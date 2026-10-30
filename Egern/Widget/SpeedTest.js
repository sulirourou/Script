/**
* 📌 桌面小组件: Speedtest 极简官方复刻版 (v2.0 修复版)
* 📊 全面适配: 小号 / 中号 / 大号组件 (各有独立布局) | 浅色 / 深色模式
*
* 🔧 v2.0 修复内容 (相对 v1.9):
* 1. 丢包率不再写死 '-': 改为应用层探测 —— 向 Cloudflare generate_204 发 8 次请求,
* 超时/非 204 记为丢失, 丢包率 = 丢失数 / 总数。iOS 上测不了 ICMP ping 丢包,
* 这是 HTTP 层等效值, 含义是"请求失败率", 已足够反映网络质量。
* 2. 延迟/抖动不再把失败请求的时间也算进去 (旧版失败一次就把 3000ms 超时计入平均,
* 延迟会被严重放大); 抖动改为相邻成功样本差值的平均 (业界通用定义)。
* 3. 下载测速必须把响应体真正读完 (arrayBuffer) 再按实际字节数算速度;
* 旧版拿到响应就停表, 测到的往往只是响应头到达时间, 数值失真。
* 同时去掉 dlTime > 0.1 的判断 —— 旧版网速快到 3MB 在 0.1s 内下完反而显示 0。
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
dividerDark: '#333333' // 〰️ 中间细分割线 - 深色
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
const CACHE_KEY = 'speedtest_cache_v3';

// pl: 数字 = 丢包率百分比; '-' = 一次都没测成 (无缓存且探测全失败到无法统计时仍会给 100, 见下方)
let data = { dl: 0, ul: 0, ping: 0, jitter: 0, pl: '-', ts: 0};

try {
const cached = ctx.storage.getJSON(CACHE_KEY);
if (cached && typeof cached.dl === 'number') data = cached;
} catch (e) {}

const measureStart = Date.now();
let measuredAny = false;

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

// ---------- 2) 下载测速: 读完响应体, 按实际字节数算 ----------
try {
const dlBytes = 3145728; // 3 MiB
const dlStart = Date.now();
const resp = await ctx.http.get(`https://speed.cloudflare.com/__down?bytes=${dlBytes}&r=${dlStart}`, {
headers: { 'Cache-Control': 'no-cache'},
timeout: 10000
});
if (resp && resp.status === 200) {
const buf = await resp.arrayBuffer(); // 关键: 等 body 全部下完才停表
const seconds = (Date.now() - dlStart) / 1000;
if (buf && buf.byteLength > 0 && seconds > 0) {
data.dl = parseFloat(((buf.byteLength * 8) / seconds / 1e6).toFixed(1));
measuredAny = true;
}
}
} catch (e) {}

// ---------- 3) 上传测速 ----------
try {
if (typeof ctx.http.post === 'function') {
const payload = '0'.repeat(512 * 1024); // 512 KiB, ASCII 每字符 1 字节
const ulStart = Date.now();
const resp = await ctx.http.post('https://speed.cloudflare.com/__up', {
headers: { 'Cache-Control': 'no-cache', 'Content-Type': 'text/plain'},
body: payload,
timeout: 8000
});
const seconds = (Date.now() - ulStart) / 1000;
if (resp && resp.status === 200 && seconds > 0) {
data.ul = parseFloat(((payload.length * 8) / seconds / 1e6).toFixed(2));
measuredAny = true;
}
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
content = [
makeHeader(false),
{ type: 'spacer', length: 12},
{ type: 'text', text: '您的网络速度', font: { size: CONFIG.size.sectionTitle, weight: 'bold'}, textColor: C.text},
{ type: 'spacer', length: 16},
StatBlock('下载速度', data.dl, 'Mbps', CONFIG.size.dlNumLarge),
{ type: 'spacer', length: 24},
{ type: 'stack', height: 1, backgroundColor: C.divider},
{ type: 'spacer', length: 16},
{
type: 'stack', direction: 'row', alignItems: 'start',
children: [
{
type: 'stack', direction: 'column', flex: 1, children: [StatBlock('上传速度', data.ul, 'Mbps', CONFIG.size.ulNumLarge)]
},
{
type: 'stack', direction: 'column', flex: 1, gap: 16,
children: [
StatBlock('网络延迟', data.ping, 'ms', CONFIG.size.pingNumLarge),
StatBlock('网络抖动', data.jitter, 'ms', CONFIG.size.pingNumLarge),
StatBlock('丢包率', plValue, plUnit, CONFIG.size.pingNumLarge)
]
}
]
}
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
