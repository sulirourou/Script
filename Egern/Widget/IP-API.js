/**
 * 🌏 Egern IP-API 小组件
 * 版本：v1.1 (2026-10-30)
 *
 * 🔧 v1.1 变更:
 * - 修复代理信息经常获取失败 (查询接口地址不变): 原版中英双请求用 Promise.all,
 *   任一超时/被限流就整块报失败; 改为 allSettled, 任一成功即可显示, 双双失败时
 *   隔 800ms 自动重试一次; 代理查询超时 3.5s -> 6s; 成功结果写入缓存, 彻底失败
 *   时显示上次成功数据, 不再动不动「获取失败」; 接口返回 status=fail (限流等)
 *   也不再永久卡在「获取中...」。本地网络的双语查询同样改 allSettled, 超时 5s。
 * - 新增环境变量 POLICY: 指定节点网络查询走的策略组 (如填 美国节点), 只影响
 *   节点查询的出口, 本地网络查询不走它。不填则按原默认路由。
 * - 小号专用布局: 只显示节点网络 + 本地网络两组信息, 去掉右侧风险圆环、
 *   原生/住宅与 IP-API 标注 (小号放不下, 原版左右挤压导致文字全被截断)。
 *
 * 环境变量:
 * - POLICY: (可选) 节点网络查询使用的策略组名称, 例: 美国节点
 */

const API_BASE = "http://ip-api.com/json/";
const FIELDS = "?fields=status,message,country,countryCode,regionName,city,isp,org,as,mobile,proxy,hosting,query";
const API_LOCAL_IP = "https://myip.ipip.net/json";
const TIMEOUT = 5000;
const TIMEOUT_PROXY = 6000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.61 Safari/537.36';

