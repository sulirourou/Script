/**
 * Egern 流媒体 & AI 检测面板 (增强版)
 * 分类显示 + 地区识别 + 新增平台 (HBO, Claude, Gemini, TikTok)
 */

(async () => {
  let info = {
    region: "未知",
    streaming: {},
    ai: {}
  };

  // 并行执行所有检测
  await Promise.all([
    getIPInfo().then(res => info.region = res),
    // 流媒体类
    checkNetflix().then(res => info.streaming.Netflix = res),
    checkDisney().then(res => info.streaming.Disney = res),
    checkHBO().then(res => info.streaming.HBO = res),
    checkTikTok().then(res => info.streaming.TikTok = res),
    checkYouTube().then(res => info.streaming.YouTube = res),
    // AI类
    checkChatGPT().then(res => info.ai.ChatGPT = res),
    checkClaude().then(res => info.ai.Claude = res),
    checkGemini().then(res => info.ai.Gemini = res)
  ]);

  // 构建显示文本
  let content = `📍 节点地区: ${info.region}\n`;
  
  content += `\n🎬 【流媒体服务】\n`;
  content += `  • Netflix: ${info.streaming.Netflix}\n`;
  content += `  • Disney+: ${info.streaming.Disney}\n`;
  content += `  • HBO Max: ${info.streaming.HBO}\n`;
  content += `  • TikTok: ${info.streaming.TikTok}\n`;
  content += `  • YouTube: ${info.streaming.YouTube}\n`;

  content += `\n🤖 【AI 助手】\n`;
  content += `  • ChatGPT: ${info.ai.ChatGPT}\n`;
  content += `  • Claude: ${info.ai.Claude}\n`;
  content += `  • Gemini: ${info.ai.Gemini}\n`;

  $done({
    title: "节点解锁实时检测",
    content: content,
    icon: "globe.asia.australia.fill",
    "icon-color": "#5AC8FA"
  });
})();

// --- 核心检测函数 ---

async function getIPInfo() {
  try {
    let res = await fetch("http://ip-api.com/json/?lang=zh-CN");
    let data = JSON.parse(res.data);
    if (data && data.countryCode) {
      const flag = data.countryCode.toUpperCase().replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
      return `${flag} ${data.country} (${data.query})`;
    }
    return "未知地区";
  } catch { return "地区识别失败"; }
}

async function checkNetflix() {
  try {
    let res = await fetch("https://www.netflix.com/title/81215561");
    if (res.status === 200) return "✅ 完整解锁";
    if (res.status === 403) return "⚠️ 仅限自制剧";
    return "❌ 未解锁";
  } catch { return "❌ 检测跳过"; }
}

async function checkHBO() {
  try {
    let res = await fetch("https://www.max.com", { redirect: 'follow' });
    if (res.status === 200) return "✅ 已解锁";
    return "❌ 未解锁";
  } catch { return "❌ 检测跳过"; }
}

async function checkTikTok() {
  try {
    let res = await fetch("https://www.tiktok.com", { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.status === 200 || res.status === 302) return "✅ 已解锁";
    return "❌ 未解锁";
  } catch { return "❌ 检测跳过"; }
}

async function checkDisney() {
  try {
    let res = await fetch("https://www.disneyplus.com", { redirect: 'follow' });
    if (res.url.includes("preview")) return "✅ 已解锁";
    return "❌ 未解锁";
  } catch { return "❌ 检测跳过"; }
}

async function checkYouTube() {
  try {
    let res = await fetch("https://www.youtube.com/premium");
    return res.status === 200 ? "✅ 已解锁" : "❌ 未解锁";
  } catch { return "❌ 检测跳过"; }
}

async function checkChatGPT() {
  try {
    let res = await fetch("https://chatgpt.com", { method: 'GET' });
    return res.status === 200 ? "✅ 已解锁" : "❌ 屏蔽";
  } catch { return "❌ 检测跳过"; }
}

async function checkClaude() {
  try {
    let res = await fetch("https://claude.ai/login");
    return res.status === 200 ? "✅ 已解锁" : "❌ 未解锁";
  } catch { return "❌ 检测跳过"; }
}

async function checkGemini() {
  try {
    let res = await fetch("https://gemini.google.com");
    return res.status === 200 ? "✅ 已解锁" : "❌ 未解锁";
  } catch { return "❌ 检测跳过"; }
}

// 兼容性 Fetch 函数
function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    $httpClient.get({ url, ...opts }, (err, resp, data) => {
      if (err) reject(err);
      else {
        resp.data = data;
        resolve(resp);
      }
    });
  });
}
