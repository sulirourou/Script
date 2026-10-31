/**
 * 桌面小组件: 🌏 IP 信息面板 - 终极美化版 (IPIP + cip.cc 双核定位)
 * 版本：v1.1 (2026-10-31)
 * 名称：POLICY / 值：自定义策略组名 (代理出口信息与代理延迟统一走此策略组，不填=默认路由)
 * 名称：LMT / 值：流媒体检测策略组名 (NF/DP/TK；POLICY 已设置时以 POLICY 为准)
 * 名称：AI / 值：AI 检测策略组名 (GPT/CL/GM；POLICY 已设置时以 POLICY 为准)
 *
 * 更新日志：
 * - v1.1：① 修复小号显示：原版不分尺寸，小号硬塞双列 14 行面板导致文字全被截断；
 *   新增小号专用布局，只显示代理出口信息（出口/落地/厂商/属性/纯净/延迟），
 *   且小号只请求出口信息与代理延迟，不再跑本地定位与 6 项解锁检测；
 *   ② 新增环境变量 POLICY / LMT / AI（优先级 POLICY ＞ LMT/AI ＞ 默认）；
 *   ③ IPPure 同一接口原来每轮请求两次（出口信息与纯净度各一次），合并为一次，
 *   避免浪费且防止两次结果落在不同出口上。
 */
