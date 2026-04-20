// Cloudflare Worker: VLESS over WebSocket Proxy
// UUID: ad800262-e69c-482f-8d94-0678e7059858
// Optimized for DPI bypass (Iran/Egypt): uses ?ed=2048 padding + popular SNI (www.speedtest.net / www.viber.com fallback)
// Full VLESS server logic with WebSocket inbound + cloudflare:sockets outbound TCP (and DNS UDP)
// Simple plain-text landing page at /<UUID> returning ready-to-use VLESS link

// @ts-ignore
import { connect } from 'cloudflare:sockets';

let userID = 'ad800262-e69c-482f-8d94-0678e7059858';

if (!isValidUUID(userID)) {
	throw new Error('uuid is not valid');
}

export default {
	/**
	 * @param {import("@cloudflare/workers-types").Request} request
	 * @param {{}} env
	 * @param {import("@cloudflare/workers-types").ExecutionContext} ctx
	 * @returns {Promise<Response>}
	 */
	async fetch(request, env, ctx) {
		try {
			const upgradeHeader = request.headers.get('Upgrade');
			if (!upgradeHeader || upgradeHeader !== 'websocket') {
				const url = new URL(request.url);
				switch (url.pathname) {
					case '/':
						return new Response('VLESS WS Proxy ready.\n\nGet your config: https://' + request.headers.get('Host') + '/' + userID, {
							status: 200,
							headers: { 'Content-Type': 'text/plain;charset=utf-8' }
						});
					case `/${userID}`: {
						const vlessConfig = getVLESSConfig(userID, request.headers.get('Host'));
						return new Response(vlessConfig, {
							status: 200,
							headers: {
								"Content-Type": "text/plain;charset=utf-8",
							}
						});
					}
					default:
						return new Response('Not found', { status: 404 });
				}
			} else {
				return await vlessOverWSHandler(request);
			}
		} catch (err) {
			return new Response(err.toString(), { status: 500 });
		}
	},
};

/**
 * Generate VLESS link with DPI-bypass optimizations
 * SNI = www.speedtest.net (default) or www.viber.com – both are popular placeholders that help bypass SNI-based DPI in Iran/Egypt
 * Path includes ?ed=2048 padding (standard Xray/V2Ray technique to defeat DPI)
 */
function getVLESSConfig(userID, host) {
	const sniOptions = ['www.speedtest.net', 'www.viber.com'];
	const sni = sniOptions[Math.floor(Math.random() * sniOptions.length)]; // random choice for extra obfuscation
	const path = '%2F%3Fed%3D2048'; // critical for DPI bypass
	return `vless://\( {userID}@ \){host}:443?encryption=none&security=tls&sni=\( {sni}&alpn=h2,http/1.1&fp=chrome&type=ws&host= \){host}&path=\( {path}# \){host}-VLESS-WS-TLS`;
}

function isValidUUID(uuid) {
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	return uuidRegex.test(uuid);
}

async function vlessOverWSHandler(request) {
	const webSocketPair = new WebSocketPair();
	const [client, webSocket] = Object.values(webSocketPair);

	webSocket.accept();

	let address = '';
	let portWithRandomLog = '';
	const log = (/** @type {string} */ info, /** @type {string | undefined} */ event) => {
		console.log(`[\( {address}: \){portWithRandomLog}] ${info}`, event || '');
	};

	const earlyDataHeader = request.headers.get('sec-websocket-protocol') || '';

	const readableWebSocketStream = makeReadableWebSocketStream(webSocket, earlyDataHeader, log);

	let remoteSocketWapper = { value: null };
	let udpStreamWrite = null;
	let isDns = false;

	readableWebSocketStream.pipeTo(new WritableStream({
		async write(chunk, controller) {
			if (isDns && udpStreamWrite) return udpStreamWrite(chunk);
			if (remoteSocketWapper.value) {
				const writer = remoteSocketWapper.value.writable.getWriter();
				await writer.write(chunk);
				writer.releaseLock();
				return;
			}

			const {
				hasError,
				message,
				portRemote = 443,
				addressRemote = '',
				rawDataIndex,
				vlessVersion = new Uint8Array([0, 0]),
				isUDP,
			} = processVlessHeader(chunk, userID);

			address = addressRemote;
			portWithRandomLog = `\( {portRemote}-- \){Math.random()} ${isUDP ? 'udp ' : 'tcp '} `;

			if (hasError) {
				throw new Error(message);
				return;
			}

			if (isUDP) {
				if (portRemote === 53) {
					isDns = true;
				} else {
					throw new Error('UDP proxy only enabled for DNS (port 53)');
					return;
				}
			}

			const vlessResponseHeader = new Uint8Array([vlessVersion[0], 0]);
			const rawClientData = chunk.slice(rawDataIndex);

			if (isDns) {
				const { write } = await handleUDPOutBound(webSocket, vlessResponseHeader, log);
				udpStreamWrite = write;
				udpStreamWrite(rawClientData);
				return;
			}

			handleTCPOutBound(remoteSocketWapper, addressRemote, portRemote, rawClientData, webSocket, vlessResponseHeader, log);
		},
		close() { log(`readableWebSocketStream closed`); },
		abort(reason) { log(`readableWebSocketStream aborted`, JSON.stringify(reason)); },
	})).catch(err => log('readableWebSocketStream pipeTo error', err));

	return new Response(null, { status: 101, webSocket: client });
}

