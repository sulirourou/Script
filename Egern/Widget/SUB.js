/**
 * 📌 机场流量监控 (Egern v7)
 * ============================================================
 * 🎨 UI 配置区
 * ============================================================
 */
const UI = {
  paddingTop:    8,
  paddingBottom: 8,
  paddingLeft:   14,
  paddingRight:  14,

  cardGap:       6,
  innerGap:      3,

  fontTitle:     14,
  fontData:      10,
  fontPct:       9,
  fontHeader:    11,

  barHeight:     13,
  barRadius:     3,

  thresholdHigh: 0.85,
  thresholdMid:  0.60,
};
// ============================================================

export default async function (ctx) {
  const MAX = 5;
  const slots = [];

  for (let i = 1; i <= MAX; i++) {
    const url = (ctx.env[`URL${i}`] || ctx.env[`URL_${i}`] || "").trim();
    if (!url) continue;
    slots.push({
      name: (ctx.env[`NAME${i}`] || ctx.env[`NAME_${i}`] || "").trim() || `机场 ${i}`,
      url,
      resetDay: parseInt(ctx.env[`RESET${i}`] || ctx.env[`RESET_${i}`]) || null
    });
  }

  // 🛠️ 彻底修复深浅模式：使用原生 { light, dark } 对象，让 iOS 系统接管自动切换
  const C = {
    bg:       { light: "#FFFFFF", dark: "#121212" },
    textMain: { light: "#000000", dark: "#FFFFFF" },
    barTrack: { light: "#E5E5EA", dark: "#3A3A3C" },
    valTotal: "#0A84FF",
    valUsed:  "#FF3B30",
    valFree:  "#34C759",
    valToday: "#BF5AF2",
    barLow:   "#0A84FF",
    barMid:   "#FF9F0A",
    barHigh:  "#FF3B30",
  };

  if (!slots.length) {
    return {
      type: "widget", padding: 12,
      children: [{
        type: "text",
        text: "⚠️ 未检测到环境变量\n请检查 NAME1 和 URL1",
        font: { size: 13, weight: "bold" },
        textColor: C.valUsed, textAlign: "center"
      }]
    };
  }

  const results = await Promise.all(slots.map(s => fetchSubInfo(ctx, s)));
  const allToday = results.reduce((a, r) => a + (r.todayUsed || 0), 0);
  const maxDisplay = ctx.widgetFamily === "systemLarge" ? 5 : 3;

  return {
    type: "widget",
    backgroundColor: C.bg,
    padding: [UI.paddingTop, UI.paddingRight, UI.paddingBottom, UI.paddingLeft],
    children: [
      {
        type: "stack", direction: "row", margin: { bottom: 4 },
        children: [
          { type: "spacer" },
          {
            type: "text",
            text: `今日全站已用: ${formatBytes(allToday)}`,
            font: { size: UI.fontHeader, weight: "semibold" },
            textColor: C.valToday
          }
        ]
      },
      {
        type: "stack", direction: "column", gap: UI.cardGap,
        children: results.slice(0, maxDisplay).map(r => buildCard(r, C))
      }
    ]
  };
}