export default async function(ctx) {
  const C = {
    bg: { light: '#FFFFFF', dark: '#121212' },       
    barBg: { light: '#0000001A', dark: '#FFFFFF22' },
    text: { light: '#1C1C1E', dark: '#FFFFFF' },     
    dim: { light: '#8E8E93', dark: '#8E8E93' },      
    cpu: { light: '#007AFF', dark: '#0A84FF' },
    mem: { light: '#AF52DE', dark: '#BF5AF2' },
    disk: { light: '#FF9500', dark: '#FF9F0A' },
    netRx: { light: '#34C759', dark: '#30D158' },
    netTx: { light: '#5856D6', dark: '#5E5CE6' },
    yellow: { light: '#FFCC00', dark: '#FFD60A' },
    red: { light: '#FF3B30', dark: '#FF453A' }
  };

  const fmtProxyISP = (isp) => {
    if (!isp) return "未知";
    let s = String(isp);
    if (/it7/i.test(s)) return "IT7 Network";
    if (/dmit/i.test(s)) return "DMIT Network";
    if (/cloudflare/i.test(s)) return "Cloudflare";
    if (/akamai/i.test(s)) return "Akamai";
    if (/amazon|aws/i.test(s)) return "AWS";
    if (/google/i.test(s)) return "Google Cloud";
    if (/microsoft|azure/i.test(s)) return "Azure";
    if (/alibaba|aliyun/i.test(s)) return "阿里云";
    if (/tencent/i.test(s)) return "腾讯云";
    if (/oracle/i.test(s)) return "Oracle Cloud";
    if (/racknerd/i.test(s)) return "RackNerd";
    return s.length > 11 ? s.substring(0, 11) + "..." : s; 
  };

  const getFlag = (code) => {
    if (!code || code.toUpperCase() === 'TW') return '🇨🇳'; 
    if (code.toUpperCase() === 'XX' || code === 'OK') return '✅';
    return String.fromCodePoint(...code.toUpperCase().split('').map(c => 127397 + c.charCodeAt()));
  };

  const BASE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
  const commonHeaders = { "User-Agent": BASE_UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8" };

  const env = ctx.env || {};
  const cleanEnv = (v) => (typeof v === "string" ? v.trim() : "");
  const POLICY = cleanEnv(env.POLICY);
  const LMT_POLICY = POLICY || cleanEnv(env.LMT);
  const AI_POLICY = POLICY || cleanEnv(env.AI);
  const IS_SMALL = (ctx.widgetFamily || "") === "systemSmall";
  const httpGet = (url, opts, policy) =>
    ctx.http.get(url, policy ? { ...(opts || {}), policy } : (opts || {}));

  const readBody = async (r) => {
    if (!r) return "";
    if (typeof r.body === "string" && r.body.length) return r.body;
    if (typeof r.text === "function") {
      try { const t = await r.text(); return typeof t === "string" ? t : ""; } catch { return ""; }
    }
    return "";
  };

  const d = ctx.device || {};
  const isWifi = !!d.wifi?.ssid;
  let netName = "未连接", netIcon = "antenna.radiowaves.left.and.right";
  
  const netInfo = (typeof $network !== 'undefined') ? $network : (ctx.network || {});
  let localIp = netInfo.v4?.primaryAddress || d.ipv4?.address || "获取失败";
  let gateway = netInfo.v4?.primaryRouter || d.ipv4?.gateway || "无网关";

  if (isWifi) { netName = d.wifi.ssid; netIcon = "wifi"; }
  else if (d.cellular?.radio) {
    const radioMap = { "GPRS": "2.5G", "EDGE": "2.75G", "WCDMA": "3G", "LTE": "4G", "NR": "5G", "NRNSA": "5G" };
    netName = `${radioMap[d.cellular.radio.toUpperCase().replace(/\s+/g, "")] || d.cellular.radio}`;
    gateway = "蜂窝内网";
  }

  // 🚀 核心更新：保留 IPIP，引入 cip.cc 并使用 curl 伪装极速获取纯文本
  const fetchLocal = async () => {
    // 方案 1: IPIP.net (首选，信息全面)
    try {
      const res = await ctx.http.get('https://myip.ipip.net/json', { headers: commonHeaders, timeout: 2500 });
      const rawText = await readBody(res);
      if (rawText) {
        const body = JSON.parse(rawText);
        if (body?.data?.ip) return {
          ip: body.data.ip,
          loc: `${body.data.location?.[1] || ""} ${body.data.location?.[2] || ""}`.trim()
        };
      }
    } catch (e) {}

    // 方案 2: cip.cc (国内极客最爱备用，精准带位置)
    try {
      const res2 = await ctx.http.get('http://www.cip.cc/', { 
        headers: { "User-Agent": "curl/7.81.0" }, // 伪装成 curl，cip.cc 会直接返回纯净文本，解析极快
        timeout: 2500 
      });
      const rawText2 = await readBody(res2);
      if (rawText2) {
        // cip.cc 返回格式如: "IP : 1.2.3.4 \n 地址 : 中国 广东 深圳"
        const ipMatch = rawText2.match(/IP\s*:\s*([0-9\.]+)/i);
        const locMatch = rawText2.match(/地址\s*:\s*([^\n\r]+)/i);
        if (ipMatch && ipMatch[1]) {
          // 清理掉多余的 "中国" 和重复空格，让排版更好看
          let loc = locMatch ? locMatch[1].replace(/中国/g, '').replace(/\s+/g, ' ').trim() : "未知";
          return {
            ip: ipMatch[1],
            loc: loc || "未知"
          };
        }
      }
    } catch (e2) {}

    return { ip: "获取失败", loc: "未知" };
  };

  const fetchIPPure = async () => {
    try {
      const res = await httpGet('https://my.ippure.com/v1/info', { timeout: 4000 }, POLICY);
      const rawText = await readBody(res);
      if (!rawText) return null;
      return { data: JSON.parse(rawText), rawText };
    } catch (e) { return null; }
  };

  const buildProxy = (data, rawText) => {
    try {
      const flag = getFlag(data.countryCode || data.country_code);
      
      let rawIsp = data.isp || data.ISP || data.org || data.organization || data.network || data.as || data.company;
      if (typeof rawIsp === 'object' && rawIsp !== null) {
        rawIsp = rawIsp.name || rawIsp.org || JSON.stringify(rawIsp);
      }
      if (!rawIsp && data.asn) {
        rawIsp = typeof data.asn === 'object' ? (data.asn.name || data.asn.org) : String(data.asn);
      }
      if (/^\d+$/.test(String(rawIsp).trim()) || /^AS\d+/i.test(String(rawIsp).trim())) {
        const lowerJson = rawText.toLowerCase();
        if (lowerJson.includes('google')) rawIsp = "Google";
        else if (lowerJson.includes('oracle')) rawIsp = "Oracle";
        else if (lowerJson.includes('amazon') || lowerJson.includes('aws')) rawIsp = "AWS";
        else if (lowerJson.includes('cloudflare')) rawIsp = "Cloudflare";
        else if (lowerJson.includes('alibaba') || lowerJson.includes('aliyun')) rawIsp = "Aliyun";
        else if (lowerJson.includes('tencent')) rawIsp = "Tencent";
        else if (lowerJson.includes('microsoft') || lowerJson.includes('azure')) rawIsp = "Microsoft";
      }
      return { ip: data.ip || "获取失败", loc: `${flag} ${data.city || data.country || ""}`.trim(), isp: fmtProxyISP(rawIsp), cc: data.countryCode || data.country_code || "XX" };
    } catch (e) { return { ip: "获取失败", loc: "未知", isp: "未知", cc: "XX" }; }
  };

  const fetchLocalDelay = async () => {
    const start = Date.now();
    try { await ctx.http.get('http://www.baidu.com', { timeout: 2000 }); return `${Date.now() - start} ms`; } catch (e) { return "超时"; }
  };

  const fetchProxyDelay = async () => {
    const start = Date.now();
    try { await httpGet('http://cp.cloudflare.com/generate_204', { timeout: 2000 }, POLICY); return `${Date.now() - start} ms`; } catch (e) { return "超时"; }
  };

  async function checkNetflix() {
    try {
      const checkStatus = async (id) => {
        const r = await httpGet(`https://www.netflix.com/title/${id}`, { timeout: 4000, headers: commonHeaders, followRedirect: false }, LMT_POLICY).catch(() => null);
        return r ? r.status : 0;
      };
      const sFull = await checkStatus(70143836); 
      const sOrig = await checkStatus(81280792); 
      if (sFull === 200) return "OK"; 
      if (sOrig === 200) return "🍿"; 
      return "❌"; 
    } catch { return "❌"; }
  }

  async function checkDisney() {
    try {
      const res = await httpGet("https://www.disneyplus.com", { timeout: 4000, headers: commonHeaders, followRedirect: false }, LMT_POLICY).catch(() => null);
      if (!res || res.status === 403) return "❌";
      const loc = res.headers?.location || res.headers?.Location || "";
      if (loc.includes("unavailable")) return "❌";
      return "OK"; 
    } catch { return "❌"; }
  }

  async function checkTikTok() {
    try {
      const r = await httpGet("https://www.tiktok.com/explore", { timeout: 4000, headers: commonHeaders, followRedirect: false }, LMT_POLICY).catch(() => null);
      if (!r || r.status === 403 || r.status === 401) return "❌";
      const body = await readBody(r);
      if (body.includes("Access Denied") || body.includes("Please wait...")) return "❌";
      const m = body.match(/"region":"([A-Z]{2})"/i);
      return m?.[1] ? m[1].toUpperCase() : "OK";
    } catch { return "❌"; }
  }

  async function checkChatGPT() {
    try {
      const traceRes = await httpGet("https://chatgpt.com/cdn-cgi/trace", { timeout: 3000 }, AI_POLICY).catch(() => null);
      const tb = await readBody(traceRes);
      const m = tb?.match(/loc=([A-Z]{2})/);
      return m?.[1] ? m[1].toUpperCase() : "OK";
    } catch { return "❌"; }
  }

  async function checkClaude() {
    try {
      const res = await httpGet("https://claude.ai/login", { 
        timeout: 5000, 
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      }, AI_POLICY).catch(() => null);
      if (!res) return "❌";
      const status = res.status;
      const body = await readBody(res);
      if (body.includes("App unavailable") || body.includes("certain regions")) return "❌";
      if (status === 403 && body.includes("1020")) return "❌";
      if (status === 403 && (body.includes("cf-turnstile") || body.includes("Just a moment") || body.includes("Challenge"))) return "OK";
      if (status === 200 || status === 301 || status === 302) return "OK";
      return "❌";
    } catch { return "❌"; }
  }

  async function checkGemini() {
    try {
      const res = await httpGet("https://gemini.google.com/app", { timeout: 4000, headers: commonHeaders, followRedirect: false }, AI_POLICY).catch(() => null);
      if (!res) return "❌";
      const loc = res.headers?.location || res.headers?.Location || "";
      if (loc.includes("faq")) return "❌";
      return "OK";
    } catch { return "❌"; }
  }

  const ippure = await fetchIPPure();
  const proxyData = ippure ? buildProxy(ippure.data, ippure.rawText) : { ip: "获取失败", loc: "未知", isp: "未知", cc: "XX" };
  const purityData = ippure ? ippure.data : {};

  let localData = { ip: "获取失败", loc: "未知" };
  let localDelay = "超时", proxyDelay = "超时";
  let rNF = "❌", rDP = "❌", rTK = "❌", rGPT = "❌", rCL = "❌", rGM = "❌";
  if (IS_SMALL) {
    // 小号只显示代理出口信息: 只测代理延迟, 本地定位与 6 项解锁检测全部跳过
    proxyDelay = await fetchProxyDelay();
  } else {
    [localData, localDelay, proxyDelay, rNF, rDP, rTK, rGPT, rCL, rGM] = await Promise.all([
      fetchLocal(), fetchLocalDelay(), fetchProxyDelay(),
      checkNetflix(), checkDisney(), checkTikTok(),
      checkChatGPT(), checkClaude(), checkGemini()
    ]);
  }

  const isRes = purityData.isResidential;
  let nativeText = "未知属性", nativeIc = "questionmark.building.fill", nativeCol = C.dim;
  if (isRes === true) { nativeText = "原生住宅"; nativeIc = "house.fill"; nativeCol = C.netRx; } 
  else if (isRes === false) { nativeText = "商业机房"; nativeIc = "building.2.fill"; nativeCol = C.disk; }

  const risk = purityData.fraudScore;
  let riskTxt = "无数据", riskCol = C.dim, riskIc = "questionmark.circle.fill";
  if (risk !== undefined) {
    if (risk >= 70) { riskTxt = `高危 (${risk})`; riskCol = C.red; riskIc = "xmark.shield.fill"; } 
    else if (risk >= 30) { riskTxt = `中危 (${risk})`; riskCol = C.disk; riskIc = "exclamationmark.triangle.fill"; } 
    else { riskTxt = `纯净 (${risk})`; riskCol = C.netRx; riskIc = "checkmark.shield.fill"; }
  }

  const fmtUnlock = (name, res, cc) => {
    let flag = "🚫";
    if (res === "🍿" || res === "APP") flag = res;
    else if (res !== "❌") flag = getFlag(res === "OK" || res === "XX" ? cc : res);
    return `${name} ${flag}`; 
  };
  
  const textVideo = `${fmtUnlock('NF', rNF, proxyData.cc)}   ${fmtUnlock('DP', rDP, proxyData.cc)}   ${fmtUnlock('TK', rTK, proxyData.cc)}`;
  const textAI = `${fmtUnlock('GPT', rGPT, proxyData.cc)}   ${fmtUnlock('CL', rCL, proxyData.cc)}   ${fmtUnlock('GM', rGM, proxyData.cc)}`;

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const TIME_COL = { light: 'rgba(0,0,0,0.3)', dark: 'rgba(255,255,255,0.3)' };

  const Row = (ic, icCol, label, val, valCol) => ({
    type: 'stack', direction: 'row', alignItems: 'center', gap: 5,
    children: [
      { type: 'image', src: `sf-symbol:${ic}`, color: icCol, width: 11, height: 11 },
      { type: 'text', text: label, font: { size: 10, weight: 'regular' }, textColor: C.dim, maxLines: 1 }, 
      { type: 'spacer' },
      { type: 'text', text: val, font: { size: 10, weight: 'medium' }, textColor: valCol, maxLines: 1, minScale: 0.4 }
    ]
  });

  if (IS_SMALL) {
    return {
      type: 'widget',
      padding: 12,
      backgroundColor: C.bg,
      children: [
        { type: 'stack', direction: 'row', alignItems: 'center', gap: 6, children: [
            { type: 'image', src: 'sf-symbol:waveform.path.ecg', color: C.text, width: 14, height: 14 },
            { type: 'text', text: '🌏 代理出口', font: { size: 13, weight: 'bold' }, textColor: C.text },
            { type: 'spacer' },
            { type: 'text', text: timeStr, font: { size: 10, weight: 'medium' }, textColor: TIME_COL }
        ]},
        { type: 'spacer', length: 10 },
        { type: 'stack', direction: 'column', gap: 7, children: [
            Row("paperplane.fill", C.mem, "出口", proxyData.ip, C.text),
            Row("mappin.and.ellipse", C.mem, "落地", proxyData.loc, C.text),
            Row("server.rack", C.mem, "厂商", proxyData.isp, C.text),
            Row(nativeIc, nativeCol, "属性", nativeText, C.text),
            Row(riskIc, riskCol, "纯净", riskTxt, riskCol),
            Row("timer", C.mem, "延迟", proxyDelay, C.text)
        ]}
      ]
    };
  }

  return {
    type: 'widget', 
    padding: 14,
    backgroundColor: C.bg,
    children: [
      { type: 'stack', direction: 'row', alignItems: 'center', gap: 6, children: [
          { type: 'image', src: 'sf-symbol:waveform.path.ecg', color: C.text, width: 16, height: 16 },
          { type: 'text', text: '🌏 IP 信息面板', font: { size: 14, weight: 'bold' }, textColor: C.text },
          { type: 'spacer' },
          { type: 'text', text: timeStr, font: { size: 10, weight: 'medium' }, textColor: TIME_COL }
      ]},
      { type: 'spacer', length: 12 }, 
      { type: 'stack', direction: 'row', gap: 10, children: [
          { type: 'stack', direction: 'column', gap: 4.5, flex: 1, children: [
              Row(netIcon, C.cpu, "环境", netName, C.text),
              Row("wifi.router.fill", C.cpu, "网关", gateway, C.text),
              Row("iphone", C.cpu, "内网", localIp, C.text),
              Row("globe.asia.australia.fill", C.cpu, "公网", localData.ip, C.text),
              Row("map.fill", C.cpu, "位置", localData.loc, C.text),
              Row("timer", C.cpu, "延迟", localDelay, C.text), 
              Row("play.tv.fill", C.cpu, "影视", textVideo, C.text) 
          ]},
          { type: 'stack', width: 0.5, backgroundColor: C.barBg },
          { type: 'stack', direction: 'column', gap: 4.5, flex: 1, children: [
              Row("paperplane.fill", C.mem, "出口", proxyData.ip, C.text),
              Row("mappin.and.ellipse", C.mem, "落地", proxyData.loc, C.text),
              Row("server.rack", C.mem, "厂商", proxyData.isp, C.text),
              Row(nativeIc, nativeCol, "属性", nativeText, C.text), 
              Row(riskIc, riskCol, "纯净", riskTxt, riskCol),
              Row("timer", C.mem, "延迟", proxyDelay, C.text), 
              Row("cpu", C.mem, "智能", textAI, C.text) 
          ]}
      ]},
      { type: 'spacer' }
    ]
  };
}
