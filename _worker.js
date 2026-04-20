export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = request.headers.get('Host');
    const uuid = 'ad800262-e69c-482f-8d94-0678e7059858';

    // دي الصفحة اللي بتطلع لك اللينك اللي إنت طالبه بالظبط
    if (url.pathname === `/${uuid}` || url.pathname === '/') {
      const vlessConfig = `vless://${uuid}@${host}:443?encryption=none&security=tls&sni=www.viber.com&type=ws&host=${host}&path=%2F%3Fed%3D2048#Venom_V2`;
      return new Response(vlessConfig, {
        status: 200,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
      });
    }

    // جزء معالجة الاتصال (WebSocket Handler)
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader === 'websocket') {
      return new Response('WebSocket Proxy Active', { status: 101 });
    }

    return new Response('Not Found', { status: 404 });
  }
};
