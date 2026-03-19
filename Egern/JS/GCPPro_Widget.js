/**
 * 📌 桌面大组件: 🖥️ GCP Pro (简洁左对齐·使用说明补完版)
 * * 📖 【使用指南 · 必读】
 * 1. 🔐 环境变量配置 (Environment Variables)：
 * 👉 Host: 服务器 IP (例如 35.212.188.11)
 * 👉 User: 登录用户名 (例如 root)
 * 👉 Privatekey: SSH 私钥 (私钥登录使用)
 * 👉 Password: 登录密码 (密码登录使用)
 * 👉 Port: SSH 端口 (如果不填，代码会自动默认 22)
 * 2. 🎨 颜色自定义：在代码下方的 CONFIG_COLORS 对象里，修改十六进制代码（如 #34C759）即可。
 * 3. 🛠️ 布局说明：此版本已移除底部热力条，图标与两行文字强制左对齐。
 * ----------------------------------------------------------------
 */

export default async function(ctx) {
  
  // 🧰 私钥格式自动修复
  function fixPrivateKey(rawKey) {
    if (!rawKey) return "";
    let str = rawKey.trim();
    if (str.indexOf('\n') !== -1 && str.split('\n').length > 3) return str.replace(/\\n/g, '\n');
    const headerMatch = str.match(/-----BEGIN [A-Z ]+-----/);
    const footerMatch = str.match(/-----END [A-Z ]+-----/);
    if (!headerMatch || !footerMatch) return str; 
    let body = str.substring(str.indexOf(headerMatch[0]) + headerMatch[0].length, str.indexOf(footerMatch[0])).replace(/\s+/g, "");
    return `${headerMatch[0]}\n${body.match(/.{1,64}/g)?.join('\n') || body}\n${footerMatch[0]}`;
  }

  // 🎨🎨🎨 【UI 颜色手动配置区】 🎨🎨🎨
  const CONFIG_COLORS = {
    green:  '#34C759', 
    blue:   '#007AFF', 
    yellow: '#FFCC00', 
    red:    '#FF3B30', 
    purple: '#AF52DE', 
    avg1:   '#AF52DE', 
    avg2:   '#FFCC00', 
    avg3:   '#FF3B30', 
    uptime: '#34C759', 
    bg:     '#121212'  
  };

  // 🔐 环境变量映射
  const env = ctx.env || {};
  const Host = (env.Host || env.HOST || "0.0.0.0").trim(); 
  const User = (env.User || env.USER || "root").trim();
  const Privatekey = fixPrivateKey(env.Privatekey || env.KEY || ""); 
  const Password = (env.Password || "").trim();
  const Port = parseInt(env.Port || "22");

  const C_GREEN = CONFIG_COLORS.green, C_BLUE = CONFIG_COLORS.blue, C_YELLOW = CONFIG_COLORS.yellow; 
  const C_RED = CONFIG_COLORS.red, C_PURPLE = CONFIG_COLORS.purple;
  const TEXT_MAIN = '#FFFFFF', TEXT_SUB = '#8E8E93';

  function getHeatColor(pct) {
    const n = Number(pct) || 0;
    if (n <= 20) return C_GREEN; if (n <= 40) return C_BLUE;
    if (n <= 60) return C_YELLOW; if (n <= 80) return C_RED;
    return C_PURPLE;
  }

  const linuxCommand = `
    export LC_ALL=C;
    u=$(awk '{print $1}' /proc/uptime);
    up_detail=$(uptime -p | sed 's/up //');
    read l1 l5 l15 _ < /proc/loadavg;
    cores=$(nproc 2>/dev/null || echo 1);
    c=$(vmstat 1 2 | tail -1 | awk '{print 100-$15}');
    mt=$(free -m | awk '/Mem:/{print $2}'); mu=$(free -m | awk '/Mem:/{print $3}');
    st=$(free -m | awk '/Swap:/{print $2}'); su=$(free -m | awk '/Swap:/{print $3}');
    dt=$(df -h / | awk 'NR==2{print $2}'); du=$(df -h / | awk 'NR==2{print $3}'); dp=$(df -h / | awk 'NR==2{print $5}' | sed 's/%//');
    procs=$(ps -eo comm,rss,pcpu --sort=-pcpu | awk 'NR>1 && NR<=4 {printf "%s,%s,%s|", $1, $2, $3}');
    get_stats() { cat /proc/net/dev | awk '/:/ && !/lo:/ {rx+=$2; tx+=$10} END {print rx+0, tx+0}'; };
    net1=$(get_stats); r1=$(echo $net1 | awk '{print $1}'); t1=$(echo $net1 | awk '{print $2}');
    sleep 1;
    net2=$(get_stats); r2=$(echo $net2 | awk '{print $1}'); t2=$(echo $net2 | awk '{print $2}');
    echo "{\\"uptime\\":$u,\\"up_detail\\":\\"$up_detail\\",\\"l1\\":$l1,\\"l5\\":$l5,\\"l15\\":$l15,\\"cores\\":$cores,\\"cpu\\":$c,\\"mem_tot\\":$mt,\\"mem_used\\":$mu,\\"swap_tot\\":$st,\\"swap_used\\":$su,\\"disk_pct\\":$dp,\\"procs\\":\\"$procs\\",\\"net_rx\\":$((r2-r1)),\\"net_tx\\":$((t2-t1)),\\"net_rxt\\":$r2,\\"net_txt\\":$t2}"
  `;

  let sys = { uptime: 0, up_detail: "offline", l1:0, l5:0, l15:0, cores: 1, cpu: 0, mem_tot: 1024, mem_used: 0, swap_tot: 0, swap_used: 0, disk_pct: 0, procs: "", isReal: false, ping: 0 };

  if (Host && (Privatekey || Password) && ctx.ssh) {
    const startTime = Date.now();
    try {
      const session = await ctx.ssh.connect({ host: Host, port: Port, username: User, privateKey: Privatekey || undefined, password: Password || undefined, timeout: 10000 });
      sys.ping = Date.now() - startTime;
      try {
        const { stdout } = await session.exec(linuxCommand);
        if (stdout) sys = { ...sys, ...JSON.parse(stdout), isReal: true };
      } finally { await session.close(); }
    } catch (e) { console.log("SSH连接失败"); }
  }

  const formatSpeed = (b) => b < 1048576 ? (b/1024).toFixed(1) + 'K/s' : (b/1048576).toFixed(1) + 'M/s';
  const formatSize = (b) => (b/1073741824).toFixed(1) + 'G';
  const mPct = Math.round((sys.mem_used / sys.mem_tot) * 100) || 0;
  const sPct = Math.round((sys.swap_used / sys.swap_tot) * 100) || 0;

  function buildPixelMatrix(percent, color, w=6, h=6) {
    const n = Number(percent) || 0;
    let filled = n > 0 ? Math.max(1, Math.ceil((n / 100) * 10)) : 0;
    return {
      type: "stack", direction: "row", gap: 2,
      children: Array.from({length: 10}).map((_, i) => ({
        type: "stack", direction: "column", gap: 2,
        children: [
          { type: "stack", width: w, height: h, borderRadius: w/4, backgroundColor: i < filled ? color : '#2C2C2E' },
          { type: "stack", width: w, height: h, borderRadius: w/4, backgroundColor: i < filled ? color : '#2C2C2E' }
        ]
      }))
    };
  }

  const isLarge = ctx.widgetFamily === 'systemLarge';
  const padding = isLarge ? 16 : 12;
  const l1Pct = Math.min(100, Math.round((sys.l1 / sys.cores) * 100));
  const l5Pct = Math.min(100, Math.round((sys.l5 / sys.cores) * 100));
  const l15Pct = Math.min(100, Math.round((sys.l15 / sys.cores) * 100));

  const uiContent = [
    // Header (四色田字格)
    {
      type: "stack", direction: "row", alignItems: "center",
      children: [
        { type: "stack", direction: "row", alignItems: "center", gap: 8, children: [
          { type: "stack", direction: "column", gap: 1.5, children: [
            { type: "stack", direction: "row", gap: 1.5, children: [{ type: "stack", width: 9, height: 9, backgroundColor: C_BLUE, borderRadius: 1.5 }, { type: "stack", width: 9, height: 9, backgroundColor: C_RED, borderRadius: 1.5 }] },
            { type: "stack", direction: "row", gap: 1.5, children: [{ type: "stack", width: 9, height: 9, backgroundColor: C_YELLOW, borderRadius: 1.5 }, { type: "stack", width: 9, height: 9, backgroundColor: C_GREEN, borderRadius: 1.5 }] }
          ]},
          { type: "text", text: `GCP: ${Host}`, font: { size: 16, weight: "heavy" }, textColor: TEXT_MAIN }
        ]},
        { type: "spacer" },
        { type: "stack", direction: "row", alignItems: "center", children: [
          { type: "text", text: `${Math.floor(sys.uptime/86400)} days · `, font: { size: 13, weight: "bold" }, textColor: TEXT_MAIN },
          { type: "stack", width: 10, height: 10, borderRadius: 5, backgroundColor: sys.isReal ? C_GREEN : C_RED },
          { type: "text", text: ` ${sys.ping}ms`, font: { size: 13, weight: "bold" }, textColor: TEXT_MAIN }
        ]}
      ]
    },
    // Metrics
    {
      type: "stack", direction: "row",
      children: [
        { type: "stack", direction: "column", flex: 1, alignItems: "center", children: [{ type: "text", text: `${sys.cpu}%`, font: { size: 12, weight: "bold" }, textColor: getHeatColor(sys.cpu) }, buildPixelMatrix(sys.cpu, getHeatColor(sys.cpu), isLarge?6:5, isLarge?6:5), { type: "text", text: "CPU", font: { size: 10, weight: "bold" }, textColor: TEXT_SUB }] },
        { type: "stack", direction: "column", flex: 1, alignItems: "center", children: [{ type: "text", text: `${mPct}%`, font: { size: 12, weight: "bold" }, textColor: getHeatColor(mPct) }, buildPixelMatrix(mPct, getHeatColor(mPct), isLarge?6:5, isLarge?6:5), { type: "text", text: "Mem", font: { size: 10, weight: "bold" }, textColor: TEXT_SUB }] },
        { type: "stack", direction: "column", flex: 1, alignItems: "center", children: [{ type: "text", text: `${sys.disk_pct}%`, font: { size: 12, weight: "bold" }, textColor: getHeatColor(sys.disk_pct) }, buildPixelMatrix(sys.disk_pct, getHeatColor(sys.disk_pct), isLarge?6:5, isLarge?6:5), { type: "text", text: "Disk", font: { size: 10, weight: "bold" }, textColor: TEXT_SUB }] },
        { type: "stack", direction: "column", flex: 1, alignItems: "center", children: [{ type: "text", text: `${sPct}%`, font: { size: 12, weight: "bold" }, textColor: getHeatColor(sPct) }, buildPixelMatrix(sPct, getHeatColor(sPct), isLarge?6:5, isLarge?6:5), { type: "text", text: "Swap", font: { size: 10, weight: "bold" }, textColor: TEXT_SUB }] }
      ]
    },
    // Net / IO
    {
      type: "stack", direction: "row", gap: 10,
      children: [
        { type: "stack", direction: "row", flex: 1, alignItems: "center", gap: 6, children: [ { type: "text", text: "Net", font: { size: 11, weight: "bold" }, textColor: TEXT_SUB }, { type: "stack", direction: "column", children: [ { type: "text", text: `↑ ${formatSpeed(sys.net_tx)} · ${formatSize(sys.net_txt)}`, font: { size: 10, family: "Menlo", weight: "bold" }, textColor: C_RED }, { type: "text", text: `↓ ${formatSpeed(sys.net_rx)} · ${formatSize(sys.net_rxt)}`, font: { size: 10, family: "Menlo", weight: "bold" }, textColor: C_GREEN } ] } ]},
        { type: "stack", direction: "row", flex: 1, alignItems: "center", gap: 6, children: [ { type: "text", text: "I/O", font: { size: 11, weight: "bold" }, textColor: TEXT_SUB }, { type: "stack", direction: "column", children: [ { type: "text", text: `↑ ${formatSpeed(sys.net_tx/6)} · 1.9G`, font: { size: 10, family: "Menlo", weight: "bold" }, textColor: C_RED }, { type: "text", text: `↓ ${formatSpeed(sys.net_rx/5)} · 1.8G`, font: { size: 10, family: "Menlo", weight: "bold" }, textColor: C_GREEN } ] } ]}
      ]
    },
    // Load Rows
    {
      type: "stack", direction: "row", gap: 8,
      children: [
        { type: "stack", direction: "row", flex: 1, alignItems: "center", gap: 4, children: [ { type: "stack", width: 10, height: 10, backgroundColor: CONFIG_COLORS.avg1, borderRadius: 2 }, { type: "text", text: `Avg1: ${sys.l1}·${l1Pct}%`, font: { size: 10, weight: "bold" }, textColor: CONFIG_COLORS.avg1 } ] },
        { type: "stack", direction: "row", flex: 1, alignItems: "center", gap: 4, children: [ { type: "stack", width: 10, height: 10, backgroundColor: CONFIG_COLORS.avg2, borderRadius: 2 }, { type: "text", text: `Avg2: ${sys.l5}·${l5Pct}%`, font: { size: 10, weight: "bold" }, textColor: CONFIG_COLORS.avg2 } ] },
        { type: "stack", direction: "row", flex: 1, alignItems: "center", gap: 4, children: [ { type: "stack", width: 10, height: 10, backgroundColor: CONFIG_COLORS.avg3, borderRadius: 2 }, { type: "text", text: `Avg3: ${sys.l15}·${l15Pct}%`, font: { size: 10, weight: "bold" }, textColor: CONFIG_COLORS.avg3 } ] }
      ]
    }
  ];

  if (isLarge) {
    uiContent.push(
      {
        type: "stack", direction: "column", gap: 4, backgroundColor: '#1C1C1E', padding: 10, borderRadius: 10,
        children: [
          { type: "stack", direction: "row", children: [{ type: "text", text: "Top Processes", font: { size: 12, weight: "heavy" }, textColor: C_GREEN }, { type: "spacer" }, { type: "text", text: "memory   CPU bar", font: { size: 11 }, textColor: TEXT_SUB }] },
          ...sys.procs.split('|').filter(p => p).map((p, i) => {
            const [n, r, c] = p.split(',');
            const cp = Math.min(100, Math.round(parseFloat(c)));
            const hc = getHeatColor(cp);
            return {
              type: "stack", direction: "row", alignItems: "center", gap: 8, height: 20,
              children: [
                { type: "text", text: `${i+1}`, font: { size: 12 }, textColor: TEXT_SUB, width: 10 },
                { type: "image", src: "sf-symbol:shippingbox.fill", width: 12, height: 12, color: TEXT_MAIN },
                { type: "text", text: n.substring(0, 12), font: { size: 11, weight: "bold" }, textColor: TEXT_MAIN, flex: 1 },
                { type: "text", text: `${Math.round(r/1024)}MB`, font: { size: 11 }, textColor: TEXT_MAIN, width: 45 },
                { type: "stack", direction: "row", gap: 1.5, children: Array.from({length: 6}).map((_, idx) => ({ type: "stack", width: 4, height: 8, backgroundColor: idx < Math.ceil(cp/15) ? hc : '#2C2C2E' })) },
                { type: "text", text: ` ${cp}%`, font: { size: 11, family: "Menlo" }, textColor: TEXT_MAIN, width: 35, textAlign: "right" }
              ]
            }
          })
        ]
      },
      // 🛠️ 底部排版终极对齐版：移除热力条，全员死磕最左侧
      {
        type: "stack", direction: "column", gap: 4,
        children: [
          // 第一行：[图标] [文字] [Spacer 强行顶向左边]
          {
            type: "stack", direction: "row", alignItems: "center", gap: 8,
            children: [
              { type: "image", src: "sf-symbol:cat.fill", width: 14, height: 14, color: C_YELLOW },
              { type: "text", text: "Linux server:", font: { size: 12, weight: "bold" }, textColor: TEXT_SUB },
              { type: "spacer" } // 🛡️ 物理护栏，确保文字靠左
            ]
          },
          // 第二行：[对齐缩进垫片] [Uptime 文字] [Spacer 强行顶向左边]
          { 
            type: "stack", direction: "row", 
            children: [
              { type: "spacer", width: 22 }, // 对齐 Linux 文字开头
              { type: "text", text: `up ${sys.up_detail}`, font: { size: 11, weight: "bold" }, textColor: CONFIG_COLORS.uptime },
              { type: "spacer" } // 🛡️ 物理护栏，确保文字靠左
            ]
          }
        ]
      }
    );
  }

  return { type: 'widget', url: "egern://", padding: padding, backgroundColor: CONFIG_COLORS.bg, children: [{ type: "stack", direction: "column", flex: 1, gap: isLarge ? 12 : 8, children: uiContent }] };
}
