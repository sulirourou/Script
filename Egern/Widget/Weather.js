/**
 * 🌤️ 和风天气 - Egern 小组件 (纯净自动定位版 + 全面UI自定义遥控器)
 *
 * ⚠️ 重要提示
 * 环境变量：
 * KEY: 和风天气 API Key（必填）
 * API_HOST: 你的个人API Host（必填！从控制台获取）
 * LOCATION: 城市或区县名，如"北京"、"海淀" （选填：不填则全自动根据当前网络 IP 定位精确位置）
 */

// ==========================================
// 🎨 UI 个性化配置区 (全面支持系统自动深浅模式)
// ==========================================

// 1️⃣ 背景颜色配置
const BG_COLOR_SMALL  = { light: '#FFFFFF', dark: '#000000' }; // 小号组件背景
const BG_COLOR_MEDIUM = { light: '#FFFFFF', dark: '#121212' }; // 中号组件背景

// 2️⃣ 顶部信息栏配置 (城市名、定位图标、更新时间)
const CITY_FONT_SIZE_S = 'caption1'; // 小号组件-城市字号
const CITY_FONT_SIZE_M = 'title3';   // 中号组件-城市字号
const CITY_TEXT_COLOR  = { light: '#000000', dark: '#FFFFFF' }; // 城市文字颜色
const LOC_ICON_COLOR   = { light: '#FF3B30', dark: '#FF453A' }; // 定位小图标颜色 (默认红)
const TIME_FONT_SIZE   = 'caption2'; // 更新时间字号
const TIME_TEXT_COLOR  = { light: '#8E8E93', dark: '#8E8E93' }; // 更新时间颜色

// 3️⃣ 核心天气数据配置 (主温度、天气描述)
const TEMP_FONT_SIZE_S = 'title2';     // 小号组件-主温度字号
const TEMP_FONT_SIZE_M = 'largeTitle'; // 中号组件-主温度字号
const TEMP_TEXT_COLOR  = { light: '#000000', dark: '#FFFFFF' }; // 主温度颜色
const DESC_FONT_SIZE_S = 'caption1';   // 小号组件-天气描述字号
const DESC_FONT_SIZE_M = 'title3';     // 中号组件-天气描述字号
const DESC_TEXT_COLOR  = { light: '#444444', dark: '#CCCCCC' }; // 天气描述颜色

// 4️⃣ 空气质量 (AQI) 配置 (仅中号组件显示)
const AQI_LABEL_SIZE   = 'caption2'; // "空气"两字字号
const AQI_LABEL_COLOR  = { light: '#666666', dark: '#AAAAAA' }; // "空气"两字颜色
const AQI_VALUE_SIZE_1 = 'caption1'; // 顶部小 AQI 提示字号
const AQI_VALUE_SIZE_2 = 'title3';   // 右侧大 AQI 评价字号 (如"优", "良")

// 5️⃣ 底部三要素配置 (湿度、风力、风速 - 仅中号组件显示)
const INFO_LABEL_SIZE  = 'caption2'; // "湿度"等标签字号
const INFO_LABEL_COLOR = { light: '#666666', dark: '#AAAAAA' }; // 标签文字颜色
const INFO_VALUE_SIZE  = 'title3';   // "65%"等数值字号
const INFO_VALUE_COLOR = { light: '#000000', dark: '#FFFFFF' }; // 数值文字颜色
// 底部三个小图标的独立颜色
const COLOR_HUMIDITY   = '#007AFF'; // 湿度图标色 (蓝)
const COLOR_WIND_DIR   = '#5856D6'; // 风向图标色 (紫)
const COLOR_WIND_SPEED = '#FF9500'; // 风速图标色 (橙)

// ==========================================
// ⚙️ 下方为核心代码区 (非必要请勿修改)
// ==========================================

