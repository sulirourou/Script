/**
 * 📌 桌面小组件: Speedtest 极简官方复刻版 (v1.9 完美毕业版 - 增添刷新时间)
 * 📊 全面适配: 中号 / 大号组件 | 浅色 / 深色模式
 * * 📖 【使用说明】：
 * 1. 颜色修改：在下方的 CONFIG.color 中修改，支持十六进制色号（如红色的 '#FF0000'）。
 * 2. 字体大小：在下方的 CONFIG.size 中修改对应数值即可。
 * 3. 浅/深色模式：带有 Light 的是白天模式颜色，带有 Dark 的是黑夜模式颜色。
 */

export default async function(ctx) {
  // ==========================================
  // 🛠️ 用户配置区 (可自由修改以下参数)
  // ==========================================
  const CONFIG = {
    // 1. 颜色配置
    color: {
      rabbit: '#E48525',                 // 🐰 兔子图标颜色 (默认专属橙色)
      titleLight: '#E48525',             // 📝 标题文字颜色 - 浅色模式 (默认深海蓝)
      titleDark: '#4DA2FF',              // 📝 标题文字颜色 - 深色模式 (默认亮蓝色)
      
      bgLight: '#FFFFFF',                // 🎨 背景颜色 - 浅色模式
      bgDark: '#000000',                 // 🎨 背景颜色 - 深色模式
      textLight: '#000000',              // 📊 主要数据文字 - 浅色模式
      textDark: '#FFFFFF',               // 📊 主要数据文字 - 深色模式
      
      subText: '#8E8E93',                // ℹ️ 灰色小图标及时间颜色
      lineLight: '#000000',              // ➖ 顶部粗横线颜色 - 浅色
      lineDark: '#FFFFFF',               // ➖ 顶部粗横线颜色 - 深色
      dividerLight: '#E5E5EA',           // 〰️ 中间细分割线 - 浅色
      dividerDark: '#333333'             // 〰️ 中间细分割线 - 深色
    },
    
    // 2. 字体大小配置
    size: {
      header: 22,                        // 顶部 "Speed Test" 标题大小
      time: 12,                          // ⏱️ 右上角刷新时间大小
      sectionTitle: 16,                  // "您的网络速度" 字体大小
      dlNumLarge: 48,                    // [大组件] 下载数字大小
      ulNumLarge: 28,                    // [大组件] 上传数字大小
      pingNumLarge: 24,                  // [大组件] 延迟/抖动数字大小
      dlNumMedium: 36,                   // [中组件] 下载数字大小
      ulNumMedium: 16                    // [中组件] 上传/延迟数字大小
    }
  };
  // ==========================================
  // 🛑 配置区结束，非核心开发者请勿修改下方代码
  // ==========================================

  // 提取配置颜色
  const C = {
    bg: { light: CONFIG.color.bgLight, dark: CONFIG.color.bgDark },
    text: { light: CONFIG.color.textLight, dark: CONFIG.color.textDark },
    sub: { light: CONFIG.color.subText, dark: CONFIG.color.subText },
    line: { light: CONFIG.color.lineLight, dark: CONFIG.color.lineDark }, 
    divider: { light: CONFIG.color.dividerLight, dark: CONFIG.color.dividerDark }
  };

  const isLarge = ctx.widgetFamily === "systemLarge";
  const CACHE_KEY = 'speedtest_pro_cache_v2';
  
  let data = { dl: 0, ul: 0, ping: 0, jitter: 0, pl: '-' };

  try {
    const cached = ctx.storage.getJSON(CACHE_KEY);
    if (cached && typeof cached.dl === 'number') data = cached;
  } catch(e) {}

  try {
    let pings = [];
    for(let i=0; i<3; i++) {
      let pt = Date.now();
      await ctx.http.get('https://cp.cloudflare.com/generate_204', { timeout: 3000 }).catch(()=>null);
      pings.push(Date.now() - pt);
    }
    let ping = pings.reduce((a,b)=>a+b, 0) / pings.length;
    let jitter = (Math.abs(pings[0]-ping) + Math.abs(pings[1]-ping) + Math.abs(pings[2]-ping)) / 3;

    const dlBytes = 3145728; 
    const dlStart = Date.now();
    let dlSuccess = true;
    await ctx.http.get(`https://speed.cloudflare.com/__down?bytes=${dlBytes}`, {
      headers: { 'Cache-Control': 'no-cache' },
      timeout: 15000 
    }).catch(() => { dlSuccess = false; });
    
    let dlTime = (Date.now() - dlStart) / 1000;
    let dlSpeed = 0;
    if (dlSuccess && dlTime > 0.1) {
      dlSpeed = (3 * 8) / dlTime; 
    }

    let ulSpeed = 0;
    if (typeof ctx.http.post === 'function') {
       const ulStart = Date.now();
       let ulSuccess = true;
       const payload = '0'.repeat(512 * 1024); 
       await ctx.http.post('https://speed.cloudflare.com/__up', {
           headers: { 'Cache-Control': 'no-cache', 'Content-Type': 'text/plain' },
           body: payload, 
           timeout: 10000 
       }).catch(() => { ulSuccess = false; });
       let ulTime = (Date.now() - ulStart) / 1000;
       if (ulSuccess && ulTime > 0.1) {
           ulSpeed = (0.5 * 8) / ulTime;
       }
    } else {
       ulSpeed = dlSpeed > 0 ? dlSpeed / 4 : 0;
    }

    if (dlSpeed > 0 || ulSpeed > 0) {
      data = {
        dl: parseFloat(dlSpeed.toFixed(1)),
        ul: parseFloat(ulSpeed.toFixed(2)),
        ping: parseInt(ping),
        jitter: parseFloat(jitter.toFixed(1)),
        pl: '-' // iOS 网页引擎不支持纯净 ICMP 发包，应用层无法精准统计丢包率，因此默认显示 '-'
      };
      ctx.storage.setJSON(CACHE_KEY, data);
    }
  } catch(e) {}

  const InfoIcon = { type: 'image', src: 'sf-symbol:info.circle', width: 10, height: 10, color: C.sub };

  const StatBlock = (title, value, unit, valSize) => {
    let valChildren = [
      { type: 'text', text: String(value), font: { size: valSize, weight: 'heavy' }, textColor: C.text }
    ];
    if (unit) {
      valChildren.push({ type: 'text', text: unit, font: { size: 12, weight: 'bold' }, textColor: C.text });
    }

    return {
      type: 'stack', direction: 'column', gap: 2,
      children: [
        {
          type: 'stack', direction: 'row', alignItems: 'center', gap: 4,
          children: [
            { type: 'text', text: title, font: { size: 12, weight: 'bold' }, textColor: C.text },
            InfoIcon
          ]
        },
        {
          type: 'stack', direction: 'row', alignItems: 'center', gap: 4, 
          children: valChildren
        }
      ]
    };
  };

  // 获取当前刷新时间
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // 🌟 [v1.9 核心定制] 增加右上角刷新时间
  const Header = {
    type: 'stack', direction: 'column', gap: 8,
    children: [
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 8,
        children: [
          { type: 'image', src: 'sf-symbol:hare.fill', width: CONFIG.size.header, height: CONFIG.size.header, color: CONFIG.color.rabbit }, 
          { type: 'text', text: 'Speed Test', font: { size: CONFIG.size.header, weight: 'heavy' }, textColor: { light: CONFIG.color.titleLight, dark: CONFIG.color.titleDark } },
          { type: 'spacer' }, // 将时间推到最右侧
          { type: 'text', text: `time ${timeStr}`, font: { size: CONFIG.size.time, weight: 'medium' }, textColor: C.sub }
        ]
      },
      { type: 'stack', height: 2, backgroundColor: C.line } 
    ]
  };

  let content;

  if (isLarge) {
    content = [
      Header,
      { type: 'spacer', length: 12 },
      { type: 'text', text: '您的网络速度', font: { size: CONFIG.size.sectionTitle, weight: 'bold' }, textColor: C.text },
      { type: 'spacer', length: 16 },
      StatBlock('下载速度', data.dl, 'Mbps', CONFIG.size.dlNumLarge), 
      { type: 'spacer', length: 24 },
      { type: 'stack', height: 1, backgroundColor: C.divider }, 
      { type: 'spacer', length: 16 },
      {
        type: 'stack', direction: 'row',
        children: [
          {
            type: 'stack', flex: 1, children: [ StatBlock('上传速度', data.ul, 'Mbps', CONFIG.size.ulNumLarge) ]
          },
          {
            type: 'stack', direction: 'column', flex: 1, gap: 16,
            children: [
              StatBlock('网络延迟', data.ping, 'ms', CONFIG.size.pingNumLarge),
              StatBlock('网络抖动', data.jitter, 'ms', CONFIG.size.pingNumLarge),
              StatBlock('丢包率', data.pl, '', 14)
            ]
          }
        ]
      }
    ];
  } else {
    content = [
      Header,
      { type: 'spacer', length: 8 },
      { type: 'text', text: '您的网络速度', font: { size: Math.max(12, CONFIG.size.sectionTitle - 2), weight: 'bold' }, textColor: C.text },
      { type: 'spacer', length: 8 },
      {
        type: 'stack', direction: 'row', alignItems: 'center',
        children: [
          {
            type: 'stack', flex: 1, children: [ StatBlock('下载速度', data.dl, 'Mbps', CONFIG.size.dlNumMedium) ]
          },
          { type: 'spacer', length: 8 },
          {
             type: 'stack', direction: 'column', flex: 1, gap: 8,
             children: [
               StatBlock('上传速度', data.ul, 'Mbps', CONFIG.size.ulNumMedium),
               StatBlock('网络延迟', data.ping, 'ms', CONFIG.size.ulNumMedium)
             ]
          }
        ]
      }
    ];
  }

  return {
    type: 'widget',
    padding: 18,
    backgroundColor: C.bg,
    children: content
  };
}
