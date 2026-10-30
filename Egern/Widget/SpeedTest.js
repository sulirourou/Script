/**
* 📌 桌面小组件: Speedtest 极简官方复刻版
* 版本：v2.3 (2026-10-30)
*
* 🔧 v2.3 变更 (负载延迟 + 大号版式再调整):
* 1. 新增负载延迟/抖动 (CF 的 ↓/↑ 两行): 在一笔按实测速度定制的背景下载/上传进行期间
*    并发发探测取中位数。带自检: 样本必须在背景传输未结束时发起, 且耗时不超过
*    空载延迟*4+200ms 才采信; 若 Egern 引擎把请求串行化导致测不到, 自动不出数, 不凑假数。
* 2. 大号版式: Latency/Jitter/Packet Loss 从底部整行移到 Download 右侧空白区 (纵向三组,
*    ↓/↑ 小字跟在各自指标下方), 底部行取消, 上传曲线下方不再拥挤。
*
* 🔧 v2.2 变更 (大号高度修正):
* v2.1 大号内容总高超出组件高度, 底部 Latency/Jitter/Packet Loss 只剩标签、数值被裁掉。
* 本版压缩大号: 去掉「您的网络速度」标题行 (CF 官方版式本就没有)、内边距 18->14、
* 下载图 50->42 / 上传图 42->34、下载数字 46->42 / 上传数字 32->28、底部数值 22->20,
* 间距整体收紧; 各区块改为左对齐 (v2.1 在真机上是居中, 与 CF 版式不符)。
*
* 🔧 v2.1 变更 (大号仿 Cloudflare 官方版式):
* 1. 大号改成 speed.cloudflare.com 的纵向版式: Download 大数字 + 曲线图、Upload 数字 + 曲线图,
*    底部 Latency / Jitter / Packet Loss 三列; 标签用 CF 官方英文原词。
* 2. 测速方法同步换成 CF 的多样本阶梯采样: 下载从 0.1MB 逐级加大到 10MB、上传同理,
*    头条数字取样本的 90 百分位 (图中灰色虚线就是它), 不再用单个 3MiB 样本定终身。
* 3. 曲线图由每次的样本现场生成 SVG (橙=下载, 紫=上传); 样本随缓存一起存, 读缓存时图也还在。
* 4. 耗时与流量有上限: 下载阶段约 9 秒 / 上传约 7 秒封顶, 单个样本超过 3 秒就停;
*    最坏情况约下载 21MB、上传 7MB 流量。中号/小号版式与口径不变 (共用同一个头条数字)。
*
* 📊 全面适配: 小号 / 中号 / 大号组件 (各有独立布局) | 浅色 / 深色模式
*
* 🔧 v2.0 修复内容 (相对 v1.9):
* 1. 丢包率不再写死 '-': 改为应用层探测 ---- 向 Cloudflare generate_204 发 8 次请求,
* 超时/非 204 记为丢失, 丢包率 = 丢失数 / 总数。iOS 上测不了 ICMP ping 丢包,
* 这是 HTTP 层等效值, 含义是"请求失败率", 已足够反映网络质量。
* 2. 延迟/抖动不再把失败请求的时间也算进去 (旧版失败一次就把 3000ms 超时计入平均,
* 延迟会被严重放大); 抖动改为相邻成功样本差值的平均 (业界通用定义)。
* 3. 下载测速必须把响应体真正读完 (arrayBuffer) 再按实际字节数算速度;
* 旧版拿到响应就停表, 测到的往往只是响应头到达时间, 数值失真。
* 同时去掉 dlTime > 0.1 的判断 ---- 旧版网速快到 3MB 在 0.1s 内下完反而显示 0。
* 4. 小号 (systemSmall) 使用专用紧凑布局: 旧版小号直接套中号的双列大字布局,
* 宽度不够导致标题截断、Mbps 换行、两列互相挤压。
* 5. 大号布局左右两列顶部对齐 (旧版左列被垂直居中, 上传速度会飘到中间偏下)。
* 6. 缓存带时间戳: 测速失败时显示的是上次数据 + 上次的时间, 不再冒充当前结果。
* 7. HTTP 状态码会校验 (旧版 404/500 也算成功), InfoIcon 改为工厂函数避免节点复用。
*
* 📖 ：
* 1. 颜色修改：在下方的 CONFIG.color 中修改，支持十六进制色号（如红色的 '#FF0000'）。
* 2. 字体大小：在下方的 CONFIG.size 中修改对应数值即可。
* 3. 浅/深色模式：带有 Light 的是白天模式颜色，带有 Dark 的是黑夜模式颜色。
* 4. 建议在 Egern 的脚本设置里把本脚本超时调到 30 秒 (默认 10 秒在弱网下可能被中途杀掉)。
*/

