/**
 * Egern 流媒体 & AI 归类检测脚本 (带 IP 显示)
 */

(async () => {
  let info = {
    region: "检测中...",
    ip: "检测中...",
    streaming: {},
    ai: {}
  };

  // 并行检测
  await Promise.all([
    getIPInfo().then(res => {
      info.region = res.region;
      info.ip = res.ip;
    }),
    // 流媒体类
    checkNetflix().then(res => info.streaming.Netflix = res),
    checkDisney().then(res => info.streaming.Disney = res),
    checkHBO().then(res => info.streaming.HBO = res),
    checkTikTok().then(res => info.streaming.TikTok = res),
    checkYouTube().then(res => info.streaming.YouTube = res),
    // AI 类
    checkChatGPT().then(res => info.ai.ChatGPT = res),
    checkClaude().then(res => info.ai.Claude = res),
    checkGemini().then(res => info.ai.Gemini = res)
  ]);

  // 组装面板文字
  let content = `📍 节点地区: ${info.region}\n`;
  content += `🌐 当前 I P : ${info.ip}\n`; // 新增 IP 显示行
  
  content += `\n🎬 【流媒体服务】\n`;
  content += ` ├ Netflix: ${info.streaming.Netflix}\n`;
  content += ` ├ Disney+: ${info.streaming.Disney}\n`;
  content += ` ├ HBO Max: ${info.streaming.HBO}\n`;
  content += ` ├ TikTok: ${info.streaming.TikTok}\n`;
  content += ` └ YouTube: ${info.streaming.YouTube}\n`;

  content += `\n🤖 【AI 助手】\n`;
  content += ` ├ ChatGPT: ${info.ai.ChatGPT}\n`;
  content += ` ├ Claude: ${info.ai.Claude}\n`;
  content += ` └ Gemini: ${info.ai.Gemini}`;

  $done({
    title: "节点解锁检测",
    content: content,
    icon: "network",
    "icon-color": "#007AFF"
  });
})();

// --- 核心逻辑 ---

async function getIPInfo() {
  try {
    let res = await fetch("http://ip-api.com/json/?lang=zh-CN");
    let data = JSON.parse(res.data);
    const flag = data.countryCode.toUpperCase().replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
    return {
      region: `${flag} ${data.country} - ${data.city}`,
      ip: data.query // 提取 IP 地址
    };
  } catch { 
    return { region: "❌ 获取失败", ip: "❌ 获取失败" }; 
  }
}

// ... (其余 check 函数保持不变) ...
async function checkNetflix() {
  try {
    let res = await fetch("https://www.netflix.com/title/81215561");
    if (res.status === 200) return "✅ 完整";
    if (res.status === 403) return "⚠️ 自制";
    return "❌";
  } catch { return "🚫"; }
}

async function checkHBO() {
  try {
    let res = await fetch("https://www.max.com");
    return res.status === 200 ? "✅" : "❌";
  } catch { return "🚫"; }
}

async function checkTikTok() {
  try {
    let res = await fetch("https://www.tiktok.com");
    return (res.status === 200 || res.status === 302) ? "✅" : "❌";
  } catch { return "🚫"; }
}

async function checkDisney() {
  try {
    let res = await fetch("https://www.disneyplus.com");
    return res.url.includes("preview") ? "✅" : "❌";
  } catch { return "🚫"; }
}

async function checkYouTube() {
  try {
    let res = await fetch("https://www.youtube.com/premium");
    return res.status === 200 ? "✅" : "❌";
  } catch { return "🚫"; }
}

async function checkChatGPT() {
  try {
    let res = await fetch("https://chatgpt.com");
    return res.status === 200 ? "✅" : "❌";
  } catch { return "🚫"; }
}

async function checkClaude() {
  try {
    let res = await fetch("https://claude.ai/login");
    return res.status === 200 ? "✅" : "❌";
  } catch { return "🚫"; }
}

async function checkGemini() {
  try {
    let res = await fetch("https://gemini.google.com");
    return res.status === 200 ? "✅" : "❌";
  } catch { return "🚫"; }
}

function fetch(url) {
  return new Promise((resolve) => {
    $httpClient.get({url, timeout: 5000}, (err, resp, data) => {
      if (err) resolve({status: 500, url: "", data: null});
      else { resp.data = data; resolve(resp); }
    });
  });
}
