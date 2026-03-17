/**
 * 🌤️ 和风天气 - Egern 小组件 (纯净自动定位版 + 支持区县)
 *
 * ⚠️ 重要提示
 * 环境变量：
 * KEY: 和风天气 API Key（必填）
 * API_HOST: 你的个人API Host（必填！从控制台获取）
 * LOCATION: 城市或区县名，如"北京"、"海淀"、"龙川" （选填：不填则全自动根据当前网络 IP 定位精确位置）
 */

export default async function(ctx) {
  const env = ctx.env || {};
  const widgetFamily = ctx.widgetFamily || 'systemMedium';

  // 防御性获取环境变量
  const apiKey     = (env.KEY || '').trim();
  const apiHostRaw = (env.API_HOST || '').trim();
  // 用户不填则为空，交给底层全自动定位
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

// ────────────────────────────────────────────────
// 辅助函数
// ────────────────────────────────────────────────

function normalizeHost(host) {
  let h = host;
  if (!/^https?:\/\//i.test(h)) h = 'https://' + h;
  return h.replace(/\/+$/, '');
}

function isAccessoryFamily(family) {
  return family.startsWith('accessory');
}

// 💡 纯净版定位函数：彻底移除内置写死城市，全靠 IP 动态解析与和风接口查询（支持区/县）
async function getLocation(ctx, locName, key, host) {
  let finalLocName = locName;

  // 1. 如果用户没有填定位，全自动通过 IP 获取当前城市/区县
  if (!finalLocName) {
    try {
      const resIp = await ctx.http.get("https://myip.ipip.net/json", { timeout: 4000 });
      const jIp = await resIp.json();
      if (jIp.ret === "ok" && jIp.data && jIp.data.location) {
        let locArray = jIp.data.location;
        // 尝试获取区/县 (索引3)，如果没有则获取市 (索引2) 或省 (索引1)
        // 返回格式通常如 ["中国", "广东", "河源", "源城区", "电信"]
        let cName = locArray[3] || locArray[2] || locArray[1] || "";
        // 清理后缀，保证和风API容易精准匹配
        finalLocName = cName.replace(/市|自治州|地区|盟|县|区/g, "");
      }
    } catch(e) {
        console.error("IP定位失败:", e);
    }
    // 终极断网兜底（防止整个脚本崩溃）
    if (!finalLocName) finalLocName = "北京";
  }

  // 2. 将城市/区县名发送给和风天气，获取精确的经纬度
  try {
    // adm 参数可以提高匹配精度（如果你搜索的县名在全国有重名）
    const url = `${host}/geo/v2/city/lookup?location=${encodeURIComponent(finalLocName)}&key=${key}&number=1&lang=zh`;
    const resp = await ctx.http.get(url, { timeout: 6000 });
    const data = await resp.json();

    if (data.code === '200' && data.location?.[0]) {
      const loc = data.location[0];
      return {
        lon: loc.lon,
        lat: loc.lat,
        // 返回和风识别到的精准地名（如：海淀，龙川）
        city: loc.name || finalLocName
      };
    }
  } catch {}

  // 3. 极端情况兜底（API 挂了或查不到）
  return { lon: '116.4074', lat: '39.9042', city: finalLocName || '未知' };
}

async function fetchWeatherNow(ctx, key, lon, lat, host) {
  const url = `${host}/v7/weather/now?location=${lon},${lat}&key=${key}&lang=zh`;
  const resp = await ctx.http.get(url, { timeout: 8000 });
  const data = await resp.json();

  if (data.code !== '200') {
    throw new Error(data.msg || `天气接口返回 ${data.code}`);
  }

  const now = data.now;
  return {
    temp: now.temp,
    text: now.text,
    icon: now.icon,
    humidity: now.humidity,
    windDir: now.windDir || '--',
    windScale: now.windScale || '--',
    windSpeed: now.windSpeed || '--'
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
    '100': 'sun.max.fill',     '101': 'cloud.sun.fill',   '102': 'cloud.fill',
    '103': 'cloud.sun.fill',   '104': 'cloud.fill',
    '300': 'cloud.drizzle.fill','301': 'cloud.drizzle.fill','302': 'cloud.sun.rain.fill',
    '303': 'cloud.heavyrain.fill','305': 'cloud.rain.fill','306': 'cloud.rain.fill',
    '307': 'cloud.heavyrain.fill','308': 'cloud.heavyrain.fill','309': 'cloud.rain.fill',
    '310': 'cloud.heavyrain.fill','311': 'cloud.heavyrain.fill','312': 'cloud.heavyrain.fill',
    '313': 'cloud.bolt.rain.fill',
    '400': 'snowflake', '401': 'snowflake', '402': 'snowflake', '403': 'snowflake',
    '404': 'cloud.sleet.fill', '405': 'cloud.sleet.fill', '406': 'cloud.sleet.fill', '407': 'cloud.sleet.fill',
    '500': 'cloud.fog.fill', '501': 'cloud.fog.fill', '502': 'cloud.fog.fill',
    '503': 'cloud.fog.fill', '504': 'cloud.fog.fill', '507': 'cloud.fog.fill', '508': 'cloud.fog.fill',
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
// 渲染函数（已改为纯白/纯黑背景）
// ────────────────────────────────────────────────

function renderSmall(now, city) {
  const icon = getWeatherIcon(now.icon);
  const color = getWeatherColor(now.icon);
  const time = new Date();
  const timeStr = `${time.getHours()}:${String(time.getMinutes()).padStart(2,'0')}`;

  return {
    type: 'widget',
    padding: 14,
    gap: 6,
    backgroundColor: { light: '#FFFFFF', dark: '#BF5AF2' },
    children: [
      {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        gap: 8,
        children: [
          { type: 'text', text: city, font: { size: 'caption1', weight: 'bold' }, textColor: { light: '#000', dark: '#FFF' } },
          { type: 'spacer' },
          { type: 'text', text: timeStr, font: { size: 'caption2' }, textColor: { light: '#8E8E93', dark: '#8E8E93' } }
        ]
      },
      {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        gap: 10,
        children: [
          { type: 'image', src: `sf-symbol:${icon}`, width: 40, height: 40, color },
          {
            type: 'stack',
            direction: 'column',
            children: [
              { type: 'text', text: `${now.temp}°`, font: { size: 'title2', weight: 'bold' }, textColor: { light: '#000', dark: '#FFF' } },
              { type: 'text', text: now.text, font: { size: 'caption1' }, textColor: { light: '#666', dark: '#AAA' } }
            ]
          }
        ]
      }
    ]
  };
}

function renderMedium(now, air, city) {
  const icon = getWeatherIcon(now.icon);
  const iconColor = getWeatherColor(now.icon);
  const aqiColor = air.color;
  const time = new Date();
  const timeStr = `${time.getMonth()+1}/${time.getDate()} ${time.getHours()}:${String(time.getMinutes()).padStart(2,'0')}`;

  return {
    type: 'widget',
    padding: 16,
    gap: 12,
    backgroundColor: { light: '#FFFFFF', dark: '#2C2C2E' },
    children: [
      {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        gap: 8,
        children: [
          {
            type: 'stack',
            direction: 'row',
            alignItems: 'center',
            gap: 6,
            children: [
              { type: 'image', src: 'sf-symbol:location.fill', width: 14, height: 14, color: { light: '#FF3B30', dark: '#FF453A' } },
              { type: 'text', text: city, font: { size: 'title3', weight: 'bold' }, textColor: { light: '#000', dark: '#FFF' } }
            ]
          },
          { type: 'spacer' },
          {
            type: 'text',
            text: `AQI ${air.aqi}`,
            font: { size: 'caption1', weight: 'semibold' },
            textColor: aqiColor
          },
          { type: 'text', text: timeStr, font: { size: 'caption2' }, textColor: { light: '#8E8E93', dark: '#8E8E93' } }
        ]
      },

      {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        gap: 16,
        children: [
          { type: 'image', src: `sf-symbol:${icon}`, width: 64, height: 64, color: iconColor },

          {
            type: 'stack',
            direction: 'column',
            flex: 1,
            gap: 4,
            children: [
              { type: 'text', text: `${now.temp}°C`, font: { size: 'largeTitle', weight: 'bold' }, textColor: { light: '#000', dark: '#FFF' } },
              { type: 'text', text: now.text, font: { size: 'title3' }, textColor: { light: '#444', dark: '#CCC' } }
            ]
          },

          {
            type: 'stack',
            direction: 'column',
            alignItems: 'center',
            gap: 2,
            children: [
              { type: 'text', text: '空气', font: { size: 'caption2' }, textColor: { light: '#666', dark: '#AAA' } },
              { type: 'text', text: air.category, font: { size: 'title3', weight: 'bold' }, textColor: aqiColor }
            ]
          }
        ]
      },

      {
        type: 'stack',
        direction: 'row',
        gap: 12,
        children: [
          createInfoItem('drop.fill',   '湿度',   `${now.humidity}%`,   '#007AFF'),
          createInfoItem('wind',        '风力',   `${now.windDir} ${now.windScale}级`, '#5856D6'),
          createInfoItem('gauge.medium','风速',   `${now.windSpeed}km/h`,'#FF9500')
        ]
      }
    ]
  };
}

function createInfoItem(icon, label, value, iconColor) {
  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
    children: [
      { type: 'image', src: `sf-symbol:${icon}`, width: 20, height: 20, color: { light: iconColor, dark: iconColor } },
      {
        type: 'stack',
        direction: 'column',
        children: [
          { type: 'text', text: label, font: { size: 'caption2' }, textColor: { light: '#666', dark: '#AAA' } },
          { type: 'text', text: value,  font: { size: 'title3', weight: 'semibold' }, textColor: { light: '#000', dark: '#FFF' } }
        ]
      }
    ]
  };
}

function renderAccessoryCompact(now, city, family) {
  const icon = getWeatherIcon(now.icon);
  return {
    type: 'widget',
    padding: 8,
    backgroundColor: { light: '#FFFFFF', dark: '#000000' },
    children: [
      {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        gap: 6,
        children: [
          { type: 'image', src: `sf-symbol:${icon}`, width: 24, height: 24, color: getWeatherColor(now.icon) },
          { type: 'text', text: `${now.temp}° ${city.slice(0,4)}`, font: { size: family === 'accessoryInline' ? 'footnote' : 'subheadline' }, textColor: { light: '#000', dark: '#FFF' } }
        ]
      }
    ]
  };
}

function renderError(msg) {
  return {
    type: 'widget',
    padding: 16,
    backgroundColor: { light: '#FFFFFF', dark: '#000000' },
    children: [
      {
        type: 'stack',
        direction: 'column',
        alignItems: 'center',
        gap: 8,
        children: [
          { type: 'image', src: 'sf-symbol:exclamationmark.triangle.fill', width: 32, height: 32, color: { light: '#FF3B30', dark: '#FF453A' } },
          { type: 'text', text: msg, font: { size: 'body' }, textColor: { light: '#FF3B30', dark: '#FF453A' }, textAlign: 'center' }
        ]
      }
    ]
  };
}