export default async function(ctx) {
// ==========================================
// 🛠️ 用户配置区 (可自由修改以下参数)
// ==========================================
const CONFIG = {
// 1. 颜色配置
color: {
rabbit: '#E48525', // 🐰 兔子图标颜色 (默认专属橙色)
titleLight: '#E48525', // 📝 标题文字颜色 - 浅色模式
titleDark: '#4DA2FF', // 📝 标题文字颜色 - 深色模式

bgLight: '#FFFFFF', // 🎨 背景颜色 - 浅色模式
bgDark: '#000000', // 🎨 背景颜色 - 深色模式
textLight: '#000000', // 📊 主要数据文字 - 浅色模式
textDark: '#FFFFFF', // 📊 主要数据文字 - 深色模式

subText: '#8E8E93', // ℹ️ 灰色小图标及时间颜色
lineLight: '#000000', // ➖ 顶部粗横线颜色 - 浅色
lineDark: '#FFFFFF', // ➖ 顶部粗横线颜色 - 深色
dividerLight: '#E5E5EA', // 〰️ 中间细分割线 - 浅色
dividerDark: '#333333', // 〰️ 中间细分割线 - 深色
dlLine: '#F6821F', // 📈 下载曲线颜色 (Cloudflare 橙)
ulLine: '#A03FF0' // 📈 上传曲线颜色 (Cloudflare 紫)
},

// 2. 字体大小配置
size: {
header: 22, // 顶部 "Speed Test" 标题大小
time: 12, // ⏱️ 右上角刷新时间大小
sectionTitle: 16, // "您的网络速度" 字体大小
dlNumLarge: 48, // [大组件] 下载数字大小
ulNumLarge: 28, // [大组件] 上传数字大小
pingNumLarge: 24, // [大组件] 延迟/抖动数字大小
dlNumMedium: 36, // [中组件] 下载数字大小
ulNumMedium: 16 // [中组件] 上传/延迟数字大小
}
};
// ==========================================
// 🛑 配置区结束，非核心开发者请勿修改下方代码
// ==========================================

// 提取配置颜色
const C = {
bg: { light: CONFIG.color.bgLight, dark: CONFIG.color.bgDark},
text: { light: CONFIG.color.textLight, dark: CONFIG.color.textDark},
sub: { light: CONFIG.color.subText, dark: CONFIG.color.subText},
line: { light: CONFIG.color.lineLight, dark: CONFIG.color.lineDark},
divider: { light: CONFIG.color.dividerLight, dark: CONFIG.color.dividerDark}
};

const family = ctx.widgetFamily || 'systemMedium';
const isLarge = family === 'systemLarge' || family === 'systemExtraLarge';
const isMedium = family === 'systemMedium';
const isSmall =!isLarge &&!isMedium; // systemSmall 及锁屏尺寸都走紧凑布局
const CACHE_KEY = 'speedtest_cache_v5';

// pl: 数字 = 丢包率百分比; '-' = 一次都没测成 (无缓存且探测全失败到无法统计时仍会给 100, 见下方)
let data = { dl: 0, ul: 0, ping: 0, jitter: 0, pl: '-', ts: 0, dlS: [], ulS: [], dlPing: null, dlJitter: null, ulPing: null, ulJitter: null};

try {
const cached = ctx.storage.getJSON(CACHE_KEY);
if (cached && typeof cached.dl === 'number') data = cached;
} catch (e) {}

const measureStart = Date.now();
let measuredAny = false;

// 90 百分位 (最近秩法): Cloudflare 官方头条数字的口径
const p90 = (nums) => {
if (!nums || nums.length === 0) return 0;
const s = [...nums].sort((a, b) => a - b);
return s[Math.min(s.length - 1, Math.ceil(0.9 * s.length) - 1)];
};
// 头条取值池: 优先用 >=512KB 的样本 (小样本被延迟主导, 不代表带宽), 不足 2 个才用全部
const headlinePool = (samples) => {
const big = samples.filter(s => s.bytes >= 512000).map(s => s.mbps);
return big.length >= 2 ? big : samples.map(s => s.mbps);
};

// ---------- 1) 延迟 / 抖动 / 丢包率: 8 次顺序探测 ----------
// 顺序发是为了延迟样本互不干扰; 总预算 6.5 秒, 超过就用已采到的样本收尾,
// 避免弱网下光探测就把脚本超时耗完。
try {
const PROBES = 8;
const PROBE_BUDGET_MS = 6500;
const samples = []; // 成功样本的耗时 (ms), 按探测顺序
let sent = 0;
for (let i = 0; i < PROBES; i++) {
if (i >= 3 && Date.now() - measureStart > PROBE_BUDGET_MS) break;
sent++;
const pt = Date.now();
let ok = false;
try {
const resp = await ctx.http.get('https://cp.cloudflare.com/generate_204', { timeout: 2000});
ok =!!resp && resp.status === 204;
} catch (e) { ok = false;}
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
} else {
data.jitter = 0;
}
}
} catch (e) {}

