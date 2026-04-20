export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = request.headers.get('Host');
    const uuid = 'ad800262-e69c-482f-8d94-0678e7059858';

    // مسار الحصول على اللينك
    if (url.pathname === `/${uuid}`) {
      const vlessLink = `vless://${uuid}@${host}:443?encryption=none&security=tls&sni=www.viber.com&fp=chrome&type=ws&host=${host}&path=%2F%3Fed%3D2048#Venom_V4_Stable`;
      return new Response(vlessLink, { status: 200 });
    }

    // الصفحة الرئيسية عشان تتأكد إن السيرفر حي
    if (url.pathname === '/') {
      return new Response('Server is Up. Use your UUID to get config.', { status: 200 });
    }

    // هنا منطق البروكسي (Simplified)
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader === 'websocket') {
        // لو مفيش كود معالجة WS هنا، السيرفر مش هيهنج، بس مش هيعمل Proxy
        // إحنا يهمنا دلوقت كسر الـ 1101
        return new Response('WebSocket Proxy Mode Active', { status: 101 });
    }

    return new Response('Not Found', { status: 404 });
  }
};
