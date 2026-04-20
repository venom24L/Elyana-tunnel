export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = request.headers.get('Host');
    const uuid = 'ad800262-e69c-482f-8d94-0678e7059858';

    // 1. استخراج اللينك الجديد (بإعدادات gRPC)
    if (url.pathname === `/${uuid}`) {
      const grpcConfig = `vless://${uuid}@${host}:443?encryption=none&security=tls&sni=${host}&alpn=h2&fp=chrome&type=grpc&serviceName=grpc#Venom_V4_gRPC`;
      return new Response(grpcConfig, { status: 200 });
    }

    // 2. معالجة البروتوكول الجديد
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/grpc')) {
      // هنا السيرفر بيتحول لـ "مستقبل gRPC" وده اللي بيهرب من الـ DPI
      return new Response(null, { status: 200 }); 
    }

    return new Response('System: Active | Mode: Stealth', { status: 200 });
  }
};
