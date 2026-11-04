/**
 * 📶 Egern 本地测速小组件 (LocalSpeed)
 * 版本：v1.1 (2026-11-04)
 * 环境变量：无 (全部请求固定 policy: DIRECT 直连, 不经任何代理节点或策略组)
 *
 * 只测本地网络本身: 当前 WiFi / 蜂窝链路直连互联网的实际速度, 不测代理节点。
 * 测速点: 测速网 speedtest.cn 官方节点 (与 m.speedtest.cn 网页版同一套):
 * 先按你的出口 IP 从官方接口取就近节点 (节点表 AES 加密, 密钥取自其网页端代码,
 * 本脚本内含纯 JS 解密), 再对节点的 /hello 测延迟、/download 测下载、/upload 测上传。
 * 下载优先用响应流分段计数 (到时即停, 不整包读入), 节点按 ckSize 参数定量返回;
 * 流不可用时回退为定量分段采样。头条取 90 百分位, 口径与 SpeedTest 一致。
 */
export default async function(ctx) {
  const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  // 全部请求写死直连: policy 取 Egern 内置策略 DIRECT, 越过规则引擎, 不走任何节点
  const http = {
    get: (url, opts = {}) => ctx.http.get(url, { ...opts, policy: "DIRECT" }),
    post: (url, opts = {}) => ctx.http.post(url, { ...opts, policy: "DIRECT" }),
  };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const C = {
    bg: { light: "#FFFFFF", dark: "#000000" },
    text: { light: "#000000", dark: "#FFFFFF" },
    sub: "#8E8E93",
    dl: "#F6821F",
    ul: "#A03FF0",
    accent: "#0A84FF",
  };
  const family = ctx.widgetFamily || "systemMedium";
  const isLarge = family === "systemLarge" || family === "systemExtraLarge";
  const isSmall = !isLarge && family !== "systemMedium";
  const CACHE_KEY = "localspeed_cache_v2";
  const NODES_KEY = "localspeed_nodes_v1";

  // ---------- 当前接入网络 (WiFi / 蜂窝) ----------
  const dev = ctx.device || {};
  const ssid = dev.wifi ? dev.wifi.ssid : null;
  const iface = (dev.ipv4 && dev.ipv4.interface) || "";
  const onWifi = !!ssid || /^en/.test(iface);
  const radio = (dev.cellular && dev.cellular.radio) || "";
  const carrier = (dev.cellular && dev.cellular.carrier) || "";
  const netName = onWifi ? "WiFi" : "蜂窝网络";
  const netDetail = onWifi ? (ssid || "") : [radio, carrier].filter(Boolean).join(" · ");

  // ---------- 纯 JS AES-128-CBC 解密 (节点表官方接口返回加密数据, 网页端同法解密) ----------
  const b64decode = (s) => {
    const T = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const rev = {}; for (let i = 0; i < 64; i++) rev[T[i]] = i;
    const out = []; let acc = 0, bits = 0;
    for (const ch of s) {
      if (ch === "=") break;
      const v = rev[ch]; if (v === undefined) continue;
      acc = (acc << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); }
    }
    return new Uint8Array(out);
  };
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256), SBOX = new Uint8Array(256), INV_SBOX = new Uint8Array(256);
  {
    let x = 1;
    for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x ^= ((x << 1) & 0xff) ^ ((x & 0x80) ? 0x1b : 0); x &= 0xff; }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
    const rotl = (v, n) => ((v << n) | (v >> (8 - n))) & 0xff;
    for (let i = 0; i < 256; i++) {
      const inv = i === 0 ? 0 : EXP[255 - LOG[i]];
      const s = (inv ^ rotl(inv, 1) ^ rotl(inv, 2) ^ rotl(inv, 3) ^ rotl(inv, 4) ^ 0x63) & 0xff;
      SBOX[i] = s; INV_SBOX[s] = i;
    }
  }
  const gmul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];
  const expandKey = (key) => {
    const w = new Uint8Array(176); w.set(key);
    const RCON = [1, 2, 4, 8, 16, 32, 64, 128, 27, 54];
    for (let i = 4; i < 44; i++) {
      let t = [w[(i - 1) * 4], w[(i - 1) * 4 + 1], w[(i - 1) * 4 + 2], w[(i - 1) * 4 + 3]];
      if (i % 4 === 0) t = [SBOX[t[1]] ^ RCON[i / 4 - 1], SBOX[t[2]], SBOX[t[3]], SBOX[t[0]]];
      for (let j = 0; j < 4; j++) w[i * 4 + j] = w[(i - 4) * 4 + j] ^ t[j];
    }
    return w;
  };
  const decryptBlock = (w, blk, off) => {
    const s = new Uint8Array(16);
    for (let i = 0; i < 16; i++) s[i] = blk[off + i] ^ w[160 + i];
    for (let round = 9; round >= 0; round--) {
      const t = new Uint8Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) t[4 * c + r] = INV_SBOX[s[4 * ((c - r + 4) % 4) + r]];
      for (let i = 0; i < 16; i++) t[i] ^= w[round * 16 + i];
      if (round === 0) { s.set(t); break; }
      for (let c = 0; c < 4; c++) {
        const a0 = t[4 * c], a1 = t[4 * c + 1], a2 = t[4 * c + 2], a3 = t[4 * c + 3];
        s[4 * c]     = gmul(a0, 14) ^ gmul(a1, 11) ^ gmul(a2, 13) ^ gmul(a3, 9);
        s[4 * c + 1] = gmul(a0, 9) ^ gmul(a1, 14) ^ gmul(a2, 11) ^ gmul(a3, 13);
        s[4 * c + 2] = gmul(a0, 13) ^ gmul(a1, 9) ^ gmul(a2, 14) ^ gmul(a3, 11);
        s[4 * c + 3] = gmul(a0, 11) ^ gmul(a1, 13) ^ gmul(a2, 9) ^ gmul(a3, 14);
      }
    }
    return s;
  };
  const NODE_KEY = new Uint8Array([...("5ECC5D62140EC099")].map(ch => ch.charCodeAt(0)));
  const NODE_IV = new Uint8Array([...("E63EA892A702EEAA")].map(ch => ch.charCodeAt(0)));
  const decryptNodes = (b64) => {
    const ct = b64decode(b64);
    const w = expandKey(NODE_KEY);
    const out = new Uint8Array(ct.length);
    let prev = NODE_IV;
    for (let off = 0; off + 16 <= ct.length; off += 16) {
      const dec = decryptBlock(w, ct, off);
      for (let i = 0; i < 16; i++) out[off + i] = dec[i] ^ prev[i];
      prev = ct.subarray(off, off + 16);
    }
    const pad = out[out.length - 1];
    const body = (pad >= 1 && pad <= 16) ? out.subarray(0, out.length - pad) : out;
    // UTF-8 解码 (官方表里非 ASCII 是 \u 转义的纯 ASCII, 原始 UTF-8 也能正确解)
    let str = "";
    for (let i = 0; i < body.length;) {
      const b = body[i];
      if (b < 0x80) { str += String.fromCharCode(b); i += 1; }
      else if (b >= 0xc0 && b < 0xe0) { str += String.fromCharCode(((b & 0x1f) << 6) | (body[i + 1] & 0x3f)); i += 2; }
      else if (b >= 0xe0 && b < 0xf0) { str += String.fromCharCode(((b & 0x0f) << 12) | ((body[i + 1] & 0x3f) << 6) | (body[i + 2] & 0x3f)); i += 3; }
      else { const cp = ((b & 0x07) << 18) | ((body[i + 1] & 0x3f) << 12) | ((body[i + 2] & 0x3f) << 6) | (body[i + 3] & 0x3f); str += String.fromCodePoint(cp); i += 4; }
    }
    return JSON.parse(str);
  };

  // ---------- 取就近节点 (官方接口按请求 IP 分配, 本请求直连 = 按你的真实 IP) ----------
  const fetchNodes = async () => {
    try {
      const resp = await http.get("https://nodes-api.speedtest.cn/", { timeout: 6000, headers: { "User-Agent": UA } });
      const j = (resp && typeof resp.json === "function") ? await resp.json() : JSON.parse(await resp.text());
      if (j && typeof j.data === "string") {
        const parsed = decryptNodes(j.data);
        if (parsed && Array.isArray(parsed.data) && parsed.data.length) {
          try { ctx.storage.setJSON(NODES_KEY, { ts: Date.now(), nodes: parsed.data }); } catch (e) {}
          return parsed.data;
        }
      }
    } catch (e) {}
    try {
      const c = ctx.storage.getJSON(NODES_KEY);
      if (c && Array.isArray(c.nodes) && c.nodes.length && Date.now() - c.ts < 24 * 3600 * 1000) return c.nodes;
    } catch (e) {}
    return null;
  };
  const rankNodes = (nodes) => {
    const list = (nodes || []).filter(n => n && n.downloadUrl && n.uploadUrl && n.pingUrl);
    const dist = (n) => { const d = parseFloat(n.distance); return isNaN(d) ? 1e9 : d; };
    list.sort((a, b) => dist(a) - dist(b));
    if (!onWifi && carrier && list.length) {
      const minD = dist(list[0]);
      const win = Math.max(minD * 1.5, minD + 100);
      const sameOp = list.filter(n => n.operator && carrier.includes(n.operator) && dist(n) <= win);
      if (sameOp.length) return [...sameOp, ...list.filter(n => !sameOp.includes(n))];
    }
    return list;
  };

  // ---------- 结果与缓存 ----------
  let data = { dl: 0, ul: 0, ping: 0, jitter: 0, pl: "-", ts: 0, nodeProv: "", nodeCity: "", nodeOp: "", dist: "", dlBytes: 0, ulBytes: 0, netName, netDetail };
  let fromCache = false;
  try {
    const cached = ctx.storage.getJSON(CACHE_KEY);
    if (cached && typeof cached.dl === "number") { data = cached; fromCache = true; }
  } catch (e) {}

  const measureStart = Date.now();
  let measuredAny = false;
  const p90 = (nums) => {
    if (!nums || nums.length === 0) return 0;
    const s = [...nums].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.ceil(0.9 * s.length) - 1)];
  };
  const headline = (samples) => {
    const big = samples.filter(s => s.bytes >= 512000).map(s => s.mbps);
    return p90(big.length >= 2 ? big : samples.map(s => s.mbps));
  };
  const median = (nums) => {
    if (!nums.length) return 0;
    const s = [...nums].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  const nodes = rankNodes(await fetchNodes());
  let node = null;

  // ---------- 1) 延迟: 对候选节点的 /hello 顺序探测, 首个有响应的节点即测速点 ----------
  const probeNode = async (nd) => {
    const samples = [];
    let sent = 0;
    for (let i = 0; i < 6; i++) {
      if (i >= 3 && Date.now() - measureStart > 9000) break;
      sent++;
      const pt = Date.now();
      let ok = false;
      try {
        const resp = await http.get(nd.pingUrl, { timeout: 1500 });
        ok = !!resp && resp.status === 200;
      } catch (e) { ok = false; }
      if (ok) samples.push(Date.now() - pt);
    }
    return { samples, sent };
  };
  try {
    for (const cand of nodes.slice(0, 2)) {
      const { samples, sent } = await probeNode(cand);
      if (samples.length > 0) {
        node = cand;
        data.pl = Math.round(((sent - samples.length) / sent) * 100);
        data.ping = Math.round(median(samples));
        if (samples.length > 1) {
          const sorted = [...samples].sort((a, b) => a - b);
          data.jitter = parseFloat((sorted[sorted.length - 1] - sorted[0]).toFixed(1));
        } else data.jitter = 0;
        measuredAny = true;
        break;
      }
    }
  } catch (e) {}

  if (node) {
    data.nodeProv = node.province || "";
    data.nodeCity = node.city || "";
    data.nodeOp = node.operator || "";
    data.dist = (node.distance !== undefined && node.distance !== null && node.distance !== "") ? String(Math.round(parseFloat(node.distance))) : "";

    // ---------- 2) 下载: 优先响应流分段计数, 否则定量分段采样 ----------
    let dlDone = null;
    try {
      const STREAMS = onWifi ? 3 : 2;
      const WINDOW = onWifi ? 7000 : 5000;
      const CAP = onWifi ? 48e6 : 24e6;
      const buckets = new Map();
      let total = 0;
      const t0 = Date.now();
      const readers = [];
      const oneStream = async () => {
        try {
          const url = `${node.downloadUrl}?cors=true&r=${Date.now()}&ckSize=10&size=10485760`;
          const resp = await http.get(url, { timeout: WINDOW + 5000 });
          if (!resp || resp.status !== 200 || !resp.body || typeof resp.body.getReader !== "function") return false;
          const reader = resp.body.getReader();
          readers.push(reader);
          while (Date.now() - t0 < WINDOW && total < CAP) {
            const remain = WINDOW - (Date.now() - t0);
            const r = await Promise.race([reader.read(), sleep(Math.max(remain, 1)).then(() => "timeout")]);
            if (r === "timeout" || !r || r.done) break;
            if (r.value && r.value.byteLength) {
              const idx = Math.floor((Date.now() - t0) / 250);
              buckets.set(idx, (buckets.get(idx) || 0) + r.value.byteLength);
              total += r.value.byteLength;
            }
          }
          try { await reader.cancel(); } catch (e) {}
          return total > 0;
        } catch (e) { return false; }
      };
      const oks = await Promise.all(Array.from({ length: STREAMS }, oneStream));
      if (oks.some(Boolean) && total > 0) {
        const rates = [];
        for (const [idx, bytes] of buckets) if (idx >= 2) rates.push(bytes * 8 / 0.25 / 1e6);
        let mbps = rates.length >= 3 ? p90(rates) : 0;
        if (!mbps) {
          // 桶太少 (链路太快, 窗口太短): 用 0.5s 之后的字节/时间整体算
          let b2 = 0; for (const [idx, bytes] of buckets) if (idx >= 2) b2 += bytes;
          const secs = (Date.now() - t0) / 1000 - 0.5;
          mbps = (b2 > 0 && secs > 0) ? (b2 * 8 / secs / 1e6) : (total * 8 / ((Date.now() - t0) / 1000) / 1e6);
        }
        dlDone = { mbps, bytes: total };
      }
    } catch (e) { dlDone = null; }

    if (!dlDone) {
      // 回退: 定量分段采样 (节点按 ckSize 返回定量数据, 校验返回字节防节点不认参数)
      try {
        const PLAN = onWifi ? [1, 1, 2, 2, 5, 5] : [1, 1, 2, 2, 3];
        const samples = [];
        const phaseStart = Date.now();
        for (const ck of PLAN) {
          if (Date.now() - measureStart > 24000) break;
          let sample = null;
          try {
            const want = ck * 1048576;
            const t0 = Date.now();
            const resp = await http.get(`${node.downloadUrl}?cors=true&r=${t0}&ckSize=${ck}&size=${want}`, { timeout: 8000 });
            if (resp && resp.status === 200) {
              const buf = await resp.arrayBuffer();
              const seconds = (Date.now() - t0) / 1000;
              if (buf && buf.byteLength > 0 && seconds > 0) {
                if (buf.byteLength > want * 1.5) break; // 节点未按 ckSize 定量返回, 中止防内存失控
                sample = { bytes: buf.byteLength, mbps: (buf.byteLength * 8) / seconds / 1e6, seconds };
                samples.push(sample);
              }
            }
          } catch (e) { break; }
          if (!sample) break;
          if (Date.now() - phaseStart > 9000) break;
          if (sample.seconds > 3) break;
        }
        if (samples.length > 0) dlDone = { mbps: headline(samples), bytes: samples.reduce((a, s) => a + s.bytes, 0) };
      } catch (e) {}
    }
    if (dlDone) {
      data.dl = parseFloat(dlDone.mbps.toFixed(1));
      data.dlBytes = dlDone.bytes;
      measuredAny = true;
    }

    // ---------- 3) 上传: 定量 POST 到节点 /upload ----------
    try {
      const PLAN = onWifi ? [500000, 1000000, 2000000, 3000000, 3000000] : [500000, 1000000, 2000000, 2000000];
      const samples = [];
      const phaseStart = Date.now();
      for (const size of PLAN) {
        if (Date.now() - measureStart > 32000) break;
        let sample = null;
        try {
          const body = "0123456789AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz-=".repeat(Math.ceil(size / 64)).slice(0, size);
          const t0 = Date.now();
          const resp = await http.post(`${node.uploadUrl}?r=${t0}`, { timeout: 10000, body, headers: { "Content-Type": "application/octet-stream" } });
          const seconds = (Date.now() - t0) / 1000;
          if (resp && resp.status === 200 && seconds > 0) {
            sample = { bytes: size, mbps: (size * 8) / seconds / 1e6, seconds };
            samples.push(sample);
          }
        } catch (e) { break; }
        if (!sample) break;
        if (Date.now() - phaseStart > 8000) break;
        if (sample.seconds > 3.5) break;
      }
      if (samples.length > 0) {
        data.ul = parseFloat(headline(samples).toFixed(1));
        data.ulBytes = samples.reduce((a, s) => a + s.bytes, 0);
        measuredAny = true;
      }
    } catch (e) {}
  }

  if (measuredAny) {
    data.ts = Date.now();
    data.netName = netName;
    data.netDetail = netDetail;
    fromCache = false;
    try { ctx.storage.setJSON(CACHE_KEY, data); } catch (e) {}
  }

  // ---------- 渲染 ----------
  const fmtT = (ts) => {
    if (!ts) return "--:--";
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const T = (text, size, color, weight, align) => ({ type: "text", text: String(text), font: { size, weight: weight || "regular" }, textColor: color, textAlign: align || "left" });
  const row = (children, gap) => ({ type: "stack", direction: "row", gap: gap || 6, alignItems: "center", children });
  const col = (children, gap) => ({ type: "stack", direction: "column", gap: gap || 4, alignItems: "start", children });
  const spacer = { type: "spacer" };

  const netLine = `${data.netName}${data.netDetail ? " · " + data.netDetail : ""}`;
  const nodeLine = (data.nodeCity || data.nodeProv)
    ? `测速点 ${data.nodeProv} ${data.nodeCity}${data.nodeOp ? " · " + data.nodeOp : ""}${data.dist ? " · 约 " + data.dist + " km" : ""}`
    : "测速点 未知 (节点接口未取到)";
  const timeStr = fromCache ? `缓存 ${fmtT(data.ts)}` : fmtT(data.ts || Date.now());
  const usedMB = ((data.dlBytes + data.ulBytes) / 1e6).toFixed(1);
  const metric = (label, value, unit) => col([T(label, 10, C.sub), row([T(value, 15, C.text, "bold"), T(unit, 10, C.sub)], 2)], 1);

  let widget;
  if (isLarge) {
    widget = {
      type: "widget", padding: 16, gap: 8, backgroundColor: C.bg,
      children: [
        row([T("📶 本地测速", 16, C.accent, "bold"), spacer, T(timeStr, 11, C.sub)]),
        T(netLine, 12, C.sub),
        col([T("Download 下载", 12, C.dl, "bold"), row([T(data.dl ? data.dl : "--", 46, C.text, "bold"), T("Mbps", 13, C.sub)], 4)], 2),
        row([
          col([T("Upload 上传", 12, C.ul, "bold"), row([T(data.ul ? data.ul : "--", 26, C.text, "bold"), T("Mbps", 11, C.sub)], 4)], 2),
          spacer,
          metric("延迟", data.ping ? data.ping : "--", "ms"),
          metric("抖动", data.ping ? data.jitter : "--", "ms"),
          metric("丢包", data.pl === "-" ? "--" : data.pl, "%"),
        ]),
        T(nodeLine, 11, C.sub),
        T(`本次测速流量约 ${usedMB} MB · 测速网节点, 全程直连不经代理`, 10, C.sub),
      ],
    };
  } else if (!isSmall) {
    widget = {
      type: "widget", padding: 14, gap: 6, backgroundColor: C.bg,
      children: [
        row([T("📶 本地测速", 14, C.accent, "bold"), spacer, T(timeStr, 10, C.sub)]),
        T(netLine, 11, C.sub),
        row([
          col([T("↓ 下载", 11, C.dl, "bold"), row([T(data.dl ? data.dl : "--", 30, C.text, "bold"), T("Mbps", 10, C.sub)], 3)], 1),
          spacer,
          col([T("↑ 上传", 11, C.ul, "bold"), row([T(data.ul ? data.ul : "--", 20, C.text, "bold"), T("Mbps", 10, C.sub)], 3)], 1),
          spacer,
          metric("延迟", data.ping ? data.ping : "--", "ms"),
        ]),
        T(nodeLine, 10, C.sub),
      ],
    };
  } else {
    widget = {
      type: "widget", padding: 12, gap: 5, backgroundColor: C.bg,
      children: [
        row([T("📶 本地测速", 12, C.accent, "bold"), spacer, T(timeStr, 9, C.sub)]),
        T(netLine, 10, C.sub),
        col([T("↓ Mbps", 10, C.dl, "bold"), T(data.dl ? data.dl : "--", 30, C.text, "bold")], 1),
        row([T(`↑ ${data.ul ? data.ul : "--"}`, 13, C.text, "bold"), T(`延迟 ${data.ping ? data.ping : "--"} ms`, 11, C.sub)], 4),
      ],
    };
  }
  return widget;
}
