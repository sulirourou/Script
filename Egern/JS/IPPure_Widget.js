/**
 * 🌏 Egern IPPure 小组件
 */

const API_MAIN = "https://my.ippure.com/v1/info";
const API_LOCAL_IP = "https://myip.ipip.net/json";
const TIMEOUT = 3500;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.61 Safari/537.36';

export default async function(ctx) {
  // 1. 初始化数据容器 (配合 IP-API 的 UI)
  let proxyData = { ip: "获取中...", title: "节点网络", detail: "未知", isp: "未知", flag: "🏳️", risk: 0, isDC: false, success: false };
  let localData = { ip: "获取中...", title: "本地网络", detail: "未知", isp: "未知", flag: "🇨🇳", success: false };

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

  // 2. 微软 Edge 翻译接口 (完全还原你的源码)
  async function msTranslate(text, to) {
    if (!text || text === "Unknown") return "";
    try {
      const authUrl = "https://edge.microsoft.com/translate/auth";
      const tokenRes = await ctx.http.get(authUrl, { timeout: TIMEOUT, headers: { 'User-Agent': UA } });
      const token = await tokenRes.text();
      
      const transUrl = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${to}`;
      const reqRes = await ctx.http.post(transUrl, {
        timeout: TIMEOUT,
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify([{ "Text": text }])
      });
      const res = await reqRes.json();
      return res?.[0]?.translations?.[0]?.text || text;
    } catch (e) { return text; }
  }

  // 3. 数据获取函数 (完全还原你的源码接口和解析逻辑)
  async function fetchProxy() {
    try {
      let res = await ctx.http.get(API_MAIN, { timeout: TIMEOUT, headers: { 'User-Agent': UA } });
      let rawMainData = await res.json();
      
      if (rawMainData && rawMainData.ip) {
        proxyData.ip = rawMainData.ip;
        let country = rawMainData.country || "";
        let region = rawMainData.region || rawMainData.regionName || "";
        let city = rawMainData.city || "";
        
        // 翻译：国家、州/省、城市 -> 中文 (使用微软接口)
        let proxyCountryCn = await msTranslate(country, "zh-Hans");
        let proxyRegionCn = await msTranslate(region, "zh-Hans"); 
        let proxyCityCn = await msTranslate(city, "zh-Hans");
        
        // 💡 应用终极提取器：标题强制纯中文，详情强制去重
        proxyData.title = getCnTitle(proxyCountryCn, proxyRegionCn, proxyCityCn);
        proxyData.detail = getEnDetail(country, region, city);

        proxyData.isp = `${rawMainData.asOrganization || ""} (AS${rawMainData.asn || ""})`.trim();
        proxyData.flag = flagEmoji(rawMainData.countryCode);
        proxyData.risk = rawMainData.fraudScore || 0;
        proxyData.isDC = !rawMainData.isResidential; 
        proxyData.success = true;
      }
    } catch (e) {
      proxyData.ip = "获取失败";
    }
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
        
        // 【关键修复：运营商全字匹配转英文】 (完全还原你的源码)
        let localCarrierEn = "Unicom";
        let locStr = loc.join("").toLowerCase();
        if (locStr.includes("电信") || locStr.includes("telecom") || locStr.includes("ct")) {
          localCarrierEn = "Telecom";
        } else if (locStr.includes("移动") || locStr.includes("mobile") || locStr.includes("cmcc")) {
          localCarrierEn = "Mobile";
        }
        localData.isp = `China ${localCarrierEn}`;
        
        // 标题行：中文
        let localCountryCn = await msTranslate(country, "zh-Hans");
        let localCityCn = await msTranslate(city, "zh-Hans");
        
        // 💡 本地同样应用提取器防重
        localData.title = getCnTitle(localCountryCn, "", localCityCn) || "本地网络";
        
        // 详情行：英文 (完全依赖微软翻译接口)
        let enProv = await msTranslate(prov, "en");
        let enCity = await msTranslate(city, "en");
        localData.detail = getEnDetail("China", enProv, enCity);

        localData.flag = "🇨🇳";
        localData.success = true;
      } else {
        throw new Error();
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
  function buildInfoBlock(data, isLocal) {
    const titleColor = { light: "#333333", dark: "#FFFFFF" };
    const subColor = { light: "#666666", dark: "#AAAAAA" };
    
    return {
      type: "stack", direction: "column", gap: 3,
      children: [
        { 
          type: "stack", direction: "row", alignItems: "center", gap: 4,
          children: [
            { type: "text", text: data.flag, font: { size: 12 } },
            { type: "text", text: data.title, font: { size: 11, weight: "bold" }, textColor: titleColor, maxLines: 1 }
          ]
        },
        { type: "text", text: data.ip, font: { size: 16, weight: "bold" }, textColor: titleColor, maxLines: 1 },
        { 
          type: "stack", direction: "row", alignItems: "center", gap: 4,
          children: [
            { type: "image", src: isLocal ? "sf-symbol:location.fill" : "sf-symbol:map.fill", color: "#8E8E93", width: 10, height: 10 },
            { type: "text", text: data.detail, font: { size: 10 }, textColor: subColor, maxLines: 1, minScale: 0.8 }
          ]
        },
        { 
          type: "stack", direction: "row", alignItems: "center", gap: 4,
          children: [
            { type: "image", src: isLocal ? "sf-symbol:antenna.radiowaves.left.and.right" : "sf-symbol:server.rack", color: "#8E8E93", width: 10, height: 10 },
            { type: "text", text: data.isp, font: { size: 10 }, textColor: subColor, maxLines: 1, minScale: 0.8 }
          ]
        }
      ]
    };
  }

  const riskColor = getRiskColor(proxyData.risk);

  // 6. 组装终极布局
  return {
    type: "widget",
    url: "egern://",
    padding: 16,
    backgroundColor: { light: "#F2F2F7", dark: "#121212" },
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
