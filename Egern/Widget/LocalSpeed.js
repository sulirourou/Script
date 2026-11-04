/**
 * 📶 Egern 本地测速小组件 (LocalSpeed)
 * 版本：v2.1 (2026-11-04)
 * 环境变量 (可选):
 * 名称：POLICY
 * 值：自定义策略组节点名称，例如 美国节点；不填则全部测速请求按 Egern 默认规则路由
 *
 * 测速引擎整套移植自 SpeedTest v2.13 (真机验证过的那一套): 阶梯多样本采样,
 * 头条取 >=512KB 样本池的 90 百分位; 负载延迟用分块背景传输 + 并发探测,
 * 背景块 1MB/500KB 用完即释放, 不整包驻留 (内存纪律与 SpeedTest 一致)。
 * 接口换成测速网 speedtest.cn 的国内节点 (与 m.speedtest.cn 网页版同一批):
 * 延迟探测 GET 节点 /hello, 下载 GET /download?ckSize=&size=, 上传 POST /upload。
 * 取点顺序: 1) 官方接口按出口 IP 返回的就近节点表 (AES 加密, 脚本内含纯 JS 解密);
 * 2) 内置节点快照按 /hello 实测延迟选点; 3) 远程公开节点表; 4) 上次缓存的节点表。
 * 候选先做双向校验 (1MiB 下载 + 100KB 上传), 都通才用 (上传坏的节点在选点阶段
 * 就淘汰, 不会测出上传 0); 只认测速网协议的节点。
 * 响应体读法 (真机记录, 勿改): 这批节点的下载体是二进制流 -- 校验用 text() 判非空,
 * 测速用 body 流式逐块数字节; 曾用 arrayBuffer() 做校验, 在真机上对这批节点
 * 100% 失败 (v1.8~v2.0), 而 text()/流式读法在 v1.4/v1.5/v1.7 均真机通过。
 * 全部请求跟随 Egern 规则路由 (与 SpeedTest 相同),
 * 不再强制 DIRECT。建议在 Egern 的脚本设置里把本脚本超时调到 60 秒。
 */