export default async function(ctx) {
  let proxyData = { ip: "获取中...", title: "节点网络", detail: "未知", isp: "未知", flag: "🏳️", risk: 0, isDC: false, success: false };
  let localData = { ip: "获取中...", title: "本地网络", detail: "未知", isp: "未知", flag: "🏳️", success: false };
  const POLICY = ((ctx.env && ctx.env.POLICY) || "").toString().trim();

  const countryMap = { "united states": "美国", "us": "美国", "singapore": "新加坡", "japan": "日本", "hong kong": "香港", "taiwan": "台湾", "united kingdom": "英国", "uk": "英国", "korea": "韩国", "south korea": "韩国" };

  function getCnTitle(c, r, d) {
    let res = [];
    const hasEng = (str) => /[a-zA-Z]/.test(str);
    let c_cn = c;
    if (c && hasEng(c) && countryMap[c.toLowerCase()]) c_cn = countryMap[c.toLowerCase()];
    if (c_cn) res.push(c_cn);
    if (r && r !== c_cn && !hasEng(r)) res.push(r);
    if (d && d !== c_cn && d !== r && !hasEng(d)) res.push(d);
    return res.join(" ").trim() || "未知节点";
  }

  function getEnDetail(c, r, d) {
    let res = [];
    let c_low = (c || "").toLowerCase();
    let r_low = (r || "").toLowerCase();
    let d_low = (d || "").toLowerCase();
    if (c) res.push(c);
    if (r && r_low !== c_low && !r_low.includes(c_low)) res.push(r);
    if (d && d_low !== c_low && d_low !== r_low && !d_low.includes(c_low)) res.push(d);
    return res.join(" ").trim() || "未知";
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function saveProxyCache() {
    try {
      ctx.storage.setString("ipapi_proxy_v1", JSON.stringify({
        t: Date.now(),
        d: { ip: proxyData.ip, title: proxyData.title, detail: proxyData.detail, isp: proxyData.isp, flag: proxyData.flag, risk: proxyData.risk, isDC: proxyData.isDC }
      }));
    } catch (e) {}
  }

  function loadProxyCache() {
    try {
      const raw = ctx.storage.getString("ipapi_proxy_v1");
      if (!raw) return false;
      const c = JSON.parse(raw);
      if (!c || !c.d || !c.d.ip || (Date.now() - (c.t || 0)) > 24 * 3600 * 1000) return false;
      proxyData.ip = c.d.ip; proxyData.title = c.d.title; proxyData.detail = c.d.detail;
      proxyData.isp = c.d.isp; proxyData.flag = c.d.flag; proxyData.risk = c.d.risk || 0;
      proxyData.isDC = !!c.d.isDC; proxyData.success = true;
      return true;
    } catch (e) { return false; }
  }

  // en/cn 任一成功即可填充: cn 优先作标题源 (中文地名), en 优先作详情源
  function fillProxy(jEn, jCn) {
    const en = (jEn && jEn.status === "success") ? jEn : null;
    const cn = (jCn && jCn.status === "success") ? jCn : null;
    if (!en && !cn) return false;
    const main = en || cn;
    const nameSrc = cn || en;
    proxyData.ip = main.query;
    proxyData.title = getCnTitle(nameSrc.country, nameSrc.regionName, nameSrc.city);
    proxyData.detail = getEnDetail(main.country, main.regionName, main.city);
    let ispName = main.isp || "";
    let asInfo = main.as || "";
    if (ispName && asInfo.toLowerCase().includes(ispName.split(' ')[0].toLowerCase())) {
      proxyData.isp = asInfo;
    } else {
      proxyData.isp = `${ispName} ${asInfo}`.trim() || "未知";
    }
    proxyData.flag = flagEmoji(main.countryCode);
    proxyData.isDC = !!(main.hosting || main.proxy);
    let score = 0;
    if (main.proxy) score += 50;
    if (main.hosting) score += 40;
    proxyData.risk = Math.min(100, score);
    proxyData.success = true;
    return true;
  }

  async function fetchProxy() {
    const opts = { timeout: TIMEOUT_PROXY, headers: { 'User-Agent': UA } };
    if (POLICY) opts.policy = POLICY;
    const getJson = async (url) => {
      const r = await ctx.http.get(url, opts);
      return await r.json();
    };
    try {
      const [rEn, rCn] = await Promise.allSettled([
        getJson(`${API_BASE}${FIELDS}`),
        getJson(`${API_BASE}${FIELDS}&lang=zh-CN`)
      ]);
      const jEn = rEn.status === "fulfilled" ? rEn.value : null;
      const jCn = rCn.status === "fulfilled" ? rCn.value : null;
      if (fillProxy(jEn, jCn)) { saveProxyCache(); return; }
    } catch (e) {}
    // 双请求都没拿到: 等 800ms 单独重试中文接口一次
    try {
      await sleep(800);
      const jCn = await getJson(`${API_BASE}${FIELDS}&lang=zh-CN`);
      if (fillProxy(null, jCn)) { saveProxyCache(); return; }
    } catch (e) {}
    // 仍失败: 用上次成功缓存顶上, 没有缓存才显示获取失败
    if (!loadProxyCache()) proxyData.ip = "获取失败";
  }

  async function fetchLocal() {
    try {
      let resIp = await ctx.http.get(API_LOCAL_IP, { timeout: TIMEOUT, headers: { 'User-Agent': UA } });
      let jIp = await resIp.json();
      if (jIp.ret === "ok" && jIp.data && jIp.data.ip) {
        localData.ip = jIp.data.ip;
        let loc = jIp.data.location || [];
        const [rCn, rEn] = await Promise.allSettled([
          ctx.http.get(`${API_BASE}${localData.ip}${FIELDS}&lang=zh-CN`, { timeout: TIMEOUT }).then(r => r.json()),
          ctx.http.get(`${API_BASE}${localData.ip}${FIELDS}`, { timeout: TIMEOUT }).then(r => r.json())
        ]);
        const ljCn = rCn.status === "fulfilled" ? rCn.value : null;
        const ljEn = rEn.status === "fulfilled" ? rEn.value : null;
        const cn = (ljCn && ljCn.status === "success") ? ljCn : null;
        const en = (ljEn && ljEn.status === "success") ? ljEn : null;
        if (cn || en) {
          const nameSrc = cn || en;
          const main = en || cn;
          localData.title = getCnTitle(nameSrc.country, nameSrc.regionName, nameSrc.city) || "本地";
          localData.detail = getEnDetail(main.country, main.regionName, main.city);
          localData.flag = flagEmoji(main.countryCode);
          let carrier = "Unicom";
          const ispRaw = (main.isp || "").toLowerCase();
          if (/telecom|电信|ct/i.test(ispRaw)) carrier = "Telecom";
          else if (/mobile|移动|cmcc/i.test(ispRaw)) carrier = "Mobile";
          localData.isp = `China ${carrier}`;
          localData.success = true;
          return;
        }
        localData.title = getCnTitle(loc[0]||"本地", loc[1]||"", loc[2]||"");
        localData.detail = "China Location";
        localData.isp = loc[4] || "未知";
        localData.flag = "🇨🇳";
      }
    } catch (e) {
      localData.ip = "获取失败";
    }
  }

  await Promise.allSettled([fetchProxy(), fetchLocal()]);

  function flagEmoji(code) {
    if (!code || code.length !== 2) return "🏳️";
    if (code.toUpperCase() === "TW") code = "CN";
    if (code.toUpperCase() === "UK") code = "GB";
    return String.fromCodePoint(...code.toUpperCase().split('').map(c => 127397 + c.charCodeAt()));
  }

  function getRiskColor(score) {
    if (score <= 20) return "#34C759"; 
    if (score <= 40) return "#32ADE6"; 
    if (score <= 60) return "#FFCC00"; 
    if (score <= 80) return "#FF9500"; 
    return "#FF3B30"; 
  }

  function buildInfoBlock(data, isLocal, compact) {
    const fFlag = compact ? 11 : 12;
    const fTitle = compact ? 10 : 11;
    const fIp = compact ? 13 : 16;
    const fSub = compact ? 9 : 10;
    const titleColor = { light: "#333333", dark: "#FFFFFF" };
    const subColor = { light: "#666666", dark: "#AAAAAA" };
    return {
      type: "stack", direction: "column", gap: compact ? 2 : 3,
      children: [
        { 
          type: "stack", direction: "row", alignItems: "center", gap: 4,
          children: [
            { type: "text", text: data.flag, font: { size: fFlag } },
            { type: "text", text: data.title, font: { size: fTitle, weight: "bold" }, textColor: titleColor, maxLines: 1 }
          ]
        },
        { type: "text", text: data.ip, font: { size: fIp, weight: "bold" }, textColor: titleColor, maxLines: 1, minScale: 0.5 },
        { 
          type: "stack", direction: "row", alignItems: "center", gap: 4,
          children: [
            { type: "image", src: isLocal ? "sf-symbol:location.fill" : "sf-symbol:map.fill", color: "#8E8E93", width: 10, height: 10 },
            { type: "text", text: data.detail, font: { size: fSub }, textColor: subColor, maxLines: 1, minScale: 0.8 }
          ]
        },
        { 
          type: "stack", direction: "row", alignItems: "center", gap: 4,
          children: [
            { type: "image", src: isLocal ? "sf-symbol:antenna.radiowaves.left.and.right" : "sf-symbol:server.rack", color: "#8E8E93", width: 10, height: 10 },
            { type: "text", text: data.isp, font: { size: fSub }, textColor: subColor, maxLines: 1, minScale: 0.8 }
          ]
        }
      ]
    };
  }

  const riskColor = getRiskColor(proxyData.risk);

  // 小号: 只保留节点网络 + 本地网络两组信息, 去掉右侧圆环/原生住宅/IP-API 标注
  if ((ctx.widgetFamily || "") === "systemSmall") {
    return {
      type: "widget",
      url: "egern://",
      padding: 12,
      backgroundColor: { light: "#FFFFFF", dark: "#121212" },
      children: [
        {
          type: "stack", direction: "column", gap: 10,
          children: [
            buildInfoBlock(proxyData, false, true),
            buildInfoBlock(localData, true, true)
          ]
        }
      ]
    };
  }

  return {
    type: "widget",
    url: "egern://",
    padding: 16,
    backgroundColor: { light: "#FFFFFF", dark: "#121212" },
    children: [
      {
        type: "stack", direction: "row", alignItems: "center",
        children: [
          {
            type: "stack", direction: "column", gap: 12, flex: 1,
            children: [
              buildInfoBlock(proxyData, false),
              buildInfoBlock(localData, true)
            ]
          },
          {
            type: "stack", direction: "column", alignItems: "center", justifyContent: "center", width: 90, gap: 8,
            children: [
              {
                type: "stack", direction: "column", alignItems: "center", justifyContent: "center",
                width: 76, height: 76, borderRadius: 38,
                borderWidth: 6, borderColor: riskColor,
                backgroundColor: { light: "#FFFFFF", dark: "#1C1C1E" },
                children: [
                  { type: "text", text: `${proxyData.risk}`, font: { size: 28, weight: "heavy" }, textColor: riskColor },
                  { type: "text", text: "风险指数", font: { size: 9, weight: "bold" }, textColor: { light: "#FF9F0A", dark: "#FF9F0A" } }
                ]
              },
              {
                type: "stack", direction: "column", alignItems: "center", gap: 2,
                children: [
                  // 💡 仅在此处将 "非原生" 改为 "商业"
                  { type: "text", text: proxyData.isDC ? "商业" : "原生", font: { size: 11, weight: "bold" }, textColor: { light: "#333333", dark: "#DDDDDD" } },
                  { type: "text", text: proxyData.isDC ? "机房" : "住宅", font: { size: 11, weight: "bold" }, textColor: { light: "#333333", dark: "#DDDDDD" } }
                ]
              },
              { type: "text", text: "IP-API", font: { size: 8, weight: "medium" }, textColor: "#34C759" }
            ]
          }
        ]
      }
    ]
  };
}