function processVlessHeader(vlessBuffer, userID) {
	if (vlessBuffer.byteLength < 24) {
		return { hasError: true, message: 'invalid data' };
	}

	const version = new Uint8Array(vlessBuffer.slice(0, 1));
	const uuidBytes = vlessBuffer.slice(1, 17);
	const uuid = Array.from(new Uint8Array(uuidBytes))
		.map(b => b.toString(16).padStart(2, '0'))
		.join('')
		.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');

	if (uuid !== userID) {
		return { hasError: true, message: 'invalid uuid' };
	}

	const optLength = new Uint8Array(vlessBuffer.slice(17, 18))[0];
	const command = new Uint8Array(vlessBuffer.slice(18 + optLength, 19 + optLength))[0];
	let addressType = new Uint8Array(vlessBuffer.slice(19 + optLength, 20 + optLength))[0];
	let address = '';
	let port = 0;
	let rawDataIndex = 20 + optLength;

	switch (addressType) {
		case 1: // IPv4
			address = Array.from(new Uint8Array(vlessBuffer.slice(rawDataIndex, rawDataIndex + 4))).join('.');
			rawDataIndex += 4;
			break;
		case 2: // Domain
			const domainLength = new Uint8Array(vlessBuffer.slice(rawDataIndex, rawDataIndex + 1))[0];
			address = new TextDecoder().decode(vlessBuffer.slice(rawDataIndex + 1, rawDataIndex + 1 + domainLength));
			rawDataIndex += 1 + domainLength;
			break;
		case 3: // IPv6
			address = Array.from(new Uint8Array(vlessBuffer.slice(rawDataIndex, rawDataIndex + 16)))
				.map(b => b.toString(16).padStart(2, '0'))
				.join(':');
			rawDataIndex += 16;
			break;
		default:
			return { hasError: true, message: 'invalid address type' };
	}

	port = new DataView(vlessBuffer.slice(rawDataIndex, rawDataIndex + 2)).getUint16(0);
	rawDataIndex += 2;

	return {
		hasError: false,
		message: '',
		portRemote: port,
		addressRemote: address,
		rawDataIndex,
		vlessVersion: version,
		isUDP: command === 2,
	};
}

async function handleTCPOutBound(remoteSocketWapper, addressRemote, portRemote, rawClientData, webSocket, vlessResponseHeader, log) {
	async function connectAndWrite(address, port) {
		const tcpSocket = connect({ hostname: address, port });
		remoteSocketWapper.value = tcpSocket;
		log(`connected to \( {address}: \){port}`);
		const writer = tcpSocket.writable.getWriter();
		await writer.write(rawClientData);
		writer.releaseLock();
		return tcpSocket;
	}

	async function retry() {
		const tcpSocket = await connectAndWrite(addressRemote, portRemote);
		tcpSocket.closed.catch(e => console.log('retry tcp closed error', e))
			.finally(() => safeCloseWebSocket(webSocket));
		remoteSocketToWS(tcpSocket, webSocket, vlessResponseHeader, null, log);
	}

	const tcpSocket = await connectAndWrite(addressRemote, portRemote);
	remoteSocketToWS(tcpSocket, webSocket, vlessResponseHeader, retry, log);
}

function makeReadableWebSocketStream(webSocketServer, earlyDataHeader, log) {
	let readableStreamCancel = false;
	return new ReadableStream({
		start(controller) {
			webSocketServer.addEventListener('message', event => {
				if (readableStreamCancel) return;
				controller.enqueue(event.data);
			});
			webSocketServer.addEventListener('close', () => controller.close());
			webSocketServer.addEventListener('error', err => controller.error(err));
		},
		cancel(reason) {
			readableStreamCancel = true;
			log(`readableStream canceled: ${reason}`);
		},
	});
}

function remoteSocketToWS(remoteSocket, webSocket, vlessResponseHeader, retry, log) {
	let hasSentHeader = false;
	remoteSocket.readable.pipeTo(new WritableStream({
		write(chunk) {
			if (webSocket.readyState !== WebSocket.OPEN) throw new Error('websocket closed');
			if (!hasSentHeader) {
				hasSentHeader = true;
				const combined = new Uint8Array(vlessResponseHeader.length + chunk.length);
				combined.set(vlessResponseHeader);
				combined.set(chunk, vlessResponseHeader.length);
				webSocket.send(combined);
				return;
			}
			webSocket.send(chunk);
		},
		close() {
			log('remoteSocketToWS closed');
			safeCloseWebSocket(webSocket);
		},
		abort(reason) {
			log('remoteSocketToWS aborted', JSON.stringify(reason));
			retry ? retry() : safeCloseWebSocket(webSocket);
		},
	})).catch(err => {
		log('remoteSocketToWS error', err);
		retry ? retry() : safeCloseWebSocket(webSocket);
	});
}

function safeCloseWebSocket(webSocket) {
	try {
		if (webSocket.readyState === WebSocket.OPEN || webSocket.readyState === WebSocket.CONNECTING) {
			webSocket.close(1000);
		}
	} catch (e) {}
}

async function handleUDPOutBound(webSocket, vlessResponseHeader, log) {
	// Full DoH-based UDP (DNS only) implementation – standard in production VLESS workers
	const dohURL = 'https://dns.google/dns-query';
	let dnsCache = new Map();

	const write = async (chunk) => {
		try {
			const dnsQuery = chunk;
			const resp = await fetch(dohURL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/dns-message' },
				body: dnsQuery,
			});
			const dnsResponse = await resp.arrayBuffer();
			const combined = new Uint8Array(vlessResponseHeader.length + dnsResponse.byteLength);
			combined.set(vlessResponseHeader);
			combined.set(new Uint8Array(dnsResponse), vlessResponseHeader.length);
			webSocket.send(combined);
		} catch (e) {
			log('DNS query failed', e);
		}
	};

	return { write };
    }
