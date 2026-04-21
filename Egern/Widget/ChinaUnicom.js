/**
 * 📱 中国联通 - 大小组件全适配版 (安全稳定·原色定型版)
 * 🌐 抓包域名: m.client.10010.com
 * * ⚙️ 环境变量填写说明 (在 Egern -> 小组件 -> 环境变量处添加)
 * * 🔴 [必填] 核心数据抓取：
 * 变量名: Cookie          值: 抓包获取的完整 Cookie
 * 变量名: 手机号          值: 您的手机号 (如 186xxxxxxxx)
 * * 🔵 [选填] UI 自定义配置 (不填则使用系统默认完美值)：
 * 变量名: 套餐名称        值: 如 "广东乐享"
 * 变量名: 话费颜色        值: 填 HEX 色值，默认 #D7000F
 * 变量名: 流量颜色        值: 填 HEX 色值，默认 #12A6E4
 * 变量名: 语音颜色        值: 填 HEX 色值，默认 #34C759
 * 变量名: 中号数值字体    值: 填纯数字，默认 24
 * 变量名: 中号单位字体    值: 填纯数字，默认 12
 * 变量名: 中号标题字体    值: 填纯数字，默认 11
 * 变量名: 小号数值字体    值: 填纯数字，默认 14
 * 变量名: 顶栏字体        值: 填纯数字，默认 13
 * 
 */

