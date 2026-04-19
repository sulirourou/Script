/**
 * 🌏 Egern 独立组件: IP / 流媒体 / AI (纯净版 + 可视化自由切换)
 * * ==========================================
 * 📚 可视化环境变量配置说明 (告别 YAML 代码！)
 * ==========================================
 * 只需要在 Egern App 当前小组件的【添加环境变量】处，添加以下参数：
 * * * 1️⃣ 名称：面板
 * * 可选的值有三种（填其中一个即可）：
 * - 值：IP       (显示本地网络与落地代理节点纯净度)
 * - 值：流媒体    (显示 Netflix、Disney 等流媒体解锁情况)
 * - 值：AI       (显示 ChatGPT、Gemini 等 AI 解锁情况)
 * * 💡 如果你什么都不填，它默认显示【IP 面板】。
 * ==========================================
 */

const localUrl = "https://myip.ipip.net/json";
const proxyUrl = "https://my.ippure.com/v1/info";
const Dazn_BASE_URL = "https://startup.core.indazn.com/misl/v5/Startup";
const Discovery_token_BASE_URL = "https://us1-prod-direct.discoveryplus.com/token?deviceId=d1a4a5d25212400d1e6985984604d740&realm=go&shortlived=true";
const Discovery_BASE_URL = "https://us1-prod-direct.discoveryplus.com/users/me";
const TIMEOUT = 3500;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.61 Safari/537.36';

