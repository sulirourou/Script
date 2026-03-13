/**
 * ⛽ 全国油价监控小组件 (区间预测版)
 * * ==========================================
 * 📚 环境变量配置说明 (在组件的"环境变量"处添加)
 * ==========================================
 * * 1️⃣ 名称：城市
 * 值：广东    (填写你所在的省份，不填则自动根据 IP 定位)
 * * 2️⃣ 名称：油号
 * 值：95      (可选填：92、95、98、0。不填默认 92)
 * * 3️⃣ 名称：容量
 * 值：60      (填写你的油箱升数，用于计算加满金额。不填默认 50)
 * * ------------------------------------------
 * 💡 配置示例：
 * 假设你是广东车主，车子加 98 号汽油，油箱是 100 升。
 * 请在 Egern 里为这个小组件添加三个环境变量：
 * * 【名称】城市   【值】广东
 * 【名称】油号   【值】98
 * 【名称】容量   【值】100
 * * 保存后刷新桌面，即可看到“广东的98号油价”及“100升的总价”。
 * ==========================================
 */

const API_LOCAL_IP = "https://myip.ipip.net/json";
const TIMEOUT = 4000;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

const provMap = {
  "北京": "beijing", "天津": "tianjin", "河北": "hebei", "山西": "shanxi",
  "内蒙古": "neimenggu", "辽宁": "liaoning", "吉林": "jilin", "黑龙江": "heilongjiang",
  "上海": "shanghai", "江苏": "jiangsu", "浙江": "zhejiang", "安徽": "anhui",
  "福建": "fujian", "江西": "jiangxi", "山东": "shandong", "河南": "henan",
  "湖北": "hubei", "湖南": "hunan", "广东": "guangdong", "广西": "guangxi",
  "海南": "hainan", "重庆": "chongqing", "四川": "sichuan", "贵州": "guizhou",
  "云南": "yunnan", "西藏": "xizang", "陕西": "shaanxi", "甘肃": "gansu",
  "青海": "qinghai", "宁夏": "ningxia", "新疆": "xinjiang"
};

