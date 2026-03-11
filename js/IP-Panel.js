/**
 * 🌏 Egern IP & 解锁满血大面板
 * 专为 Large Widget 设计
 */

const localUrl = "https://myip.ipip.net/json";
const proxyUrl = "https://my.ippure.com/v1/info";
const TIMEOUT = 3000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.61 Safari/537.36';

export default async function(ctx) {
  let info = {
    local: { ip: "获取中...", loc: "未知" },
    landing: { ip: "获取中...", asn: "", flag: "🏳️", loc: "未知", nativeText: "", riskText: "", code: "UN" },
    streaming: {},
    ai: {}
  };

  // 1. 网络数据获取
  async function getLocalIP() {
    try {
      let res = await ctx.http.get(localUrl, { timeout: TIMEOUT, policy: "direct", headers: { 'User-Agent': UA } });
      let j = await res.json();
      if (j.ret === "ok" && j.data) {
        let locArr = j.data.location || [];
        return { ip: j.data.ip, loc: `${locArr[0]||""} ${locArr[2]||""}` };
      }
      throw new Error();
    } catch (e) { return { ip: "获取失败", loc: "❌ 未知" }; }
  }

  async function getLandingIP() {
    try {
      let res = await ctx.http.get(proxyUrl, { timeout: TIMEOUT, headers: { 'User-Agent': UA } });
      let j = await res.json();
      const ip = j.ip || j.query || "失败";
      const risk = j.fraudScore || 0;
      let riskText = risk >= 80 ? `高(${risk})` : risk >= 70 ? `高(${risk})` : risk >= 40 ? `中(${risk})` : `低(${risk})`;
      return {
        ip, asn: j.asn || "", flag: flagEmoji(j.countryCode), loc: `${j.country||""} ${j.city||""}`,
        code: j.countryCode || "UN", nativeText: j.isResidential ? "原生" : "机房", riskText
      };
    } catch (e) {
      return { ip: "网络错误", asn: "", flag: "❌", loc: "未知", code: "UN", nativeText: "未知", riskText: "失败" };
    }
  }

  async function check(url, validator, options = {}) {
    try {
      let res = await (options.method === 'POST' ? ctx.http.post(url, options) : ctx.http.get(url, options));
      return await validator(res);
    } catch (e) { return "超时"; }
  }

  // 2. 并发检测队列 (包含所有原版检测)
  const tasks = [
    getLocalIP().then(r => info.local = r),
    getLandingIP().then(r => info.landing = r),
    
    // --- 流媒体 ---
    check("https://www.netflix.com/title/81280792", async (res) => {
      if (res.status === 403) return "未支持";
      if (res.status === 404) return "仅自制剧";
      if (res.status === 200) {
        let ourl = res.headers.get('x-originating-url');
        if (ourl) {
          let region = ourl.split('/')[3].split('-')[0];
          // 修复 UNSUPPORTEDBROWSER 问题
          if (region.toLowerCase().includes("unsupported")) region = info.landing.code;
          return `支持 ${flagEmoji(region === 'title' ? 'us' : region)}`;
        }
        return `支持 ${info.landing.flag}`;
      }
      return "失败";
    }, { timeout: TIMEOUT, headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15' } }).then(r => info.streaming.Netflix = r),
    
    check("https://www.youtube.com/premium", async (res) => {
      let data = await res.text();
      if (data.includes('Premium is not available')) return "未支持";
      let ret = new RegExp('"GL":"(.*?)"', 'gm').exec(data);
      return `支持 ${flagEmoji(ret ? ret[1] : (data.includes('google.cn') ? 'CN' : 'US'))}`;
    }, { timeout: TIMEOUT, headers: { 'User-Agent': UA } }).then(r => info.streaming.YouTube = r),
    
    check("https://www.disneyplus.com", async (res) => (res.status === 200 || res.status === 301 || res.status === 302) ? `支持 ${info.landing.flag}` : "未支持", { timeout: TIMEOUT, redirect: 'manual' }).then(r => info.streaming.Disney = r),
    check("https://www.tiktok.com", async (res) => (res.status === 200 || res.status === 302) ? `支持 ${info.landing.flag}` : "未支持", { timeout: TIMEOUT, redirect: 'manual' }).then(r => info.streaming.TikTok = r),
    check("https://www.max.com", async (res) => res.status === 200 ? `支持 ${info.landing.flag}` : "未支持", { timeout: TIMEOUT, headers: { 'User-Agent': UA } }).then(r => info.streaming.HBO = r),
    check("https://www.paramountplus.com/", async (res) => res.status === 200 ? `支持 ${info.landing.flag}` : (res.status === 302 || res.status === 403 ? "未支持" : "超时"), { timeout: TIMEOUT, headers: { 'User-Agent': UA } }).then(r => info.streaming.Paramount = r),
    
    // --- AI 助手 ---
    check("https://chatgpt.com/", async (res) => {
      let data = await res.text();
      if (data.includes("text/plain")) return "未支持";
      let traceRes = await ctx.http.get('https://chat.openai.com/cdn-cgi/trace', { timeout: TIMEOUT, headers: { 'User-Agent': UA } });
      let match = (await traceRes.text()).match(/loc=(.*)/);
      if (match && !["CN","HK","RU","IR","XX"].includes(match[1])) return `支持 ${flagEmoji(match[1])}`;
      return "未支持";
    }, { timeout: TIMEOUT, headers: { 'User-Agent': UA } }).then(r => info.ai.ChatGPT = r),
    check("https://gemini.google.com", async (res) => res.status === 200 ? `支持 ${info.landing.flag}` : "未支持", { timeout: TIMEOUT }).then(r => info.ai.Gemini = r),
    check("https://claude.ai/favicon.ico", async (res) => res.status === 200 ? `支持 ${info.landing.flag}` : "未支持", { timeout: TIMEOUT }).then(r => info.ai.Claude = r),
    check("https://grok.x.ai", async (res) => (res.status === 200 || res.status === 302) ? `支持 ${info.landing.flag}` : "未支持", { timeout: TIMEOUT }).then(r => info.ai.Grok = r)
  ];

  await Promise.allSettled(tasks);

  // 3. UI 辅助函数
  function flagEmoji(code) {
    if (!code || code.length !== 2) return "";
    if (code.toUpperCase() === "TW") code = "CN";
    if (code.toUpperCase() === "UK") code = "GB";
    return String.fromCodePoint(...code.toUpperCase().split('').map(c => 127397 + c.charCodeAt()));
  }

  function getStatusColor(text) {
    if (!text) return "#8E8E93";
    if (text.includes("支持") || text.includes("原生") || text.includes("低")) return "#34C759";
    if (text.includes("未") || text.includes("失败") || text.includes("高") || text.includes("❌")) return "#FF3B30";
    if (text.includes("自制剧") || text.includes("中")) return "#FF9500";
    return "#8E8E93";
  }

  const isLarge = ctx.widgetFamily.includes("Large");
  const fSize = isLarge ? 11 : 10; // 大组件稍微放大字号

  function buildRow(icon, name, value) {
    return {
      type: "stack", direction: "row", alignItems: "center", gap: 4,
      children: [
        { type: "text", text: `${icon} ${name}`, font: { size: fSize, weight: "medium" }, textColor: { light: "#555555", dark: "#AAAAAA" }, maxLines: 1 },
        { type: "spacer" },
        { type: "text", text: value || "...", font: { size: fSize, weight: "bold" }, textColor: getStatusColor(value), maxLines: 1, minScale: 0.6 }
      ]
    };
  }

  function buildCard(title, children) {
    return {
      type: "stack", direction: "column", gap: 5, padding: 10, borderRadius: 12, flex: 1, backgroundColor: { light: "#F2F2F7", dark: "#1C1C1E" },
      children: [
        { type: "text", text: title, font: { size: 11, weight: "bold" }, textColor: { light: "#8E8E93", dark: "#8E8E93" } },
        ...children
      ]
    };
  }

  // 4. 构建模块卡片
  const netCard = buildCard("📡 网络与节点纯净度", [
    buildRow("🏠", "本地 IP", info.local.ip),
    buildRow("🌐", "节点 IP", `${info.landing.flag} ${info.landing.ip}`),
    buildRow("🛡️", "原生与风险", `${info.landing.nativeText} · ${info.landing.riskText}`)
  ]);

  const streamCard = buildCard("🎬 流媒体解锁", [
    buildRow("🎥", "Netflix", info.streaming.Netflix),
    buildRow("▶️", "YouTube", info.streaming.YouTube),
    buildRow("🏰", "Disney+", info.streaming.Disney),
    buildRow("🎵", "TikTok", info.streaming.TikTok),
    buildRow("🎞️", "HBO Max", info.streaming.HBO),
    buildRow("🏔️", "Paramount+", info.streaming.Paramount)
  ]);

  const aiCard = buildCard("🤖 AI 助手", [
    buildRow("🤡", "ChatGPT", info.ai.ChatGPT),
    buildRow("🧠", "Claude", info.ai.Claude),
    buildRow("✨", "Gemini", info.ai.Gemini),
    buildRow("✖️", "Grok", info.ai.Grok)
  ]);

  // 5. 组装终极布局
  let mainContent;
  if (isLarge) {
    // 大组件：双栏完美布局 (左边网络+AI，右边流媒体)
    mainContent = {
      type: "stack", direction: "row", gap: 10,
      children: [
        { type: "stack", direction: "column", gap: 10, flex: 1, children: [ netCard, aiCard ] },
        { type: "stack", direction: "column", gap: 10, flex: 1, children: [ streamCard ] }
      ]
    };
  } else {
    // 兼容中组件
    mainContent = {
      type: "stack", direction: "row", gap: 8,
      children: [ netCard, streamCard ]
    };
  }

  return {
    type: "widget",
    padding: 16,
    gap: 12,
    backgroundColor: { light: "#FFFFFF", dark: "#000000" },
    children: [
      {
        type: "stack", direction: "row", alignItems: "center", gap: 6,
        children: [
          { type: "image", src: "sf-symbol:globe.americas.fill", color: "#AF52DE", width: 16, height: 16 },
          { type: "text", text: "IP 信息与解锁监控", font: { size: 14, weight: "bold" }, textColor: { light: "#000000", dark: "#FFFFFF" } },
          { type: "spacer" },
          { type: "date", date: new Date().toISOString(), format: "time", font: { size: 11, weight: "medium" }, textColor: "#8E8E93" }
        ]
      },
      mainContent
    ]
  };
}