export default async function(ctx) {
  // 💡 核心修改：支持全中文的可视化变量读取，告别 YAML
  let widgetType = "IP"; // 默认显示 IP 面板
  
  if (ctx && ctx.env) {
      // 支持“面板”或“类型”或英文“TYPE”作为变量名
      let envInput = ctx.env.面板 || ctx.env.类型 || ctx.env.TYPE || "";
      envInput = String(envInput).trim().toUpperCase();
      
      if (envInput === "流媒体" || envInput === "STREAM") {
          widgetType = "STREAM";
      } else if (envInput === "AI") {
          widgetType = "AI";
      } else if (envInput === "IP" || envInput === "网络") {
          widgetType = "IP";
      }
  }
  
  let info = {
    local: { ip: "获取中...", loc: "未知", isp: "未知" },
    landing: { ip: "获取中...", type: "IPv4", asn: "", org: "", flag: "", loc: "未知", nativeText: "", riskText: "", code: "UN", riskLevel: 0 },
    streaming: {}, ai: {}
  };

  // 1. 获取本地 IP（纯净版：仅使用 ipip.net）
  async function getLocalIP() {
    try {
      let res = await ctx.http.get(localUrl, { timeout: TIMEOUT, headers: { 'User-Agent': UA } });
      let j = await res.json();
      if (j.ret === "ok" && j.data) {
          let loc = j.data.location || [];
          return { ip: j.data.ip, loc: `${loc[0]||""} ${loc[2]||""}`.trim() || "未知", isp: loc[4] || "未知" };
      }
      throw new Error();
    } catch (e) { 
      return { ip: "获取失败", loc: "未知", isp: "未知" }; 
    }
  }

  // 2. 获取落地节点 IP (ippure)
  async function getLandingIP() {
    try {
      let res = await ctx.http.get(proxyUrl, { timeout: TIMEOUT, headers: { 'User-Agent': UA } });
      let j = await res.json();
      const ip = j.ip || j.query || "失败";
      const type = ip.includes(':') ? 'IPv6' : 'IPv4';
      const risk = j.fraudScore || 0;
      let riskText = risk >= 80 ? `高风险(${risk})` : risk >= 40 ? `中等(${risk})` : `低风险(${risk})`;
      return {
        ip, type, asn: j.asn || "", org: j.asOrganization || "",
        flag: flagEmoji(j.countryCode), loc: `${j.country||""} ${j.city||""}`.trim() || "未知",
        code: j.countryCode || "UN", nativeText: j.isResidential ? "原生" : "机房", riskText, riskLevel: risk
      };
    } catch (e) { return { ip: "网络错误", type: "IPv4", asn: "", org: "", flag: "❌", loc: "未知", code: "UN", nativeText: "未知", riskText: "失败", riskLevel: 0 }; }
  }

  // 通用检测请求函数
  async function check(url, validator, options = {}) {
    try {
      let res = await (options.method === 'POST' ? ctx.http.post(url, options) : ctx.http.get(url, options));
      return await validator(res);
    } catch (e) { return "超时"; }
  }

  // 根据组件类型，分配并发任务
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
      check("https://www.paramountplus.com/", async (res) => res.status === 200 ? `支持 ${info.landing.flag}` : (res.status === 302 || res.status === 403 ? "未支持" : "超时"), { timeout: TIMEOUT, headers: { 'User-Agent': UA } }).then(r => info.streaming.Paramount = r),
      check(Dazn_BASE_URL, async (res) => {
          let data = await res.text();
          let re = new RegExp('"GeolocatedCountry":"(.*?)"', 'gm');
          let ret = re.exec(data);
          return (ret && ret.length === 2) ? `支持 ${flagEmoji(ret[1])}` : "未支持";
      }, { method: 'POST', timeout: TIMEOUT, headers: { 'User-Agent': UA, "Content-Type": "application/json" }, body: JSON.stringify({ "LandingPageKey":"generic", "Platform":"web", "PlatformAttributes":{}, "Version":"2" }) }).then(r => info.streaming.Dazn = r),
      check(Discovery_token_BASE_URL, async (res) => {
          try {
              let d = await res.json();
              let token = d.data.attributes.token;
              let res2 = await ctx.http.get(Discovery_BASE_URL, { timeout: TIMEOUT, headers: { 'User-Agent': UA, "Cookie": `st=${token}` } });
              let resD = await res2.json();
              let loc = resD.data.attributes.currentLocationTerritory;
              return loc === 'us' ? `支持 🇺🇸` : `未支持(${loc})`;
          } catch(e) { return "超时"; }
      }, { timeout: TIMEOUT, headers: { 'User-Agent': UA } }).then(r => info.streaming.Discovery = r)
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

  // 国旗转换
  function flagEmoji(code) {
    if (!code || code.length !== 2) return "";
    if (code.toUpperCase() === "TW") code = "CN";
    if (code.toUpperCase() === "UK") code = "GB";
    return String.fromCodePoint(...code.toUpperCase().split('').map(c => 127397 + c.charCodeAt()));
  }

  // 状态颜色判断
  function getStatusColor(text) {
    if (!text) return "#8E8E93";
    if (text.includes("支持") || text.includes("原生") || text.includes("低")) return "#34C759";
    if (text.includes("未") || text.includes("失败") || text.includes("高") || text.includes("❌") || text.includes("🚫")) return "#FF3B30";
    if (text.includes("自制剧") || text.includes("机房") || text.includes("中") || text.includes("⚠️")) return "#FF9500";
    return "#8E8E93";
  }

  // 格式化文本
  function formatStatus(text) {
    if (!text) return "-";
    if (text === "未支持" || text.includes("未支持(")) return `${text} 🚫`;
    if (text === "失败") return "失败 ❌";
    if (text === "超时") return "超时 ⚠️";
    if (text === "自制剧" || text === "仅自制剧") return "自制剧 ⚠️";
    return text;
  }

  // 字符串截断
  function cutString(str, maxLen) {
    if (!str) return "-";
    let chars = Array.from(str);
    let len = 0;
    let res = "";
    for (let i = 0; i < chars.length; i++) {
      let char = chars[i];
      let code = char.codePointAt(0);
      let w = code > 255 ? 1.5 : 1; 
      if (len + w > maxLen) {
        return res + "…";
      }
      len += w;
      res += char;
    }
    return res;
  }

  // 渲染流媒体/AI 紧凑行
  function buildCompactRow(icon, name, value) {
    let displayVal = formatStatus(value);
    return {
      type: "stack", direction: "row", alignItems: "center", gap: 2,
      children: [
        { type: "text", text: `${icon} ${name}`, font: { size: 13, weight: "medium" }, textColor: { light: "#666666", dark: "#AAAAAA" }, maxLines: 1 },
        { type: "spacer" },
        { type: "text", text: displayVal, font: { size: 13, weight: "bold" }, textColor: getStatusColor(displayVal), maxLines: 1, minScale: 0.7 }
      ]
    };
  }

  // 渲染 IP 表格行
  function buildIPRow(label, value, color, maxStrLen) {
    let displayVal = formatStatus(value);
    if (maxStrLen) displayVal = cutString(displayVal, maxStrLen); 
    
    return {
      type: "stack", direction: "row", alignItems: "center", gap: 6,
      children: [
        { type: "stack", width: 32, children: [
          { type: "text", text: label, font: { size: 12, weight: "medium" }, textColor: { light: "#666666", dark: "#999999" }, maxLines: 1 }
        ]},
        { type: "text", text: displayVal, font: { size: 12, weight: "bold" }, textColor: color || { light: "#000000", dark: "#FFFFFF" }, maxLines: 1 },
        { type: "spacer" }
      ]
    };
  }

  // 构建主 UI
  let titleText = "", titleIcon = "", titleColor = "";
  let bodyContent;

  if (widgetType === "IP") {
    titleText = "IP 纯净度"; titleIcon = "sf-symbol:network"; titleColor = "#0A84FF";
    
    bodyContent = {
      type: "stack", direction: "row", gap: 14, alignItems: "start",
      children: [
        { type: "stack", direction: "column", gap: 6, flex: 1, children: [
            { type: "text", text: "🏠 本地网络", font: { size: 13, weight: "bold" }, textColor: { light: "#8E8E93", dark: "#636366" } },
            buildIPRow("IPv4", info.local.ip, null, 15),
            buildIPRow("ISP", info.local.isp, null, 15),
            buildIPRow("位置", info.local.loc, null, 15),
            { type: "text", text: " ", font: { size: 12 } } 
        ]},
        { type: "stack", direction: "column", gap: 6, flex: 1.2, children: [
            { type: "text", text: "🌐 代理节点", font: { size: 13, weight: "bold" }, textColor: { light: "#8E8E93", dark: "#636366" } },
            buildIPRow(info.landing.type, info.landing.ip, null, 18),
            buildIPRow("ASN", `AS${info.landing.asn} ${info.landing.org}`.trim(), null, 18),
            buildIPRow("位置", info.landing.loc, null, 18),
            buildIPRow("风险", `${info.landing.nativeText} · ${info.landing.riskText}`, getStatusColor(info.landing.riskText), 18)
        ]}
      ]
    };
  } else if (widgetType === "STREAM") {
    titleText = "流媒体解锁"; titleIcon = "sf-symbol:play.tv.fill"; titleColor = "#FF2D55";
    bodyContent = {
      type: "stack", direction: "row", gap: 14, 
      children: [
        { type: "stack", direction: "column", gap: 6, flex: 1, children: [
            buildCompactRow("🎥", "Netflix", info.streaming.Netflix),
            buildCompactRow("▶️", "YouTube", info.streaming.YouTube),
            buildCompactRow("🏰", "Disney+", info.streaming.Disney),
            buildCompactRow("🥊", "Dazn", info.streaming.Dazn)
        ]},
        { type: "stack", direction: "column", gap: 6, flex: 1, children: [
            buildCompactRow("🎵", "TikTok", info.streaming.TikTok),
            buildCompactRow("🎞️", "HBO Max", info.streaming.HBO),
            buildCompactRow("🏔️", "Paramount", info.streaming.Paramount),
            buildCompactRow("🌍", "Discovery", info.streaming.Discovery)
        ]}
      ]
    };
  } else if (widgetType === "AI") {
    titleText = "AI 助手"; titleIcon = "sf-symbol:sparkles"; titleColor = "#AF52DE";
    bodyContent = {
      type: "stack", direction: "row", gap: 16,
      children: [
        { type: "stack", direction: "column", gap: 14, flex: 1, children: [
            buildCompactRow("🤡", "ChatGPT", info.ai.ChatGPT),
            buildCompactRow("✨", "Gemini", info.ai.Gemini)
        ]},
        { type: "stack", direction: "column", gap: 14, flex: 1, children: [
            buildCompactRow("🧠", "Claude", info.ai.Claude),
            buildCompactRow("✖️", "Grok", info.ai.Grok)
        ]}
      ]
    };
  }

  return {
    type: "widget",
    url: "egern://",
    padding: 16, 
    gap: 12, 
    backgroundColor: { light: "#F2F2F7", dark: "#121212" }, 
    children: [
      {
        type: "stack", direction: "row", alignItems: "center", gap: 6,
        children: [
          { type: "image", src: titleIcon, color: titleColor, width: 18, height: 18 },
          { type: "text", text: titleText, font: { size: 15, weight: "bold" }, textColor: { light: "#000000", dark: "#FFFFFF" } },
          { type: "spacer" },
          { type: "date", date: new Date().toISOString(), format: "time", font: { size: 12, weight: "medium" }, textColor: "#8E8E93" }
        ]
      },
      bodyContent
    ]
  };
}
