/**
 * TestFlight 监控 (完美三等分 - ID整体右移微调版)
 * 保持了 ID 的绝对垂直对齐，并将整体向右平移 12 像素，达到视觉平衡。
 * 💡 环境变量 TF 填写格式 (用 # 号加备注，逗号隔开)：
 * 示例: QkU4VS1s#和风天气, GgBqXAqm#百度贴贴, JkU2rh21#Edge
 */

const userAgents = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
];

export default async function(ctx) {
  const rawIds = ctx.env.TF || "";
  
  if (!rawIds.trim()) {
    return {
      type: 'widget',
      padding: 16,
      children: [
        { type: 'text', text: '⚠️ 请先配置 TF 环境变量', font: { size: 14, weight: 'bold' }, textColor: '#FF3B30' }
      ]
    };
  }
  
  const appIdsInfo = rawIds.split(/\s*[\n,，;]\s*/).filter(Boolean);
  let results = [];

  await Promise.all(appIdsInfo.map(async (info) => {
    let appId = info;
    let appName = info; 
    
    if (info.includes("#")) {
      appId = info.split("#")[0].trim();
      appName = info.split("#")[1].trim();
    }

    const url = `https://testflight.apple.com/join/${appId}`;
    let statusText = "检测中";
    let statusColor = "#8E8E93"; 
    let iconName = "arrow.triangle.2.circlepath";
    const currentUA = userAgents[Math.floor(Math.random() * userAgents.length)];

    try {
      const resp = await ctx.http.get(url, {
        headers: { "User-Agent": currentUA },
        timeout: 4000 
      });

      if (resp.status === 404) {
        statusText = "不存在";
        statusColor = "#FF3B30";
        iconName = "xmark.octagon.fill";
      } else if (resp.status !== 200) {
        statusText = `异常`;
        statusColor = "#FF9500";
        iconName = "exclamationmark.triangle.fill";
      } else {
        const data = await resp.text();
        
        if (/版本的测试员已满|This beta is full|此 beta 版已额满/.test(data)) {
          statusText = "已满";
          statusColor = "#FF3B30";
          iconName = "person.crop.circle.badge.xmark";
        } 
        else if (/版本目前不接受任何新测试员|This beta isn't accepting any new testers/.test(data)) {
          statusText = "不接受";
          statusColor = "#FF9500";
          iconName = "pause.circle.fill";
        } 
        else if (/要加入 Beta 版|To join the|开始测试|itms-beta:\/\/|join the beta/.test(data)) {
          statusText = "速抢";
          statusColor = "#34C759";
          iconName = "checkmark.seal.fill";
          
          ctx.notify({
            title: "TestFlight 有名额了！",
            subtitle: appName !== appId ? `${appName} (${appId})` : `ID: ${appId}`,
            body: "🚀 探测到新名额，请立即点击加入测试",
            action: { type: "openUrl", url: url }
          });
        } else {
          statusText = "未知";
          statusColor = "#8E8E93";
          iconName = "questionmark.circle.fill";
        }
      }
    } catch (e) {
      statusText = "超时";
      statusColor = "#FF3B30";
      iconName = "wifi.exclamationmark";
    }

    results.push({ appId, appName, statusText, statusColor, iconName });
  }));

  const orderMap = new Map(appIdsInfo.map((info, i) => [info.split("#")[0].trim(), i]));
  results.sort((a, b) => orderMap.get(a.appId) - orderMap.get(b.appId));

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const listChildren = results.map(item => {
    return {
      type: 'stack', 
      direction: 'row', 
      alignItems: 'center', 
      children: [
        // 1. 左边格子 (占 1/3)
        {
          type: 'stack', direction: 'row', flex: 1,
          children: [
            { 
              type: 'text', 
              text: item.appName, 
              font: { size: 14, weight: 'heavy' }, 
              textColor: { light: '#333333', dark: '#E5E5EA' },
              maxLines: 1
            },
            { type: 'spacer' }
          ]
        },
        
        // 2. 中间格子 (占 1/3)
        {
          type: 'stack', direction: 'row', flex: 1,
          children: [
            // 🚀 核心微调：塞入一个固定宽度为 12 的隐形木块，把 ID 整体往右平移一点点！
            { type: 'spacer', length: 30 }, 
            ...(item.appName !== item.appId ? [
              { 
                type: 'text', 
                text: `ID: ${item.appId}`, 
                font: { size: 11, weight: 'medium' }, 
                textColor: '#8E8E93',
                maxLines: 1
              }
            ] : []),
            { type: 'spacer' } // 右边用弹性弹簧填满
          ]
        },
        
        // 3. 右边格子 (占 1/3)
        {
          type: 'stack', direction: 'row', flex: 1,
          children: [
            { type: 'spacer' },
            {
              type: 'stack', direction: 'row', alignItems: 'center', gap: 4,
              children: [
                { type: 'image', src: `sf-symbol:${item.iconName}`, width: 12, height: 12, color: item.statusColor },
                { type: 'text', text: item.statusText, font: { size: 12, weight: 'bold' }, textColor: item.statusColor }
              ]
            }
          ]
        }
      ]
    };
  });

  const separatedList = [];
  for (let i = 0; i < listChildren.length; i++) {
    separatedList.push(listChildren[i]);
    if (i !== listChildren.length - 1) {
      separatedList.push({ type: 'spacer', length: 8 }); 
      separatedList.push({ type: 'stack', height: 1, backgroundColor: { light: '#F2F2F7', dark: '#2C2C2E' } });
      separatedList.push({ type: 'spacer', length: 8 });
    }
  }

  return {
    type: 'widget',
    padding: 16, 
    backgroundColor: { light: '#FFFFFF', dark: '#1C1C1E' },
    children: [
      {
        type: 'stack', direction: 'row', alignItems: 'center', gap: 6,
        children: [
          { type: 'image', src: 'sf-symbol:paperplane.fill', width: 14, height: 14, color: '#007AFF' },
          { type: 'text', text: 'TestFlight 监控', font: { size: 13, weight: 'bold' }, textColor: { light: '#000000', dark: '#FFFFFF' } },
          { type: 'spacer' },
          { type: 'text', text: `↻ ${timeStr}`, font: { size: 10, weight: 'medium' }, textColor: '#8E8E93' }
        ]
      },
      { type: 'spacer', length: 12 },
      {
        type: 'stack', direction: 'column', 
        children: separatedList
      }
    ]
  };
}
