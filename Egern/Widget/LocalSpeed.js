/**
 * 📶 Egern 本地测速小组件 (LocalSpeed)
 * 版本：v1.4 (2026-11-04)
 * 环境变量：无 (全部请求优先 policy: DIRECT 直连; 若直连被当前构建拒绝, 自动回退规则路由并在界面注明)
 *
 * 只测本地网络本身: 当前 WiFi / 蜂窝链路直连互联网的实际速度, 不测代理节点。
 * 测速点: 测速网 speedtest.cn 节点 (与 m.speedtest.cn 网页版同一批节点), 取点顺序:
 * 1) 官方接口按你的出口 IP 返回就近节点表 (AES 加密, 密钥取自其网页端代码, 脚本内含纯 JS 解密);
 * 2) 脚本内置节点快照 (2026-11-04 公开节点表, 57 个, 按 /hello 实测延迟并行选点);
 * 3) 远程更新同一份公开节点表 (jsDelivr / GitHub); 4) 上次缓存。
 * 取点来源与失败阶段写在组件上。公开表里混有两类节点: 测速网协议 (/download?ckSize=)
 * 与 Ookla 协议 (如高校/运营商的 ooklaserver 主机, /hello 能应答但下载路径不同);
 * 选中节点先做下载通道校验 (先测速网形, 后 Ookla 形), 不通就自动换下一个候选节点。
 * 下载优先响应流分段计数, 否则定量分段采样; 头条取 90 百分位, 口径与 SpeedTest 一致。
 */
