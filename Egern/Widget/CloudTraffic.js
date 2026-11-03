/**
 * 🌐 云服务器流量监控 (SSH 直连 · vnStat 数据)
 * 版本：v1.4 (2026-11-03)
 * 名称：host / 值：服务器地址 (必填，如 170.9.22.31)
 * 名称：port / 值：SSH 端口 (不填默认 22)
 * 名称：username / 值：SSH 用户名 (必填，如 ubuntu)
 * 名称：privateKey / 值：SSH 私钥全文 (直接粘贴即可，脚本会自动重排私钥的换行与空格，OpenSSH / PEM 格式都行)
 * 名称：password / 值：SSH 密码 (与 privateKey 二选一)
 * 名称：passphrase / 值：私钥密码 (私钥没设密码则不填)
 * 名称：name / 值：显示名称 (不填自动用服务器主机名，如 Oracle Cloud)
 * 名称：quota / 值：月流量上限 GB (填了才显示使用百分比，如 Oracle 免费额度 10TB 填 10000；不填则圆环显示本月下载/上传占比)
 * 名称：iface / 值：网卡名 (不填自动选流量最大的网卡，如 ens3 / eth0)
 */

export default async function (ctx) {
  const env = ctx.env || {};
  const clean = (v) => (v === undefined || v === null ? "" : String(v).trim());
  const pick = (...names) => {
    for (const n of names) {
      const v = clean(env[n]);
      if (v) return v;
    }
    return "";
  };
  const cfg = {
    host: pick("host"),
    port: Number(pick("port")) || 22,
    username: pick("username", "user"),
    privateKey: "", // 下方 normalizeKey 统一处理
    password: pick("password", "sshPassword"),
    passphrase: pick("passphrase") || undefined,
    name: pick("name"),
    quotaGB: Number(pick("quota")) || 0,
    iface: pick("iface")
  };
  // 私钥规范化: 粘贴进环境变量的私钥常常换行错乱或混入空格, libssh2 解析器会
  // 报 "Unable to extract public key ... Unsupported"。把正文的全部空白剔除后
  // 按每 64 字符一行重排成标准 PEM 形态再交给 ctx.ssh (与 Server-monitor 同法)。
  function normalizeKey(key) {
    if (!key || typeof key !== "string") return "";
    const raw = key.trim();
    const headerMatch = raw.match(/-----BEGIN [A-Z ]+-----/);
    const footerMatch = raw.match(/-----END [A-Z ]+-----/);
    if (headerMatch && footerMatch) {
      const header = headerMatch[0];
      const footer = footerMatch[0];
      let body = raw.substring(raw.indexOf(header) + header.length, raw.indexOf(footer));
      body = body.replace(/\s+/g, "");
      const lines = body.match(/.{1,64}/g) || [];
      return header + "\n" + lines.join("\n") + "\n" + footer;
    }
    return raw.replace(/\\n/g, "\n");
  }
  cfg.privateKey = normalizeKey(pick("privateKey", "key", "sshKey"));

  const FAMILY = clean(ctx.widgetFamily) || "systemLarge";
  const IS_SMALL = FAMILY === "systemSmall";
  const IS_MEDIUM = FAMILY === "systemMedium";

  // ---------- palette ----------
  const C = {
    root: { light: "#F2F4FB", dark: "#0B1026" },
    text: { light: "#141B33", dark: "#FFFFFF" },
    sub: { light: "rgba(38,48,84,0.72)", dark: "rgba(235,240,255,0.74)" },
    muted: { light: "rgba(38,48,84,0.48)", dark: "rgba(235,240,255,0.46)" },
    cardBg: { light: "#FFFFFF", dark: "rgba(255,255,255,0.055)" },
    cardBorder: { light: "rgba(30,41,82,0.10)", dark: "rgba(255,255,255,0.10)" },
    divider: { light: "rgba(30,41,82,0.10)", dark: "rgba(255,255,255,0.10)" },
    down: { light: "#0284C7", dark: "#22D3EE" },
    up: { light: "#DB2777", dark: "#F472B6" },
    amber: { light: "#B45309", dark: "#FBBF24" },
    green: { light: "#059669", dark: "#34D399" },
    red: { light: "#E11D48", dark: "#FB7185" },
    violet: { light: "#7C3AED", dark: "#A78BFA" },
    onText: "#FFFFFF",
    onSub: "rgba(235,240,255,0.78)"
  };
  const DOWN_HEX = "#22D3EE";
  const UP_HEX = "#F472B6";
  const GRAD_MONTH = ["#6D28D9", "#2563EB"];
  const GRAD_TOTAL = ["#0E7490", "#134E4A"];
  const GRAD_HEAD = ["#7C3AED", "#DB2777"];

  // ---------- tiny builders ----------
  const merge = (a, b) => Object.assign({}, a, b || {});
  const row = (children, extra) => merge({ type: "stack", direction: "row", alignItems: "center", children: children || [] }, extra);
  const col = (children, extra) => merge({ type: "stack", direction: "column", alignItems: "start", children: children || [] }, extra);
  const spacer = (length) => (length ? { type: "spacer", length: length } : { type: "spacer" });
  const text = (value, size, weight, color, extra) =>
    merge({ type: "text", text: String(value), font: { size: size, weight: weight || "regular" }, textColor: color || C.text, maxLines: 1 }, extra);
  const image = (symbol, color, w, h) => ({ type: "image", src: "sf-symbol:" + symbol, color: color, width: w, height: h });
  const svgDataURI = (svg) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22");
  const svgImage = (svg, w, h) => ({ type: "image", src: svgDataURI(svg), width: w, height: h, resizable: true });
  const grad = (colors) => ({ type: "linear", colors: colors, startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } });
  const panel = (children, colors, extra) =>
    merge({ type: "stack", direction: "column", alignItems: "start", padding: [10, 12], gap: 6, backgroundColor: C.cardBg, backgroundGradient: colors ? grad(colors) : undefined, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, children: children || [] }, extra);

  // ---------- formatting ----------
  function fmtBytes(n) {
    n = Number(n) || 0;
    const units = ["B", "KB", "MB", "GB", "TB", "PB"];
    let i = 0;
    while (n >= 1000 && i < units.length - 1) { n /= 1000; i += 1; }
    const v = n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
    return v.replace(/\.0+$|(\.\d*?)0+$/, "$1") + " " + units[i];
  }
  function fmtUptime(up) {
    return String(up || "")
      .replace(/weeks?/g, "周").replace(/days?/g, "天")
      .replace(/hours?/g, "小时").replace(/minutes?/g, "分钟").replace(/seconds?/g, "秒")
      .replace(/,\s*/g, " ").trim();
  }

  // ---------- remote fetch ----------
  const REMOTE_CMD = [
    'echo "HOST=$(hostname)"',
    'echo "UP=$(uptime -p 2>/dev/null | sed \'s/^up //\')"',
    'if command -v vnstat >/dev/null 2>&1; then echo "MODE=vnstat"; echo "===JSON==="; vnstat --json; else echo "MODE=proc"; echo "BOOT=$(uptime -s 2>/dev/null)"; echo "===DEV==="; cat /proc/net/dev; fi'
  ].join("; ");

  async function fetchStats() {
    const connectCfg = { host: cfg.host, port: cfg.port, username: cfg.username, timeout: 9000 };
    if (cfg.privateKey) connectCfg.privateKey = cfg.privateKey;
    else if (cfg.password) connectCfg.password = cfg.password;
    if (cfg.passphrase) connectCfg.passphrase = cfg.passphrase;
    const session = await ctx.ssh.connect(connectCfg);
    try {
      const res = await session.exec(REMOTE_CMD);
      if (!res || (res.code !== 0 && !res.stdout)) {
        throw new Error("远程命令失败" + (res && res.stderr ? ": " + String(res.stderr).trim().slice(0, 60) : ""));
      }
      return parseRemote(String(res.stdout || ""));
    } finally {
      try { await session.close(); } catch (_) {}
    }
  }

  function parseRemote(out) {
    const meta = {};
    const jsonAt = out.indexOf("===JSON===");
    const devAt = out.indexOf("===DEV===");
    const head = out.slice(0, Math.max(jsonAt, devAt) >= 0 ? Math.max(jsonAt, devAt) : out.length);
    head.split("\n").forEach((ln) => {
      const m = ln.match(/^([A-Z]+)=(.*)$/);
      if (m) meta[m[1]] = m[2].trim();
    });
    const base = { hostname: meta.HOST || "", uptime: fmtUptime(meta.UP || ""), mode: meta.MODE || "", iface: "", created: "", boot: meta.BOOT || "" };

    if (jsonAt >= 0) {
      const data = JSON.parse(out.slice(jsonAt + "===JSON===".length).trim());
      const ifs = (data.interfaces || []).filter((i) => i && i.name !== "lo");
      if (!ifs.length) throw new Error("vnStat 没有可用网卡数据");
      let chosen = cfg.iface ? ifs.find((i) => i.name === cfg.iface) : null;
      if (!chosen) {
        chosen = ifs.slice().sort((a, b) =>
          ((b.traffic?.total?.rx || 0) + (b.traffic?.total?.tx || 0)) - ((a.traffic?.total?.rx || 0) + (a.traffic?.total?.tx || 0)))[0];
      }
      const tr = chosen.traffic || {};
      const total = tr.total || {};
      const now = new Date();
      const months = tr.month || [];
      const cur = months.find((e) => e.date && e.date.year === now.getFullYear() && e.date.month === now.getMonth() + 1);
      const days = (tr.day || []).slice(-7).map((e) => ({
        label: e.date ? String(e.date.day) : "",
        rx: Number(e.rx) || 0, tx: Number(e.tx) || 0
      }));
      const lastDay = (tr.day || []).slice(-1)[0];
      const today = lastDay && lastDay.date && lastDay.date.year === now.getFullYear() &&
        lastDay.date.month === now.getMonth() + 1 && lastDay.date.day === now.getDate()
        ? { rx: Number(lastDay.rx) || 0, tx: Number(lastDay.tx) || 0 } : { rx: 0, tx: 0 };
      const created = chosen.created && chosen.created.date
        ? `${chosen.created.date.year}-${String(chosen.created.date.month).padStart(2, "0")}-${String(chosen.created.date.day).padStart(2, "0")}` : "";
      return Object.assign(base, {
        iface: chosen.name, created: created,
        totalRx: Number(total.rx) || 0, totalTx: Number(total.tx) || 0,
        monthRx: cur ? Number(cur.rx) || 0 : 0, monthTx: cur ? Number(cur.tx) || 0 : 0,
        monthKnown: true, today: today, days: days
      });
    }

    if (devAt >= 0) {
      const devText = out.slice(devAt + "===DEV===".length);
      const entries = [];
      devText.split("\n").forEach((ln) => {
        const m = ln.match(/^\s*([^:\s]+):\s*(\d+)(?:\s+\d+){7}\s+(\d+)/);
        if (m && m[1] !== "lo") entries.push({ name: m[1], rx: Number(m[2]), tx: Number(m[3]) });
      });
      if (!entries.length) throw new Error("读不到 /proc/net/dev");
      let chosen = cfg.iface ? entries.find((e) => e.name === cfg.iface) : null;
      if (!chosen) chosen = entries.slice().sort((a, b) => (b.rx + b.tx) - (a.rx + a.tx))[0];
      return Object.assign(base, {
        iface: chosen.name,
        totalRx: chosen.rx, totalTx: chosen.tx,
        monthRx: chosen.rx, monthTx: chosen.tx,
        monthKnown: false, today: null, days: []
      });
    }

    throw new Error("服务器无输出");
  }

  // ---------- cache ----------
  const CACHE_KEY = "cloudtraffic:" + cfg.host;
  function saveCache(data) {
    try { ctx.storage.set(CACHE_KEY, JSON.stringify({ at: Date.now(), data: data })); } catch (_) {}
  }
  function loadCache() {
    try {
      const raw = ctx.storage.get(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.data ? parsed : null;
    } catch (_) { return null; }
  }

  // ---------- SVG: ring ----------
  function ringSVG(d, size) {
    const monthTotal = d.monthRx + d.monthTx;
    const quotaBytes = cfg.quotaGB * 1e9;
    const hasQuota = quotaBytes > 0;
    const pct = hasQuota ? (monthTotal / quotaBytes) * 100 : 0;
    const downShare = monthTotal > 0 ? (d.monthRx / monthTotal) * 100 : 50;
    const cx = 50, cy = 50, r = 40;
    const pt = (deg) => {
      const a = ((deg - 90) * Math.PI) / 180;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };
    const arcPath = (from, to, color, cap) => {
      const s = pt(from), e = pt(to);
      const large = to - from > 180 ? 1 : 0;
      return `<path d="M ${s[0].toFixed(2)} ${s[1].toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e[0].toFixed(2)} ${e[1].toFixed(2)}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="${cap || "butt"}"/>`;
    };
    const fullCircle = (color, width, opacity) =>
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${width || 9}"${opacity ? ` stroke-opacity="${opacity}"` : ""}/>`;
    let arcs, centerTop, centerBottom;
    if (hasQuota) {
      const shown = Math.min(100, pct);
      arcs = fullCircle("#FFFFFF", 9, 0.14) +
        (shown >= 99.95 ? fullCircle("url(#rg)", 9) : shown > 0.05 ? arcPath(0, shown * 3.6, "url(#rg)", "round") : "");
      centerTop = pct >= 10 ? pct.toFixed(0) + "%" : pct.toFixed(1) + "%";
      centerBottom = "本月已用";
    } else {
      const upShare = 100 - downShare;
      const gapDeg = downShare >= 2 && upShare >= 2 ? 1.2 : 0;
      arcs = fullCircle("#FFFFFF", 9, 0.10);
      if (downShare >= 99.95) arcs += fullCircle(DOWN_HEX, 9);
      else if (downShare > 0.05) arcs += arcPath(gapDeg / 2, downShare * 3.6 - gapDeg / 2, DOWN_HEX);
      if (upShare >= 99.95) arcs += fullCircle(UP_HEX, 9);
      else if (upShare > 0.05) arcs += arcPath(downShare * 3.6 + gapDeg / 2, 360 - gapDeg / 2, UP_HEX);
      centerTop = fmtBytes(monthTotal);
      centerBottom = "本月 · 蓝下粉上";
    }
    const topSize = centerTop.length > 7 ? 13 : centerTop.length > 5 ? 16 : 20;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">` +
      `<defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22D3EE"/><stop offset="1" stop-color="#A78BFA"/></linearGradient></defs>` +
      arcs +
      `<text x="50" y="49" text-anchor="middle" font-family="-apple-system,Helvetica,Arial,sans-serif" font-size="${topSize}" font-weight="800" fill="#FFFFFF">${centerTop}</text>` +
      `<text x="50" y="63" text-anchor="middle" font-family="-apple-system,Helvetica,Arial,sans-serif" font-size="8" font-weight="600" fill="rgba(235,240,255,0.55)">${centerBottom}</text>` +
      `</svg>`;
  }

  // ---------- SVG: 7-day bars ----------
  function barsSVG(d) {
    const days = d.days || [];
    if (!days.length) return null;
    const W = 308, H = 96, base = 74, maxBarH = 52;
    const max = Math.max.apply(null, days.map((e) => e.rx + e.tx).concat([1]));
    const slot = W / days.length;
    const barW = Math.min(26, slot * 0.52);
    let parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
      `<defs><linearGradient id="bg1" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#2563EB"/><stop offset="1" stop-color="#22D3EE"/></linearGradient></defs>`,
      `<line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="rgba(130,142,180,0.35)" stroke-width="1"/>`];
    days.forEach((e, i) => {
      const total = e.rx + e.tx;
      const h = Math.max(2, (total / max) * maxBarH);
      const x = slot * i + (slot - barW) / 2;
      const isToday = i === days.length - 1;
      parts.push(`<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${barW}" height="${h.toFixed(1)}" rx="4" fill="${isToday ? "#F472B6" : "url(#bg1)"}" opacity="${isToday ? "1" : "0.88"}"/>`);
      if (isToday || total === max) {
        parts.push(`<text x="${(x + barW / 2).toFixed(1)}" y="${(base - h - 4).toFixed(1)}" text-anchor="middle" font-family="-apple-system,Helvetica,Arial,sans-serif" font-size="8" font-weight="700" fill="${isToday ? "#DB2777" : "#2563EB"}">${fmtBytes(total)}</text>`);
      }
      parts.push(`<text x="${(x + barW / 2).toFixed(1)}" y="${base + 13}" text-anchor="middle" font-family="-apple-system,Helvetica,Arial,sans-serif" font-size="8" font-weight="600" fill="#8E97B5">${e.label}日</text>`);
    });
    parts.push("</svg>");
    return parts.join("");
  }

  // ---------- layout pieces ----------
  function statusPill(d) {
    if (d.cachedAt) {
      const t = new Date(d.cachedAt);
      const hh = String(t.getHours()).padStart(2, "0"), mm = String(t.getMinutes()).padStart(2, "0");
      return row([text("● 缓存 " + hh + ":" + mm, 7, "semibold", C.amber)], { padding: [2, 6], backgroundColor: "rgba(251,191,36,0.16)", borderRadius: 8 });
    }
    return row([text("● 在线", 7, "semibold", C.green)], { padding: [2, 6], backgroundColor: "rgba(52,211,153,0.16)", borderRadius: 8 });
  }

  function header(d, opts) {
    const o = opts || {};
    const title = cfg.name || d.hostname || cfg.host;
    const kids = [
      { type: "stack", direction: "row", alignItems: "center", padding: [5, 6], backgroundGradient: grad(GRAD_HEAD), borderRadius: 9,
        children: [image("cloud.fill", "#FFFFFF", 13, 13)] },
      col([
        text(title, o.small ? 11 : 13, "bold", C.text, { maxLines: 1, minScale: 0.6 }),
        text(cfg.host + (d.iface ? " · " + d.iface : ""), 7, "medium", C.muted, { maxLines: 1, minScale: 0.6 })
      ], { gap: 0, flex: 1 })
    ];
    if (!o.noPill) { kids.push(spacer()); kids.push(statusPill(d)); }
    return row(kids, { gap: 6 });
  }

  function monthNote(d) {
    if (!d.monthKnown) return "未装 vnStat，本月为开机以来累计";
    if (cfg.quotaGB > 0) {
      const quotaBytes = cfg.quotaGB * 1e9;
      const left = Math.max(0, quotaBytes - (d.monthRx + d.monthTx));
      return "上限 " + fmtBytes(quotaBytes) + " · 剩余 " + fmtBytes(left);
    }
    return "下载 " + (d.monthRx + d.monthTx > 0 ? Math.round((d.monthRx / (d.monthRx + d.monthTx)) * 100) : 0) + "% · 上传 " + (d.monthRx + d.monthTx > 0 ? Math.round((d.monthTx / (d.monthRx + d.monthTx)) * 100) : 0) + "%";
  }

  function statChip(label, value, color) {
    return col([
      text(label, 7, "semibold", C.muted, { minScale: 0.7 }),
      text(value, 10.5, "bold", color || C.text, { maxLines: 1, minScale: 0.55 })
    ], { flex: 1, gap: 1, padding: [6, 8], backgroundColor: C.cardBg, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder });
  }

  function largeLayout(d) {
    const bars = barsSVG(d);
    const children = [
      header(d),
      panel([
        row([
          svgImage(ringSVG(d, 96), 96, 96),
          col([
            text(d.monthKnown ? "本月流量" : "本月流量（开机以来）", 9, "semibold", C.onSub, {}),
            text(fmtBytes(d.monthRx + d.monthTx), 24, "bold", C.onText, { minScale: 0.55 }),
            flowSplit(d.monthRx, d.monthTx, 10.5, true)
          ], { flex: 1, gap: 3 })
        ], { gap: 10 }),
        text(monthNote(d), 7.5, "medium", C.onSub, { minScale: 0.65 })
      ], GRAD_MONTH, {}),
      panel([
        row([
          image("calendar", C.down, 11, 11),
          text("近 7 天流量", 9, "semibold", C.text, {}),
          spacer(),
          d.today ? text("今日 " + fmtBytes(d.today.rx + d.today.tx), 8, "semibold", C.amber, {}) : text("", 8, "regular", C.text, {})
        ], { gap: 4 }),
        bars ? svgImage(bars, 308, 96) : text("暂无按天数据（需 vnStat）", 9, "medium", C.muted, {})
      ], null, {}),
      row([
        statChip("总流量 ↓", fmtBytes(d.totalRx), C.down),
        statChip("总流量 ↑", fmtBytes(d.totalTx), C.up),
        statChip("总计", fmtBytes(d.totalRx + d.totalTx), C.amber)
      ], { gap: 6 }),
      row([
        image("clock.fill", C.muted, 8, 8),
        text("已运行 " + (d.uptime || "--"), 7.5, "medium", C.muted, { minScale: 0.6 }),
        spacer(),
        text(d.created ? "统计始于 " + d.created : (d.boot ? "开机于 " + d.boot.slice(0, 10) : ""), 7.5, "medium", C.muted, { minScale: 0.6 })
      ], { gap: 3 })
    ];
    return children;
  }

  function flowSplit(rx, tx, size, onGrad) {
    const valColor = onGrad ? C.onText : C.text;
    const downColor = onGrad ? DOWN_HEX : C.down;
    const upColor = onGrad ? UP_HEX : C.up;
    return col([
      row([text("↓ 下载", size - 1.5, "semibold", downColor, {}), spacer(), text(fmtBytes(rx), size, "bold", valColor, { minScale: 0.55 })], { gap: 4 }),
      row([text("↑ 上传", size - 1.5, "semibold", upColor, {}), spacer(), text(fmtBytes(tx), size, "bold", valColor, { minScale: 0.55 })], { gap: 4 })
    ], { gap: 2 });
  }

  function mediumLayout(d) {
    return [
      header(d),
      row([
        { type: "stack", direction: "row", alignItems: "center", padding: [6, 6], backgroundGradient: grad(GRAD_MONTH), borderRadius: 16, children: [svgImage(ringSVG(d, 84), 84, 84)] },
        col([
          text(d.monthKnown ? "本月流量" : "本月（开机以来）", 8, "semibold", C.muted, {}),
          text(fmtBytes(d.monthRx + d.monthTx), 19, "bold", C.text, { minScale: 0.55 }),
          text(monthNote(d), 7, "medium", C.sub, { minScale: 0.6 })
        ], { flex: 1, gap: 2 }),
        col([
          flowSplit(d.monthRx, d.monthTx, 9.5),
          { type: "stack", direction: "row", children: [], height: 1, backgroundColor: C.divider },
          col([
            text("总流量 " + fmtBytes(d.totalRx + d.totalTx), 10, "bold", C.amber, { minScale: 0.55 }),
            row([
              text("↓ " + fmtBytes(d.totalRx), 8, "semibold", C.down, { minScale: 0.55 }),
              text("↑ " + fmtBytes(d.totalTx), 8, "semibold", C.up, { minScale: 0.55 })
            ], { gap: 5 })
          ], { gap: 1 })
        ], { width: 118, gap: 4 })
      ], { gap: 10, flex: 1 })
    ];
  }

  function smallLayout(d) {
    return [
      header(d, { small: true }),
      row([spacer(), { type: "stack", direction: "row", alignItems: "center", padding: [6, 6], backgroundGradient: grad(GRAD_MONTH), borderRadius: 16, children: [svgImage(ringSVG(d, 88), 88, 88)] }, spacer()], {}),
      row([
        col([text("↓ 下载", 7, "semibold", C.down, {}), text(fmtBytes(d.monthRx), 10, "bold", C.text, { minScale: 0.5 })], { flex: 1, gap: 0, alignItems: "center" }),
        col([text("↑ 上传", 7, "semibold", C.up, {}), text(fmtBytes(d.monthTx), 10, "bold", C.text, { minScale: 0.5 })], { flex: 1, gap: 0, alignItems: "center" })
      ], { gap: 6 }),
      row([spacer(), text("总流量 " + fmtBytes(d.totalRx + d.totalTx), 8.5, "semibold", C.amber, { minScale: 0.6 }), spacer()], {})
    ];
  }

  function messageWidget(title, body) {
    return {
      type: "widget", padding: 14, backgroundColor: C.root,
      children: [
        col([
          spacer(),
          row([spacer(), image("exclamationmark.triangle.fill", C.amber, 22, 22), spacer()], {}),
          row([spacer(), text(title, 12, "bold", C.text, { textAlign: "center" }), spacer()], {}),
          row([spacer(), text(body, 8.5, "medium", C.sub, { textAlign: "center", maxLines: 3, minScale: 0.6 }), spacer()], {}),
          spacer()
        ], { flex: 1, gap: 6 })
      ]
    };
  }

  // ---------- main ----------
  const missing = [];
  if (!cfg.host) missing.push("host");
  if (!cfg.username) missing.push("username");
  if (!cfg.privateKey && !cfg.password) missing.push("privateKey");
  if (missing.length) {
    return messageWidget("尚未配置服务器", "缺少环境变量：" + missing.join("、") + "（名称和值都要填对，参考脚本头说明）");
  }

  let data = null;
  let fetchError = "";
  try {
    data = await fetchStats();
    saveCache(data);
  } catch (e) {
    fetchError = (e && e.message) ? String(e.message) : "SSH 连接失败";
  }

  if (!data) {
    const cached = loadCache();
    if (cached && cached.data) {
      data = cached.data;
      data.cachedAt = cached.at;
    } else {
      let msg = fetchError.slice(0, 80) || "请检查 host / 私钥 / 网络";
      if (/extract public key|unsupported/i.test(fetchError)) {
        msg = "私钥解析失败：脚本已自动重排过一次，请确认粘贴的是完整私钥（从 BEGIN 到 END 一行都不少）";
      }
      return messageWidget("连接失败", msg);
    }
  }

  const children = IS_SMALL ? smallLayout(data) : IS_MEDIUM ? mediumLayout(data) : largeLayout(data);
  return {
    type: "widget",
    padding: 12,
    gap: 8,
    backgroundColor: C.root,
    refreshAfter: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    children: [col(children, { flex: 1, gap: 8 })]
  };
}