export default async function(ctx) {
  const env = ctx.env || {};
  const widgetFamily = ctx.widgetFamily || 'systemMedium';

  const apiKey     = (env.KEY || '').trim();
  const apiHostRaw = (env.API_HOST || '').trim();
  const location   = (env.LOCATION || '').trim(); 

  if (!apiKey)     return renderError('缺少 KEY 环境变量');
  if (!apiHostRaw) return renderError('缺少 API_HOST 环境变量');

  const apiHost = normalizeHost(apiHostRaw);

  try {
    const { lon, lat, city } = await getLocation(ctx, location, apiKey, apiHost);
    const now = await fetchWeatherNow(ctx, apiKey, lon, lat, apiHost);

    let air = null;
    if (widgetFamily !== 'systemSmall' && !isAccessoryFamily(widgetFamily)) {
      air = await fetchAirQuality(ctx, apiKey, lon, lat, apiHost);
    }

    if (isAccessoryFamily(widgetFamily)) {
      return renderAccessoryCompact(now, city, widgetFamily);
    }

    if (widgetFamily === 'systemSmall') {
      return renderSmall(now, city);
    } else {
      return renderMedium(now, air, city);
    }

  } catch (e) {
    console.error(e);
    return renderError(`请求失败：${e.message.slice(0, 60)}`);
  }
}