// ---------- 2) 下载测速: 阶梯多样本采样 (仿 Cloudflare) ----------
// 从 0.1MB 逐级加大, 每个样本都把响应体真正读完再按实际字节数算速;
// 下载阶段约 9 秒封顶, 单样本超过 3 秒说明该尺寸已够测准, 停。
const DL_PLAN = [100000, 100000, 500000, 500000, 1000000, 1000000, 3000000, 5000000, 10000000];
const dlSamples = []; // {bytes, mbps, seconds}
try {
const dlPhaseStart = Date.now();
for (const planBytes of DL_PLAN) {
if (Date.now() - measureStart > 22000) break;
let sample = null;
try {
const t0 = Date.now();
const resp = await ctx.http.get(`https://speed.cloudflare.com/__down?bytes=${planBytes}&r=${t0}`, {
headers: { 'Cache-Control': 'no-cache'},
timeout: 10000
});
if (resp && resp.status === 200) {
const buf = await resp.arrayBuffer(); // 等 body 全部下完才停表
const seconds = (Date.now() - t0) / 1000;
if (buf && buf.byteLength > 0 && seconds > 0) {
sample = { bytes: buf.byteLength, mbps: (buf.byteLength * 8) / seconds / 1e6, seconds};
dlSamples.push(sample);
}
}
} catch (e) { break; }
if (!sample) break;
if (Date.now() - dlPhaseStart > 9000) break;
if (sample.seconds > 3) break;
}
if (dlSamples.length > 0) {
data.dl = parseFloat(p90(headlinePool(dlSamples)).toFixed(1));
data.dlS = dlSamples.map(s => parseFloat(s.mbps.toFixed(2)));
measuredAny = true;
}
} catch (e) {}

