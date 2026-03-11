/**
 * 🌏 Egern IP & 解锁信息面板小组件
 * 适配 Egern Widget DSL
 */

const localUrl = "https://myip.ipip.net/json";
const proxyUrl = "https://my.ippure.com/v1/info";
const TIMEOUT = 3000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.61 Safari/537.36';

export default async function(ctx) {
  // 1. 数据结构初始化
  let info = {
    local: { ip: "获取中...", flag: "🏳️", isp: "未知" },
    landing: { ip: "获取中...", flag: "🏳️", asn: "", org: "", countryCode: "UN", nativeText: "", riskText: "", riskLevel: 0 },
    streaming: {},
    ai: {}
  };

  // 2. 核心检测函数 (基于 ctx.http)
  async function getLocalIP() {
    try {
      // 强制使用 direct 策略获取本地 IP
      let res = await ctx.http.get(localUrl, { timeout: TIMEOUT, policy: "direct", headers: { 'User-Agent': UA } });
      let j = await res.json();
      if (j.ret === "ok" && j.data) {
        let loc = j.data.location || [];
        let code = (loc[0] === "中国") ? "CN" : "UN";
        return { ip: j.data.ip, flag: flagEmoji(code), isp: loc[4] || "未知" };
      }
      throw new Error();
    } catch (e) { return { ip: "获取失败", flag: "❌", isp: "未知" }; }
  }

  async function getLandingIP() {
    try {
      let res = await ctx.http.get(proxyUrl, { timeout: TIMEOUT, headers: { 'User-Agent': UA } });
      let j = await res.json();
      const ip = j.ip || j.query || "获取失败";
      const risk = j.fraudScore || 0;
      let riskText = risk >= 80 ? `🛑 极高风险(${risk})` : risk >= 70 ? `⚠️ 高风险(${risk})` : risk >= 40 ? `🔶 中等风险(${risk})` : `✅ 低风险(${risk})`;
      return {
        ip, flag: flagEmoji(j.countryCode), asn: j.asn || "", org: j.asOrganization || "",
        countryCode: j.countryCode || "UN", nativeText: j.isResidential ? "原生" : "机房", riskText, riskLevel: risk
      };
    } catch (e) {
      return { ip: "网络错误", flag: "❌", asn: "", org: "", countryCode: "UN", nativeText: "未知", riskText: "检测失败", riskLevel: 0 };
    }
  }

  // 流媒体 & AI 检测函数简写
  async function check(url, validator, options = {}) {
    try {
      let res = await (options.method === 'POST' ? ctx.http.post(url, options) : ctx.http.get(url, options));
      return await validator(res);
    } catch (e) { return "超时 🚫"; }
  }

  const tasks = [
    getLocalIP().then(r => info.local = r),
    getLandingIP().then(r => info.landing = r),
    // Netflix
    check("https://www.netflix.com/title/81280792", async (res) => {
      if (res.status === 403) return "未支持 🚫";
      if (res.status === 404) return "仅自制剧 ⚠️";
      if (res.status === 200) {
        let ourl = res.headers.get('x-originating-url');
        if (ourl) {
          let region = ourl.split('/')[3].split('-')[0];
          return `支持 ⟦${flagEmoji(region === 'title' ? 'us' : region)}⟧`;
        }
        return "支持 ⟦未知⟧";
      }
      return "失败 🚫";
    }, { timeout: TIMEOUT, headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15' } }).then(r => info.streaming.Netflix = r),
    // YouTube
    check("https://www.youtube.com/premium", async (res) => {
      let data = await res.text();
      if (data.includes('Premium is not available')) return "未支持 🚫";
      let ret = new RegExp('"GL":"(.*?)"', 'gm').exec(data);
      return `支持 ⟦${flagEmoji(ret ? ret[1] : (data.includes('google.cn') ? 'CN' : 'US'))}⟧`;
    }, { timeout: TIMEOUT, headers: { 'User-Agent': UA } }).then(r => info.streaming.YouTube = r),
    // Disney+
    check("https://www.disneyplus.com", async (res) => (res.status === 200 || res.status === 301 || res.status === 302) ? "支持 🎉" : "未支持 🚫", { timeout: TIMEOUT, redirect: 'manual' }).then(r => info.streaming.Disney = r),
    // TikTok
    check("https://www.tiktok.com", async (res) => (res.status === 200 || res.status === 302) ? "支持 🎉" : "未支持 🚫", { timeout: TIMEOUT, redirect: 'manual' }).then(r => info.streaming.TikTok = r),
    // ChatGPT
    check("https://chatgpt.com/", async (res) => {
      let data = await res.text();
      if (data.includes("text/plain")) return "未支持 🚫";
      let traceRes = await ctx.http.get('https://chat.openai.com/cdn-cgi/trace', { timeout: TIMEOUT, headers: { 'User-Agent': UA } });
      let traceData = await traceRes.text();
      let match = traceData.match(/loc=(.*)/);
      if (match && !["CN","HK","RU","IR","XX"].includes(match[1])) return `支持 ⟦${flagEmoji(match[1])}⟧`;
      return "未支持 🚫";
    }, { timeout: TIMEOUT, headers: { 'User-Agent': UA } }).then(r => info.ai.ChatGPT = r),
    // Gemini
    check("https://gemini.google.com", async (res) => res.status === 200 ? "支持 🎉" : "未支持 🚫", { timeout: TIMEOUT }).then(r => info.ai.Gemini = r),
    // Claude
    check("https://claude.ai/favicon.ico", async (res) => res.status === 200 ? "支持 🎉" : "未支持 🚫", { timeout: TIMEOUT }).then(r => info.ai.Claude = r)
  ];

  await Promise.allSettled(tasks);

  // 3. UI 构建辅助函数
  function flagEmoji(code) {
    if (!code) return "🏳️";
    if (code.toUpperCase() === "TW") code = "CN";
    if (code.toUpperCase() === "UK") code = "GB";
    return String.fromCodePoint(...code.toUpperCase().split('').map(c => 127397 + c.charCodeAt()));
  }

  function getStatusColor(text) {
    if (!text) return "#8E8E93";
    if (text.includes("支持") || text.includes("原生")) return "#34C759";
    if (text.includes("未") || text.includes("失败") || text.includes("高风险")) return "#FF3B30";
    if (text.includes("自制剧") || text.includes("中等")) return "#FF9500";
    return "#8E8E93";
  }

  function buildRow(icon, name, value) {
    return {
      type: "stack", direction: "row", alignItems: "center", gap: 4,
      children: [
        { type: "text", text: `${icon} ${name}`, font: { size: 11, weight: "medium" }, textColor: { light: "#666666", dark: "#AAAAAA" } },
        { type: "spacer" },
        { type: "text", text: value || "...", font: { size: 11, weight: "bold" }, textColor: getStatusColor(value) }
      ]
    };
  }

  // 4. 根据小组件尺寸返回 DSL
  const isSmall = ctx.widgetFamily === "systemSmall";
  const isMedium = ctx.widgetFamily === "systemMedium";

  // 构建卡片块
  const ipBlock = {
    type: "stack", direction: "column", gap: 4, padding: 10, borderRadius: 12, backgroundColor: { light: "#F2F2F7", dark: "#1C1C1E" },
    children: [
      { type: "text", text: "📡 网络与纯净度", font: { size: 10, weight: "bold" }, textColor: { light: "#8E8E93", dark: "#8E8E93" } },
      buildRow("🏠", "本地", info.local.flag),
      buildRow("🌐", "节点", `${info.landing.flag} ${info.landing.nativeText}`),
      buildRow("🛡️", "欺诈", info.landing.riskText)
    ]
  };

  const streamBlock = {
    type: "stack", direction: "column", gap: 4, padding: 10, borderRadius: 12, flex: 1, backgroundColor: { light: "#F2F2F7", dark: "#1C1C1E" },
    children: [
      { type: "text", text: "🎬 流媒体", font: { size: 10, weight: "bold" }, textColor: { light: "#8E8E93", dark: "#8E8E93" } },
      buildRow("🎥", "Netflix", info.streaming.Netflix),
      buildRow("▶️", "YouTube", info.streaming.YouTube),
      buildRow("🏰", "Disney+", info.streaming.Disney)
    ]
  };
  if (!isMedium) streamBlock.children.push(buildRow("🎵", "TikTok", info.streaming.TikTok));

  const aiBlock = {
    type: "stack", direction: "column", gap: 4, padding: 10, borderRadius: 12, flex: 1, backgroundColor: { light: "#F2F2F7", dark: "#1C1C1E" },
    children: [
      { type: "text", text: "🤖 AI 助手", font: { size: 10, weight: "bold" }, textColor: { light: "#8E8E93", dark: "#8E8E93" } },
      buildRow("🤡", "ChatGPT", info.ai.ChatGPT),
      buildRow("✨", "Gemini", info.ai.Gemini),
      buildRow("🧠", "Claude", info.ai.Claude)
    ]
  };

  // 组装最终布局
  let mainContent;
  if (isSmall) {
    mainContent = [ ipBlock, { type: "spacer" }, buildRow("🤖", "GPT", info.ai.ChatGPT), buildRow("🎥", "NF", info.streaming.Netflix) ];
  } else if (isMedium) {
    mainContent = [
      { type: "stack", direction: "row", gap: 10, children: [
          { type: "stack", direction: "column", gap: 10, flex: 1, children: [ipBlock] },
          { type: "stack", direction: "column", gap: 10, flex: 1, children: [streamBlock] }
      ]}
    ];
  } else {
    // Large 尺寸
    mainContent = [
      ipBlock,
      { type: "stack", direction: "row", gap: 10, children: [ streamBlock, aiBlock ] }
    ];
  }

  return {
    type: "widget",
    padding: 14,
    gap: 10,
    backgroundColor: { light: "#FFFFFF", dark: "#000000" },
    children: [
      // 头部
      {
        type: "stack", direction: "row", alignItems: "center", gap: 6,
        children: [
          { type: "image", src: "sf-symbol:globe.americas.fill", color: "#AF52DE", width: 18, height: 18 },
          { type: "text", text: "节点环境监控", font: { size: 14, weight: "bold" }, textColor: { light: "#000000", dark: "#FFFFFF" } },
          { type: "spacer" },
          { type: "date", date: new Date().toISOString(), format: "time", font: { size: 10, weight: "medium" }, textColor: "#8E8E93" }
        ]
      },
      ...mainContent
    ]
  };
}