export default async function(ctx) {
  // 强硬解析环境变量
  let userCity = "";
  let userType = "92";
  let userCap = "50";
  
  if (ctx && ctx.env) {
      if (ctx.env.城市 !== undefined && ctx.env.城市 !== null) userCity = String(ctx.env.城市).trim();
      if (ctx.env.油号 !== undefined && ctx.env.油号 !== null) userType = String(ctx.env.油号).trim();
      if (ctx.env.容量 !== undefined && ctx.env.容量 !== null) userCap = String(ctx.env.容量).trim();
  }

  let locData = { prov: "北京", py: "beijing" };
  let oilData = { p92: "0.00", p95: "0.00", p98: "0.00", p0: "0.00", trend: "未知", adjustVal: "0.00", date: "未知日期", refreshDate: "", rangeStr: "" };

  // 1. 定位省份
  if (userCity !== "" && provMap[userCity]) {
    locData.prov = userCity;
    locData.py = provMap[userCity];
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

  // 2. 抓取数据 (油价网)
  try {
    let resOil = await ctx.http.get(`http://m.qiyoujiage.com/${locData.py}.shtml`, { timeout: TIMEOUT, headers: { 'User-Agent': UA } });
    let html = await resOil.text();
    
    // 价格提取
    const getPrice = (name) => {
        let reg = new RegExp(name + "[^\\d]*?(\\d+\\.\\d{2})");
        let match = html.match(reg);
        return match ? match[1] : "0.00";
    };

    oilData.p92 = getPrice("92号汽油");
    oilData.p95 = getPrice("95号汽油");
    oilData.p98 = getPrice("98号汽油");
    oilData.p0  = getPrice("0号柴油");

    let tishi = html.match(/class="tishi">([\s\S]*?)<\/div>/)?.[1] || "";
    
    if (tishi.includes("上调") || tishi.includes("上涨") || tishi.includes("大涨")) oilData.trend = "上涨";
    else if (tishi.includes("下调") || tishi.includes("下跌") || tishi.includes("大跌")) oilData.trend = "下跌";
    else if (tishi.includes("搁浅")) oilData.trend = "搁浅";

    // 💡 核心修改：如果是区间，不仅取最大值，还要记录整个区间字符串
    let rangeMatch = tishi.match(/(\d+\.\d+)元\/升.*?(\d+\.\d+)元\/升/);
    if (rangeMatch) {
       let num1 = parseFloat(rangeMatch[1]);
       let num2 = parseFloat(rangeMatch[2]);
       oilData.adjustVal = Math.max(num1, num2).toFixed(2);
       // 记录区间字符串，如 "0.55-0.61"
       oilData.rangeStr = `${rangeMatch[1]}-${rangeMatch[2]}`;
    } else {
       let singleMatch = tishi.match(/(\d+\.\d+)/);
       if (singleMatch) {
           oilData.adjustVal = singleMatch[1];
           oilData.rangeStr = singleMatch[1]; // 单值时区间也显示为单值
       } else {
           oilData.rangeStr = "搁浅";
       }
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
  if (oilData.trend === "上涨") {
    trendColor = "#EB604D"; // 橘红
  } else if (oilData.trend === "下跌") {
    trendColor = "#34C759"; // 绿色
  }

  let capacity = Number(userCap);
  if (isNaN(capacity) || capacity <= 0) capacity = 50;

  let basePrice = 0;
  if (userType === "92") basePrice = Number(oilData.p92) || 0;
  else if (userType === "95") basePrice = Number(oilData.p95) || 0;
  else if (userType === "98") basePrice = Number(oilData.p98) || 0;
  else basePrice = Number(oilData.p0) || 0;

  let futurePrice = basePrice;
  if (oilData.trend === "上涨") futurePrice += (Number(oilData.adjustVal) || 0);
  else if (oilData.trend === "下跌") futurePrice -= (Number(oilData.adjustVal) || 0);
  
  const totalCost = (futurePrice * capacity).toFixed(2);

  // 4. UI 积木块封装
  function buildOilCol(name, price, range) {
    return {
      type: "stack", direction: "column", alignItems: "center", gap: 8, flex: 1,
      children: [
        { type: "text", text: name, font: { size: 22, weight: "medium" }, textColor: "#EB604D" },
        { type: "text", text: `¥${price}`, font: { size: 20, weight: "bold" }, textColor: "#FFFFFF" },
        // 💡 视觉修改：直接显示区间字符串（不带符号），颜色跟随趋势
        { type: "text", text: range, font: { size: 12, weight: "medium" }, textColor: trendColor }
      ]
    };
  }

  const baseTextColor = "#EBEBF5"; 
  const fontSize = 11; 
  
  const oilNameText = userType === "0" ? "0 号柴油" : `${userType} 号汽油`;
  
  const costRow = {
    type: "stack", direction: "row", alignItems: "center", gap: 3,
    children: [
      { type: "text", text: `预计加满 ${oilNameText} ${capacity} 升需要 ${totalCost} 元`, font: { size: fontSize, weight: "medium" }, textColor: baseTextColor }
    ]
  };

  const timeRow = {
    type: "stack", direction: "row", alignItems: "center", gap: 3,
    children: [
      { type: "text", text: `${oilData.refreshDate} • ${oilData.date}${oilData.trend === '搁浅' ? '' : `预计约 ${oilData.rangeStr} 元/升`}`, font: { size: fontSize, weight: "medium" }, textColor: baseTextColor }
    ]
  };

  return {
    type: "widget",
    url: "egern://",
    padding: 14, 
    backgroundColor: "#2C2C2E", 
    children: [
      {
        type: "stack", direction: "column", flex: 1, justifyContent: "space-between", 
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
              // 💡 传给 buildOilCol 的是 oilData.rangeStr
              buildOilCol("92#", oilData.p92, oilData.rangeStr),
              buildOilCol("95#", oilData.p95, oilData.rangeStr),
              buildOilCol("98#", oilData.p98, oilData.rangeStr),
              buildOilCol("0#",  oilData.p0,  oilData.rangeStr)
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
