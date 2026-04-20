// Venom Private Bypass System
const UUID = 'ad800262-e69c-482f-8d94-0678e7059858';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // لو دخلت بالـ UUID السري هيفتح لك لوحة التحكم
    if (url.pathname === `/${UUID}`) {
      const vlessConfig = `vless://${UUID}@${url.host}:443?encryption=none&security=tls&sni=${url.host}&type=ws&host=${url.host}&path=%2F%3Fed%3D2048#Venom_Special_Edition`;
      return new Response(`
        <body style="background:#121212;color:#00ff00;padding:20px;font-family:monospace;">
          <h3>[ System Authenticated ]</h3>
          <p>Copy this VLESS config for Eliana:</p>
          <textarea style="width:100%;height:100px;background:#222;color:#00ff00;border:1px solid #00ff00;">${vlessConfig}</textarea>
        </body>`, { headers: { 'Content-Type': 'text/html' } });
    }
    // لو حد غريب دخل يفتح له جوجل للتمويه
    return fetch(new Request('https://www.google.com', request));
  }
};
