/**
 * 🌏 Egern IPPure 小组件
 * 版本：v1.2 (2026-10-30)
 * 环境变量 (可选):
 * 名称：POLICY
 * 值：自定义策略组节点名称，例如 美国节点；不填则按默认路由查询
 *
 * 🔧 v1.2 变更: 按新规范把环境变量用法移到版本号正下方 (名称/值格式); 无功能变化。
 *
 * 🔧 v1.1 变更 (与 IP-API v1.1 同一套方法, 查询接口地址不变):
 * - 修复获取失败: 节点查询原为单请求、无重试, 3.5s 超时一到就整块失败;
 *   改为超时 6s、失败隔 800ms 自动重试一次、成功结果写入缓存, 彻底失败时
 *   显示上次成功数据; 接口返回无 ip 的错误响应时不再永久卡在「获取中...」。
 * - 翻译接口提速 (本版最大开销): 原版每翻一个地名都要重新取一次 token 并
 *   串行等待, 一次刷新最多 14 个翻译请求, 经常把脚本总时长拖爆; 改为 token
 *   全程只取一次、地名打包成一次批量翻译 (节点 1 次、本地 2 次), 翻译失败
 *   仍按原逻辑回退原文。
 * - isResidential 字段缺失时旧版会误判为「商业/机房」, 改为缺失时按住宅处理;
 *   asOrganization/asn 都缺失时不再拼出 "(AS)" 这种残缺 ISP 文案。
 * - 新增环境变量 POLICY: 指定节点查询走的策略组 (如填 美国节点), 只影响
 *   节点查询的出口, 本地查询与翻译请求不走它。不填则按原默认路由。
 * - 小号专用布局: 只显示节点网络 + 本地网络两组信息, 去掉右侧风险圆环、
 *   原生/住宅与 IPPure 标注 (小号放不下, 原版左右挤压导致文字全被截断)。
 *
 */

const API_MAIN = "https://my.ippure.com/v1/info";
const API_LOCAL_IP = "https://myip.ipip.net/json";
const TIMEOUT = 5000;
const TIMEOUT_PROXY = 6000;
const TIMEOUT_TRANS = 3000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.61 Safari/537.36';