function normalizeHost(host) {
  let h = host;
  if (!/^https?:\/\//i.test(h)) h = 'https://' + h;
  return h.replace(/\/+$/, '');
}

function isAccessoryFamily(family) {
  return family.startsWith('accessory');
}

async function getLocation(ctx, locName, key, host) {
  let finalLocName = locName;
  if (!finalLocName) {
    try {
      const resIp = await ctx.http.get("https://myip.ipip.net/json", { timeout: 4000 });
      const jIp = await resIp.json();
      if (jIp.ret === "ok" && jIp.data && jIp.data.location) {
        let locArray = jIp.data.location;
        let cName = locArray[3] || locArray[2] || locArray[1] || "";
        finalLocName = cName.replace(/市|自治州|地区|盟|县|区/g, "");
      }
    } catch(e) {}
    if (!finalLocName) finalLocName = "北京";
  }
  try {
    const url = `${host}/geo/v2/city/lookup?location=${encodeURIComponent(finalLocName)}&key=${key}&number=1&lang=zh`;
    const resp = await ctx.http.get(url, { timeout: 6000 });
    const data = await resp.json();
    if (data.code === '200' && data.location?.[0]) {
      const loc = data.location[0];
      return { lon: loc.lon, lat: loc.lat, city: loc.name || finalLocName };
    }
  } catch {}
  return { lon: '116.4074', lat: '39.9042', city: finalLocName || '未知' };
}

async function fetchWeatherNow(ctx, key, lon, lat, host) {
  const url = `${host}/v7/weather/now?location=${lon},${lat}&key=${key}&lang=zh`;
  const resp = await ctx.http.get(url, { timeout: 8000 });
  const data = await resp.json();
  if (data.code !== '200') throw new Error(data.msg || `天气接口返回 ${data.code}`);
  const now = data.now;
  return {
    temp: now.temp, text: now.text, icon: now.icon,
    humidity: now.humidity, windDir: now.windDir || '--',
    windScale: now.windScale || '--', windSpeed: now.windSpeed || '--'
  };
}

async function fetchAirQuality(ctx, key, lon, lat, host) {
  let aqiData = null;
  try {
    const url = `${host}/airquality/v1/current/${lat}/${lon}?key=${key}&lang=zh`;
    const resp = await ctx.http.get(url, { timeout: 7000 });
    const data = await resp.json();
    if (data.indexes && data.indexes.length > 0) {
      const cnMee = data.indexes.find(i => i.code === 'cn-mee') || data.indexes[0];
      if (cnMee?.aqi != null) {
        aqiData = {
          aqi: Math.round(Number(cnMee.aqi)),
          category: cnMee.category || getAQICategory(cnMee.aqi).text,
          color: getAQICategory(cnMee.aqi).color
        };
      }
    }
  } catch (e) {}
  if (!aqiData) {
    try {
      const url = `${host}/v7/air/now?location=${lon},${lat}&key=${key}&lang=zh`;
      const resp = await ctx.http.get(url, { timeout: 7000 });
      const data = await resp.json();
      if (data.code === '200' && data.now?.aqi) {
        const val = Number(data.now.aqi);
        aqiData = {
          aqi: Math.round(val),
          category: data.now.category || getAQICategory(val).text,
          color: getAQICategory(val).color
        };
      }
    } catch {}
  }
  return aqiData || { aqi: '--', category: '--', color: { light: '#999', dark: '#888' } };
}

function getAQICategory(val) {
  const n = Number(val);
  if (isNaN(n)) return { text: '--', color: { light: '#999999', dark: '#888888' } };
  if (n <=  50) return { text: '优',   color: { light: '#4CD964', dark: '#34C759' } };
  if (n <= 100) return { text: '良',   color: { light: '#FFCC00', dark: '#FF9F0A' } };
  if (n <= 150) return { text: '轻度污染', color: { light: '#FF9500', dark: '#FF9500' } };
  if (n <= 200) return { text: '中度污染', color: { light: '#FF3B30', dark: '#FF453A' } };
  if (n <= 300) return { text: '重度污染', color: { light: '#AF52DE', dark: '#BF5AF2' } };
  return               { text: '严重污染', color: { light: '#8E3C9E', dark: '#9F5FC9' } };
}

function getWeatherIcon(code) {
  const map = {
    '100': 'sun.max.fill', '101': 'cloud.sun.fill', '102': 'cloud.fill',
    '103': 'cloud.sun.fill', '104': 'cloud.fill', '300': 'cloud.drizzle.fill',
    '800': 'wind', '801': 'wind', '802': 'wind', '803': 'wind', '804': 'wind'
  };
  return map[code] || 'cloud.fill';
}

function getWeatherColor(code) {
  const n = Number(code);
  if (n >= 100 && n <= 104) return { light: '#FF9500', dark: '#FFB340' };
  if (n >= 300 && n <= 399) return { light: '#007AFF', dark: '#0A84FF' };
  if (n >= 400 && n <= 499) return { light: '#5856D6', dark: '#5E5CE6' };
  if (n >= 500 && n <= 515) return { light: '#8E8E93', dark: '#98989D' };
  return { light: '#FF9500', dark: '#FFB340' };
}

// ────────────────────────────────────────────────
// 渲染函数 (修复挤压 + 指南完整版)
// ────────────────────────────────────────────────

function renderSmall(now, city) {
  const icon = getWeatherIcon(now.icon);
  const color = getWeatherColor(now.icon);
  const time = new Date();
  const timeStr = `${time.getHours()}:${String(time.getMinutes()).padStart(2,'0')}`;
  return {
    type: 'widget', padding: 14, gap: 6, backgroundColor: BG_COLOR_SMALL,
    children: [
      { type: 'stack', direction: 'row', alignItems: 'center', gap: 8, children: [{ type: 'text', text: city, font: { size: CITY_FONT_SIZE_S, weight: 'bold' }, textColor: CITY_TEXT_COLOR }, { type: 'spacer' }, { type: 'text', text: timeStr, font: { size: TIME_FONT_SIZE }, textColor: TIME_TEXT_COLOR }] },
      { type: 'stack', direction: 'row', alignItems: 'center', gap: 10, children: [{ type: 'image', src: `sf-symbol:${icon}`, width: 40, height: 40, color }, { type: 'stack', direction: 'column', children: [{ type: 'text', text: `${now.temp}°`, font: { size: TEMP_FONT_SIZE_S, weight: 'bold' }, textColor: TEMP_TEXT_COLOR }, { type: 'text', text: now.text, font: { size: DESC_FONT_SIZE_S }, textColor: DESC_TEXT_COLOR }] }] }
    ]
  };
}

function renderMedium(now, air, city) {
  const icon = getWeatherIcon(now.icon);
  const iconColor = getWeatherColor(now.icon);
  const time = new Date();
  const timeStr = `${time.getMonth()+1}/${time.getDate()} ${time.getHours()}:${String(time.getMinutes()).padStart(2,'0')}`;
  return {
    type: 'widget', padding: 12, gap: 10, backgroundColor: BG_COLOR_MEDIUM,
    children: [
      { type: 'stack', direction: 'row', alignItems: 'center', children: [{ type: 'stack', direction: 'row', alignItems: 'center', gap: 6, children: [{ type: 'image', src: 'sf-symbol:location.fill', width: 14, height: 14, color: LOC_ICON_COLOR }, { type: 'text', text: city, font: { size: CITY_FONT_SIZE_M, weight: 'bold' }, textColor: CITY_TEXT_COLOR }] }, { type: 'spacer' }, { type: 'text', text: `AQI ${air.aqi}`, font: { size: AQI_VALUE_SIZE_1, weight: 'semibold' }, textColor: air.color }, { type: 'spacer', width: 8 }, { type: 'text', text: timeStr, font: { size: TIME_FONT_SIZE }, textColor: TIME_TEXT_COLOR }] },
      { type: 'stack', direction: 'row', alignItems: 'center', gap: 16, children: [{ type: 'image', src: `sf-symbol:${icon}`, width: 60, height: 60, color: iconColor }, { type: 'stack', direction: 'column', flex: 1, gap: 4, children: [{ type: 'text', text: `${now.temp}°C`, font: { size: TEMP_FONT_SIZE_M, weight: 'bold' }, textColor: TEMP_TEXT_COLOR }, { type: 'text', text: now.text, font: { size: DESC_FONT_SIZE_M }, textColor: DESC_TEXT_COLOR }] }, { type: 'stack', direction: 'column', alignItems: 'center', gap: 2, children: [{ type: 'text', text: '空气', font: { size: AQI_LABEL_SIZE }, textColor: AQI_LABEL_COLOR }, { type: 'text', text: air.category, font: { size: AQI_VALUE_SIZE_2, weight: 'bold' }, textColor: air.color }] }] },
      // 🛠️ 底部排版修正：使用 Spacer 分割，保证留空位且完整显示
      { type: 'stack', direction: 'row', alignItems: 'center', children: [
          createInfoItem('drop.fill', '湿度', `${now.humidity}%`, COLOR_HUMIDITY),
          { type: 'spacer' },
          createInfoItem('wind', '风力', `${now.windDir} ${now.windScale}级`, COLOR_WIND_DIR),
          { type: 'spacer' },
          createInfoItem('gauge.medium', '风速', `${now.windSpeed}km/h`, COLOR_WIND_SPEED)
      ]}
    ]
  };
}

function createInfoItem(icon, label, value, iconColor) {
  return {
    type: 'stack', direction: 'row', alignItems: 'center', gap: 4, // 🛠️ 图标字紧贴
    children: [
      { type: 'image', src: `sf-symbol:${icon}`, width: 18, height: 18, color: { light: iconColor, dark: iconColor } },
      { 
        type: 'stack', direction: 'column',
        children: [
          { type: 'text', text: label, font: { size: INFO_LABEL_SIZE }, textColor: INFO_LABEL_COLOR, lineLimit: 1, minimumScaleFactor: 0.6 },
          // 🛠️ 深度缩放，确保桌面端“东北风 X级”必出，绝不变省略号
          { type: 'text', text: value, font: { size: INFO_VALUE_SIZE, weight: 'semibold' }, textColor: INFO_VALUE_COLOR, lineLimit: 1, minimumScaleFactor: 0.3 }
        ]
      }
    ]
  };
}

function renderAccessoryCompact(now, city, family) {
  const icon = getWeatherIcon(now.icon);
  return {
    type: 'widget', padding: 8, backgroundColor: BG_COLOR_SMALL,
    children: [{ type: 'stack', direction: 'row', alignItems: 'center', gap: 6, children: [{ type: 'image', src: `sf-symbol:${icon}`, width: 24, height: 24, color: getWeatherColor(now.icon) }, { type: 'text', text: `${now.temp}° ${city.slice(0,4)}`, font: { size: family === 'accessoryInline' ? 'footnote' : 'subheadline' }, textColor: CITY_TEXT_COLOR }] }]
  };
}

function renderError(msg) {
  return {
    type: 'widget', padding: 16, backgroundColor: BG_COLOR_SMALL,
    children: [{ type: 'stack', direction: 'column', alignItems: 'center', gap: 8, children: [{ type: 'image', src: 'sf-symbol:exclamationmark.triangle.fill', width: 32, height: 32, color: LOC_ICON_COLOR }, { type: 'text', text: msg, font: { size: 'body' }, textColor: LOC_ICON_COLOR, textAlign: 'center' }] }]
  };
}