export default async function(ctx) {
  const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // ---------- HTTP: 优先 DIRECT 直连; 首个请求若被拒, 本轮回退规则路由 ----------
  let directState = "unknown"; // unknown | ok | rejected
  const callHttp = async (method, url, opts) => {
    if (directState !== "rejected") {
      try {
        const r = await ctx.http[method](url, { ...opts, policy: "DIRECT" });
        directState = "ok";
        return r;
      } catch (e) {
        if (directState !== "unknown") throw e;
        directState = "rejected";
      }
    }
    return ctx.http[method](url, opts);
  };
  const http = {
    get: (url, opts = {}) => callHttp("get", url, opts),
    post: (url, opts = {}) => callHttp("post", url, opts),
  };

  const C = {
    rootBg: { light: "#F2F4F8", dark: "#000000" },
    card: { light: "#FFFFFF", dark: "#1C1C1E" },
    text: { light: "#000000", dark: "#FFFFFF" },
    sub: "#8E8E93",
    dl: "#F6821F",
    ul: "#A03FF0",
    accent: "#0A84FF",
    warn: "#FF9F0A",
    track: "rgba(128,128,128,0.35)",
  };
  const GRAD_HEAD = ["#0A84FF", "#5E5CE6"];
  const family = ctx.widgetFamily || "systemMedium";
  const isLarge = family === "systemLarge" || family === "systemExtraLarge";
  const isSmall = !isLarge && family !== "systemMedium";
  const CACHE_KEY = "localspeed_cache_v2";
  const NODES_KEY = "localspeed_nodes_v2";
  const CSV_KEY = "localspeed_csvnodes_v1";

  // ---------- 当前接入网络 (WiFi / 蜂窝) ----------
  const clean = (s) => { s = (s === null || s === undefined) ? "" : String(s).trim(); return (s === "--" || s === "-" || s === "--") ? "" : s; };
  const dev = ctx.device || {};
  const ssid = clean(dev.wifi ? dev.wifi.ssid : "");
  const iface = clean((dev.ipv4 && dev.ipv4.interface) || "");
  const localIP = clean((dev.ipv4 && dev.ipv4.address) || "");
  const gateway = clean((dev.ipv4 && dev.ipv4.gateway) || "");
  const onWifi = !!ssid || /^en/.test(iface);
  const radio = clean((dev.cellular && dev.cellular.radio) || "");
  const carrier = clean((dev.cellular && dev.cellular.carrier) || "");
  const netName = onWifi ? "WiFi" : "蜂窝网络";
  const netDetail = onWifi ? ssid : [radio, carrier].filter(Boolean).join(" · ");
  const showGateway = onWifi && gateway && gateway !== localIP;

  // ---------- 内置节点快照 (测速网公开节点表 2026-11-04, [host, scheme, 省, 市, 运营商]) ----------
  const SNAPSHOT = [["5gnanjing.speedtest.jsinfo.net:8080","http","江苏","南京","电信"],["5gzhenjiang.speedtest.jsinfo.net:8080","http","江苏","南京","电信"],["4gsuzhou1.speedtest.jsinfo.net:8080","http","江苏","南京","电信"],["5gzhenjiang.speedtest.jsinfo.net.prod.hosts.ooklaserver.net:8080","https","江苏","南京","电信"],["speedtest.dukekunshan.edu.cn:8080","https","江苏","苏州","教育网"],["4gsuzhou1.speedtest.jsinfo.net.prod.hosts.ooklaserver.net:8080","https","江苏","苏州","电信"],["node-124-160-78-98.speedtest.cn:51090","https","浙江","杭州","联通"],["speedtest.wasu.cn:8080","http","浙江","杭州","华数"],["speedtest.wasu.cn.prod.hosts.ooklaserver.net:8080","https","浙江","杭州","华数"],["cesu-hz.zjtelecom.com.cn:8080","http","浙江","杭州","电信"],["cesu-hz.zjtelecom.com.cn.prod.hosts.ooklaserver.net:8080","https","浙江","杭州","电信"],["cesu-nb.zjtelecom.com.cn:8080","http","浙江","宁波","电信"],["cesu-nb.zjtelecom.com.cn.prod.hosts.ooklaserver.net:8080","https","浙江","宁波","电信"],["node-59-175-206-86.speedtest.cn:51090","https","湖北","武汉","电信"],["vipspeedtest8.wuhan.net.cn:8080","https","湖北","武汉","电信"],["node-36-250-1-90.speedtest.cn:51090","https","福建","福州","联通"],["node-219-150-218-123.speedtest.cn:51090","https","河南","新乡","电信"],["node-124-93-198-18.speedtest.cn:51090","https","辽宁","大连","联通"],["node-218-26-162-114.speedtest.cn:51090","https","山西省","太原市","联通"],["speedtest1.sc.189.cn.prod.hosts.ooklaserver.net:8080","http","四川","成都","电信"],["speedtest1.sc.189.cn:8080","http","四川","成都","电信"],["cuscspeed.169ol.com.prod.hosts.ooklaserver.net:8080","https","四川","成都","联通"],["node-125-76-88-10.speedtest.cn:51090","https","甘肃","兰州","电信"],["node-58-49-35-34.speedtest.cn:51090","https","湖北","武汉","电信"],["node-111-42-93-106.speedtest.cn:51090","https","黑龙江","绥化","广电"],["node-111-42-93-105.speedtest.cn:51090","https","黑龙江","绥化","广电"],["mycuspeed.169ol.com:8080","http","四川","绵阳","联通"],["hntelecom5g.cn:8080","http","湖南","长沙","电信"],["speedtest1.cqccn.com.prod.hosts.ooklaserver.net:8080","https","重庆","重庆","重庆广电"],["speedtest1.cqccn.com:8080","http","重庆","重庆","重庆广电"],["speedtest1.online.sh.cn:8080","https","上海","上海","电信"],["node-221-10-136-162.speedtest.cn:51090","https","四川","南充","联通"],["5g.shunicomtest.com:8088","http","上海","上海","联通"],["speedtest3.online.tj.cn:8080","http","天津","天津","联通"],["5g.shunicomtest.com.prod.hosts.ooklaserver.net:8088","https","上海","上海","联通"],["beijing.unicomtest.com.prod.hosts.ooklaserver.net:8080","http","北京","北京","联通"],["beijing.unicomtest.com:8080","https","北京","北京","联通"],["speedtest.139play.com:8080","http","浙江","杭州","移动"],["speedtest.139play.com.prod.hosts.ooklaserver.net:8080","https","浙江","杭州","移动"],["cuscspeed.169ol.com:8080","http","四川","成都","联通"],["speedtest.jsqiuying.com:8080","https","江苏","南京","移动"],["36.250.1.90:8080","http","福建","福州","联通"],["node-218-25-6-190.speedtest.cn:51090","https","辽宁","沈阳","联通"],["node-117-91-186-195.speedtest.cn:51090","https","江苏","扬州","电信"],["csfw.fj.chinamobile.com:8080","http","福建","福州","移动"],["5g.shunicomtest.com.prod.hosts.ooklaserver.net:8080","https","浙江","杭州","移动"],["5g.shunicomtest.com:8080","http","上海","上海","联通"],["speedtest.jsqiuying.com.prod.hosts.ooklaserver.net:8080","http","江苏","南京","移动"],["csfw.fj.chinamobile.com.prod.hosts.ooklaserver.net:8080","https","福建","福州","移动"],["node-112-45-112-83.speedtest.cn:51090","https","四川","成都","移动"],["mycuspeed.169ol.com.prod.hosts.ooklaserver.net:8080","http","四川","绵阳","联通"],["speedtest1.sc.chinamobile.com:8080","https","四川","成都","移动"],["mobile.shunicomtest.com:8080","http","上海","上海","联通"],["server-24447.prod.hosts.ooklaserver.net:8080","https","上海","上海","联通"],["mobile.shunicomtest.com.prod.hosts.ooklaserver.net:8080","https","上海","上海","联通"],["node-183-213-92-194.speedtest.cn:51090","https","江苏","南京","移动"],["node-183-213-92-198.speedtest.cn:51090","https","江苏","南京","移动"]];
  const snapNode = (a) => ({ host: a[0], province: a[2], city: a[3], operator: a[4], pingUrl: `${a[1]}://${a[0]}/hello`, downloadUrl: `${a[1]}://${a[0]}/download`, uploadUrl: `${a[1]}://${a[0]}/upload`, snap: true });

  // ---------- 纯 JS AES-128-CBC 解密 (官方节点表加密, 网页端同法解密) ----------
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

  // ---------- 取点各来源 ----------
  let nodeDiag = "";
  const fetchOfficial = async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const resp = await http.get("https://nodes-api.speedtest.cn/", { timeout: 5000, headers: { "User-Agent": UA } });
        if (!resp || resp.status !== 200) { nodeDiag = `官方接口 HTTP ${resp ? resp.status : "无响应"}`; }
        else {
          const j = (typeof resp.json === "function") ? await resp.json() : JSON.parse(await resp.text());
          if (!j || typeof j.data !== "string") { nodeDiag = "官方接口返回格式异常"; return null; }
          let parsed = null;
          try { parsed = decryptNodes(j.data); } catch (e) { nodeDiag = "节点表解密失败"; return null; }
          if (parsed && Array.isArray(parsed.data) && parsed.data.length) return parsed.data;
          nodeDiag = "官方接口节点为空";
          return null;
        }
      } catch (e) { nodeDiag = "官方接口请求失败"; }
      if (attempt === 0) await sleep(800);
    }
    return null;
  };
  const parseCSV = (text) => {
    const lines = String(text || "").split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const head = lines[0].split(",");
    const ix = (name) => head.indexOf(name);
    const iP = ix("province"), iC = ix("city"), iO = ix("operator"), iPing = ix("pingUrl"), iDl = ix("downloadUrl"), iUl = ix("uploadUrl"), iH = ix("host");
    if (iPing < 0 || iDl < 0 || iUl < 0) return [];
    const out = [];
    for (let i = 1; i < lines.length; i++) {
      const f = lines[i].split(",");
      if (!f[iPing] || !f[iDl] || !f[iUl]) continue;
      out.push({ province: f[iP] || "", city: f[iC] || "", operator: f[iO] || "", host: f[iH] || "", pingUrl: f[iPing], downloadUrl: f[iDl], uploadUrl: f[iUl], csv: true });
    }
    return out;
  };
  const fetchCSVNodes = async () => {
    const bases = ["https://cdn.jsdelivr.net/gh/spiritLHLS/speedtest.cn-CN-ID@main", "https://raw.githubusercontent.com/spiritLHLS/speedtest.cn-CN-ID/main"];
    for (const base of bases) {
      try {
        const files = ["unicom.csv", "telecom.csv", "mobile.csv"];
        const results = await Promise.all(files.map(async (f) => {
          try {
            const resp = await http.get(`${base}/${f}`, { timeout: 6000, headers: { "User-Agent": UA } });
            if (resp && resp.status === 200) return parseCSV(await resp.text());
          } catch (e) {}
          return [];
        }));
        const seen = new Set();
        const nodes = results.flat().filter(n => { if (seen.has(n.host)) return false; seen.add(n.host); return true; });
        if (nodes.length) {
          try { ctx.storage.setJSON(CSV_KEY, { ts: Date.now(), nodes }); } catch (e) {}
          return nodes;
        }
      } catch (e) {}
    }
    return null;
  };
  const readCache = (key, ttlMs) => {
    try {
      const c = ctx.storage.getJSON(key);
      if (c && Array.isArray(c.nodes) && c.nodes.length && (ttlMs === 0 || Date.now() - c.ts < ttlMs)) return c.nodes;
    } catch (e) {}
    return null;
  };
  const rankOfficial = (nodes) => {
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
  const orderPool = (nodes) => {
    const list = (nodes || []).filter(n => n && n.downloadUrl && n.uploadUrl && n.pingUrl);
    if (!onWifi && carrier) {
      const same = list.filter(n => n.operator && carrier.includes(n.operator));
      const rest = list.filter(n => !same.includes(n));
      return [...same, ...rest];
    }
    return list;
  };

  // ---------- 结果与缓存 ----------
  let data = { dl: 0, ul: 0, ping: 0, jitter: 0, pl: "-", ts: 0, nodeProv: "", nodeCity: "", nodeOp: "", dist: "", dlBytes: 0, ulBytes: 0, netName, netDetail, nodeSrc: "", diag: "" };
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

  // ---------- 1) 选点 + 延迟 ----------
  let node = null, nodeSrc = "";
  const pingFull = async (nd) => {
    const samples = [];
    let sent = 0;
    for (let i = 0; i < 6; i++) {
      if (i >= 3 && Date.now() - measureStart > 14000) break;
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
  const applyPing = ({ samples, sent }) => {
    if (sent > 0) data.pl = Math.round(((sent - samples.length) / sent) * 100);
    if (samples.length > 0) {
      data.ping = Math.round(median(samples));
      if (samples.length > 1) {
        let d = 0;
        for (let i = 1; i < samples.length; i++) d += Math.abs(samples[i] - samples[i - 1]);
        data.jitter = parseFloat((d / (samples.length - 1)).toFixed(1));
      } else data.jitter = 0;
      measuredAny = true;
    }
  };
  const helloOnce = async (nd) => {
    const pt = Date.now();
    try {
      const resp = await http.get(nd.pingUrl, { timeout: 1500 });
      if (resp && resp.status === 200) return Date.now() - pt;
    } catch (e) {}
    return -1;
  };
  const tournamentRanked = async (pool) => {
    const found = [];
    for (let b = 0; b < 2 && b * 10 < pool.length; b++) {
      const batch = pool.slice(b * 10, b * 10 + 10);
      const rs = await Promise.all(batch.map(async (nd) => ({ nd, rtt: await helloOnce(nd) })));
      for (const { nd, rtt } of rs) if (rtt >= 0) found.push({ nd, rtt });
      found.sort((a, b2) => a.rtt - b2.rtt);
      if (found.length >= 3 && found[0].rtt <= 80) break;
    }
    found.sort((a, b) => a.rtt - b.rtt);
    return found.map(f => f.nd);
  };
  // 下载通道校验: 先试测速网形 (/download?ckSize=1), 再试 Ookla 形 (/speedtest/random*.jpg)
  let proto = null, seedSample = null, validateTried = 0, lastDlStatus = "", pickIndex = -1;
  const originOf = (nd) => (nd.pingUrl && nd.pingUrl.endsWith("/hello")) ? nd.pingUrl.slice(0, nd.pingUrl.length - 6) : "";
  const validateNode = async (nd) => {
    validateTried++;
    try {
      const t0 = Date.now();
      const resp = await http.get(`${nd.downloadUrl}?cors=true&r=${t0}&ckSize=1&size=1048576`, { timeout: 5000 });
      if (resp && resp.status === 200) {
        const buf = await resp.arrayBuffer();
        const seconds = (Date.now() - t0) / 1000;
        if (buf && buf.byteLength > 0 && seconds > 0) {
          if (buf.byteLength > 1048576 * 1.5) return { proto: null };
          return { proto: "cn", sample: { bytes: buf.byteLength, mbps: (buf.byteLength * 8) / seconds / 1e6, seconds } };
        }
        lastDlStatus = "下载返回空数据";
      } else lastDlStatus = `HTTP ${resp ? resp.status : "无响应"}`;
    } catch (e) { lastDlStatus = "请求失败"; }
    const origin = originOf(nd);
    if (origin) {
      try {
        const resp = await http.get(`${origin}/speedtest/random350x350.jpg`, { timeout: 5000 });
        if (resp && resp.status === 200) {
          const buf = await resp.arrayBuffer();
          if (buf && buf.byteLength > 0) return { proto: "ookla" };
        }
        lastDlStatus = `Ookla 形 HTTP ${resp ? resp.status : "无响应"}`;
      } catch (e) { lastDlStatus = "Ookla 形请求失败"; }
    }
    return { proto: null };
  };
  const pickFrom = async (cands, srcLabel) => {
    const n = Math.min(3, cands.length);
    for (let i = 0; i < n; i++) {
      const v = await validateNode(cands[i]);
      if (v.proto) { node = cands[i]; proto = v.proto; seedSample = v.sample || null; pickIndex = i; nodeSrc = srcLabel; return true; }
    }
    return false;
  };
  try {
    const official = await fetchOfficial();
    if (official) {
      try { ctx.storage.setJSON(NODES_KEY, { ts: Date.now(), nodes: official }); } catch (e) {}
      if (!(await pickFrom(rankOfficial(official).slice(0, 3), "官方接口"))) {
        nodeDiag = (nodeDiag ? nodeDiag + "; " : "") + "官方节点下载通道无响应";
      }
    }
    if (!node) {
      const ranked = await tournamentRanked(orderPool(SNAPSHOT.map(snapNode)));
      if (ranked.length) await pickFrom(ranked.slice(0, 4), "内置节点表");
    }
    if (!node) {
      const csv = (await fetchCSVNodes()) || readCache(CSV_KEY, 0);
      if (csv) {
        const ranked = await tournamentRanked(orderPool(csv));
        if (ranked.length) await pickFrom(ranked.slice(0, 4), "备用节点表");
      }
    }
    if (!node) {
      const cachedNodes = readCache(NODES_KEY, 0);
      if (cachedNodes) await pickFrom(rankOfficial(cachedNodes).slice(0, 2), "节点缓存");
    }
    if (node) applyPing(await pingFull(node));
  } catch (e) {}

  if (node) {
    const trimAdmin = (s) => clean(s).replace(/(省|市)$/, "");
    data.nodeProv = trimAdmin(node.province);
    data.nodeCity = trimAdmin(node.city);
    data.nodeOp = clean(node.operator);
    data.dist = (nodeSrc === "官方接口" && node.distance !== undefined && node.distance !== null && node.distance !== "") ? String(Math.round(parseFloat(node.distance))) : "";
    data.nodeSrc = nodeSrc;
    // 本轮实测开始: 清空上一轮缓存里的测速值, 避免测速失败时把旧值当新值存回
    data.dl = 0; data.ul = 0; data.dlBytes = 0; data.ulBytes = 0;

    // ---------- 2) 下载: 优先响应流分段计数, 否则定量分段采样 (按节点协议选路径) ----------
    const origin = originOf(node);
    let dlDone = null;
    try {
      const STREAMS = onWifi ? 3 : 2;
      const WINDOW = onWifi ? 7000 : 5000;
      const CAP = onWifi ? 48e6 : 24e6;
      const buckets = new Map();
      let total = 0;
      const t0 = Date.now();
      const streamUrl = proto === "ookla" ? `${origin}/speedtest/random4000x4000.jpg` : `${node.downloadUrl}?cors=true&r=${Date.now()}&ckSize=10&size=10485760`;
      const oneStream = async () => {
        try {
          const url = streamUrl;
          const resp = await http.get(url, { timeout: WINDOW + 5000 });
          if (!resp || resp.status !== 200 || !resp.body || typeof resp.body.getReader !== "function") return false;
          const reader = resp.body.getReader();
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
          let b2 = 0; for (const [idx, bytes] of buckets) if (idx >= 2) b2 += bytes;
          const secs = (Date.now() - t0) / 1000 - 0.5;
          mbps = (b2 > 0 && secs > 0) ? (b2 * 8 / secs / 1e6) : (total * 8 / ((Date.now() - t0) / 1000) / 1e6);
        }
        dlDone = { mbps, bytes: total };
      }
    } catch (e) { dlDone = null; }

    if (!dlDone && proto === "cn") {
      try {
        const PLAN = onWifi ? [1, 1, 2, 2, 5, 5] : [1, 1, 2, 2, 3];
        const samples = seedSample ? [seedSample] : [];
        const phaseStart = Date.now();
        for (const ck of PLAN) {
          if (Date.now() - measureStart > 30000) break;
          let sample = null;
          try {
            const want = ck * 1048576;
            const t0 = Date.now();
            const resp = await http.get(`${node.downloadUrl}?cors=true&r=${t0}&ckSize=${ck}&size=${want}`, { timeout: 8000 });
            if (resp && resp.status === 200) {
              const buf = await resp.arrayBuffer();
              const seconds = (Date.now() - t0) / 1000;
              if (buf && buf.byteLength > 0 && seconds > 0) {
                if (buf.byteLength > want * 1.5) break;
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
    if (!dlDone && proto === "ookla") {
      try {
        const samples = [];
        const phaseStart = Date.now();
        for (let i = 0; i < 4; i++) {
          if (Date.now() - measureStart > 30000) break;
          let sample = null;
          try {
            const t0 = Date.now();
            const resp = await http.get(`${origin}/speedtest/random2000x2000.jpg?r=${t0}`, { timeout: 8000 });
            if (resp && resp.status === 200) {
              const buf = await resp.arrayBuffer();
              const seconds = (Date.now() - t0) / 1000;
              if (buf && buf.byteLength > 0 && seconds > 0) {
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
        if (Date.now() - measureStart > 36000) break;
        let sample = null;
        try {
          const body = "0123456789AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz-=".repeat(Math.ceil(size / 64)).slice(0, size);
          const t0 = Date.now();
          const resp = await http.post(proto === "ookla" ? `${origin}/speedtest/upload` : `${node.uploadUrl}?r=${t0}`, { timeout: 10000, body, headers: { "Content-Type": "application/octet-stream" } });
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

  // ---------- 诊断汇总 ----------
  {
    const parts = [];
    if (directState === "rejected") parts.push("直连被拒, 已回退规则路由");
    if (!node) {
      if (validateTried > 0) parts.push(`测速失败: ${validateTried} 个候选节点下载通道均无响应 (最后状态 ${lastDlStatus || "未知"})`);
      else parts.push(nodeDiag ? `取点失败: ${nodeDiag}` : "取点失败: 全部节点无响应");
    } else {
      if (nodeSrc && nodeSrc !== "官方接口") parts.push(`取点: ${nodeSrc}${nodeDiag ? " (" + nodeDiag + ")" : ""}`);
      if (pickIndex > 0) parts.push(`前 ${pickIndex} 个节点下载不通, 已自动切换`);
      if (proto === "ookla") parts.push("该节点为 Ookla 协议");
      if (node && !data.dl && !data.ul) parts.push("节点已选定但测速无数据");
      else if (node && data.dl && !data.ul) parts.push("上传无数据");
    }
    data.diag = parts.join(" · ");
  }

  if (measuredAny) {
    data.ts = Date.now();
    data.netName = netName;
    data.netDetail = netDetail;
    fromCache = false;
    try { ctx.storage.setJSON(CACHE_KEY, data); } catch (e) {}
  }

  // ---------- 渲染 (三尺寸统一版式: 同字号层级/同卡片样式/同指标块) ----------
  const fmtT = (ts) => {
    if (!ts) return "--:--";
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const merge = (a, b) => Object.assign({}, a, b || {});
  const T = (text, size, color, weight, extra) => merge({ type: "text", text: String(text), font: { size, weight: weight || "regular" }, textColor: color, maxLines: 1 }, extra);
  const row = (children, extra) => merge({ type: "stack", direction: "row", alignItems: "center", children: children || [] }, extra);
  const col = (children, extra) => merge({ type: "stack", direction: "column", alignItems: "start", children: children || [] }, extra);
  const spacer = { type: "spacer" };
  const grad = (colors) => ({ type: "linear", colors, startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } });
  const panel = (children, extra) => merge({ type: "stack", direction: "column", alignItems: "start", padding: [9, 12], gap: 5, backgroundColor: C.card, borderRadius: 16, children: children || [] }, extra);
  const svgDataURI = (svg) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22");
  const bar = (mbps, color, w) => {
    const pct = mbps > 0 ? Math.max(0.02, Math.min(1, Math.log10(mbps + 1) / 3)) : 0;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 10"><rect width="300" height="10" rx="5" fill="${C.track}"/><rect width="${(pct * 300).toFixed(0)}" height="10" rx="5" fill="${color}"/></svg>`;
    return { type: "image", src: svgDataURI(svg), width: w, height: 10, resizable: true };
  };
  // 统一指标块: 上灰小标签, 下粗体值 + 小单位
  const metric = (label, value, unit) => col([T(label, 10, C.sub), row([T(value, 15, C.text, "bold"), T(unit, 10, C.sub)], 2)], 1);
  const metricsRow = row([
    metric("延迟", data.ping ? data.ping : "--", "ms"), spacer,
    metric("抖动", data.ping ? data.jitter : "--", "ms"), spacer,
    metric("丢包", data.pl === "-" ? "--" : data.pl, "%"),
  ]);

  const netLine = `${data.netName}${data.netDetail ? " · " + data.netDetail : ""}`;
  const nodeShort = (data.nodeCity || data.nodeProv) ? `${data.nodeProv} ${data.nodeCity}`.trim() : "未知";
  const nodeLine = (data.nodeCity || data.nodeProv)
    ? `测速点 ${data.nodeProv} ${data.nodeCity}${data.nodeOp ? " · " + data.nodeOp : ""}${data.dist ? " · 约 " + data.dist + " km" : ""}`
    : "测速点 未知";
  const timeStr = fromCache ? `缓存 ${fmtT(data.ts)}` : fmtT(data.ts || Date.now());
  const usedMB = ((data.dlBytes + data.ulBytes) / 1e6).toFixed(1);
  const localBits = [localIP ? `本机 ${localIP}` : "", iface ? `接口 ${iface}` : "", showGateway ? `网关 ${gateway}` : ""].filter(Boolean).join(" · ");
  const srcLine = `节点来源: ${data.nodeSrc || "--"} · 本次流量约 ${usedMB} MB · 全程直连不经代理`;

  let widget;
  if (isLarge) {
    const dlChildren = [
      row([T("Download 下载", 12, C.dl, "bold"), spacer, T(nodeShort, 11, C.sub)]),
      row([T(data.dl ? data.dl : "--", 46, C.text, "bold"), T("Mbps", 13, C.sub)], 4),
      bar(data.dl, C.dl, 326),
      T(`本次下载 ${(data.dlBytes / 1e6).toFixed(1)} MB`, 10, C.sub),
    ];
    if (!node && data.diag) dlChildren.push(T(`⚠ ${data.diag}`, 10, C.warn));
    const nodeChildren = [T(nodeLine, 12, C.text), T(srcLine, 10, C.sub)];
    if (node && data.diag) nodeChildren.push(T(`⚠ ${data.diag}`, 10, C.warn));
    widget = {
      type: "widget", padding: 12, gap: 6, backgroundColor: C.rootBg,
      children: [
        row([T("📶 本地测速", 16, "#FFFFFF", "bold"), spacer, T(timeStr, 11, "rgba(255,255,255,0.75)")], { padding: [8, 12], backgroundGradient: grad(GRAD_HEAD), borderRadius: 14 }),
        panel([
          row([col([T(data.netName, 15, C.text, "bold"), T(data.netDetail || "--", 11, C.sub)], 2), spacer, col([T("本地 IP", 10, C.sub), T(localIP || "--", 13, C.text, "bold")], 2)]),
          T(localBits, 10, C.sub),
        ]),
        panel(dlChildren),
        panel([
          row([T("Upload 上传", 12, C.ul, "bold"), spacer, T(`本次上传 ${(data.ulBytes / 1e6).toFixed(1)} MB`, 10, C.sub)]),
          row([T(data.ul ? data.ul : "--", 28, C.text, "bold"), T("Mbps", 11, C.sub)], 4),
          bar(data.ul, C.ul, 326),
          metricsRow,
        ]),
        panel(nodeChildren),
      ],
    };
  } else if (!isSmall) {
    const children = [
      row([T("📶 本地测速", 15, C.accent, "bold"), spacer, T(timeStr, 10, C.sub)]),
      T(netLine, 11, C.sub),
      row([
        col([T("Download 下载", 11, C.dl, "bold"), T(data.dl ? data.dl : "--", 30, C.text, "bold"), bar(data.dl, C.dl, 150)], 3),
        spacer,
        col([T("Upload 上传", 11, C.ul, "bold"), T(data.ul ? data.ul : "--", 30, C.text, "bold"), bar(data.ul, C.ul, 150)], 3),
      ]),
      row([
        T(`延迟 ${data.ping ? data.ping : "--"} ms`, 11, C.text), spacer,
        T(`抖动 ${data.ping ? data.jitter : "--"} ms`, 11, C.text), spacer,
        T(`丢包 ${data.pl === "-" ? "--" : data.pl} %`, 11, C.text),
      ]),
      T(nodeLine, 11, C.sub),
      T(srcLine, 10, C.sub),
    ];
    if (data.diag) children.push(T(`⚠ ${data.diag}`, 10, C.warn));
    widget = { type: "widget", padding: 12, gap: 6, backgroundColor: C.rootBg, children };
  } else {
    const children = [
      row([T("📶 本地测速", 12, C.accent, "bold"), spacer, T(timeStr, 9, C.sub)]),
      T(netLine, 10, C.sub),
      T("Download 下载", 10, C.dl, "bold"),
      T(data.dl ? data.dl : "--", 30, C.text, "bold"),
      bar(data.dl, C.dl, 128),
      row([T(`↑ ${data.ul ? data.ul : "--"} Mbps`, 12, C.text, "bold"), spacer, T(`延迟 ${data.ping ? data.ping : "--"} ms`, 11, C.sub)]),
      T(nodeShort, 9, C.sub),
    ];
    widget = { type: "widget", padding: 12, gap: 4, backgroundColor: C.rootBg, children };
  }
  return widget;
}
