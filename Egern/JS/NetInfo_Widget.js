/**
 * 📌 桌面小组件: 📶 现代高级版网络信息 (精准显示 LTE/NR 版 + 保姆级配置说明)
 */
export default async function(ctx) {
  // ==========================================
  // 🎨 UI 个性化配置区 (全面支持系统自动深浅模式)
  // ==========================================
  
  // 1️⃣ 【整体背景】
  // BG_COLOR: 小组件最外层的大背景颜色
  // CARD_BG: 右侧大圆环内部的底色（为了凸显圆环，通常比背景亮一点）
  const BG_COLOR = { light: '#F2F2F7', dark: '#121212' }; 
  const CARD_BG  = { light: '#FFFFFF', dark: '#1C1C1E' }; 

  // 2️⃣ 【左侧模块标题】 (例如屏幕上显示的 "内网" 和 "外网" 这四个字)
  // TITLE_SIZE: 标题字号大小
  // TITLE_COLOR: 标题文字颜色
  const TITLE_SIZE  = 12;
  const TITLE_COLOR = { light: '#1A1A1A', dark: '#FFFFFF' };

  // 3️⃣ 【左侧核心 IP 数据】 (例如屏幕上显示的 "192.168.3.80" 这串大数字)
  // IP_SIZE: IP 数字的字号大小
  // IP_COLOR: IP 数字的颜色
  const IP_SIZE  = 15;
  const IP_COLOR = { light: '#1A1A1A', dark: '#FFFFFF' };

  // 4️⃣ 【左侧详情小字】 (IP 下方带小图标的说明，如 "5G(NR)网络"、"广东 广州")
  // DETAIL_ICON_SIZE: 前面那个小图标的大小
  // DETAIL_TEXT_SIZE: 后面文字的大小
  // DETAIL_COLOR: 详情图标和文字统一使用的颜色 (默认灰色)
  const DETAIL_ICON_SIZE = 11; 
  const DETAIL_TEXT_SIZE = 11; 
  const DETAIL_COLOR     = { light: '#8E8E93', dark: '#98989F' }; 

  // 5️⃣ 【右侧视觉大圆环】
  // THEME_COLOR: 决定圆环的线条颜色，以及圆环中间那个大 WiFi/天线 图标的颜色
  // RING_ICON_SIZE: 圆环中间那个大 WiFi/天线 图标的大小
  const THEME_COLOR    = { light: '#34C759', dark: '#30D158' }; // 默认纯净绿
  const RING_ICON_SIZE = 30; 

  // 6️⃣ 【右侧主状态文字】 (圆环正下方那行粗体字，如 "Wi-Fi", "LTE", "NRNSA")
  // STATUS_MAIN_SIZE: 主状态字号大小
  // STATUS_MAIN_COLOR: 主状态文字颜色
  const STATUS_MAIN_SIZE  = 11;
  const STATUS_MAIN_COLOR = { light: '#1A1A1A', dark: '#FFFFFF' };

  // 7️⃣ 【右侧副状态文字】 (最底部那行极小的字 "当前状态")
  // STATUS_SUB_SIZE: 副状态字号大小
  // STATUS_SUB_COLOR: 副状态文字颜色
  const STATUS_SUB_SIZE  = 9;
  const STATUS_SUB_COLOR = { light: '#8E8E93', dark: '#98989F' };

  // ==========================================
  // ⚙️ 核心数据获取逻辑
  // ==========================================
  const d = ctx.device || {};
  const isWifi = !!d.wifi?.ssid;

  let netName = "未连接", netIcon = "wifi.slash";
  let rightStatus = "无连接"; // 专门用于右侧大圆环下的精准状态展示

  if (isWifi) {
    netName = d.wifi.ssid;
    netIcon = "wifi";
    rightStatus = "Wi-Fi";
  } else if (d.cellular?.radio) {
    const rawRadio = d.cellular.radio.toUpperCase().replace(/\s+/g, "");
    
    // 精准解析蜂窝网络类型，直接暴露出 LTE 或 NR
    if (rawRadio.includes("NR")) {
      netName = `5G (${rawRadio})`;  // 左侧显示如：5G (NRNSA)
      rightStatus = rawRadio;        // 右侧显示如：NRNSA 或 NR
    } else if (rawRadio.includes("LTE")) {
      netName = `4G (LTE)`;
      rightStatus = "LTE";
    } else if (rawRadio.includes("WCDMA")) {
      netName = `3G (WCDMA)`;
      rightStatus = "3G";
    } else {
      netName = `${rawRadio} 网络`;
      rightStatus = rawRadio;
    }
    netIcon = "antenna.radiowaves.left.and.right";
  } else {
    rightStatus = "Cellular";
  }

  const localIp = d.ipv4?.address || "获取失败";
  const gateway = d.ipv4?.gateway || "无网关";

  const fmtISP = (isp) => {
    if (!isp) return "未知";
    const s = String(isp).toLowerCase();
    if (/移动\|mobile\|cmcc/i.test(s)) return "中国移动";
    if (/电信\|telecom\|chinanet/i.test(s)) return "中国电信";
    if (/联通\|unicom/i.test(s)) return "中国联通";
    if (/广电\|broadcast\|cbn/i.test(s)) return "中国广电";
    return isp;
  };

  let pubIp = "获取中...", pubLoc = "未知位置", pubIsp = "未知运营商";
  try {
    const res = await ctx.http.get('https://myip.ipip.net/json', { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 4000 });
    const body = JSON.parse(await res.text());
    if (body && body.data) {
      pubIp = body.data.ip || "获取失败";
      const locArr = body.data.location || [];
      let prov = locArr[1] ? locArr[1].replace(/省|市|自治区|回族自治区|维吾尔自治区|壮族自治区/g, "") : "";
      let city = locArr[2] ? locArr[2].replace(/市|自治州|地区|盟/g, "") : "";
      
      if (prov && city && prov !== city) pubLoc = `${prov} ${city}`;
      else if (prov || city) pubLoc = prov || city;
      else pubLoc = locArr[0] || "未知";
      
      pubIsp = fmtISP(locArr[4] || locArr[3]);
    }
  } catch (e) {}

  // ==========================================
  // 🎨 UI 积木块封装
  // ==========================================
  function buildCard(title, ipText, icon1, detail1, icon2, detail2) {
    return {
      type: "stack", direction: "column", alignItems: "center", gap: 3,
      children: [
        { type: "text", text: title, font: { size: TITLE_SIZE, weight: "bold" }, textColor: TITLE_COLOR, maxLines: 1 },
        { type: "text", text: ipText, font: { size: IP_SIZE, weight: "bold", family: "Menlo" }, textColor: IP_COLOR, maxLines: 1 },
        { 
          type: "stack", direction: "row", alignItems: "center", gap: 4,
          children: [
            { type: "image", src: `sf-symbol:${icon1}`, color: DETAIL_COLOR, width: DETAIL_ICON_SIZE, height: DETAIL_ICON_SIZE },
            { type: "text", text: detail1, font: { size: DETAIL_TEXT_SIZE, weight: "medium" }, textColor: DETAIL_COLOR, maxLines: 1, minScale: 0.8 }
          ]
        },
        { 
          type: "stack", direction: "row", alignItems: "center", gap: 4,
          children: [
            { type: "image", src: `sf-symbol:${icon2}`, color: DETAIL_COLOR, width: DETAIL_ICON_SIZE, height: DETAIL_ICON_SIZE },
            { type: "text", text: detail2, font: { size: DETAIL_TEXT_SIZE, weight: "medium" }, textColor: DETAIL_COLOR, maxLines: 1, minScale: 0.8 }
          ]
        }
      ]
    };
  }

  // ==========================================
  // 🧩 终极布局渲染
  // ==========================================
  return {
    type: 'widget',
    url: "egern://",
    padding: 16,
    backgroundColor: BG_COLOR,
    children: [
      {
        type: "stack", direction: "row", alignItems: "center",
        children: [
          // 👈 左侧信息双层堆叠
          {
            type: "stack", direction: "column", alignItems: "center", gap: 12, flex: 1,
            children: [
              buildCard("内网", localIp, "network", netName, "wifi.router.fill", gateway),
              buildCard("外网", pubIp, "location.fill", pubLoc, "antenna.radiowaves.left.and.right", pubIsp)
            ]
          },
          
          // 👉 右侧视觉大圆环
          {
            type: "stack", direction: "column", alignItems: "center", justifyContent: "center", width: 90, gap: 8,
            children: [
              {
                type: "stack", direction: "column", alignItems: "center", justifyContent: "center",
                width: 76, height: 76, borderRadius: 38,
                borderWidth: 5, borderColor: THEME_COLOR,
                backgroundColor: CARD_BG,
                children: [
                  { type: "image", src: `sf-symbol:${netIcon}`, color: THEME_COLOR, width: RING_ICON_SIZE, height: RING_ICON_SIZE }
                ]
              },
              {
                type: "stack", direction: "column", alignItems: "center", gap: 2,
                children: [
                  { type: "text", text: rightStatus, font: { size: STATUS_MAIN_SIZE, weight: "heavy" }, textColor: STATUS_MAIN_COLOR },
                  { type: "text", text: "当前状态", font: { size: STATUS_SUB_SIZE, weight: "bold" }, textColor: STATUS_SUB_COLOR }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
}
