/**
 * 🌏 Egern 独立拆分组件 (纯净度 / 流媒体 / AI)
 * 适配 systemMedium 中尺寸，极简无边框设计
 */

const localUrl = "https://myip.ipip.net/json";
const proxyUrl = "https://my.ippure.com/v1/info";
const TIMEOUT = 3000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.61 Safari/537.36';

export default async function(ctx) {
  // 通过环境变量判断当前要渲染哪个组件，默认渲染流媒体
  const widgetType = ctx.env.TYPE || "STREAM"; 
  
  let info = {
    local: { ip: "获取中...", isp: "未知" },
    landing: { ip: "获取中...", flag: "", nativeText: "", riskText: "", code: "UN" },
    streaming: {}, ai: {}
  };

  async function getLocalIP() {
    try {
      let res = await ctx.http.get(localUrl, { timeout: TIMEOUT, policy: "direct", headers: { 'User-Agent': UA } });
      let j = await res.json();
      if (j.ret === "ok" && j.data) return { ip: j.data.ip, isp: (j.data.location && j.data.location[4]) || "未知" };
      throw new Error();
    } catch (e) { return { ip: "获取失败", isp: "-" }; }
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
    } catch (e) { return { ip: "网络错误", flag: "❌", code: "UN", nativeText: "未知", riskText: "失败" }; }
  }

  async function check(url, validator, options = {}) {
    try {
      let res = await (options.method === 'POST' ? ctx.http.post(url, options) : ctx.http.get(url, options));
      return await validator(res);
    } catch (e) { return "超时"; }
  }

  // 根据组件类型，按需拉取数据，极速响应
  let tasks = [];
  if (widgetType === "IP") {
    tasks.push(getLocalIP().then(r => info.local = r), getLandingIP().then(r => info.landing = r));
  } else if (widgetType === "STREAM") {
    tasks.push(getLandingIP().then(r => info.landing = r));
    tasks.push(
      check("https://www.netflix.com/title/81280792", async (res) => {
        if (res.status === 403) return "未支持";
        if (res.status === 404) return "自制剧";
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
      check("https://www.paramountplus.com/", async (res) => res.status === 200 ? `支持 ${info.landing.flag}` : (res.status === 302 || res.status === 403 ? "未支持" : "超时"), { timeout: TIMEOUT, headers: { 'User-Agent': UA } }).then(r => info.streaming.Paramount = r)
    );
  } else if (widgetType === "AI") {
    tasks.push(getLandingIP().then(r => info.landing = r));
    tasks.push(
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
    );
  }

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
    if (text.includes("自制剧") || text.includes("机房") || text.includes("中")) return "#FF9500";
    return "#8E8E93";
  }

  // 极简 UI 组件构建
  function buildRow(icon, name, value) {
    return {
      type: "stack", direction: "row", alignItems: "center", gap: 4,
      children: [
        { type: "text", text: `${icon} ${name}`, font: { size: 12, weight: "medium" }, textColor: { light: "#666666", dark: "#AAAAAA" }, maxLines: 1 },
        { type: "spacer" },
        { type: "text", text: value || "-", font: { size: 12, weight: "bold" }, textColor: getStatusColor(value), maxLines: 1, minScale: 0.8 }
      ]
    };
  }

  let titleText = "", titleIcon = "", titleColor = "";
  let bodyContent;

  // 根据环境变量生成不同的 UI 布局
  if (widgetType === "IP") {
    titleText = "IP 与节点纯净度"; titleIcon = "sf-symbol:network"; titleColor = "#0A84FF";
    bodyContent = {
      type: "stack", direction: "row", gap: 16,
      children: [
        { type: "stack", direction: "column", gap: 8, flex: 1, children: [
            { type: "text", text: "🏠 本地网络", font: { size: 11, weight: "bold" }, textColor: { light: "#8E8E93", dark: "#636366" } },
            buildRow("IP", "", info.local.ip),
            buildRow("ISP", "", info.local.isp)
        ]},
        { type: "stack", direction: "column", gap: 8, flex: 1.1, children: [
            { type: "text", text: "🌐 代理节点", font: { size: 11, weight: "bold" }, textColor: { light: "#8E8E93", dark: "#636366" } },
            buildRow("IP", "", `${info.landing.flag} ${info.landing.ip}`),
            buildRow("风险", "", `${info.landing.nativeText} · ${info.landing.riskText}`)
        ]}
      ]
    };
  } else if (widgetType === "STREAM") {
    titleText = "流媒体解锁"; titleIcon = "sf-symbol:play.tv.fill"; titleColor = "#FF2D55";
    bodyContent = {
      type: "stack", direction: "row", gap: 16,
      children: [
        { type: "stack", direction: "column", gap: 8, flex: 1, children: [
            buildRow("🎥", "Netflix", info.streaming.Netflix),
            buildRow("▶️", "YouTube", info.streaming.YouTube),
            buildRow("🏰", "Disney+", info.streaming.Disney)
        ]},
        { type: "stack", direction: "column", gap: 8, flex: 1, children: [
            buildRow("🎵", "TikTok", info.streaming.TikTok),
            buildRow("🎞️", "HBO Max", info.streaming.HBO),
            buildRow("🏔️", "Paramount+", info.streaming.Paramount)
        ]}
      ]
    };
  } else if (widgetType === "AI") {
    titleText = "AI 助手"; titleIcon = "sf-symbol:sparkles"; titleColor = "#AF52DE";
    bodyContent = {
      type: "stack", direction: "row", gap: 16,
      children: [
        { type: "stack", direction: "column", gap: 12, flex: 1, children: [
            buildRow("🤡", "ChatGPT", info.ai.ChatGPT),
            buildRow("✨", "Gemini", info.ai.Gemini)
        ]},
        { type: "stack", direction: "column", gap: 12, flex: 1, children: [
            buildRow("🧠", "Claude", info.ai.Claude),
            buildRow("✖️", "Grok", info.ai.Grok)
        ]}
      ]
    };
  }

  return {
    type: "widget",
    url: "egern://",
    padding: 16,
    gap: 16,
    backgroundColor: { light: "#F2F2F7", dark: "#121212" }, // 极简底色，拒绝套娃
    children: [
      {
        type: "stack", direction: "row", alignItems: "center", gap: 6,
        children: [
          { type: "image", src: titleIcon, color: titleColor, width: 16, height: 16 },
          { type: "text", text: titleText, font: { size: 14, weight: "bold" }, textColor: { light: "#000000", dark: "#FFFFFF" } },
          { type: "spacer" },
          { type: "date", date: new Date().toISOString(), format: "time", font: { size: 11, weight: "medium" }, textColor: "#8E8E93" }
        ]
      },
      bodyContent
    ]
  };
}