export default async function(ctx) {
  const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const POLICY = ((ctx.env && ctx.env.POLICY) || "").toString().trim();
  // 填了 POLICY: 全部测速请求强制走该策略组; 不填: 原样走 Egern 规则路由 (与 SpeedTest 相同)
  const http = (() => {
    if (!POLICY) return ctx.http;
    const withPolicy = (fn) => (url, opts = {}) => fn(url, { ...opts, policy: POLICY });
    const h = { get: withPolicy(ctx.http.get.bind(ctx.http)) };
    if (typeof ctx.http.post === "function") h.post = withPolicy(ctx.http.post.bind(ctx.http));
    return h;
  })();

  const C = {
    bg: { light: "#FFFFFF", dark: "#000000" },
    text: { light: "#000000", dark: "#FFFFFF" },
    sub: { light: "#8E8E93", dark: "#8E8E93" },
    line: { light: "#000000", dark: "#FFFFFF" },
    divider: { light: "#E5E5EA", dark: "#333333" },
  };
  const DL_C = "#F6821F", UL_C = "#A03FF0", TITLE_C = { light: "#E48525", dark: "#4DA2FF" };

  const family = ctx.widgetFamily || "systemMedium";
  const isLarge = family === "systemLarge" || family === "systemExtraLarge";
  const isMedium = family === "systemMedium";
  const isSmall = !isLarge && !isMedium;
  const CACHE_KEY = "localspeed_cache_v3";
  const NODES_KEY = "localspeed_nodes_v2";
  const CSV_KEY = "localspeed_csvnodes_v1";

  // ---------- 本地网络信息 (标题/信息块用) ----------
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

  // ---------- 内置节点快照 (2026-11-04 公开节点表, spiritLHLS/speedtest.cn-CN-ID) ----------
  const SNAPSHOT = [["5gnanjing.speedtest.jsinfo.net:8080","http","江苏","南京","电信"],["5gzhenjiang.speedtest.jsinfo.net:8080","http","江苏","南京","电信"],["4gsuzhou1.speedtest.jsinfo.net:8080","http","江苏","南京","电信"],["5gzhenjiang.speedtest.jsinfo.net.prod.hosts.ooklaserver.net:8080","https","江苏","南京","电信"],["speedtest.dukekunshan.edu.cn:8080","https","江苏","苏州","教育网"],["4gsuzhou1.speedtest.jsinfo.net.prod.hosts.ooklaserver.net:8080","https","江苏","苏州","电信"],["node-124-160-78-98.speedtest.cn:51090","https","浙江","杭州","联通"],["speedtest.wasu.cn:8080","http","浙江","杭州","华数"],["speedtest.wasu.cn.prod.hosts.ooklaserver.net:8080","https","浙江","杭州","华数"],["cesu-hz.zjtelecom.com.cn:8080","http","浙江","杭州","电信"],["cesu-hz.zjtelecom.com.cn.prod.hosts.ooklaserver.net:8080","https","浙江","杭州","电信"],["cesu-nb.zjtelecom.com.cn:8080","http","浙江","宁波","电信"],["cesu-nb.zjtelecom.com.cn.prod.hosts.ooklaserver.net:8080","https","浙江","宁波","电信"],["node-59-175-206-86.speedtest.cn:51090","https","湖北","武汉","电信"],["vipspeedtest8.wuhan.net.cn:8080","https","湖北","武汉","电信"],["node-36-250-1-90.speedtest.cn:51090","https","福建","福州","联通"],["node-219-150-218-123.speedtest.cn:51090","https","河南","新乡","电信"],["node-124-93-198-18.speedtest.cn:51090","https","辽宁","大连","联通"],["node-218-26-162-114.speedtest.cn:51090","https","山西省","太原市","联通"],["speedtest1.sc.189.cn.prod.hosts.ooklaserver.net:8080","http","四川","成都","电信"],["speedtest1.sc.189.cn:8080","http","四川","成都","电信"],["cuscspeed.169ol.com.prod.hosts.ooklaserver.net:8080","https","四川","成都","联通"],["node-125-76-88-10.speedtest.cn:51090","https","甘肃","兰州","电信"],["node-58-49-35-34.speedtest.cn:51090","https","湖北","武汉","电信"],["node-111-42-93-106.speedtest.cn:51090","https","黑龙江","绥化","广电"],["node-111-42-93-105.speedtest.cn:51090","https","黑龙江","绥化","广电"],["mycuspeed.169ol.com:8080","http","四川","绵阳","联通"],["hntelecom5g.cn:8080","http","湖南","长沙","电信"],["speedtest1.cqccn.com.prod.hosts.ooklaserver.net:8080","https","重庆","重庆","重庆广电"],["speedtest1.cqccn.com:8080","http","重庆","重庆","重庆广电"],["speedtest1.online.sh.cn:8080","https","上海","上海","电信"],["node-221-10-136-162.speedtest.cn:51090","https","四川","南充","联通"],["5g.shunicomtest.com:8088","http","上海","上海","联通"],["speedtest3.online.tj.cn:8080","http","天津","天津","联通"],["5g.shunicomtest.com.prod.hosts.ooklaserver.net:8088","https","上海","上海","联通"],["beijing.unicomtest.com.prod.hosts.ooklaserver.net:8080","http","北京","北京","联通"],["beijing.unicomtest.com:8080","https","北京","北京","联通"],["speedtest.139play.com:8080","http","浙江","杭州","移动"],["speedtest.139play.com.prod.hosts.ooklaserver.net:8080","https","浙江","杭州","移动"],["cuscspeed.169ol.com:8080","http","四川","成都","联通"],["speedtest.jsqiuying.com:8080","https","江苏","南京","移动"],["36.250.1.90:8080","http","福建","福州","联通"],["node-218-25-6-190.speedtest.cn:51090","https","辽宁","沈阳","联通"],["node-117-91-186-195.speedtest.cn:51090","https","江苏","扬州","电信"],["csfw.fj.chinamobile.com:8080","http","福建","福州","移动"],["5g.shunicomtest.com.prod.hosts.ooklaserver.net:8080","https","浙江","杭州","移动"],["5g.shunicomtest.com:8080","http","上海","上海","联通"],["speedtest.jsqiuying.com.prod.hosts.ooklaserver.net:8080","http","江苏","南京","移动"],["csfw.fj.chinamobile.com.prod.hosts.ooklaserver.net:8080","https","福建","福州","移动"],["node-112-45-112-83.speedtest.cn:51090","https","四川","成都","移动"],["mycuspeed.169ol.com.prod.hosts.ooklaserver.net:8080","http","四川","绵阳","联通"],["speedtest1.sc.chinamobile.com:8080","https","四川","成都","移动"],["mobile.shunicomtest.com:8080","http","上海","上海","联通"],["server-24447.prod.hosts.ooklaserver.net:8080","https","上海","上海","联通"],["mobile.shunicomtest.com.prod.hosts.ooklaserver.net:8080","https","上海","上海","联通"],["node-183-213-92-194.speedtest.cn:51090","https","江苏","南京","移动"],["node-183-213-92-198.speedtest.cn:51090","https","江苏","南京","移动"]];
  const snapNode = (a) => ({ host: a[0], province: a[2], city: a[3], operator: a[4], pingUrl: `${a[1]}://${a[0]}/hello`, downloadUrl: `${a[1]}://${a[0]}/download`, uploadUrl: `${a[1]}://${a[0]}/upload`, snap: true });

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
    // 只试一次: 该接口在本机网络长期不通, 重试只是白烧时间 (内置表锦标赛并行备好)
    try {
      const resp = await http.get("https://nodes-api.speedtest.cn/", { timeout: 4000, headers: { "User-Agent": UA } });
      if (!resp || resp.status !== 200) { nodeDiag = `官方接口 HTTP ${resp ? resp.status : "无响应"}`; return null; }
      const j = (typeof resp.json === "function") ? await resp.json() : JSON.parse(await resp.text());
      if (!j || typeof j.data !== "string") { nodeDiag = "官方接口返回格式异常"; return null; }
      let parsed = null;
      try { parsed = decryptNodes(j.data); } catch (e) { nodeDiag = "节点表解密失败"; return null; }
      if (parsed && Array.isArray(parsed.data) && parsed.data.length) return parsed.data;
      nodeDiag = "官方接口节点为空";
      return null;
    } catch (e) { nodeDiag = "官方接口请求失败"; return null; }
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
  // ---------- 结果与缓存 ----------
  let data = { dl: 0, ul: 0, ping: 0, jitter: 0, pl: "-", ts: 0, dlS: [], ulS: [], dlPing: null, dlJitter: null, ulPing: null, ulJitter: null, nodeProv: "", nodeCity: "", nodeOp: "", nodeSrc: "", dist: "", diag: "" };
  try {
    const cached = ctx.storage.getJSON(CACHE_KEY);
    if (cached && typeof cached.dl === "number") data = cached;
  } catch (e) {}

  const measureStart = Date.now();
  let measuredAny = false;

  // 90 百分位 (最近秩法): 与 SpeedTest / Cloudflare 官方头条数字同一口径
  const p90 = (nums) => {
    if (!nums || nums.length === 0) return 0;
    const s = [...nums].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.ceil(0.9 * s.length) - 1)];
  };
  // 头条取值池: 优先用 >=512KB 的样本, 不足 2 个才用全部
  const headlinePool = (samples) => {
    const big = samples.filter(s => s.bytes >= 512000).map(s => s.mbps);
    return big.length >= 2 ? big : samples.map(s => s.mbps);
  };

  const dlUrl = (nd, bytes) => `${nd.downloadUrl}?cors=true&r=${Date.now()}&ckSize=${Math.max(1, Math.round(bytes / 1048576))}&size=${bytes}`;
  const ulUrl = (nd) => `${nd.uploadUrl}?r=${Date.now()}`;
  const UL_BODY_PAT = "0123456789AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz-=";
  const ulBody = (size) => UL_BODY_PAT.repeat(Math.ceil(size / 64)).slice(0, size);

  // ---------- 下载读取: 流式逐块数字节 (真机验证过的读法, 块用完即弃, 不整包驻留) ----------
  const fetchDownload = async (url, timeoutMs) => {
    try {
      const t0 = Date.now();
      const resp = await http.get(url, { headers: { "Cache-Control": "no-cache" }, timeout: timeoutMs });
      if (!resp || resp.status !== 200) return null;
      let bytes = 0;
      const body = resp.body;
      if (body && typeof body.getReader === "function") {
        const reader = body.getReader();
        try {
          for (;;) {
            const r = await reader.read();
            if (!r || r.done) break;
            if (r.value) bytes += r.value.byteLength || r.value.length || 0;
            if (bytes > 6291456) { try { await reader.cancel(); } catch (e) {} return null; }
          }
        } catch (e) { try { await reader.cancel(); } catch (e2) {} return null; }
      } else {
        const buf = await resp.arrayBuffer();
        bytes = buf ? buf.byteLength : 0;
      }
      const seconds = (Date.now() - t0) / 1000;
      return (bytes > 0 && seconds > 0) ? { bytes, seconds } : null;
    } catch (e) { return null; }
  };

  // ---------- 选点: 候选先做双向校验 (下载 text() 判非空 + 100KB 上传探活) ----------
  let node = null, nodeSrc = "";
  const SEL_BUDGET_MS = 12000;
  const validateDownload = async (nd) => {
    try {
      const resp = await http.get(dlUrl(nd, 1048576), { timeout: 5000, headers: { "Cache-Control": "no-cache" } });
      if (!resp || resp.status !== 200) return false;
      const txt = await resp.text();
      if (!txt || !txt.length) return false;
      if (typeof http.post === "function") {
        const presp = await http.post(ulUrl(nd), { headers: { "Cache-Control": "no-cache", "Content-Type": "application/octet-stream" }, body: ulBody(100000), timeout: 5000 });
        if (!presp || presp.status !== 200) return false;
      }
      return true;
    } catch (e) {}
    return false;
  };
  const tryCandidates = async (list, srcLabel, maxTry) => {
    const n = Math.min(maxTry, list.length);
    for (let i = 0; i < n; i++) {
      if (i > 0 && Date.now() - measureStart > SEL_BUDGET_MS) break;
      if (await validateDownload(list[i])) { node = list[i]; nodeSrc = srcLabel; return true; }
    }
    return false;
  };
  try {
    const officialP = fetchOfficial();
    const snapRankedP = tournamentRanked(orderPool(SNAPSHOT.map(snapNode)));
    const official = await officialP;
    if (official) {
      try { ctx.storage.setJSON(NODES_KEY, { ts: Date.now(), nodes: official }); } catch (e) {}
      await tryCandidates(rankOfficial(official), "官方接口", 3);
    }
    if (!node) {
      const ranked = await snapRankedP;
      if (ranked.length) await tryCandidates(ranked, "内置节点表", 3);
    }
    if (!node) {
      const csv = (await fetchCSVNodes()) || readCache(CSV_KEY, 0);
      if (csv) {
        const ranked = await tournamentRanked(orderPool(csv));
        if (ranked.length) await tryCandidates(ranked, "备用节点表", 3);
      }
    }
    if (!node) {
      const cachedNodes = readCache(NODES_KEY, 0);
      if (cachedNodes) await tryCandidates(rankOfficial(cachedNodes), "节点缓存", 2);
    }
  } catch (e) {}
  if (node) {
    const trimAdmin = (s) => clean(s).replace(/(省|市)$/, "");
    data.nodeProv = trimAdmin(node.province);
    data.nodeCity = trimAdmin(node.city);
    data.nodeOp = clean(node.operator);
    data.nodeSrc = nodeSrc;
    data.dist = (nodeSrc === "官方接口" && node.distance !== undefined && node.distance !== null && node.distance !== "") ? String(Math.round(parseFloat(node.distance))) : "";
    data.diag = "";
  } else {
    data.diag = nodeDiag ? `取点失败: ${nodeDiag}` : "取点失败: 全部节点无响应";
  }

  if (node) {
    // ---------- 1) 延迟 / 抖动 / 丢包率: 8 次顺序探测 (SpeedTest 同款) ----------
    try {
      const PROBES = 8;
      const PROBE_BUDGET_MS = 6500;
      const pingStart = Date.now();
      const samples = [];
      let sent = 0;
      for (let i = 0; i < PROBES; i++) {
        if (i >= 3 && Date.now() - pingStart > PROBE_BUDGET_MS) break;
        sent++;
        const pt = Date.now();
        let ok = false;
        try {
          const resp = await http.get(node.pingUrl, { timeout: 2000 });
          ok = !!resp && resp.status === 200;
        } catch (e) { ok = false; }
        if (ok) samples.push(Date.now() - pt);
      }
      if (sent > 0) {
        const lost = sent - samples.length;
        data.pl = Math.round((lost / sent) * 100);
        measuredAny = true;
      }
      if (samples.length > 0) {
        data.ping = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
        if (samples.length > 1) {
          let diffSum = 0;
          for (let i = 1; i < samples.length; i++) diffSum += Math.abs(samples[i] - samples[i - 1]);
          data.jitter = parseFloat((diffSum / (samples.length - 1)).toFixed(1));
        } else data.jitter = 0;
      }
    } catch (e) {}

    // ---------- 2) 下载测速: 阶梯多样本采样 (SpeedTest 同款) ----------
    const DL_PLAN = [100000, 100000, 500000, 500000, 1000000, 1000000, 3000000, 5000000, 5000000];
    const dlSamples = [];
    try {
      const dlPhaseStart = Date.now();
      for (const planBytes of DL_PLAN) {
        if (Date.now() - measureStart > 22000) break;
        const r = await fetchDownload(dlUrl(node, planBytes), 10000);
        if (!r) break;
        const sample = { bytes: r.bytes, mbps: (r.bytes * 8) / r.seconds / 1e6, seconds: r.seconds };
        dlSamples.push(sample);
        if (Date.now() - dlPhaseStart > 9000) break;
        if (sample.seconds > 3) break;
      }
      if (dlSamples.length > 0) {
        data.dl = parseFloat(p90(headlinePool(dlSamples)).toFixed(1));
        data.dlS = dlSamples.map(s => parseFloat(s.mbps.toFixed(2)));
        measuredAny = true;
      }
    } catch (e) {}

    // ---------- 负载延迟/抖动: 背景传输期间并发探测 (SpeedTest 同款, 含并发性自检) ----------
    const medianNum = (nums) => {
      if (!nums.length) return null;
      const s = [...nums].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
    };
    const summarizeLoaded = (times) => {
      if (!times || times.length < 2) return null;
      let dsum = 0;
      for (let i = 1; i < times.length; i++) dsum += Math.abs(times[i] - times[i - 1]);
      return { ping: medianNum(times), jitter: parseFloat((dsum / (times.length - 1)).toFixed(1)) };
    };
    let engineParallel = null;
    const probeParallel = async () => {
      const one = async () => {
        const t = Date.now();
        try {
          const r = await http.get(node.pingUrl, { timeout: 2000 });
          if (r && r.status === 200) return Date.now() - t;
        } catch (e) {}
        return null;
      };
      const single = await one();
      if (single == null) return true;
      const t0 = Date.now();
      const rs = await Promise.all([one(), one()]);
      if (rs[0] == null || rs[1] == null) return true;
      return (Date.now() - t0) < single * 1.6;
    };
    const measureLoaded = async (startBg, idlePing) => {
      if (engineParallel === null) engineParallel = await probeParallel();
      let bgDone = false;
      let bgResult = null;
      const spans = [];
      const beginSpan = () => {
        const s = [Date.now(), Infinity];
        spans.push(s);
        return () => { s[1] = Date.now(); };
      };
      const bgPromise = (async () => {
        try { bgResult = await startBg(beginSpan); } catch (e) {}
        bgDone = true;
      })();
      const maxDur = Math.min(2500, Math.max(800, (idlePing || 250) * 4 + 200));
      const times = [];
      if (engineParallel) {
        for (let i = 0; i < 4; i++) {
          if (bgDone) break;
          const wasLoading = !bgDone;
          const t0 = Date.now();
          let ok = false;
          try {
            const resp = await http.get(node.pingUrl, { timeout: 2000 });
            ok = !!resp && resp.status === 200;
          } catch (e) { ok = false; }
          const dt = Date.now() - t0;
          const overlapped = spans.some(([a, b]) => t0 < b && a < t0 + dt);
          if (ok && wasLoading && dt <= maxDur && overlapped) times.push(dt);
        }
      }
      await bgPromise;
      return { times, bgResult };
    };

    // ---------- 下载负载延迟 (↓): 背景下载顺带作为一个额外测速样本 ----------
    try {
      if (dlSamples.length > 0 && Date.now() - measureStart < 18000) {
        const { times, bgResult } = await measureLoaded(async (beginSpan) => {
          const t0 = Date.now();
          let total = 0;
          while (Date.now() - t0 < 2200 && total < 40000000) {
            const endSpan = beginSpan();
            const r = await fetchDownload(dlUrl(node, 1000000), 6000);
            endSpan();
            if (!r) break;
            total += r.bytes;
          }
          const sec = (Date.now() - t0) / 1000;
          if (total > 0 && sec > 0.2) return { bytes: total, mbps: (total * 8) / sec / 1e6, seconds: sec };
          return null;
        }, data.ping);
        if (bgResult) {
          dlSamples.push(bgResult);
          data.dl = parseFloat(p90(headlinePool(dlSamples)).toFixed(1));
          data.dlS = dlSamples.map(s => parseFloat(s.mbps.toFixed(2)));
        }
        const L = summarizeLoaded(times);
        if (L) { data.dlPing = L.ping; data.dlJitter = L.jitter; }
      }
    } catch (e) {}

    // ---------- 3) 上传测速: 阶梯多样本采样 (SpeedTest 同款) ----------
    const UL_PLAN = [100000, 100000, 300000, 300000, 1000000, 1000000, 3000000];
    const ulSamples = [];
    try {
      if (typeof http.post === "function") {
        const ulPhaseStart = Date.now();
        for (const planBytes of UL_PLAN) {
          if (Date.now() - measureStart > 26000) break;
          let sample = null;
          try {
            const t0 = Date.now();
            const resp = await http.post(ulUrl(node), { headers: { "Cache-Control": "no-cache", "Content-Type": "application/octet-stream" }, body: ulBody(planBytes), timeout: 8000 });
            const seconds = (Date.now() - t0) / 1000;
            if (resp && resp.status === 200 && seconds > 0) {
              sample = { bytes: planBytes, mbps: (planBytes * 8) / seconds / 1e6, seconds };
              ulSamples.push(sample);
            }
          } catch (e) { break; }
          if (!sample) break;
          if (Date.now() - ulPhaseStart > 7000) break;
          if (sample.seconds > 3.5) break;
        }
        if (ulSamples.length > 0) {
          data.ul = parseFloat(p90(headlinePool(ulSamples)).toFixed(2));
          data.ulS = ulSamples.map(s => parseFloat(s.mbps.toFixed(2)));
          measuredAny = true;
        }
      }
    } catch (e) {}

    // ---------- 上传负载延迟 (↑) ----------
    try {
      if (ulSamples.length > 0 && typeof http.post === "function" && Date.now() - measureStart < 24000) {
        const { times } = await measureLoaded(async (beginSpan) => {
          const t0 = Date.now();
          const chunk = ulBody(500000);
          let total = 0;
          while (Date.now() - t0 < 2200 && total < 16000000) {
            const endSpan = beginSpan();
            try {
              const resp = await http.post(ulUrl(node), { headers: { "Cache-Control": "no-cache", "Content-Type": "application/octet-stream" }, body: chunk, timeout: 6000 });
              endSpan();
              if (!resp || resp.status !== 200) break;
              total += 500000;
            } catch (e) { endSpan(); break; }
          }
          return null;
        }, data.ping);
        const L = summarizeLoaded(times);
        if (L) { data.ulPing = L.ping; data.ulJitter = L.jitter; }
      }
    } catch (e) {}
  }

  if (measuredAny) {
    data.ts = Date.now();
    data.netName = netName;
    data.netDetail = netDetail;
    try { ctx.storage.setJSON(CACHE_KEY, data); } catch (e) {}
  }

  // ---------- 渲染 (SpeedTest 同款版式) ----------
  const infoIcon = () => ({ type: "image", src: "sf-symbol:info.circle", width: 10, height: 10, color: C.sub });
  const StatBlock = (title, value, unit, valSize) => {
    const valChildren = [
      { type: "text", text: String(value), font: { size: valSize, weight: "heavy" }, textColor: C.text, maxLines: 1, minScale: 0.5 },
    ];
    if (unit) valChildren.push({ type: "text", text: unit, font: { size: 12, weight: "bold" }, textColor: C.text, maxLines: 1 });
    return {
      type: "stack", direction: "column", gap: 2,
      children: [
        { type: "stack", direction: "row", alignItems: "center", gap: 4, children: [
          { type: "text", text: title, font: { size: 12, weight: "bold" }, textColor: C.text, maxLines: 1, minScale: 0.7 },
          infoIcon(),
        ] },
        { type: "stack", direction: "row", alignItems: "center", gap: 4, children: valChildren },
      ],
    };
  };
  const MiniStat = (title, value, unit) => ({
    type: "stack", direction: "column", gap: 1,
    children: [
      { type: "text", text: title, font: { size: 10, weight: "bold" }, textColor: C.sub, maxLines: 1 },
      { type: "stack", direction: "row", alignItems: "center", gap: 3, children: [
        { type: "text", text: String(value), font: { size: 14, weight: "heavy" }, textColor: C.text, maxLines: 1, minScale: 0.6 },
        { type: "text", text: unit, font: { size: 9, weight: "bold" }, textColor: C.text, maxLines: 1 },
      ] },
    ],
  });
  const svgURI = (svg) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  const sparkline = (samples, color, width, height) => {
    if (!samples || samples.length < 2) return null;
    const peak = p90(samples);
    const max = Math.max(...samples, peak) * 1.12;
    const stepX = width / (samples.length - 1);
    const X = (i) => (i * stepX).toFixed(1);
    const Y = (v) => (height - 2 - (v / max) * (height - 8)).toFixed(1);
    const pts = samples.map((v, i) => `${X(i)},${Y(v)}`).join(" ");
    const area = `0,${height} ${pts} ${width},${height}`;
    const p90y = Y(peak);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><polygon points="${area}" fill="${color}" opacity="0.16"/><line x1="0" y1="${p90y}" x2="${width}" y2="${p90y}" stroke="#8E8E93" stroke-width="1" stroke-dasharray="4 3"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
    return { type: "image", src: svgURI(svg), width, height };
  };

  const shownTime = data.ts ? new Date(data.ts) : new Date();
  const timeStr = `${String(shownTime.getHours()).padStart(2, "0")}:${String(shownTime.getMinutes()).padStart(2, "0")}`;
  const plValue = (typeof data.pl === "number") ? data.pl : "-";
  const plUnit = (typeof data.pl === "number") ? "%" : "";
  const nodeShort = [data.nodeProv, data.nodeCity].filter(Boolean).join(" ") + (data.nodeOp ? ` · ${data.nodeOp}` : "");
  const dispNetName = data.netName || netName;
  const dispNetDetail = (data.netDetail !== undefined && data.netDetail !== null) ? data.netDetail : netDetail;

  const makeHeader = (compact) => ({
    type: "stack", direction: "column", gap: compact ? 4 : 8,
    children: [
      { type: "stack", direction: "row", alignItems: "center", gap: compact ? 5 : 8, children: compact ? [
        { type: "image", src: "sf-symbol:hare.fill", width: 15, height: 15, color: "#E48525" },
        { type: "text", text: "本地测速", font: { size: 15, weight: "heavy" }, textColor: TITLE_C, maxLines: 1, minScale: 0.7 },
        { type: "spacer" },
        { type: "text", text: timeStr, font: { size: 11, weight: "medium" }, textColor: C.sub, maxLines: 1 },
      ] : [
        { type: "image", src: "sf-symbol:hare.fill", width: 22, height: 22, color: "#E48525" },
        { type: "text", text: "本地测速", font: { size: 22, weight: "heavy" }, textColor: TITLE_C, maxLines: 1, minScale: 0.7 },
        { type: "spacer" },
        { type: "text", text: `time ${timeStr}`, font: { size: 12, weight: "medium" }, textColor: C.sub, maxLines: 1 },
      ] },
      { type: "stack", height: compact ? 1 : 2, backgroundColor: C.line },
    ],
  });

  let content;
  let padding = 18;

  if (isLarge) {
    const CHART_W = 336;
    const dlChart = sparkline(data.dlS, DL_C, CHART_W, 38);
    const ulChart = sparkline(data.ulS, UL_C, CHART_W, 30);
    padding = 14;
    const cfLabel = (title) => ({
      type: "stack", direction: "row", alignItems: "center", gap: 4,
      children: [
        { type: "text", text: title, font: { size: 13, weight: "bold" }, textColor: C.text, maxLines: 1 },
        infoIcon(),
      ],
    });
    const cfBig = (value, unit, size) => ({
      type: "stack", direction: "row", alignItems: "end", gap: 5,
      children: [
        { type: "text", text: String(value), font: { size, weight: "heavy" }, textColor: C.text, maxLines: 1, minScale: 0.5 },
        { type: "text", text: unit, font: { size: 13, weight: "bold" }, textColor: C.text, maxLines: 1 },
      ],
    });
    const p90Caption = { type: "text", text: "90th percentile", font: { size: 8, weight: "medium" }, textColor: C.sub, maxLines: 1 };
    const loadedRow = (arrow, val, color) => ({
      type: "stack", direction: "row", alignItems: "center", gap: 3,
      children: [
        { type: "text", text: arrow, font: { size: 10, weight: "bold" }, textColor: color, maxLines: 1 },
        { type: "text", text: `${val} ms`, font: { size: 10, weight: "medium" }, textColor: C.text, maxLines: 1 },
      ],
    });
    const cfMini = (title, value, unit, dlLoaded, ulLoaded) => {
      const kids = [
        cfLabel(title),
        { type: "stack", direction: "row", alignItems: "end", gap: 3, children: [
          { type: "text", text: String(value), font: { size: 18, weight: "heavy" }, textColor: C.text, maxLines: 1, minScale: 0.5 },
          { type: "text", text: unit, font: { size: 11, weight: "bold" }, textColor: C.text, maxLines: 1 },
        ] },
      ];
      if (dlLoaded !== null && dlLoaded !== undefined) kids.push(loadedRow("↓", dlLoaded, DL_C));
      if (ulLoaded !== null && ulLoaded !== undefined) kids.push(loadedRow("↑", ulLoaded, UL_C));
      return { type: "stack", direction: "column", alignItems: "start", gap: 2, flex: 1, children: kids };
    };
    const dlLeftKids = [cfLabel("Download"), cfBig(data.dl, "Mbps", 40)];
    if (dlChart) dlLeftKids.push(p90Caption);
    // 右上信息块: 本次测速点 + 本地网络 (SpeedTest 里是线路 IP 信息的位置)
    const infoKids = [];
    if (data.diag) {
      infoKids.push({ type: "text", text: "取点失败", font: { size: 12.5, weight: "bold" }, textColor: "#FF9F0A", maxLines: 1, minScale: 0.55 });
      infoKids.push({ type: "text", text: String(data.diag).replace(/^取点失败: /, ""), font: { size: 9.5, weight: "medium" }, textColor: C.sub, maxLines: 1, minScale: 0.6 });
    } else if (nodeShort) {
      infoKids.push({ type: "text", text: nodeShort, font: { size: 12.5, weight: "bold" }, textColor: C.text, maxLines: 1, minScale: 0.55 });
      const srcLine = [data.nodeSrc, data.dist ? `约 ${data.dist} km` : ""].filter(Boolean).join(" · ");
      if (srcLine) infoKids.push({ type: "text", text: srcLine, font: { size: 9.5, weight: "medium" }, textColor: C.text, maxLines: 1, minScale: 0.65 });
    }
    const locLine = [dispNetName, dispNetDetail].filter(Boolean).join(" ");
    if (locLine) infoKids.push({ type: "text", text: locLine, font: { size: 9, weight: "medium" }, textColor: C.sub, maxLines: 1, minScale: 0.65 });
    const ipLine = [localIP ? `本地 ${localIP}` : "", iface].filter(Boolean).join(" · ");
    if (ipLine) infoKids.push({ type: "text", text: ipLine, font: { size: 9, weight: "medium" }, textColor: C.sub, maxLines: 1, minScale: 0.65 });
    let dlHeadNode;
    if (infoKids.length) {
      dlHeadNode = { type: "stack", direction: "row", alignItems: "start", gap: 8, children: [
        { type: "stack", direction: "column", alignItems: "start", gap: 3, children: dlLeftKids },
        { type: "spacer" },
        { type: "stack", direction: "column", alignItems: "start", gap: 2, width: 148, children: infoKids },
      ] };
    } else {
      dlHeadNode = { type: "stack", direction: "column", alignItems: "start", gap: 3, children: dlLeftKids };
    }
    const dlKids = [dlHeadNode];
    if (dlChart) dlKids.push(dlChart);
    const ulKids = [cfLabel("Upload"), cfBig(data.ul, "Mbps", 26)];
    if (ulChart) { ulKids.push(p90Caption); ulKids.push(ulChart); }
    content = [
      makeHeader(false),
      { type: "spacer", length: 6 },
      { type: "stack", direction: "column", alignItems: "start", gap: 3, children: dlKids },
      { type: "spacer", length: 8 },
      { type: "stack", height: 1, backgroundColor: C.divider },
      { type: "spacer", length: 6 },
      { type: "stack", direction: "column", alignItems: "start", gap: 3, children: ulKids },
      { type: "spacer", length: 18 },
      { type: "stack", direction: "row", alignItems: "start", gap: 8, children: [
        cfMini("Latency", data.ping, "ms", data.dlPing, data.ulPing),
        cfMini("Jitter", data.jitter, "ms", data.dlJitter, data.ulJitter),
        cfMini("Packet Loss", plValue, plUnit, null, null),
      ] },
    ];
  } else if (isMedium) {
    content = [
      makeHeader(false),
      { type: "spacer", length: 8 },
      { type: "stack", direction: "row", alignItems: "center", gap: 6, children: [
        { type: "text", text: "您的网络速度", font: { size: 14, weight: "bold" }, textColor: C.text, maxLines: 1 },
        { type: "spacer" },
        { type: "text", text: data.diag ? "取点失败" : nodeShort, font: { size: 10, weight: "medium" }, textColor: C.sub, maxLines: 1, minScale: 0.7 },
      ] },
      { type: "spacer", length: 8 },
      { type: "stack", direction: "row", alignItems: "center", children: [
        { type: "stack", flex: 1, children: [StatBlock("下载速度", data.dl, "Mbps", 36)] },
        { type: "spacer", length: 8 },
        { type: "stack", direction: "column", flex: 1, gap: 6, children: [
          StatBlock("上传速度", data.ul, "Mbps", 16),
          StatBlock("网络延迟", data.ping, "ms", 16),
          { type: "stack", direction: "row", alignItems: "center", gap: 4, children: [
            { type: "text", text: "丢包率", font: { size: 12, weight: "bold" }, textColor: C.text, maxLines: 1 },
            { type: "text", text: `${plValue}${plUnit}`, font: { size: 16, weight: "heavy" }, textColor: C.text, maxLines: 1 },
          ] },
        ] },
      ] },
    ];
  } else {
    padding = 12;
    content = [
      makeHeader(true),
      { type: "spacer", length: 4 },
      { type: "stack", direction: "row", alignItems: "center", gap: 4, children: [
        { type: "text", text: [dispNetName, dispNetDetail].filter(Boolean).join(" "), font: { size: 9, weight: "medium" }, textColor: C.sub, maxLines: 1, minScale: 0.7 },
        { type: "spacer" },
        { type: "text", text: data.diag ? "取点失败" : nodeShort, font: { size: 9, weight: "medium" }, textColor: C.sub, maxLines: 1, minScale: 0.7 },
      ] },
      { type: "spacer", length: 6 },
      { type: "stack", direction: "column", gap: 1, children: [
        { type: "text", text: "下载速度", font: { size: 11, weight: "bold" }, textColor: C.sub, maxLines: 1 },
        { type: "stack", direction: "row", alignItems: "center", gap: 4, children: [
          { type: "text", text: String(data.dl), font: { size: 30, weight: "heavy" }, textColor: C.text, maxLines: 1, minScale: 0.6 },
          { type: "text", text: "Mbps", font: { size: 11, weight: "bold" }, textColor: C.text, maxLines: 1 },
        ] },
      ] },
      { type: "spacer", length: 8 },
      { type: "stack", direction: "row", gap: 8, children: [
        { type: "stack", flex: 1, children: [MiniStat("上传", data.ul, "Mbps")] },
        { type: "stack", flex: 1, children: [MiniStat("延迟", data.ping, "ms")] },
      ] },
      { type: "spacer", length: 6 },
      { type: "stack", direction: "row", gap: 8, children: [
        { type: "stack", flex: 1, children: [MiniStat("抖动", data.jitter, "ms")] },
        { type: "stack", flex: 1, children: [MiniStat("丢包率", plValue, plUnit)] },
      ] },
    ];
  }

  return {
    type: "widget",
    padding,
    backgroundColor: C.bg,
    children: content,
  };
}