function buildCard(res, C) {
  if (res.error) {
    return {
      type: "stack", direction: "column", gap: 2,
      children: [
        { type: "text", text: res.name, font: { size: UI.fontTitle, weight: "bold" }, textColor: C.textMain },
        { type: "text", text: "❌ 获取失败", font: { size: 10 }, textColor: C.valUsed }
      ]
    };
  }

  const pct = res.total > 0 ? Math.min(1, res.used / res.total) : 0;
  const pctStr = `${(pct * 100).toFixed(1)}%`;
  const barColor = pct >= UI.thresholdHigh ? C.barHigh
                 : pct >= UI.thresholdMid  ? C.barMid
                 : C.barLow;

  // 色块：百分比统一放色块内右端（白字）
  const fillStack = {
    type: "stack",
    direction: "row",
    flex: pct,
    height: UI.barHeight,
    backgroundColor: barColor,
    alignItems: "center",
    children: [
      { type: "spacer" },
      {
        type: "text",
        text: pctStr,
        font: { size: UI.fontPct, weight: "medium" },
        textColor: "#FFFFFF",
        margin: { right: 3 }
      }
    ]
  };

  // 剩余轨道（纯空白，不放文字）
  const remainStack = {
    type: "stack",
    direction: "row",
    flex: Math.max(0.001, 1 - pct),
    height: UI.barHeight
  };

  return {
    type: "stack", direction: "column", gap: UI.innerGap,
    children: [
      // 机场名
      {
        type: "text", text: res.name,
        font: { size: UI.fontTitle, weight: "bold" },
        textColor: C.textMain
      },
      // 进度条
      {
        type: "stack",
        direction: "row",
        height: UI.barHeight,
        borderRadius: UI.barRadius,
        backgroundColor: C.barTrack,
        clip: true,
        children: [fillStack, remainStack]
      },
      // 四色数据行 — spacer 撑开间距
      {
        type: "stack", direction: "row",
        children: [
          { type: "text", text: `总:${formatBytes(res.total)}`,            font: { size: UI.fontData, weight: "semibold", family: "Menlo" }, textColor: C.valTotal },
          { type: "spacer" },
          { type: "text", text: `用:${formatBytes(res.used)}`,             font: { size: UI.fontData, weight: "semibold", family: "Menlo" }, textColor: C.valUsed  },
          { type: "spacer" },
          { type: "text", text: `剩:${formatBytes(res.total - res.used)}`, font: { size: UI.fontData, weight: "semibold", family: "Menlo" }, textColor: C.valFree  },
          { type: "spacer" },
          { type: "text", text: `今:${formatBytes(res.todayUsed)}`,        font: { size: UI.fontData, weight: "semibold", family: "Menlo" }, textColor: C.valToday }
        ]
      }
    ]
  };
}

async function fetchSubInfo(ctx, slot) {
  const cacheKey = `cache_v17_${slot.name}`;
  const todayStr = new Date().toLocaleDateString();
  let cache = await ctx.storage.get(cacheKey) || { date: "", startUsed: 0, lastResult: null, time: 0 };

  if (cache.lastResult && (Date.now() - cache.time < 3600000) && cache.date === todayStr) {
    return cache.lastResult;
  }

  let stats = null;
  const UAs = ["Quantumult%20X/1.5.2", "ClashforWindows/0.19.0", "Mihomo/1.18.0"];

  for (const ua of UAs) {
    try {
      const resp = await ctx.http.get(slot.url, { headers: { "User-Agent": ua }, timeout: 6000 });
      const raw = resp.headers["subscription-userinfo"] || resp.headers["Subscription-UserInfo"] || "";
      const info = parseUserInfo(raw);
      if (info) { stats = info; break; }
    } catch (e) {}
  }

  if (!stats) return cache.lastResult || { name: slot.name, error: true };

  const used = (stats.upload || 0) + (stats.download || 0);
  const todayUsed = cache.date === todayStr ? Math.max(0, used - cache.startUsed) : 0;
  const result = { name: slot.name, used, total: stats.total || 0, todayUsed, resetDay: slot.resetDay, expire: stats.expire || null };

  await ctx.storage.set(cacheKey, {
    date: todayStr,
    startUsed: cache.date === todayStr ? cache.startUsed : used,
    time: Date.now(),
    lastResult: result
  });

  return result;
}

function parseUserInfo(header) {
  if (!header) return null;
  const res = {};
  header.split(";").forEach(p => {
    const [k, v] = p.split("=");
    if (k && v) res[k.trim().toLowerCase()] = parseInt(v);
  });
  return res.total ? res : null;
}

function formatBytes(b) {
  if (!b || b <= 0) return "0.0M";
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return (b / Math.pow(1024, i)).toFixed(1) + ["B", "K", "M", "G", "T"][i];
}
