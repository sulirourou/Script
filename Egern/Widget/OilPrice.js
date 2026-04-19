/**
 * ⛽ 全国油价监控小组件 (三级护航版 + 全面深浅模式UI自定义遥控器)1.1
 * * ==========================================
 * 📚 环境变量配置说明 (在组件的"环境变量"处添加)
 * ==========================================
 * * 1️⃣ 名称：城市
 * 值：广东    (填写你所在的省份，不填则自动根据 IP 定位)
 * * 2️⃣ 名称：油号
 * 值：95      (可选填：92、95、98、0。不填默认 92)
 * * 3️⃣ 名称：容量
 * 值：60      (填写你的油箱升数，用于计算加满金额。不填默认 50)
 * ==========================================
 */

// ==========================================
// 🎨 UI 个性化配置区 (全面支持系统自动深浅模式)
// ==========================================

// 1️⃣ 小组件背景颜色 { light: 白天颜色, dark: 黑夜颜色 }
const WIDGET_BG_COLOR = { light: "#FFFFFF", dark: "#121212" };

// 2️⃣ 顶部标题设置 (“中国油价·XX” 和 水滴图标)
const TITLE_FONT_SIZE = 14;
const TITLE_COLOR = { light: "#000000", dark: "#FFFFFF" };

// 3️⃣ 各标号油号名称的颜色 (92#, 95#...)
const COLOR_92 = { light: "#FF3B30", dark: "#FF453A" }; // 92号 (红)
const COLOR_95 = { light: "#34C759", dark: "#32D74B" }; // 95号 (绿)
const COLOR_98 = { light: "#FF9500", dark: "#FFD60A" }; // 98号 (黄)
const COLOR_0  = { light: "#007AFF", dark: "#0A84FF" }; // 0号柴油 (蓝)

// 4️⃣ 油号名称的字号 (如 "92#", "95#")
const OIL_NAME_SIZE = 22;

// 5️⃣ 核心油价数字的字号与颜色 (如 "7.66", "8.29")
const PRICE_NUMBER_SIZE = 25;
const PRICE_NUMBER_COLOR = { light: "#000000", dark: "#FFFFFF" };

// 6️⃣ 底部三行提示文字设置
const BOTTOM_FONT_SIZE = 10;
const BOTTOM_TEXT_COLOR = { light: "#666666", dark: "#EBEBF5" };


// ==========================================
// ⚙️ 下方为核心代码区 (非必要请勿修改)
// ==========================================

const API_LOCAL_IP = "https://myip.ipip.net/json";
const TIMEOUT = 4000;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