export default async function(ctx) {
  // 1. 初始化数据容器 (配合 IP-API 的 UI)
  let proxyData = { ip: "获取中...", title: "节点网络", detail: "未知", isp: "未知", flag: "🏳️", risk: 0, isDC: false, success: false };
  let localData = { ip: "获取中...", title: "本地网络", detail: "未知", isp: "未知", flag: "🇨🇳", success: false };
  const POLICY = ((ctx.env && ctx.env.POLICY) || "").toString().trim();

  // 💡 终极防线：常见国家名强制兜底字典
  const countryMap = { "united states": "美国", "us": "美国", "singapore": "新加坡", "japan": "日本", "hong kong": "香港", "taiwan": "台湾", "united kingdom": "英国", "uk": "英国", "korea": "韩国", "south korea": "韩国" };

  // 💡 终极防线：纯中文标题提取器（只要带英文直接丢弃去重）
  function getCnTitle(c, r, d) {
    let res = [];
    const hasEng = (str) => /[a-zA-Z]/.test(str);
    let c_cn = c;
    if (c && hasEng(c) && countryMap[c.toLowerCase()]) c_cn = countryMap[c.toLowerCase()];
    if (c_cn) res.push(c_cn);
    // 省和市：只要包含任何英文字母，直接抛弃
    if (r && r !== c_cn && !hasEng(r)) res.push(r);
    if (d && d !== c_cn && d !== r && !hasEng(d)) res.push(d);
    return res.join(" ").trim() || "未知节点";
  }

  // 💡 终极防线：纯英文详情提取器（包含国家名直接丢弃去重）
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

  // 2. 微软 Edge 翻译: token 全程只取一次 + 批量翻译 (失败整组回退原文)
  let tokenPromise = null;
  function getMsToken() {
    if (!tokenPromise) {
      tokenPromise = (async () => {
        const r = await ctx.http.get("https://edge.microsoft.com/translate/auth", { timeout: TIMEOUT_TRANS, headers: { 'User-Agent': UA } });
        return await r.text();
      })();
    }
    return tokenPromise;
  }

  async function msTranslateBatch(texts, to) {
    const list = texts.map(t => t || "");
    try {
      const token = await getMsToken();
      if (!token) return list;
      const reqRes = await ctx.http.post(`https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${to}`, {
        timeout: TIMEOUT_TRANS,
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(list.map(t => ({ "Text": t || " " })))
      });
      const res = await reqRes.json();
      if (!Array.isArray(res)) return list;
      return list.map((t, i) => {
        if (!t || t === "Unknown") return "";
        const tr = res[i] && res[i].translations && res[i].translations[0] && res[i].translations[0].text;
        return tr || t;
      });
    } catch (e) { return list; }
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function saveProxyCache() {
    try {
      ctx.storage.setString("ippure_proxy_v1", JSON.stringify({
        t: Date.now(),
        d: { ip: proxyData.ip, title: proxyData.title, detail: proxyData.detail, isp: proxyData.isp, flag: proxyData.flag, risk: proxyData.risk, isDC: proxyData.isDC }
      }));
    } catch (e) {}
  }

  function loadProxyCache() {
    try {
      const raw = ctx.storage.getString("ippure_proxy_v1");
      if (!raw) return false;
      const c = JSON.parse(raw);
      if (!c || !c.d || !c.d.ip || (Date.now() - (c.t || 0)) > 24 * 3600 * 1000) return false;
      proxyData.ip = c.d.ip; proxyData.title = c.d.title; proxyData.detail = c.d.detail;
      proxyData.isp = c.d.isp; proxyData.flag = c.d.flag; proxyData.risk = c.d.risk || 0;
      proxyData.isDC = !!c.d.isDC; proxyData.success = true;
      return true;
    } catch (e) { return false; }
  }

  // 3. 数据获取 (接口地址不变)
  async function fetchProxyOnce() {
    const opts = { timeout: TIMEOUT_PROXY, headers: { 'User-Agent': UA } };
    if (POLICY) opts.policy = POLICY;
    let res = await ctx.http.get(API_MAIN, opts);
    let j = await res.json();
    if (!j || !j.ip) return false;

    proxyData.ip = j.ip;
    let country = j.country || "";
    let region = j.region || j.regionName || "";
    let city = j.city || "";

    // 国家/州/城市一次批量翻译成中文
    const [countryCn, regionCn, cityCn] = await msTranslateBatch([country, region, city], "zh-Hans");
    proxyData.title = getCnTitle(countryCn, regionCn, cityCn);
    proxyData.detail = getEnDetail(country, region, city);

    const asOrg = j.asOrganization || "";
    const asn = (j.asn !== undefined && j.asn !== null && j.asn !== "") ? j.asn : "";
    proxyData.isp = (asOrg || asn) ? `${asOrg} (AS${asn})`.trim() : "未知";
    proxyData.flag = flagEmoji(j.countryCode);
    proxyData.risk = j.fraudScore || 0;
    // isResidential 缺失时旧版 !undefined 会误判商业/机房, 改为缺失按住宅
    proxyData.isDC = (typeof j.isResidential === "boolean") ? !j.isResidential : false;
    proxyData.success = true;
    return true;
  }

  async function fetchProxy() {
    try { if (await fetchProxyOnce()) { saveProxyCache(); return; } } catch (e) {}
    try {
      await sleep(800);
      if (await fetchProxyOnce()) { saveProxyCache(); return; }
    } catch (e) {}
    if (!loadProxyCache()) proxyData.ip = "获取失败";
  }

  async function fetchLocal() {
    try {
      let res = await ctx.http.get(API_LOCAL_IP, { timeout: TIMEOUT, headers: { 'User-Agent': UA } });
      let localSimple = await res.json();

      if (localSimple.ret === "ok" && localSimple.data && localSimple.data.ip) {
        localData.ip = localSimple.data.ip;
        let loc = localSimple.data.location || [];
        let country = loc[0] || "";
        let prov = loc[1] || "";
        let city = loc[2] || "";

        // 运营商全字匹配转英文 (原逻辑不变)
        let localCarrierEn = "Unicom";
        let locStr = loc.join("").toLowerCase();
        if (locStr.includes("电信") || locStr.includes("telecom") || locStr.includes("ct")) {
          localCarrierEn = "Telecom";
        } else if (locStr.includes("移动") || locStr.includes("mobile") || locStr.includes("cmcc")) {
          localCarrierEn = "Mobile";
        }
        localData.isp = `China ${localCarrierEn}`;

        // 中文组 (国家+城市) 与英文组 (省+城市) 各一次批量翻译, 并行
        const [zh, en] = await Promise.all([
          msTranslateBatch([country, city], "zh-Hans"),
          msTranslateBatch([prov, city], "en")
        ]);
        localData.title = getCnTitle(zh[0], "", zh[1]) || "本地网络";
        localData.detail = getEnDetail("China", en[0], en[1]);

        localData.flag = "🇨🇳";
        localData.success = true;
      } else {
        localData.ip = "获取失败";
      }
    } catch (e) {
      localData.ip = "获取失败";
    }
  }

  // 并发拉取
  await Promise.allSettled([fetchProxy(), fetchLocal()]);

  // 4. 辅助格式化函数
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

  // 5. UI 构建器 (原封不动套用 IP-API 的排版)
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

  // 小号: 只保留节点网络 + 本地网络两组信息, 去掉右侧圆环/原生住宅/IPPure 标注
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

  // 6. 组装终极布局
  return {
    type: "widget",
    url: "egern://",
    padding: 16,
    backgroundColor: { light: "#FFFFFF", dark: "#121212" },
    children: [
      {
        type: "stack", direction: "row", alignItems: "center",
        children: [
          // 左侧信息栏 (代理在上，本地在下)
          {
            type: "stack", direction: "column", gap: 12, flex: 1,
            children: [
              buildInfoBlock(proxyData, false),
              buildInfoBlock(localData, true)
            ]
          },
          
          // 右侧风险评估盘
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
              // 原生/商业 状态标签
              {
                type: "stack", direction: "column", alignItems: "center", gap: 2,
                children: [
                  // 💡 真正修改这行：将 "非原生" 替换为 "商业"
                  { type: "text", text: proxyData.isDC ? "商业" : "原生", font: { size: 11, weight: "bold" }, textColor: { light: "#333333", dark: "#DDDDDD" } },
                  // 💡 恢复为原本的 "机房"
                  { type: "text", text: proxyData.isDC ? "机房" : "住宅", font: { size: 11, weight: "bold" }, textColor: { light: "#333333", dark: "#DDDDDD" } }
                ]
              },
              // 底部来源标识
              { type: "text", text: "IPPure", font: { size: 8, weight: "medium" }, textColor: "#34C759" }
            ]
          }
        ]
      }
    ]
  };
}
