/**
 * 🌏 Egern IP-API 小组件
 * 版本：v1.4 (2026-10-30)
 * 环境变量 (可选):
 * 名称：POLICY
 * 值：自定义策略组节点名称，例如 美国节点；不填则按默认路由查询
 *
 * 🔧 v1.4 变更: 风险公式补漏检: ip-api 对部分云 IP 不打 hosting 标记
 * (实测 34.3.105.110 谷歌云 proxy/hosting 均为 false 却显示 0 分原生住宅),
 * 新增 org/as 关键词判定: 含 cloud/hosting/datacenter/data center/vps/idc
 * 时同样按机房 +40 分并显示商业机房。原有 proxy +50 / hosting +40 不变。
 *
 * 🔧 v1.3 变更: 按新规范把环境变量用法移到版本号正下方 (名称/值格式); 无功能变化。
 *
 * 🔧 v1.2 变更 (针对 v1.1 在共享节点出口上仍持续获取失败):
 * - 失败原因可见: 彻底失败时详情行显示具体原因 (HTTP 状态码/接口 message/
 *   网络错误), 不再只有一句「获取失败」无从排查。
 * - 识别接口限流: ip-api 免费额度按出口 IP 计算 (45 次/分钟), 共享节点出口
 *   常年被同出口其他用户耗尽 -> HTTP 429; 收到 429 时按响应头 X-Ttl 等待
 *   (上限 4 秒) 后自动重试, 不再傻等下一轮刷新。
 * - POLICY 兜底: 若指定了策略组但经它查询全失败, 自动改用默认路由再试一次
 *   (策略组名填错/该组异常时不至于整块报废)。
 * - 减少接口消耗: 本地网络的 ip-api 详情按 IP 缓存, 本地 IP 没变时零请求
 *   (原版每次刷新要为本地块额外烧 2 次额度, 与节点查询抢同一份配额)。
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
    // 关键词补漏: org/as 含云/机房关键词时也判机房 (ip-api 对谷歌云等漏标 hosting)
    const orgAsText = `${main.org || ""} ${main.as || ""}`.toLowerCase();
    const dcByKeyword = /cloud|hosting|datacenter|data center|\bvps\b|\bidc\b/.test(orgAsText);
    const isHostLike = !!(main.hosting || dcByKeyword);
    proxyData.isDC = !!(isHostLike || main.proxy);
    let score = 0;
    if (main.proxy) score += 50;
    if (isHostLike) score += 40;
    proxyData.risk = Math.min(100, score);
    proxyData.success = true;
    return true;
  }

  // 单次查询: 返回 { j } 成功 / { err, status, ttl } 失败, 不抛异常
  async function tryProxyQuery(url, usePolicy, timeoutMs) {
    const opts = { timeout: timeoutMs || TIMEOUT_PROXY, headers: { 'User-Agent': UA } };
    if (usePolicy && POLICY) opts.policy = POLICY;
    try {
      const r = await ctx.http.get(url, opts);
      const status = r.status || 0;
      if (status === 429) {
        let ttl = 0;
        try { ttl = parseFloat((r.headers && r.headers.get) ? (r.headers.get('x-ttl') || 0) : 0) || 0; } catch (e) {}
        return { err: "HTTP 429 接口限流", status: 429, ttl };
      }
      let j = null;
      try { j = await r.json(); } catch (e) { return { err: "接口响应解析失败" }; }
      if (status !== 200) return { err: `HTTP ${status}` };
      if (j && j.status === "success") return { j };
      return { err: (j && j.message) ? `接口: ${j.message}` : "接口返回异常" };
    } catch (e) {
      return { err: (e && e.message) ? String(e.message).slice(0, 40) : "网络错误" };
    }
  }

  async function fetchProxy() {
    const urlEn = `${API_BASE}${FIELDS}`;
    const urlCn = `${API_BASE}${FIELDS}&lang=zh-CN`;
    let lastErr = "";
    let rlErr = "";
    const note = (r) => { if (r.err) { lastErr = r.err; if (r.status === 429) rlErr = r.err; } };

    // 第 1 轮: 中英并行 (任一成功即可)
    const [rEn, rCn] = await Promise.all([tryProxyQuery(urlEn, true), tryProxyQuery(urlCn, true)]);
    note(rEn); note(rCn);
    if (fillProxy(rEn.j || null, rCn.j || null)) { saveProxyCache(); return; }

    // 第 2 轮: 隔一会单独重试中文 (被限流时按 X-Ttl 等, 上限 4 秒)
    const ttlWait = Math.max(rEn.ttl || 0, rCn.ttl || 0);
    await sleep(rlErr ? Math.min(Math.max(ttlWait, 1), 4) * 1000 : 800);
    const rCn2 = await tryProxyQuery(urlCn, true);
    note(rCn2);
    if (rCn2.j && fillProxy(null, rCn2.j)) { saveProxyCache(); return; }

    // 第 3 轮: 指定了策略组仍全失败 -> 去掉策略组用默认路由再试一次
    if (POLICY) {
      const rCn3 = await tryProxyQuery(urlCn, false);
      note(rCn3);
      if (rCn3.j && fillProxy(null, rCn3.j)) { saveProxyCache(); return; }
    }

    // 全失败: 缓存顶上; 无缓存显示失败 + 原因
    if (!loadProxyCache()) {
      proxyData.ip = "获取失败";
      const reason = rlErr || lastErr;
      if (reason) proxyData.detail = `⚠ ${reason}`;
    }
  }

  function saveLocalCache() {
    try {
      ctx.storage.setString("ipapi_local_v1", JSON.stringify({
        ip: localData.ip,
        d: { title: localData.title, detail: localData.detail, isp: localData.isp, flag: localData.flag }
      }));
    } catch (e) {}
  }

  function loadLocalCache(ip) {
    try {
      const raw = ctx.storage.getString("ipapi_local_v1");
      if (!raw) return false;
      const c = JSON.parse(raw);
      if (!c || c.ip !== ip || !c.d) return false;
      localData.title = c.d.title; localData.detail = c.d.detail;
      localData.isp = c.d.isp; localData.flag = c.d.flag;
      localData.success = true;
      return true;
    } catch (e) { return false; }
  }

  async function fetchLocal() {
    try {
      let resIp = await ctx.http.get(API_LOCAL_IP, { timeout: TIMEOUT, headers: { 'User-Agent': UA } });
      let jIp = await resIp.json();
      if (jIp.ret === "ok" && jIp.data && jIp.data.ip) {
        localData.ip = jIp.data.ip;
        let loc = jIp.data.location || [];
        // 本地 IP 没变: 详情直接用缓存, 不再烧 ip-api 额度
        if (loadLocalCache(localData.ip)) return;
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
          saveLocalCache();
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
