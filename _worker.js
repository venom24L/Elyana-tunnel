export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ad800262-e69c-482f-8d94-0678e7059858') {
      const vlessConfig = `vless://ad800262-e69c-482f-8d94-0678e7059858@${url.host}:443?encryption=none&security=tls&sni=www.viber.com&type=ws&host=${url.host}&path=%2F%3Fed%3D2048#Venom_V2`;
      return new Response(vlessConfig, { headers: { 'Content-Type': 'text/plain' } });
    }
    return fetch(new Request('https://www.wikipedia.org', request));
  }
};