// ---------- 负载延迟/抖动: 背景传输期间并发探测 (CF 的 ↓/↑) ----------
// 先不 await 地发起一笔背景传输, 在它进行期间发 generate_204 探测。
// 自检: 样本必须在背景传输未结束时发起, 且耗时 <= 空载延迟*4+200ms 才采信
// (串行引擎下探测被排队到背景传输之后, 耗时爆表, 自动丢弃); 有效样本 >= 2 才出数。
const medianNum = (nums) => {
if (!nums.length) return null;
const s = [...nums].sort((a, b) => a - b);
const m = Math.floor(s.length / 2);
return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const summarizeLoaded = (times) => {
if (!times || times.length < 2) return null;
let jitter = 0;
let dsum = 0;
for (let i = 1; i < times.length; i++) dsum += Math.abs(times[i] - times[i - 1]);
jitter = parseFloat((dsum / (times.length - 1)).toFixed(1));
return { ping: medianNum(times), jitter};
};
const measureLoaded = async (startBg, idlePing) => {
let bgDone = false;
let bgResult = null;
const bgPromise = (async () => {
try { bgResult = await startBg(); } catch (e) {}
bgDone = true;
})();
const maxDur = Math.min(2500, Math.max(800, (idlePing || 250) * 4 + 200));
const times = [];
for (let i = 0; i < 4; i++) {
if (bgDone) break;
const wasLoading = !bgDone;
const t0 = Date.now();
let ok = false;
try {
const resp = await ctx.http.get('https://cp.cloudflare.com/generate_204', { timeout: 2000});
ok = !!resp && resp.status === 204;
} catch (e) { ok = false; }
const dt = Date.now() - t0;
if (ok && wasLoading && dt <= maxDur) times.push(dt);
}
await bgPromise;
return { times, bgResult };
};

// ---------- 下载负载延迟 (↓): 背景下载顺带作为一个额外测速样本 ----------
try {
if (dlSamples.length > 0 && Date.now() - measureStart < 18000) {
const estMbps = data.dl > 0 ? data.dl : 50;
const bgBytes = Math.round(Math.min(20000000, Math.max(2000000, estMbps * 1e6 / 8 * 2)));
const { times, bgResult } = await measureLoaded(async () => {
const t0 = Date.now();
const resp = await ctx.http.get(`https://speed.cloudflare.com/__down?bytes=${bgBytes}&r=${t0}`, {
headers: { 'Cache-Control': 'no-cache'},
timeout: 15000
});
if (resp && resp.status === 200) {
const buf = await resp.arrayBuffer();
const sec = (Date.now() - t0) / 1000;
if (buf && buf.byteLength > 0 && sec > 0.2) {
return { bytes: buf.byteLength, mbps: (buf.byteLength * 8) / sec / 1e6, seconds: sec };
}
}
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

// ---------- 3) 上传测速: 阶梯多样本采样 (仿 Cloudflare) ----------
const UL_PLAN = [100000, 100000, 300000, 300000, 1000000, 1000000, 3000000];
const ulSamples = []; // {bytes, mbps, seconds}
try {
if (typeof ctx.http.post === 'function') {
const ulPhaseStart = Date.now();
for (const planBytes of UL_PLAN) {
if (Date.now() - measureStart > 26000) break;
let sample = null;
try {
const payload = '0'.repeat(planBytes); // ASCII 每字符 1 字节
const t0 = Date.now();
const resp = await ctx.http.post('https://speed.cloudflare.com/__up', {
headers: { 'Cache-Control': 'no-cache', 'Content-Type': 'text/plain'},
body: payload,
timeout: 8000
});
const seconds = (Date.now() - t0) / 1000;
if (resp && resp.status === 200 && seconds > 0) {
sample = { bytes: planBytes, mbps: (planBytes * 8) / seconds / 1e6, seconds};
ulSamples.push(sample);
}
} catch (e) { break; }
if (!sample) break;
if (Date.now() - ulPhaseStart > 7000) break;
if (sample.seconds > 3) break;
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
if (ulSamples.length > 0 && typeof ctx.http.post === 'function' && Date.now() - measureStart < 24000) {
const estMbps = data.ul > 0 ? data.ul : 20;
const bgBytes = Math.round(Math.min(8000000, Math.max(500000, estMbps * 1e6 / 8 * 2)));
const { times } = await measureLoaded(async () => {
const payload = '0'.repeat(bgBytes);
await ctx.http.post('https://speed.cloudflare.com/__up', {
headers: { 'Cache-Control': 'no-cache', 'Content-Type': 'text/plain'},
body: payload,
timeout: 12000
});
return null;
}, data.ping);
const L = summarizeLoaded(times);
if (L) { data.ulPing = L.ping; data.ulJitter = L.jitter; }
}
} catch (e) {}

if (measuredAny) {
data.ts = Date.now();
try { ctx.storage.setJSON(CACHE_KEY, data);} catch (e) {}
}

// ---------- 渲染 ----------
// InfoIcon 用工厂函数: 每次生成新节点对象, 避免同一对象被多处引用时渲染器串位
const infoIcon = () => ({ type: 'image', src: 'sf-symbol:info.circle', width: 10, height: 10, color: C.sub});

const StatBlock = (title, value, unit, valSize) => {
const valChildren = [
{ type: 'text', text: String(value), font: { size: valSize, weight: 'heavy'}, textColor: C.text, maxLines: 1, minScale: 0.5}
];
if (unit) {
valChildren.push({ type: 'text', text: unit, font: { size: 12, weight: 'bold'}, textColor: C.text, maxLines: 1});
}
return {
type: 'stack', direction: 'column', gap: 2,
children: [
{
type: 'stack', direction: 'row', alignItems: 'center', gap: 4,
children: [
{ type: 'text', text: title, font: { size: 12, weight: 'bold'}, textColor: C.text, maxLines: 1, minScale: 0.7},
infoIcon()
]
},
{
type: 'stack', direction: 'row', alignItems: 'center', gap: 4,
children: valChildren
}
]
};
};

// 小号专用迷你指标: 无 info 图标, 数字与单位同行, 字号小
const MiniStat = (title, value, unit) => ({
type: 'stack', direction: 'column', gap: 1,
children: [
{ type: 'text', text: title, font: { size: 10, weight: 'bold'}, textColor: C.sub, maxLines: 1},
{
type: 'stack', direction: 'row', alignItems: 'center', gap: 3,
children: [
{ type: 'text', text: String(value), font: { size: 14, weight: 'heavy'}, textColor: C.text, maxLines: 1, minScale: 0.6},
{ type: 'text', text: unit, font: { size: 9, weight: 'bold'}, textColor: C.text, maxLines: 1}
]
}
]
});

// ---------- 曲线图: 由样本现场生成 SVG (与网络诊断雷达同款 data-URI 图片渲染) ----------
const svgURI = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
const sparkline = (samples, color, width, height) => {
if (!samples || samples.length < 2) return null;
const peak = p90(samples);
const max = Math.max(...samples, peak) * 1.12;
const stepX = width / (samples.length - 1);
const X = (i) => (i * stepX).toFixed(1);
const Y = (v) => (height - 2 - (v / max) * (height - 8)).toFixed(1);
const pts = samples.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
const area = `0,${height} ${pts} ${width},${height}`;
const p90y = Y(peak);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><polygon points="${area}" fill="${color}" opacity="0.16"/><line x1="0" y1="${p90y}" x2="${width}" y2="${p90y}" stroke="#8E8E93" stroke-width="1" stroke-dasharray="4 3"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
return { type: 'image', src: svgURI(svg), width: width, height: height};
};

// 时间显示的是"这份数据的测量时间": 本次测成功就是现在, 用的是缓存就显示缓存的时间
const shownTime = data.ts? new Date(data.ts): new Date();
const timeStr = `${String(shownTime.getHours()).padStart(2, '0')}:${String(shownTime.getMinutes()).padStart(2, '0')}`;

const plValue = (typeof data.pl === 'number')? data.pl: '-';
const plUnit = (typeof data.pl === 'number')? '%': '';

const makeHeader = (compact) => ({
type: 'stack', direction: 'column', gap: compact? 4: 8,
children: [
{
type: 'stack', direction: 'row', alignItems: 'center', gap: compact? 5: 8,
children: compact? [
{ type: 'image', src: 'sf-symbol:hare.fill', width: 15, height: 15, color: CONFIG.color.rabbit},
{ type: 'text', text: 'Speed Test', font: { size: 15, weight: 'heavy'}, textColor: { light: CONFIG.color.titleLight, dark: CONFIG.color.titleDark}, maxLines: 1, minScale: 0.7},
{ type: 'spacer'},
{ type: 'text', text: timeStr, font: { size: 11, weight: 'medium'}, textColor: C.sub, maxLines: 1}
]: [
{ type: 'image', src: 'sf-symbol:hare.fill', width: CONFIG.size.header, height: CONFIG.size.header, color: CONFIG.color.rabbit},
{ type: 'text', text: 'Speed Test', font: { size: CONFIG.size.header, weight: 'heavy'}, textColor: { light: CONFIG.color.titleLight, dark: CONFIG.color.titleDark}, maxLines: 1, minScale: 0.7},
{ type: 'spacer'},
{ type: 'text', text: `time ${timeStr}`, font: { size: CONFIG.size.time, weight: 'medium'}, textColor: C.sub, maxLines: 1}
]
},
{ type: 'stack', height: compact? 1: 2, backgroundColor: C.line}
]
});

let content;
let padding = 18;

if (isLarge) {
// ---------- 大号: 仿 speed.cloudflare.com 版式 (v2.3) ----------
// Download: 左侧标签+数字, 右侧三组指标 (Latency/Jitter/Packet Loss, 各带 ↓/↑ 负载小字),
// 下方全宽橙色曲线; Upload + 紫色曲线; 底部不再放指标行。
const CHART_W = 336;
const dlChart = sparkline(data.dlS, CONFIG.color.dlLine, CHART_W, 46);
const ulChart = sparkline(data.ulS, CONFIG.color.ulLine, CHART_W, 36);
padding = 14;

const cfLabel = (title) => ({
type: 'stack', direction: 'row', alignItems: 'center', gap: 4,
children: [
{ type: 'text', text: title, font: { size: 13, weight: 'bold'}, textColor: C.text, maxLines: 1},
infoIcon()
]
});
const cfBig = (value, unit, size) => ({
type: 'stack', direction: 'row', alignItems: 'end', gap: 5,
children: [
{ type: 'text', text: String(value), font: { size: size, weight: 'heavy'}, textColor: C.text, maxLines: 1, minScale: 0.5},
{ type: 'text', text: unit, font: { size: 13, weight: 'bold'}, textColor: C.text, maxLines: 1}
]
});
const p90Caption = { type: 'text', text: '90th percentile', font: { size: 8, weight: 'medium'}, textColor: C.sub, maxLines: 1};

// 负载小字行: ↓ = 下载负载 (橙箭头), ↑ = 上传负载 (紫箭头); 测到哪个显示哪个, 都没有则整行不渲染
const loadedLine = (dlVal, ulVal) => {
const kids = [];
if (dlVal !== null && dlVal !== undefined) {
kids.push({ type: 'text', text: '↓', font: { size: 9, weight: 'bold'}, textColor: CONFIG.color.dlLine, maxLines: 1});
kids.push({ type: 'text', text: `${dlVal} ms`, font: { size: 9, weight: 'medium'}, textColor: C.sub, maxLines: 1});
}
if (ulVal !== null && ulVal !== undefined) {
kids.push({ type: 'text', text: '↑', font: { size: 9, weight: 'bold'}, textColor: CONFIG.color.ulLine, maxLines: 1});
kids.push({ type: 'text', text: `${ulVal} ms`, font: { size: 9, weight: 'medium'}, textColor: C.sub, maxLines: 1});
}
if (!kids.length) return null;
return { type: 'stack', direction: 'row', alignItems: 'center', gap: 3, children: kids};
};
// 右侧指标组: 标签+数值同行, 负载小字跟在下方
const sideStat = (title, value, unit, sub) => {
const kids = [
{
type: 'stack', direction: 'row', alignItems: 'end', gap: 4,
children: [
{ type: 'text', text: title, font: { size: 11, weight: 'bold'}, textColor: C.text, maxLines: 1},
{ type: 'text', text: String(value), font: { size: 16, weight: 'heavy'}, textColor: C.text, maxLines: 1, minScale: 0.6},
{ type: 'text', text: unit, font: { size: 9, weight: 'bold'}, textColor: C.text, maxLines: 1}
]
}
];
if (sub) kids.push(sub);
return { type: 'stack', direction: 'column', alignItems: 'start', gap: 1, children: kids};
};
const metricsCol = {
type: 'stack', direction: 'column', alignItems: 'start', gap: 7,
children: [
sideStat('Latency', data.ping, 'ms', loadedLine(data.dlPing, data.ulPing)),
sideStat('Jitter', data.jitter, 'ms', loadedLine(data.dlJitter, data.ulJitter)),
sideStat('Packet Loss', plValue, plUnit, null)
]
};

const dlHead = {
type: 'stack', direction: 'row', alignItems: 'start', gap: 10,
children: [
{
type: 'stack', direction: 'column', alignItems: 'start', gap: 3, flex: 1,
children: dlChart ? [cfLabel('Download'), cfBig(data.dl, 'Mbps', 42), p90Caption] : [cfLabel('Download'), cfBig(data.dl, 'Mbps', 42)]
},
metricsCol
]
};
const ulKids = [cfLabel('Upload'), cfBig(data.ul, 'Mbps', 28)];
if (ulChart) { ulKids.push(p90Caption); ulKids.push(ulChart); }

content = [
makeHeader(false),
{ type: 'spacer', length: 10},
dlHead,
...(dlChart ? [{ type: 'spacer', length: 4}, dlChart] : []),
{ type: 'spacer', length: 10},
{ type: 'stack', height: 1, backgroundColor: C.divider},
{ type: 'spacer', length: 10},
{ type: 'stack', direction: 'column', alignItems: 'start', gap: 3, children: ulKids}
];
} else if (isMedium) {
content = [
makeHeader(false),
{ type: 'spacer', length: 8},
{ type: 'text', text: '您的网络速度', font: { size: Math.max(12, CONFIG.size.sectionTitle - 2), weight: 'bold'}, textColor: C.text},
{ type: 'spacer', length: 8},
{
type: 'stack', direction: 'row', alignItems: 'center',
children: [
{
type: 'stack', flex: 1, children: [StatBlock('下载速度', data.dl, 'Mbps', CONFIG.size.dlNumMedium)]
},
{ type: 'spacer', length: 8},
{
type: 'stack', direction: 'column', flex: 1, gap: 6,
children: [
StatBlock('上传速度', data.ul, 'Mbps', CONFIG.size.ulNumMedium),
StatBlock('网络延迟', data.ping, 'ms', CONFIG.size.ulNumMedium),
// 中号高度塞不下第三个完整 StatBlock, 丢包率用单行紧凑形式
{
type: 'stack', direction: 'row', alignItems: 'center', gap: 4,
children: [
{ type: 'text', text: '丢包率', font: { size: 12, weight: 'bold'}, textColor: C.text, maxLines: 1},
{ type: 'text', text: `${plValue}${plUnit}`, font: { size: CONFIG.size.ulNumMedium, weight: 'heavy'}, textColor: C.text, maxLines: 1}
]
}
]
}
]
}
];
} else {
// ---------- 小号专用布局: 单列下载 + 2x2 迷你指标, 无 info 图标, 无副标题 ----------
padding = 12;
content = [
makeHeader(true),
{ type: 'spacer', length: 6},
{
type: 'stack', direction: 'column', gap: 1,
children: [
{ type: 'text', text: '下载速度', font: { size: 11, weight: 'bold'}, textColor: C.sub, maxLines: 1},
{
type: 'stack', direction: 'row', alignItems: 'center', gap: 4,
children: [
{ type: 'text', text: String(data.dl), font: { size: 30, weight: 'heavy'}, textColor: C.text, maxLines: 1, minScale: 0.6},
{ type: 'text', text: 'Mbps', font: { size: 11, weight: 'bold'}, textColor: C.text, maxLines: 1}
]
}
]
},
{ type: 'spacer', length: 8},
{
type: 'stack', direction: 'row', gap: 8,
children: [
{ type: 'stack', flex: 1, children: [MiniStat('上传', data.ul, 'Mbps')]},
{ type: 'stack', flex: 1, children: [MiniStat('延迟', data.ping, 'ms')]}
]
},
{ type: 'spacer', length: 6},
{
type: 'stack', direction: 'row', gap: 8,
children: [
{ type: 'stack', flex: 1, children: [MiniStat('抖动', data.jitter, 'ms')]},
{ type: 'stack', flex: 1, children: [MiniStat('丢包率', plValue, plUnit)]}
]
}
];
}

return {
type: 'widget',
padding: padding,
backgroundColor: C.bg,
children: content
};
}
