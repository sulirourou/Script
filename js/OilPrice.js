const API_LOCAL_IP = "https://myip.ipip.net/json";
const TIMEOUT = 4000;
// 伪装成手机浏览器获取移动端排版数据
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

const provMap = {
  "北京": "beijing", "天津": "tianjin", "河北": "hebei", "山西": "shanxi",
  "内蒙古": "neimenggu", "辽宁": "liaoning", "吉林": "jilin", "黑龙江": "heilongjiang",
  "上海": "shanghai", "江苏": "jiangsu", "浙江": "zhejiang", "安徽": "anhui",
  "福建": "fujian", "江西": "jiangxi", "山东": "shandong", "河南": "henan",
  "湖北": "hubei", "湖南": "hunan", "广东": "guangdong", "广西": "guangxi",
  "海南": "hainan", "重庆": "chongqing", "四川": "sichuan", "贵州": "guizhou",
  "云南": "yunnan", "西藏": "xizang", "陕西": "shaanxi", "甘肃": "gansu",
  "青海": "qinghai", "宁夏": "ningxia", "新疆": "xinjiang",
  "自动定位": "auto"
};

export default async function(ctx) {
  const targetProv = (ctx && ctx.env && ctx.env.PROV) ? ctx.env.PROV : "自动定位";
  
  let locData = { prov: "北京", py: "beijing" };
  let oilData = { p92: "0.00", p95: "0.00", p98: "0.00", p0: "0.00", trend: "未知", adjustVal: "0.00", date: "未知日期", refreshDate: "" };

  // 1. 定位省份
  if (targetProv !== "自动定位" && provMap[targetProv]) {
    locData.prov = targetProv;
    locData.py = provMap[targetProv];
  } else {
    try {
      let resIp = await ctx.http.get(API_LOCAL_IP, { timeout: TIMEOUT, headers: { 'User-Agent': UA } });
      let jIp = await resIp.json();
      if (jIp.ret === "ok" && jIp.data && jIp.data.location) {
        let provName = jIp.data.location[1] || jIp.data.location[0] || "北京";
        locData.prov = provName.replace(/省|市|自治区|回族自治区|维吾尔自治区|壮族自治区/g, "");
        locData.py = provMap[locData.prov] || "beijing";
      }
    } catch(e) {}
  }

  // 2. 抓取数据
  try {
    let resOil = await ctx.http.get(`http://m.qiyoujiage.com/${locData.py}.shtml`, { timeout: TIMEOUT, headers: { 'User-Agent': UA } });
    let html = await resOil.text();
    
    // 💡 核心修复：模糊跳过 30 个字符内的所有乱码或冒号标签，直接精准抓取数字
    const getPrice = (name) => {
        const reg = new RegExp(`${name}[\\s\\S]{0,30}?(\\d+\\.\\d+)`);
        return html.match(reg)?.[1] || "0.00";
    };

    oilData.p92 = getPrice("92号汽油");
    oilData.p95 = getPrice("95号汽油");
    oilData.p98 = getPrice("98号汽油");
    oilData.p0  = getPrice("0号柴油");

    let tishi = html.match(/class="tishi">([\s\S]*?)<\/div>/)?.[1] || "";
    
    if (tishi.includes("上调") || tishi.includes("上涨") || tishi.includes("大涨")) oilData.trend = "上涨";
    else if (tishi.includes("下调") || tishi.includes("下跌") || tishi.includes("大跌")) oilData.trend = "下跌";
    else if (tishi.includes("搁浅")) oilData.trend = "搁浅";

    let priceMatch = tishi.match(/(\d+\.\d+)[元\/升|分]/);
    if (priceMatch) {
       oilData.adjustVal = priceMatch[1];
    }
    
    let nextDateMatch = tishi.match(/(\d{4}年\d{1,2}月\d{1,2}日|\d{1,2}月\d{1,2}日)/);
    if (nextDateMatch) {
        let nextDate = nextDateMatch[1];
        if (!nextDate.includes("年")) nextDate = new Date().getFullYear() + "年" + nextDate;
        oilData.date = `${nextDate}${oilData.trend}`;
    } else {
        oilData.date = "未知时间";
    }
    
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    oilData.refreshDate = `${now.getFullYear()}年${mm}月${dd}日刷新`;

  } catch(e) {}

  // 3. 颜色及数值计算
  let trendColor = "#8E8E93"; 
  let sign = "";
  if (oilData.trend === "上涨") {
    trendColor = "#EB604D"; 
    sign = "+";
  } else if (oilData.trend === "下跌") {
    trendColor = "#34C759";
    sign = "-";
  }

  const capacity = 100;
  const currentPrice = parseFloat(oilData.p0) || 0;
  let futurePrice = currentPrice;
  if (oilData.trend === "上涨") futurePrice += (parseFloat(oilData.adjustVal) || 0);
  else if (oilData.trend === "下跌") futurePrice -= (parseFloat(oilData.adjustVal) || 0);
  const totalCost = (futurePrice * capacity).toFixed(2);

  // 4. UI 积木块封装 (字号完美压缩防溢出)
  function buildOilCol(name, price, adjust) {
    return {
      type: "stack", direction: "column", alignItems: "center", gap: 4, flex: 1,
      children: [
        { type: "text", text: name, font: { size: 22, weight: "medium" }, textColor: "#EB604D" },
        { type: "text", text: `¥${price}`, font: { size: 15, weight: "bold" }, textColor: "#FFFFFF" },
        { type: "text", text: `${sign}${adjust}`, font: { size: 12, weight: "medium" }, textColor: trendColor }
      ]
    };
  }

  const baseTextColor = "#EBEBF5";
  const fontSize = 10; // 严格控制底部字号为 10，绝不挤压
  
  const costRow = {
    type: "stack", direction: "row", alignItems: "center", gap: 3,
    children: [
      { type: "text", text: "预计加满 0 号汽油", font: { size: fontSize, weight: "medium" }, textColor: baseTextColor },
      { type: "text", text: `${capacity}`, font: { size: fontSize, weight: "medium" }, textColor: trendColor },
      { type: "text", text: "升需要", font: { size: fontSize, weight: "medium" }, textColor: baseTextColor },
      { type: "text", text: `${totalCost}`, font: { size: fontSize, weight: "medium" }, textColor: trendColor },
      { type: "text", text: "元", font: { size: fontSize, weight: "medium" }, textColor: baseTextColor }
    ]
  };

  const timeRow = {
    type: "stack", direction: "row", alignItems: "center", gap: 3,
    children: [
      { type: "text", text: `${oilData.refreshDate} • ${oilData.date.replace(oilData.trend, '')}`, font: { size: fontSize, weight: "medium" }, textColor: baseTextColor },
      { type: "text", text: oilData.trend, font: { size: fontSize, weight: "medium" }, textColor: trendColor }
    ]
  };

  return {
    type: "widget",
    url: "egern://",
    padding: 14, // 💡 缩小外边距，给内部留出充足空间
    backgroundColor: "#2C2C2E", 
    children: [
      {
        type: "stack", direction: "column", flex: 1, justifyContent: "space-between", // 💡 弹性分布，彻底消灭溢出
        children: [
          {
            type: "stack", direction: "row", alignItems: "center", justifyContent: "center", gap: 4,
            children: [
              { type: "image", src: "sf-symbol:drop", color: "#FFFFFF", width: 14, height: 14 },
              { type: "text", text: `中国油价 • ${locData.prov}`, font: { size: 14, weight: "bold" }, textColor: "#FFFFFF" }
            ]
          },
          {
            type: "stack", direction: "row", alignItems: "center", justifyContent: "space-around",
            children: [
              buildOilCol("92#", oilData.p92, oilData.adjustVal),
              buildOilCol("95#", oilData.p95, oilData.adjustVal),
              buildOilCol("98#", oilData.p98, oilData.adjustVal),
              buildOilCol("0#",  oilData.p0,  oilData.adjustVal)
            ]
          },
          {
            type: "stack", direction: "column", alignItems: "center", gap: 2,
            children: [
              costRow,
              timeRow
            ]
          }
        ]
      }
    ]
  };
}
