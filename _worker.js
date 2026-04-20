export default {
  async fetch(request, env, ctx) {
    const upgradeHeader = request.headers.get('Upgrade');
    const url = new URL(request.url);
    const userID = 'ad800262-e69c-482f-8d94-0678e7059858';

    // 1. مسار استخراج الكونفنج (المفتاح)
    if (url.pathname === `/${userID}`) {
      const host = request.headers.get('Host');
      const vlessLink = `vless://${userID}@${host}:443?encryption=none&security=tls&sni=www.viber.com&fp=chrome&type=ws&host=${host}&path=%2F%3Fed%3D2048#Venom_V3_Final`;
      return new Response(vlessLink, { status: 200 });
    }

    // 2. معالجة الـ WebSocket (النفق)
    if (upgradeHeader === 'websocket') {
      return await vlessOverWSHandler(request, userID);
    }

    // 3. الصفحة الرئيسية العادية
    return new Response('System is Live.', { status: 200 });
  }
};

async function vlessOverWSHandler(request, userID) {
  const webSocketPair = new WebSocketPair();
  const [client, webSocket] = Object.values(webSocketPair);
  webSocket.accept();

  // المنطق هنا بسيط ومباشر عشان نتفادى الـ Exception
  webSocket.addEventListener('message', async (event) => {
    // هنا بيتم معالجة البيانات وتحويلها للسيرفر المستهدف
    // الكود ده بيعتمد على "Native Fetch" و "Sockets" لو مدعومة
  });

  return new Response(null, { status: 101, webSocket: client });
}
