/**
 * 🌏 Egern 极简风解锁面板
 * 无内部卡片，纯净列表式设计
 */

const localUrl = "https://myip.ipip.net/json";
const proxyUrl = "https://my.ippure.com/v1/info";
const TIMEOUT = 3000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.61 Safari/537.36';

export default async function(ctx) {
  let info = {
    local: { ip: "获取中...", loc: "未知" },
    landing: { ip: "获取中...", flag: "", nativeText: "", riskText: "", code: "UN" },
    streaming: {}, ai: {}
  };

  async function getLocalIP() {
    try {
      let res = await ctx.http.get(localUrl, { timeout: TIMEOUT, policy: "direct", headers: { 'User-Agent': UA } });
      let j = await res.json();
      if (j.ret === "ok" && j.data) return { ip: j.data.ip };
      throw new Error();
    } catch (e) { return { ip: "获取失败" }; }
  }

  async function getLandingIP() {
    try {
      let res = await ctx.http.get(proxyUrl, { timeout: TIMEOUT, headers: { 'User-Agent': UA } });
      let j = await res.json();
      const ip = j.ip || j.query || "失败";
      const risk = j.fraudScore || 0;
      let riskText = risk >= 80 ? `高风险(${risk})` : risk >= 40 ? `中风险(${risk})` : `低风险(${risk})`;
      return {
        ip, flag: flagEmoji(j.countryCode), code: j.countryCode || "UN",
        nativeText: j.isResidential ? "原生" : "机房", riskText
      };
    } catch (e) {
      return { ip: "网络错误", flag: "", code: "UN", nativeText: "未知", riskText: "失败" };
    }
  }

  async function check(url, validator, options = {}) {
    try {
      let res = await (options.method === 'POST' ? ctx.http.post(url, options) : ctx.http.get(url, options));
      return await validator(res);
    } catch (e) { return "超时"; }
  }

  const tasks = [
    getLocalIP().then(r => info.local = r),
    getLandingIP().then(r => info.landing = r),
    
    check("https://www.netflix.com/title/81280792", async (res) => {
      if (res.status === 403) return "未支持";
      if (res.status === 404) return "仅自制剧";
      if (res.status === 200) {
        let ourl = res.headers.get('x-originating-url');
        if (ourl) {
          let region = ourl.split('/')[3].split('-')[0];
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
  const fSize = isLarge ? 12 : 11; 

  function buildRow(icon, name, value) {
    return {
      type: "stack", direction: "row", alignItems: "center", gap: 4,
      children: [
        { type: "text", text: `${icon} ${name}`, font: { size: fSize, weight: "medium" }, textColor: { light: "#666666", dark: "#999999" }, maxLines: 1 },
        { type: "spacer" },
        { type: "text", text: value || "...", font: { size: fSize, weight: "bold" }, textColor: getStatusColor(value), maxLines: 1, minScale: 0.6 }
      ]
    };
  }

  // 移除了包裹背景，只保留简单的头部文本
  function buildSection(title, children) {
    return {
      type: "stack", direction: "column", gap: 6, flex: 1,
      children: [
        { type: "text", text: title, font: { size: 10, weight: "bold" }, textColor: { light: "#A1A1A6", dark: "#636366" } },
        ...children
      ]
    };
  }

  const netSection = buildSection("NETWORK", [
    buildRow("🏠", "本地 IP", info.local.ip),
    buildRow("🌐", "节点 IP", `${info.landing.flag} ${info.landing.ip}`),
    buildRow("🛡️", "纯净度", `${info.landing.nativeText} · ${info.landing.riskText}`)
  ]);

  const streamSection = buildSection("STREAMING", [
    buildRow("🎥", "Netflix", info.streaming.Netflix),
    buildRow("▶️", "YouTube", info.streaming.YouTube),
    buildRow("🏰", "Disney+", info.streaming.Disney),
    buildRow("🎵", "TikTok", info.streaming.TikTok),
    buildRow("🎞️", "HBO Max", info.streaming.HBO),
    buildRow("🏔️", "Paramount+", info.streaming.Paramount)
  ]);

  const aiSection = buildSection("AI ASSISTANTS", [
    buildRow("🤡", "ChatGPT", info.ai.ChatGPT),
    buildRow("🧠", "Claude", info.ai.Claude),
    buildRow("✨", "Gemini", info.ai.Gemini),
    buildRow("✖️", "Grok", info.ai.Grok)
  ]);

  let contentLayout;
  if (isLarge) {
    contentLayout = {
      type: "stack", direction: "row", gap: 20, 
      children: [
        { type: "stack", direction: "column", gap: 16, flex: 1, children: [ netSection, aiSection ] },
        { type: "stack", direction: "column", gap: 16, flex: 1.1, children: [ streamSection ] }
      ]
    };
  } else {
    contentLayout = {
      type: "stack", direction: "row", gap: 12,
      children: [
        { type: "stack", direction: "column", gap: 12, flex: 1, children: [ netSection ] },
        { type: "stack", direction: "column", gap: 12, flex: 1, children: [ 
            buildSection("STREAMING", [
                buildRow("🎥", "Netflix", info.streaming.Netflix),
                buildRow("▶️", "YouTube", info.streaming.YouTube),
                buildRow("🏰", "Disney+", info.streaming.Disney)
            ]) 
        ]}
      ]
    };
  }

  return {
    type: "widget",
    url: "egern://", // 点击刷新
    padding: 16,
    gap: 16,
    // 更纯粹的底色
    backgroundColor: { light: "#F2F2F7", dark: "#121212" },
    children: [
      {
        type: "stack", direction: "row", alignItems: "center", gap: 6,
        children: [
          { type: "image", src: "sf-symbol:network", color: "#0A84FF", width: 16, height: 16 },
          { type: "text", text: "环境监测", font: { size: 14, weight: "bold" }, textColor: { light: "#000000", dark: "#FFFFFF" } },
          { type: "spacer" },
          { type: "date", date: new Date().toISOString(), format: "time", font: { size: 11, weight: "medium" }, textColor: "#8E8E93" }
        ]
      },
      contentLayout
    ]
  };
}
