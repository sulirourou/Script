/**
 * 📌 桌面小组件: 🖥️ GCP (五彩热力感应版)
 * * 📖 【保姆级环境变量设置指南】
 * 请在 Egern 的界面中配置以下环境变量：
 * 👉 Host: 服务器 IP (必填)
 * 👉 User: 登录用户名 (必填，如 root)
 * 👉 Privatekey: 完整私钥 (如使用私钥登录)
 * 👉 Password: 登录密码 (如使用密码登录)
 * 👉 Port: 端口号 (不填则默认为 22)
 * ----------------------------------------------------------------
 * 特性：红绿灯在最前，GCP: IP 紧贴，天数在右，数据根据负载自动变色。
 */

export default async function(ctx) {
  
  // 🧰 私钥格式自动修复引擎
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

  // 🔐 环境变量规范化映射
  const env = ctx.env || {};
  const Host = (env.Host || env.host || "0.0.0.0").trim(); 
  const User = (env.User || env.user || "root").trim();
  const Privatekey = fixPrivateKey(env.Privatekey || env.KEY || ""); 
  const Password = (env.Password || "").trim();
  const Port = parseInt(env.Port || "22");

  // 🎨 调色盘 (自适应深浅模式)
  const isDark = ctx.displayAppearance !== 'light';
  const BG_COLOR = isDark ? '#121212' : '#FFFFFF'; 
  const TEXT_MAIN  = isDark ? '#FFFFFF' : '#000000'; 
  const TEXT_SUB   = isDark ? '#8E8E93' : '#636366'; 
  const DIVIDER_COLOR = isDark ? '#2C2C2E' : '#E5E5EA';
  
  const C_GREEN  = isDark ? '#34C759' : '#1A7F37'; // 20%
  const C_BLUE   = isDark ? '#007AFF' : '#0969DA'; // 40%
  const C_YELLOW = isDark ? '#FFCC00' : '#9A6700'; // 60%
  const C_RED    = isDark ? '#FF3B30' : '#CF222E'; // 80%
  const C_PURPLE = isDark ? '#AF52DE' : '#8250DF'; // 100%

  // 💡 五彩热力逻辑
  function getHeatColor(pct) {
    if (pct <= 20) return C_GREEN;
    if (pct <= 40) return C_BLUE;
    if (pct <= 60) return C_YELLOW;
    if (pct <= 80) return C_RED;
    return C_PURPLE;
  }

  // 💡 数据采集命令
  const linuxCommand = `
    export LC_ALL=C;
    u=$(awk '{print $1}' /proc/uptime);
    read l1 l5 l15 _ < /proc/loadavg;
    cores=$(nproc 2>/dev/null || echo 1);
    c=$(vmstat 1 2 | tail -1 | awk '{print 100-$15}');
    mt=$(free -m | awk '/Mem:/{print $2}'); mu=$(free -m | awk '/Mem:/{print $3}');
    st=$(free -m | awk '/Swap:/{print $2}'); su=$(free -m | awk '/Swap:/{print $3}');
    dt=$(df -h / | awk 'NR==2{print $2}'); du=$(df -h / | awk 'NR==2{print $3}'); dp=$(df -h / | awk 'NR==2{print $5}' | sed 's/%//');
    get_stats() {
      net=$(cat /proc/net/dev | awk '/:/ && !/lo:/ {rx+=$2; tx+=$10} END {print rx+0, tx+0}')
      io=$(cat /proc/diskstats 2>/dev/null | awk '{r+=$6; w+=$10} END {print r*512, w*512}' || echo "0 0")
      echo "$net $io"
    }
    set -- $(get_stats); nr1=$1; nt1=$2; ir1=$3; iw1=$4;
    sleep 1;
    set -- $(get_stats); nr2=$1; nt2=$2; ir2=$3; iw2=$4;
    echo "{\\"uptime\\":$u,\\"l1\\":$l1,\\"l5\\":$l5,\\"l15\\":$l15,\\"cores\\":$cores,\\"cpu\\":$c,\\"mem_tot\\":$mt,\\"mem_used\\":$mu,\\"swap_tot\\":$st,\\"swap_used\\":$su,\\"disk_pct\\":$dp,\\"net_rx\\":$((nr2-nr1)),\\"net_tx\\":$((nt2-nt1)),\\"net_rxt\\":\${nr2:-0},\\"net_txt\\":\${nt2:-0},\\"io_r\\":$((ir2-ir1)),\\"io_w\\":$((iw2-iw1))}"
  `;

  let sys = { uptime: 0, l1: 0, l5: 0, l15: 0, cores: 1, cpu: 0, mem_tot: 1024, mem_used: 0, swap_tot: 0, swap_used: 0, disk_pct: 0, net_rx: 0, net_tx: 0, net_rxt: 0, net_txt: 0, io_r: 0, io_w: 0, isReal: false };

  if (Host && (Privatekey || Password) && ctx.ssh) {
    try {
      const session = await ctx.ssh.connect({ 
        host: Host, 
        port: Port, 
        username: User, 
        privateKey: Privatekey || undefined, 
        password: Password || undefined,
        timeout: 10000 
      });
      try {
        const { stdout } = await session.exec(linuxCommand);
        if (stdout) sys = { ...sys, ...JSON.parse(stdout), isReal: true };
      } finally { await session.close(); }
    } catch (e) { console.log("SSH错误"); }
  }

  const formatSpeed = (b) => { if (b < 1024) return b + 'B/s'; if (b < 1048576) return (b/1024).toFixed(1) + 'K/s'; return (b/1048576).toFixed(1) + 'M/s'; };
  const formatSize = (b) => { if (!b || isNaN(b)) return '0B'; if (b < 1073741824) return (b/1048576).toFixed(1) + 'M'; return (b/1073741824).toFixed(1) + 'G'; };

  // 🎨 原子组件
  function buildStatCell(label, value, percent) {
    return {
      type: "stack", direction: "column", alignItems: "center", flex: 1,
      children: [
        { type: "text", text: label, font: { size: 11, weight: "bold" }, textColor: TEXT_SUB },
        { type: "text", text: `${percent}%`, font: { size: 14, weight: "heavy", family: "Menlo" }, textColor: getHeatColor(percent) }
      ]
    };
  }

  function buildLoadCell(label, value, cores) {
    const pct = Math.round((value / cores) * 100);
    return {
      type: "stack", direction: "column", alignItems: "center", flex: 1,
      children: [
        { type: "text", text: label, font: { size: 11, weight: "bold" }, textColor: TEXT_SUB },
        { 
          type: "stack", direction: "row", alignItems: "center", gap: 3,
          children: [
            { type: "text", text: parseFloat(value).toFixed(2), font: { size: 14, weight: "heavy", family: "Menlo" }, textColor: getHeatColor(pct) },
            { type: "text", text: `· ${pct}%`, font: { size: 10, weight: "bold" }, textColor: TEXT_SUB }
          ]
        }
      ]
    };
  }

  // 🛠️ 流量网速上色核心函数
  function buildTrafficBox(title, upS, upT, dnS, dnT) {
    return {
      type: "stack", direction: "column", flex: 1, alignItems: "center", gap: 2,
      children: [
        { type: "text", text: title, font: { size: 11, weight: "bold" }, textColor: TEXT_SUB },
        {
          type: "stack", direction: "row", alignItems: "center", gap: 0,
          children: [
             { type: "spacer" },
             { type: "stack", width: 72, direction: "row", children: [{ type: "spacer" }, { type: "text", text: `↑ ${formatSpeed(upS)}`, font: { size: 10, weight: "bold", family: "Menlo" }, textColor: C_RED }] },
             { type: "text", text: " · ", font: { size: 10 }, textColor: TEXT_SUB },
             { type: "stack", width: 48, direction: "row", children: [{ type: "text", text: `${formatSize(upT)}`, font: { size: 10, weight: "bold", family: "Menlo" }, textColor: C_RED }, { type: "spacer" }] },
             { type: "spacer" }
          ]
        },
        {
          type: "stack", direction: "row", alignItems: "center", gap: 0,
          children: [
             { type: "spacer" },
             { type: "stack", width: 72, direction: "row", children: [{ type: "spacer" }, { type: "text", text: `↓ ${formatSpeed(dnS)}`, font: { size: 10, weight: "bold", family: "Menlo" }, textColor: C_GREEN }] },
             { type: "text", text: " · ", font: { size: 10 }, textColor: TEXT_SUB },
             { type: "stack", width: 48, direction: "row", children: [{ type: "text", text: `${formatSize(dnT)}`, font: { size: 10, weight: "bold", family: "Menlo" }, textColor: C_GREEN }, { type: "spacer" }] },
             { type: "spacer" }
          ]
        }
      ]
    };
  }

  return {
    type: 'widget', url: "egern://", padding: 10, backgroundColor: BG_COLOR,
    children: [
      {
        type: "stack", direction: "column", flex: 1, gap: 8,
        children: [
          // 💡 Header
          {
            type: "stack", direction: "row", alignItems: "center",
            children: [
              {
                type: "stack", direction: "row", alignItems: "center", gap: 6,
                children: [
                  { type: "stack", width: 14, height: 14, borderRadius: 7, backgroundColor: sys.isReal ? C_GREEN : C_RED },
                  { type: "text", text: `GCP: ${Host}`, font: { size: 15, weight: "heavy" }, textColor: TEXT_MAIN }
                ]
              },
              { type: "spacer" },
              { type: "text", text: `${Math.floor(sys.uptime/86400)} days`, font: { size: 12, weight: "bold" }, textColor: TEXT_SUB }
            ]
          },
          
          { type: "stack", direction: "row", children: [buildStatCell("CPU", sys.cpu, sys.cpu), buildStatCell("Memory", sys.mem_used, Math.round((sys.mem_used/sys.mem_tot)*100)), buildStatCell("Disk", sys.disk_pct, sys.disk_pct), buildStatCell("Swap", sys.swap_used, Math.round((sys.swap_used/sys.swap_tot)*100)||0)] },
          { type: "stack", height: 1, backgroundColor: DIVIDER_COLOR, margin: { left: -10, right: -10 } },
          { type: "stack", direction: "row", children: [buildLoadCell("Load 1", sys.l1, sys.cores), buildLoadCell("Load 5", sys.l5, sys.cores), buildLoadCell("Load 15", sys.l15, sys.cores)] },
          { type: "stack", height: 1, backgroundColor: DIVIDER_COLOR, margin: { left: -10, right: -10 } },
          { type: "stack", direction: "row", children: [buildTrafficBox("Net", sys.net_tx, sys.net_txt, sys.net_rx, sys.net_rxt), buildTrafficBox("I/O", sys.io_w, sys.io_w, sys.io_r, sys.io_r)] }
        ]
      }
    ]
  };
}
