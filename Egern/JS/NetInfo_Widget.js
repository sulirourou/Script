/**
 * 📌 桌面小组件: 📶 现代高级版网络信息 (防崩溃极致对齐版)
 */
export default async function(ctx) {
  // ==========================================
  // 🎨 UI 个性化配置区 (全面支持系统自动深浅模式)
  // ==========================================
  const BG_COLOR = { light: '#F2F2F7', dark: '#121212' }; // 最外层背景
  const CARD_BG  = { light: '#FFFFFF', dark: '#1C1C1E' }; // 内层卡片背景
  const C_TITLE  = { light: '#1A1A1A', dark: '#FFFFFF' }; // 主标题颜色
  const C_SUB    = { light: '#8E8E93', dark: '#98989F' }; // 副标题颜色
  const THEME_COLOR = { light: '#34C759', dark: '#30D158' }; // 统一主题色(绿)
  const C_IP     = { light: '#1A1A1A', dark: '#FFFFFF' }; // IP 数字颜色

  // ==========================================
  // ⚙️ 核心数据获取逻辑
  // ==========================================
  const d = ctx.device || {};
  const isWifi = !!d.wifi?.ssid;

  let netName = "未连接", netIcon = "wifi.slash";
  if (isWifi) {
    netName = d.wifi.ssid;
    netIcon = "wifi";
  } else if (d.cellular?.radio) {
    const radioMap = { "GPRS": "2G", "EDGE": "2G", "WCDMA": "3G", "LTE": "4G", "NR": "5G", "NRNSA": "5G" };
    const rawRadio = d.cellular.radio.toUpperCase().replace(/\s+/g, "");
    netName = `${radioMap[rawRadio] || rawRadio} 网络`;
    netIcon = "antenna.radiowaves.left.and.right";
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
  // 🎨 UI 积木块封装 (引入强力弹簧 Spacer 确保安全左对齐)
  // ==========================================
  function buildCard(title, ipText, label1, detail1, label2, detail2) {
    return {
      type: "stack", direction: "column", gap: 3,
      children: [
        // 标题行
        {
          type: "stack", direction: "row", alignItems: "center",
          children: [
            { type: "text", text: title, font: { size: 11, weight: "bold" }, textColor: C_TITLE, maxLines: 1 },
            { type: "spacer" } // 强力弹簧，推向左侧
          ]
        },
        // IP行
        {
          type: "stack", direction: "row", alignItems: "center",
          children: [
            { type: "text", text: ipText, font: { size: 17, weight: "bold", family: "Menlo" }, textColor: C_IP, maxLines: 1 },
            { type: "spacer" }
          ]
        },
        // 详情第一行
        { 
          type: "stack", direction: "row", alignItems: "center", gap: 2,
          children: [
            { type: "text", text: label1, font: { size: 11, weight: "bold" }, textColor: C_SUB },
            { type: "text", text: detail1, font: { size: 11, weight: "medium" }, textColor: C_SUB, maxLines: 1, minScale: 0.8 },
            { type: "spacer" }
          ]
        },
        // 详情第二行
        { 
          type: "stack", direction: "row", alignItems: "center", gap: 2,
          children: [
            { type: "text", text: label2, font: { size: 11, weight: "bold" }, textColor: C_SUB },
            { type: "text", text: detail2, font: { size: 11, weight: "medium" }, textColor: C_SUB, maxLines: 1, minScale: 0.8 },
            { type: "spacer" }
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
            type: "stack", direction: "column", gap: 12, flex: 1,
            children: [
              // 💡 魔法生效点：使用全角空格将短词物理补齐，达到完美对齐！
              buildCard("内网 IP", localIp, "网　络：", netName, "网　关：", gateway),
              buildCard("公网 IP", pubIp, "位　置：", pubLoc, "运营商：", pubIsp)
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
                  { type: "image", src: `sf-symbol:${netIcon}`, color: THEME_COLOR, width: 30, height: 30 }
                ]
              },
              {
                type: "stack", direction: "column", alignItems: "center", gap: 2,
                children: [
                  { type: "text", text: isWifi ? "Wi-Fi" : "Cellular", font: { size: 11, weight: "heavy" }, textColor: C_TITLE },
                  { type: "text", text: "当前状态", font: { size: 9, weight: "bold" }, textColor: C_SUB }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
}
