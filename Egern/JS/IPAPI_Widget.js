/**
 * 🌏 Egern IP 质量监测组件 18.0
 */

const API_BASE = "http://ip-api.com/json/";
const FIELDS = "?fields=status,message,country,countryCode,regionName,city,isp,org,as,mobile,proxy,hosting,query";
const API_LOCAL_IP = "https://myip.ipip.net/json";
const TIMEOUT = 3500;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.61 Safari/537.36';

export default async function(ctx) {
  // 1. 初始化数据容器
  let proxyData = { ip: "获取中...", title: "节点网络", detail: "未知", isp: "未知", flag: "🏳️", risk: 0, isDC: false, success: false };
  let localData = { ip: "获取中...", title: "本地网络", detail: "未知", isp: "未知", flag: "🏳️", success: false };

  // 💡 终极智能去重：只要包含国家的英文名（如 Central Singapore 包含 Singapore），直接剔除
  function cleanLoc(c, r, d, enCountry) {
      let res = [];
      let c_low = (c || "").toLowerCase();
      let r_low = (r || "").toLowerCase();
      let d_low = (d || "").toLowerCase();
      let en_c = (enCountry || "").toLowerCase();
      
      if (c) res.push(c);
      
      // 省份如果不是国家名，且不包含国家英文名，才保留
      if (r && r_low !== c_low && (!en_c || !r_low.includes(en_c))) {
          res.push(r);
      }
      
      // 城市如果不是国家名，不是省份名，且不包含国家英文名，才保留
      if (d && d_low !== c_low && d_low !== r_low && (!en_c || !d_low.includes(en_c))) {
          res.push(d);
      }
      
      return res.join(" ").trim() || "未知";
  }

  // 2. 数据获取函数
  async function fetchProxy() {
    try {
      // 并发请求英文和中文接口
      let [resEn, resCn] = await Promise.all([
        ctx.http.get(`${API_BASE}${FIELDS}`, { timeout: TIMEOUT, headers: { 'User-Agent': UA } }),
        ctx.http.get(`${API_BASE}${FIELDS}&lang=zh-CN`, { timeout: TIMEOUT, headers: { 'User-Agent': UA } })
      ]);
      let jEn = await resEn.json();
      let jCn = await resCn.json();

      if (jEn.status === "success") {
        proxyData.ip = jEn.query;
        
        // 💡 传入国家英文名 jEn.country 进行终极过滤拦截
        proxyData.title = cleanLoc(jCn.country, jCn.regionName, jCn.city, jEn.country) || "未知节点";
        proxyData.detail = cleanLoc(jEn.country, jEn.regionName, jEn.city, jEn.country);
        
        // 处理 ISP 和 AS 名字重复的问题
        let ispName = jEn.isp || "";
        let asInfo = jEn.as || "";
        if (asInfo.toLowerCase().includes(ispName.split(' ')[0].toLowerCase())) {
            proxyData.isp = asInfo;
        } else {
            proxyData.isp = `${ispName} ${asInfo}`.trim();
        }
        
        proxyData.flag = flagEmoji(jEn.countryCode);
        proxyData.isDC = (jEn.hosting || jEn.proxy);
        
        // 风险计算逻辑还原
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
      // 获取本地 IP
      let resIp = await ctx.http.get(API_LOCAL_IP, { timeout: TIMEOUT, headers: { 'User-Agent': UA } });
      let jIp = await resIp.json();
      
      if (jIp.ret === "ok" && jIp.data && jIp.data.ip) {
        localData.ip = jIp.data.ip;
        let loc = jIp.data.location || [];
        // 尝试用 ip-api 获取更详细的本地数据
        try {
          let resCn = await ctx.http.get(`${API_BASE}${localData.ip}${FIELDS}&lang=zh-CN`, { timeout: TIMEOUT });
          let resEn = await ctx.http.get(`${API_BASE}${localData.ip}${FIELDS}`, { timeout: TIMEOUT });
          let ljCn = await resCn.json();
          let ljEn = await resEn.json();
          
          if(ljCn.status === "success") {
            localData.title = cleanLoc(ljCn.country, "", ljCn.city, ljEn.country) || "本地";
            localData.detail = cleanLoc(ljEn.country, ljEn.regionName, ljEn.city, ljEn.country);
            localData.flag = flagEmoji(ljEn.countryCode);
            // 还原精准运营商识别
            let carrier = "Unicom";
            const ispRaw = (ljEn.isp || "").toLowerCase();
            if (/telecom|电信|ct/i.test(ispRaw)) carrier = "Telecom";
            else if (/mobile|移动|cmcc/i.test(ispRaw)) carrier = "Mobile";
            localData.isp = `China ${carrier}`;
            localData.success = true;
            return;
          }
        } catch(e2) {}
        
        // 如果 ip-api 失败，兜底使用 ipip 的数据
        localData.title = cleanLoc(loc[0]||"本地", "", loc[2]||"", "");
        localData.detail = "China Location";
        localData.isp = loc[4] || "未知";
        localData.flag = "🇨🇳";
      }
    } catch (e) {
      localData.ip = "获取失败";
    }
  }

  // 并发拉取
  await Promise.allSettled([fetchProxy(), fetchLocal()]);

  // 3. 辅助格式化函数
  function flagEmoji(code) {
    if (!code || code.length !== 2) return "🏳️";
    if (code.toUpperCase() === "TW") code = "CN";
    if (code.toUpperCase() === "UK") code = "GB";
    return String.fromCodePoint(...code.toUpperCase().split('').map(c => 127397 + c.charCodeAt()));
  }

  function getRiskColor(score) {
    if (score <= 20) return "#34C759"; // 绿
    if (score <= 40) return "#32ADE6"; // 蓝
    if (score <= 60) return "#FFCC00"; // 黄
    if (score <= 80) return "#FF9500"; // 橙
    return "#FF3B30"; // 红
  }

  // 4. UI 构建器
  // 左侧信息块构建器
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

  // 5. 组装终极布局
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
              // 用 Egern 的 borderRadius 模拟圆形仪表盘
              {
                type: "stack", direction: "column", alignItems: "center", justifyContent: "center",
                width: 76, height: 76, borderRadius: 38,
                borderWidth: 6, borderColor: riskColor,
                backgroundColor: { light: "#FFFFFF", dark: "#1C1C1E" },
                children: [
                  { type: "text", text: `${proxyData.risk}`, font: { size: 28, weight: "heavy" }, textColor: riskColor },
                  { type: "text", text: "风险指数", font: { size: 9, weight: "bold" }, textColor: { light: "#8E8E93", dark: "#636366" } }
                ]
              },
              // 原生/非原生状态标签
              {
                type: "stack", direction: "column", alignItems: "center", gap: 2,
                children: [
                  { type: "text", text: proxyData.isDC ? "非原生" : "原生", font: { size: 11, weight: "bold" }, textColor: { light: "#333333", dark: "#DDDDDD" } },
                  { type: "text", text: proxyData.isDC ? "机房" : "住宅", font: { size: 11, weight: "bold" }, textColor: { light: "#333333", dark: "#DDDDDD" } }
                ]
              },
              // 底部来源标识
              { type: "text", text: "IP-API.COM", font: { size: 8, weight: "medium" }, textColor: "#8E8E93" }
            ]
          }
        ]
      }
    ]
  };
}
