/**
 * 🌏 Egern IP-API 小组件
 */

const API_BASE = "http://ip-api.com/json/";
const FIELDS = "?fields=status,message,country,countryCode,regionName,city,isp,org,as,mobile,proxy,hosting,query";
const API_LOCAL_IP = "https://myip.ipip.net/json";
const TIMEOUT = 3500;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.61 Safari/537.36';

export default async function(ctx) {
  let proxyData = { ip: "获取中...", title: "节点网络", detail: "未知", isp: "未知", flag: "🏳️", risk: 0, isDC: false, success: false };
  let localData = { ip: "获取中...", title: "本地网络", detail: "未知", isp: "未知", flag: "🏳️", success: false };

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

  async function fetchProxy() {
    try {
      let [resEn, resCn] = await Promise.all([
        ctx.http.get(`${API_BASE}${FIELDS}`, { timeout: TIMEOUT, headers: { 'User-Agent': UA } }),
        ctx.http.get(`${API_BASE}${FIELDS}&lang=zh-CN`, { timeout: TIMEOUT, headers: { 'User-Agent': UA } })
      ]);
      let jEn = await resEn.json();
      let jCn = await resCn.json();

      if (jEn.status === "success") {
        proxyData.ip = jEn.query;
        proxyData.title = getCnTitle(jCn.country, jCn.regionName, jCn.city);
        proxyData.detail = getEnDetail(jEn.country, jEn.regionName, jEn.city);
        
        let ispName = jEn.isp || "";
        let asInfo = jEn.as || "";
        if (asInfo.toLowerCase().includes(ispName.split(' ')[0].toLowerCase())) {
            proxyData.isp = asInfo;
        } else {
            proxyData.isp = `${ispName} ${asInfo}`.trim();
        }
        
        proxyData.flag = flagEmoji(jEn.countryCode);
        proxyData.isDC = (jEn.hosting || jEn.proxy);
        
        let score = 0;
        if (jEn.proxy) score += 50;
        if (jEn.hosting) score += 40;
        proxyData.risk = Math.min(100, score);
        proxyData.success = true;
      }
    } catch (e) {
      proxyData.ip = "获取失败";
    }
  }

  async function fetchLocal() {
    try {
      let resIp = await ctx.http.get(API_LOCAL_IP, { timeout: TIMEOUT, headers: { 'User-Agent': UA } });
      let jIp = await resIp.json();
      if (jIp.ret === "ok" && jIp.data && jIp.data.ip) {
        localData.ip = jIp.data.ip;
        let loc = jIp.data.location || [];
        try {
          let resCn = await ctx.http.get(`${API_BASE}${localData.ip}${FIELDS}&lang=zh-CN`, { timeout: TIMEOUT });
          let resEn = await ctx.http.get(`${API_BASE}${localData.ip}${FIELDS}`, { timeout: TIMEOUT });
          let ljCn = await resCn.json();
          let ljEn = await resEn.json();
          if(ljCn.status === "success") {
            localData.title = getCnTitle(ljCn.country, ljCn.regionName, ljCn.city) || "本地";
            localData.detail = getEnDetail(ljEn.country, ljEn.regionName, ljEn.city);
            localData.flag = flagEmoji(ljEn.countryCode);
            let carrier = "Unicom";
            const ispRaw = (ljEn.isp || "").toLowerCase();
            if (/telecom|电信|ct/i.test(ispRaw)) carrier = "Telecom";
            else if (/mobile|移动|cmcc/i.test(ispRaw)) carrier = "Mobile";
            localData.isp = `China ${carrier}`;
            localData.success = true;
            return;
          }
        } catch(e2) {}
        
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

  return {
    type: "widget",
    url: "egern://",
    padding: 16,
    backgroundColor: { light: "#F2F2F7", dark: "#121212" },
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