// 仅作网络崩溃时的最后一道防线兜底
const CALENDAR_2026 = [
  {m: 1, d: 12}, {m: 1, d: 23}, {m: 2, d: 9},  {m: 2, d: 23}, {m: 3, d: 9},  {m: 3, d: 23}, {m: 4, d: 7},  {m: 4, d: 21}, 
  {m: 5, d: 8},  {m: 5, d: 22}, {m: 6, d: 5},  {m: 6, d: 19}, {m: 7, d: 3},  {m: 7, d: 17}, {m: 7, d: 31}, {m: 8, d: 14}, 
  {m: 8, d: 28}, {m: 9, d: 11}, {m: 9, d: 25}, {m: 10, d: 14}, {m: 10, d: 28}, {m: 11, d: 11}, {m: 11, d: 25}, {m: 12, d: 9}, {m: 12, d: 23}
];

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
  let userCity = "";
  let userType = "92";
  let userCap = "50";
  
  if (ctx && ctx.env) {
      if (ctx.env.城市 !== undefined && ctx.env.城市 !== null) userCity = String(ctx.env.城市).trim();
      if (ctx.env.油号 !== undefined && ctx.env.油号 !== null) userType = String(ctx.env.油号).trim();
      if (ctx.env.容量 !== undefined && ctx.env.容量 !== null) userCap = String(ctx.env.容量).trim();
  }

  let locData = { prov: "北京", py: "beijing" };
  let oilData = { p92: "0.00", p95: "0.00", p98: "0.00", p0: "0.00", trend: "未知", adjustVal: "0.00", currentCycleDate: "未知日期", nextCycleDate: "", refreshDate: "", rangeStr: "" };

  const now = new Date();
  const currYear = now.getFullYear();

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

  // 2. 抓取【当前油价】及【本轮调价新闻】
  try {
    let resOil = await ctx.http.get(`http://m.qiyoujiage.com/${locData.py}.shtml`, { timeout: TIMEOUT, headers: { 'User-Agent': UA } });
    let html = await resOil.text();
    
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

    let rangeMatch = tishi.match(/(\d+\.\d+)元\/升.*?(\d+\.\d+)元\/升/);
    if (rangeMatch) {
       let num1 = parseFloat(rangeMatch[1]);
       let num2 = parseFloat(rangeMatch[2]);
       oilData.rangeStr = `${Math.min(num1, num2).toFixed(2)}-${Math.max(num1, num2).toFixed(2)}`;
    } else {
       let singleMatch = tishi.match(/(\d+\.\d+)/);
       if (singleMatch) {
           oilData.rangeStr = singleMatch[1];
       } else {
           oilData.rangeStr = "0.00";
       }
    }
    
    // 提取本轮调价时间
    let currentMatch = tishi.match(/(\d{4}年\d{1,2}月\d{1,2}日|\d{1,2}月\d{1,2}日)/);
    if (currentMatch) {
        let cd = currentMatch[1];
        if (!cd.includes("年")) cd = currYear + "年" + cd;
        cd = cd.replace(/年0?/g, '年').replace(/月0?/g, '月');
        oilData.currentCycleDate = cd;
    }
  } catch(e) {}

  // 3. 🚀 第一级火箭：实时抓取油价网总站
  try {
      let resMain = await ctx.http.get("http://m.qiyoujiage.com/", { timeout: TIMEOUT, headers: { 'User-Agent': UA } });
      let htmlMain = await resMain.text();
      let pureText = htmlMain.replace(/<[^>]+>/g, ''); 
      
      let match = pureText.match(/(?:下一|新一|下次|下轮).*?(?:调|时间|窗口).*?(\d{4}年\d{1,2}月\d{1,2}日|\d{1,2}月\d{1,2}日|\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/);
      if (match) {
          let raw = match[1];
          if (raw.includes('-') || raw.includes('/')) {
              let parts = raw.split(/[-\/]/);
              oilData.nextCycleDate = `${parts[0]}年${parts[1]}月${parts[2]}日`;
          } else {
              oilData.nextCycleDate = raw;
          }
      }
  } catch(e) {}

  // 🚀 第二级火箭：汽车之家备用抓取
  if (!oilData.nextCycleDate) {
      try {
          let resAuto = await ctx.http.get("https://m.autohome.com.cn/oil/", { timeout: TIMEOUT, headers: { 'User-Agent': UA } });
          let htmlAuto = await resAuto.text();
          let pureAuto = htmlAuto.replace(/<[^>]+>/g, '');
          let match = pureAuto.match(/(?:下一|新一|下次|下轮).*?(?:调|时间|窗口).*?(\d{4}年\d{1,2}月\d{1,2}日|\d{1,2}月\d{1,2}日)/);
          if (match) oilData.nextCycleDate = match[1];
      } catch(e) {}
  }

  // 🚀 第三级火箭：2026年日历终极兜底
  if (!oilData.nextCycleDate && currYear === 2026) {
      for (const item of CALENDAR_2026) {
          const targetDate = new Date(currYear, item.m - 1, item.d, 23, 59, 59);
          if (targetDate > now) {
              oilData.nextCycleDate = `${currYear}年${item.m}月${item.d}日`;
              break; 
          }
      }
  }

  // 规范化下轮时间格式
  if (oilData.nextCycleDate && oilData.nextCycleDate !== "未知日期") {
      let nd = oilData.nextCycleDate;
      if (!nd.includes("年")) nd = currYear + "年" + nd;
      oilData.nextCycleDate = nd.replace(/年0?/g, '年').replace(/月0?/g, '月');
  } else {
      oilData.nextCycleDate = "获取中";
  }

  // 生成刷新时间
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  oilData.refreshDate = `${yyyy}年${mm}月${dd}日`;

  // 4. 计算加满费用
  let capacity = Number(userCap);
  if (isNaN(capacity) || capacity <= 0) capacity = 50;

  let basePrice = 0;
  if (userType === "92") basePrice = Number(oilData.p92) || 0;
  else if (userType === "95") basePrice = Number(oilData.p95) || 0;
  else if (userType === "98") basePrice = Number(oilData.p98) || 0;
  else basePrice = Number(oilData.p0) || 0;

  const totalCost = (basePrice * capacity).toFixed(2);

  // 5. UI 积木块封装 (使用自定义配置区的参数)
  function buildOilCol(name, price) {
    let nameColor = { light: "#000000", dark: "#FFFFFF" }; 
    if (name === "92#") nameColor = COLOR_92; 
    else if (name === "95#") nameColor = COLOR_95; 
    else if (name === "98#") nameColor = COLOR_98; 
    else if (name === "0#") nameColor = COLOR_0; 

    return {
      type: "stack", direction: "column", alignItems: "center", gap: 8, flex: 1,
      children: [
        { type: "text", text: name, font: { size: OIL_NAME_SIZE, weight: "medium" }, textColor: nameColor },
        { type: "text", text: `${price}`, font: { size: PRICE_NUMBER_SIZE, weight: "bold" }, textColor: PRICE_NUMBER_COLOR }
      ]
    };
  }

  const oilNameText = userType === "0" ? "0 号柴油" : `${userType} 号汽油`;
  
  // 第一行：当前加满
  const row1 = {
    type: "stack", direction: "row", alignItems: "center", gap: 3,
    children: [
      { type: "text", text: `当前加满 ${oilNameText} ${capacity} 升需 ${totalCost} 元`, font: { size: BOTTOM_FONT_SIZE, weight: "medium" }, textColor: BOTTOM_TEXT_COLOR }
    ]
  };

  // 第二行：本轮调价
  const rangeText = oilData.trend === '搁浅' ? '搁浅' : `${oilData.trend}${oilData.rangeStr}元/升`;
  const row2 = {
    type: "stack", direction: "row", alignItems: "center", gap: 3,
    children: [
      { type: "text", text: `本轮调价：${oilData.currentCycleDate}·${rangeText}`, font: { size: BOTTOM_FONT_SIZE, weight: "medium" }, textColor: BOTTOM_TEXT_COLOR }
    ]
  };

  // 第三行：下轮调价
  const row3 = {
    type: "stack", direction: "row", alignItems: "center", gap: 3,
    children: [
      { type: "text", text: `下轮调价：${oilData.nextCycleDate}·刷新时间：${oilData.refreshDate}`, font: { size: BOTTOM_FONT_SIZE, weight: "medium" }, textColor: BOTTOM_TEXT_COLOR }
    ]
  };

  return {
    type: "widget",
    url: "egern://",
    padding: 14, 
    backgroundColor: WIDGET_BG_COLOR, 
    children: [
      {
        type: "stack", direction: "column", flex: 1, justifyContent: "space-between", 
        children: [
          {
            type: "stack", direction: "row", alignItems: "center", justifyContent: "center", gap: 4,
            children: [
              { type: "image", src: "sf-symbol:drop", color: TITLE_COLOR, width: 14, height: 14 },
              { type: "text", text: `中国油价 • ${locData.prov}`, font: { size: TITLE_FONT_SIZE, weight: "bold" }, textColor: TITLE_COLOR }
            ]
          },
          {
            type: "stack", direction: "row", alignItems: "center", justifyContent: "space-around",
            children: [
              buildOilCol("92#", oilData.p92),
              buildOilCol("95#", oilData.p95),
              buildOilCol("98#", oilData.p98),
              buildOilCol("0#",  oilData.p0)
            ]
          },
          {
            type: "stack", direction: "column", alignItems: "center", gap: 2,
            children: [
              row1,
              row2,
              row3
            ]
          }
        ]
      }
    ]
  };
}