export default async function(ctx) {
  const cookie = ctx.env.Cookie || "";
  const phone = ctx.env.手机号 || "";

  // ⚙️ 字体与颜色配置读取
  const cfg = {
    medValueSize:  parseInt(ctx.env.中号数值字体) || 20,
    medUnitSize:   parseInt(ctx.env.中号单位字体) || 12,
    medTitleSize:  parseInt(ctx.env.中号标题字体) || 11,
    smValueSize:   parseInt(ctx.env.小号数值字体) || 14,
    smUnitSize:    parseInt(ctx.env.小号单位字体) || 9,
    smLabelSize:   parseInt(ctx.env.小号标签字体) || 9,
    headerSize:    parseInt(ctx.env.顶栏字体)     || 13,
    feeColor:      ctx.env.话费颜色 || "#D7000F",
    flowColor:     ctx.env.流量颜色 || "#12A6E4",
    voiceColor:    ctx.env.语音颜色 || "#34C759",
  };

  // 🎨 绝对安全的底色方案 (弃用会导致崩溃的 8位透明度 HEX，直接使用安全的 6位极浅 HEX)
  const colors = {
    bg: { light: "#FFFFFF", dark: "#121212" },
    title: { light: "#8E8E93", dark: "#98989D" },
    unicomRed: "#E60012", 
    themeFee: { 
      main: cfg.feeColor, 
      bg: { light: "#FFE5E5", dark: "#4A2424" },
      cardBg: { light: "#FFF5F5", dark: "#2C1E1E" } // 安全浅红
    }, 
    themeFlow: { 
      main: cfg.flowColor, 
      bg: { light: "#E5F1FF", dark: "#1A324A" },
      cardBg: { light: "#F2F8FF", dark: "#1B242C" } // 安全浅蓝
    }, 
    themeVoice: { 
      main: cfg.voiceColor, 
      bg: { light: "#E5F9EB", dark: "#1C3C24" },
      cardBg: { light: "#F2FBF4", dark: "#1C261F" } // 安全浅绿
    }, 
  };

  // 🌟 生成右上角的刷新时间
  const now = new Date();
  const refreshTime = ` ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  let data = {
    packageName: "中国联通", 
    fee:   { title: "剩余话费", value: "--", unit: "¥" },
    voice: { title: "剩余语音", value: "--", unit: "MIN" },
    flow:  { title: "剩余流量", value: "--", unit: "GB" },
    error: null,
  };

  if (!cookie) {
    data.error = "未配置 Cookie 环境变量";
  } else {
    try {
      const loginUrl = 'https://m.client.10010.com/dailylottery/static/textdl/userLogin?version=iphone_c@8.0200&desmobile=';
      await ctx.http.get(loginUrl, { headers: { "cookie": cookie } }).catch(() => {});

      const url = 'https://m.client.10010.com/mobileserviceimportant/home/queryUserInfoSeven?version=iphone_c@8.0200&desmobiel=&showType=0';
      const resp = await ctx.http.get(url, {
        timeout: 8000,
        headers: { "Host": "m.client.10010.com", "User-Agent": "ChinaUnicom.x CFNetwork iOS/16.3", "cookie": cookie },
      });
      const res = await resp.json();

      if (res?.code === "Y") {
        data.packageName = ctx.env.套餐名称 || ctx.env.套餐 || res.productName || res.packageName || res.planName || "中国联通";
        
        if (res.data && res.data.dataList && Array.isArray(res.data.dataList)) {
          res.data.dataList.forEach((item) => {
            if (item.type === 'fee') {
              data.fee.value = item.unit === '万元' ? item.number * 10000 : item.number;
              data.fee.unit = item.unit || "¥";
            } else if (item.type === 'flow') {
              data.flow.value = item.number;
              data.flow.unit = item.unit || "GB";
            } else if (item.type === 'voice') {
              data.voice.value = item.number;
              data.voice.unit = item.unit || "MIN";
            }
          });
        } else {
          if (res.feeResource) data.fee.value = res.feeResource.feePersent ?? 0;
          if (res.voiceResource) data.voice.value = res.voiceResource.voicePersent ?? 0;
          if (res.flowResource) data.flow.value = res.flowResource.flowPersent ?? 0;
        }
      } else {
        data.error = "API返回异常";
      }
    } catch (e) {
      data.error = "网络请求失败";
    }
  }

  // 📦 构建 中号组件 (Medium)
  function buildMediumCard(title, value, unit, theme, icon) {
    return {
      type: "stack", 
      direction: "column", 
      flex: 1, 
      padding: [12, 8, 12, 8],
      backgroundColor: theme.cardBg, // 绝对安全的底色
      borderRadius: 16, 
      alignItems: "center",
      children: [
        {
          type: "stack", direction: "column", alignItems: "center",
          children: [
            {
              type: "stack", padding: [8, 8, 8, 8], backgroundColor: theme.bg, borderRadius: 18,
              children: [{ type: "image", src: `sf-symbol:${icon}`, color: theme.main, width: 22, height: 22 }]
            }
          ]
        },
        { type: "spacer" },
        {
          type: "stack", direction: "column", alignItems: "center",
          children: [
            {
              type: "stack", direction: "row", alignItems: "center", gap: 2,
              children: [
                { type: "text", text: String(value), font: { size: cfg.medValueSize, weight: "bold" }, textColor: theme.main },
                { type: "text", text: unit,          font: { size: cfg.medUnitSize,  weight: "bold" }, textColor: theme.main }
              ]
            },
            { type: "stack", height: 4 },
            { type: "text", text: title, font: { size: cfg.medTitleSize, weight: "medium" }, textColor: colors.title }
          ]
        }
      ]
    };
  }

  // 📦 构建 小号组件 (Small)
  function buildSmallRow(title, value, unit, theme, icon) {
    return {
      type: "stack", direction: "row", alignItems: "center", padding: [8, 12, 8, 12],
      backgroundColor: theme.cardBg, // 绝对安全的底色
      borderRadius: 12,
      children: [
        {
          type: "stack", padding: [6, 6, 6, 6], backgroundColor: theme.bg, borderRadius: 10,
          children: [{ type: "image", src: `sf-symbol:${icon}`, color: theme.main, width: 14, height: 14 }]
        },
        { type: "stack", width: 22 }, // 🌟 物理外挂间距：去除一切复杂语法，硬推22像素，稳妥后移文字
        {
          type: "stack", direction: "column",
          // ⚠️ 绝不加任何 alignItems 语法，防止 Egern 报错
          children: [
            { type: "text", text: title, font: { size: cfg.smLabelSize, weight: "medium" }, textColor: colors.title },
            {
              type: "stack", direction: "row", alignItems: "center", gap: 2,
              children: [
                { type: "text", text: String(value), font: { size: cfg.smValueSize, weight: "bold" }, textColor: theme.main },
                { type: "text", text: unit,          font: { size: cfg.smUnitSize,  weight: "bold" }, textColor: theme.main }
              ]
            }
          ]
        },
        { type: "spacer" }
      ]
    };
  }

  if (data.error) {
    return {
      type: "widget", backgroundColor: colors.bg, padding: 16,
      children: [{ type: "text", text: `❌ ${data.error}`, textColor: colors.unicomRed }]
    };
  }

  const headerStack = {
    type: "stack", direction: "row", alignItems: "center",
    children: [
      { type: "image", src: "sf-symbol:simcard.fill", color: colors.unicomRed, width: 14, height: 14 },
      { type: "stack", width: 6 },
      { type: "text", text: `中国联通 · ${data.packageName}`, font: { size: cfg.headerSize, weight: "bold" }, textColor: colors.unicomRed },
      { type: "spacer" },
      { type: "text", text: refreshTime, font: { size: 11, weight: "medium" }, textColor: colors.title }
    ]
  };

  const isSmall = ctx.widgetFamily === "systemSmall";

  if (isSmall) {
    return {
      type: "widget", backgroundColor: colors.bg, padding: [12, 12, 12, 12],
      children: [
        {
          type: "stack", direction: "row", alignItems: "center",
          children: [
            { type: "image", src: "sf-symbol:simcard.fill", color: colors.unicomRed, width: 12, height: 12 },
            { type: "stack", width: 4 },
            { type: "text", text: "中国联通", font: { size: cfg.headerSize, weight: "bold" }, textColor: colors.unicomRed },
            { type: "spacer" },
            { type: "text", text: refreshTime, font: { size: 9, weight: "medium" }, textColor: colors.title }
          ]
        },
        { type: "spacer" },
        {
          type: "stack", direction: "column", gap: 6,
          children: [
            buildSmallRow("话费", data.fee.value,   data.fee.unit,   colors.themeFee,   "yensign"),
            buildSmallRow("流量", data.flow.value,  data.flow.unit,  colors.themeFlow,  "antenna.radiowaves.left.and.right"),
            buildSmallRow("语音", data.voice.value, data.voice.unit, colors.themeVoice, "phone.fill")
          ]
        }
      ]
    };
  }

  const mediumCardsStack = {
    type: "stack", direction: "row", gap: 10,
    children: [
      buildMediumCard(data.fee.title,   data.fee.value,   data.fee.unit,   colors.themeFee,   "yensign"),
      buildMediumCard(data.flow.title,  data.flow.value,  data.flow.unit,  colors.themeFlow,  "antenna.radiowaves.left.and.right"),
      buildMediumCard(data.voice.title, data.voice.value, data.voice.unit, colors.themeVoice, "phone.fill")
    ]
  };

  return {
    type: "widget", backgroundColor: colors.bg, padding: [16, 16, 16, 16],
    children: [ headerStack, { type: "stack", height: 14 }, mediumCardsStack ]
  };
}
