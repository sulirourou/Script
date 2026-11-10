/**
 * 🌏 IP-API
 * 版本：v2.0 (2026-11-11)
 * 环境变量 (可选):
 * 名称：POLICY
 * 值：自定义策略组节点名称，例如 美国节点；不填则按默认路由查询
 */

const API_BASE = "http://ip-api.com/json/";
const FIELDS = "?fields=status,message,country,countryCode,regionName,city,isp,org,as,mobile,proxy,hosting,query";
const API_LOCAL_IP = "https://myip.ipip.net/json";
const TIMEOUT = 5000;
const TIMEOUT_PROXY = 6000;
const TIMEOUT_TRANS = 3000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.61 Safari/537.36';

export default async function(ctx) {
  let proxyData = { ip: "获取中...", title: "节点网络", detail: "未知", isp: "未知", flag: "🏳️", risk: 0, isDC: false, success: false };
  let localData = { ip: "获取中...", title: "本地网络", detail: "未知", isp: "未知", flag: "🏳️", success: false };
  const POLICY = ((ctx.env && ctx.env.POLICY) || "").toString().trim();

  const countryMap = { "united states": "美国", "us": "美国", "singapore": "新加坡", "japan": "日本", "hong kong": "香港", "taiwan": "台湾", "united kingdom": "英国", "uk": "英国", "korea": "韩国", "south korea": "韩国" };

  // 省/市/州名去掉末尾的省/市/州 (广东省 -> 广东, 广州市 -> 广州, 加利福尼亚州 -> 加利福尼亚)
  function trimAdmin(s) {
    return String(s || "").trim().replace(/(省|市|州)$/, "");
  }

  const countryCodeCn = { US: "美国", CN: "中国", HK: "香港", TW: "台湾", MO: "澳门", JP: "日本", KR: "韩国", SG: "新加坡", GB: "英国", UK: "英国", DE: "德国", FR: "法国", CA: "加拿大", AU: "澳大利亚", NL: "荷兰", CH: "瑞士", SE: "瑞典", NO: "挪威", DK: "丹麦", FI: "芬兰", IT: "意大利", ES: "西班牙", PT: "葡萄牙", IE: "爱尔兰", AT: "奥地利", BE: "比利时", PL: "波兰", CZ: "捷克", HU: "匈牙利", GR: "希腊", TR: "土耳其", RU: "俄罗斯", UA: "乌克兰", IN: "印度", TH: "泰国", VN: "越南", MY: "马来西亚", ID: "印度尼西亚", PH: "菲律宾", NZ: "新西兰", MX: "墨西哥", BR: "巴西", AR: "阿根廷", CL: "智利", CO: "哥伦比亚", PE: "秘鲁", ZA: "南非", EG: "埃及", NG: "尼日利亚", KE: "肯尼亚", IL: "以色列", AE: "阿联酋", SA: "沙特阿拉伯", QA: "卡塔尔", KW: "科威特", IR: "伊朗", IQ: "伊拉克", PK: "巴基斯坦", BD: "孟加拉国", LK: "斯里兰卡", MM: "缅甸", KH: "柬埔寨", LA: "老挝", MN: "蒙古", NP: "尼泊尔", KZ: "哈萨克斯坦", UZ: "乌兹别克斯坦" };

  // 💡 地区中文表: 按 "国家代码:地区代码" 查 (接口自带 regionCode, 不依赖翻译接口)
  const regionCodeCn = {
    "US:AL": "阿拉巴马州", "US:AK": "阿拉斯加州", "US:AZ": "亚利桑那州", "US:AR": "阿肯色州", "US:CA": "加利福尼亚州", "US:CO": "科罗拉多州", "US:CT": "康涅狄格州", "US:DE": "特拉华州", "US:FL": "佛罗里达州", "US:GA": "佐治亚州", "US:HI": "夏威夷州", "US:ID": "爱达荷州", "US:IL": "伊利诺伊州", "US:IN": "印第安纳州", "US:IA": "艾奥瓦州", "US:KS": "堪萨斯州", "US:KY": "肯塔基州", "US:LA": "路易斯安那州", "US:ME": "缅因州", "US:MD": "马里兰州", "US:MA": "马萨诸塞州", "US:MI": "密歇根州", "US:MN": "明尼苏达州", "US:MS": "密西西比州", "US:MO": "密苏里州", "US:MT": "蒙大拿州", "US:NE": "内布拉斯加州", "US:NV": "内华达州", "US:NH": "新罕布什尔州", "US:NJ": "新泽西州", "US:NM": "新墨西哥州", "US:NY": "纽约州", "US:NC": "北卡罗来纳州", "US:ND": "北达科他州", "US:OH": "俄亥俄州", "US:OK": "俄克拉荷马州", "US:OR": "俄勒冈州", "US:PA": "宾夕法尼亚州", "US:RI": "罗得岛州", "US:SC": "南卡罗来纳州", "US:SD": "南达科他州", "US:TN": "田纳西州", "US:TX": "得克萨斯州", "US:UT": "犹他州", "US:VT": "佛蒙特州", "US:VA": "弗吉尼亚州", "US:WA": "华盛顿州", "US:WV": "西弗吉尼亚州", "US:WI": "威斯康星州", "US:WY": "怀俄明州", "US:DC": "哥伦比亚特区", "US:PR": "波多黎各", "US:GU": "关岛", "US:VI": "美属维尔京群岛", "US:AS": "美属萨摩亚", "US:MP": "北马里亚纳群岛",
    "CA:AB": "阿尔伯塔省", "CA:BC": "不列颠哥伦比亚省", "CA:MB": "曼尼托巴省", "CA:NB": "新不伦瑞克省", "CA:NL": "纽芬兰与拉布拉多省", "CA:NS": "新斯科舍省", "CA:NT": "西北地区", "CA:NU": "努纳武特地区", "CA:ON": "安大略省", "CA:PE": "爱德华王子岛省", "CA:QC": "魁北克省", "CA:SK": "萨斯喀彻温省", "CA:YT": "育空地区",
    "AU:ACT": "澳大利亚首都领地", "AU:NSW": "新南威尔士州", "AU:NT": "北领地", "AU:QLD": "昆士兰州", "AU:SA": "南澳大利亚州", "AU:TAS": "塔斯马尼亚州", "AU:VIC": "维多利亚州", "AU:WA": "西澳大利亚州",
    "CN:BJ": "北京市", "CN:TJ": "天津市", "CN:HE": "河北省", "CN:SX": "山西省", "CN:NM": "内蒙古自治区", "CN:LN": "辽宁省", "CN:JL": "吉林省", "CN:HL": "黑龙江省", "CN:SH": "上海市", "CN:JS": "江苏省", "CN:ZJ": "浙江省", "CN:AH": "安徽省", "CN:FJ": "福建省", "CN:JX": "江西省", "CN:SD": "山东省", "CN:HA": "河南省", "CN:HB": "湖北省", "CN:HN": "湖南省", "CN:GD": "广东省", "CN:GX": "广西壮族自治区", "CN:HI": "海南省", "CN:CQ": "重庆市", "CN:SC": "四川省", "CN:GZ": "贵州省", "CN:YN": "云南省", "CN:XZ": "西藏自治区", "CN:SN": "陕西省", "CN:GS": "甘肃省", "CN:QH": "青海省", "CN:NX": "宁夏回族自治区", "CN:XJ": "新疆维吾尔自治区", "CN:HK": "香港特别行政区", "CN:MO": "澳门特别行政区", "CN:TW": "台湾省",
    "GB:ENG": "英格兰", "GB:SCT": "苏格兰", "GB:WLS": "威尔士", "GB:NIR": "北爱尔兰"
  };

  const regionNameCn = {
    "alabama": "阿拉巴马州", "alaska": "阿拉斯加州", "arizona": "亚利桑那州", "arkansas": "阿肯色州", "california": "加利福尼亚州", "colorado": "科罗拉多州", "connecticut": "康涅狄格州", "delaware": "特拉华州", "florida": "佛罗里达州", "georgia": "佐治亚州", "hawaii": "夏威夷州", "idaho": "爱达荷州", "illinois": "伊利诺伊州", "indiana": "印第安纳州", "iowa": "艾奥瓦州", "kansas": "堪萨斯州", "kentucky": "肯塔基州", "louisiana": "路易斯安那州", "maine": "缅因州", "maryland": "马里兰州", "massachusetts": "马萨诸塞州", "michigan": "密歇根州", "minnesota": "明尼苏达州", "mississippi": "密西西比州", "missouri": "密苏里州", "montana": "蒙大拿州", "nebraska": "内布拉斯加州", "nevada": "内华达州", "new hampshire": "新罕布什尔州", "new jersey": "新泽西州", "new mexico": "新墨西哥州", "new york": "纽约州", "north carolina": "北卡罗来纳州", "north dakota": "北达科他州", "ohio": "俄亥俄州", "oklahoma": "俄克拉荷马州", "oregon": "俄勒冈州", "pennsylvania": "宾夕法尼亚州", "rhode island": "罗得岛州", "south carolina": "南卡罗来纳州", "south dakota": "南达科他州", "tennessee": "田纳西州", "texas": "得克萨斯州", "utah": "犹他州", "vermont": "佛蒙特州", "virginia": "弗吉尼亚州", "washington": "华盛顿州", "west virginia": "西弗吉尼亚州", "wisconsin": "威斯康星州", "wyoming": "怀俄明州", "district of columbia": "哥伦比亚特区", "puerto rico": "波多黎各", "guam": "关岛",
    "beijing": "北京市", "tianjin": "天津市", "hebei": "河北省", "shanxi": "山西省", "inner mongolia": "内蒙古自治区", "liaoning": "辽宁省", "jilin": "吉林省", "heilongjiang": "黑龙江省", "shanghai": "上海市", "jiangsu": "江苏省", "zhejiang": "浙江省", "anhui": "安徽省", "fujian": "福建省", "jiangxi": "江西省", "shandong": "山东省", "henan": "河南省", "hubei": "湖北省", "hunan": "湖南省", "guangdong": "广东省", "guangxi": "广西壮族自治区", "hainan": "海南省", "chongqing": "重庆市", "sichuan": "四川省", "guizhou": "贵州省", "yunnan": "云南省", "tibet": "西藏自治区", "shaanxi": "陕西省", "gansu": "甘肃省", "qinghai": "青海省", "ningxia": "宁夏回族自治区", "xinjiang": "新疆维吾尔自治区"
  };

  // 城市中文表: ip-api 中文接口不翻译外国城市名 (San Jose 仍返回英文),
  // 标题要显示中文城市名时查这张表; 查不到时城市名留空 (不硬拼英文)
  const cityNameCn = {
    "san jose": "圣何塞", "los angeles": "洛杉矶", "san francisco": "旧金山", "new york": "纽约", "seattle": "西雅图", "chicago": "芝加哥", "dallas": "达拉斯", "houston": "休斯顿", "atlanta": "亚特兰大", "miami": "迈阿密", "boston": "波士顿", "denver": "丹佛", "phoenix": "菲尼克斯", "las vegas": "拉斯维加斯", "portland": "波特兰", "austin": "奥斯汀", "san diego": "圣迭戈", "sacramento": "萨克拉门托", "oakland": "奥克兰", "san antonio": "圣安东尼奥", "columbus": "哥伦布", "charlotte": "夏洛特", "detroit": "底特律", "nashville": "纳什维尔", "baltimore": "巴尔的摩", "memphis": "孟菲斯", "milwaukee": "密尔沃基", "tucson": "图森", "kansas city": "堪萨斯城", "tampa": "坦帕", "new orleans": "新奥尔良", "cleveland": "克利夫兰", "pittsburgh": "匹兹堡", "salt lake city": "盐湖城", "honolulu": "檀香山", "saint paul": "圣保罗", "st. paul": "圣保罗", "riverside": "河滨", "fresno": "弗雷斯诺", "mesa": "梅萨", "omaha": "奥马哈", "tulsa": "塔尔萨", "arlington": "阿灵顿", "wichita": "威奇托", "bakersfield": "贝克斯菲尔德", "aurora": "奥罗拉", "anaheim": "阿纳海姆", "stockton": "斯托克顿", "lexington": "列克星敦", "anchorage": "安克雷奇", "cincinnati": "辛辛那提", "greensboro": "格林斯伯勒", "plano": "普莱诺", "newark": "纽瓦克", "lincoln": "林肯", "durham": "达勒姆", "toledo": "托莱多", "fort wayne": "韦恩堡", "laredo": "拉雷多", "jersey city": "泽西市", "chandler": "钱德勒", "madison": "麦迪逊", "lubbock": "拉伯克", "scottsdale": "斯科茨代尔", "reno": "里诺", "buffalo": "布法罗", "gilbert": "吉尔伯特", "glendale": "格伦代尔", "north las vegas": "北拉斯维加斯", "fremont": "弗里蒙特", "garland": "加兰", "irvine": "尔湾", "hialeah": "海厄利亚", "richmond": "里士满", "boise": "博伊西", "spokane": "斯波坎", "birmingham": "伯明翰", "modesto": "莫德斯托", "des moines": "得梅因", "rochester": "罗彻斯特", "tacoma": "塔科马", "fontana": "丰塔纳", "oxnard": "奥克斯纳德", "fayetteville": "费耶特维尔", "moreno valley": "莫雷诺谷", "amarillo": "阿马里洛", "yonkers": "扬克斯", "montgomery": "蒙哥马利", "akron": "阿克伦", "little rock": "小石城", "augusta": "奥古斯塔", "grand rapids": "大急流城", "mobile": "莫比尔",
    "tokyo": "东京", "osaka": "大阪", "nagoya": "名古屋", "kyoto": "京都", "kobe": "神户", "yokohama": "横滨", "seoul": "首尔", "busan": "釜山", "incheon": "仁川", "singapore": "新加坡", "hong kong": "香港", "taipei": "台北", "kaohsiung": "高雄", "london": "伦敦", "paris": "巴黎", "frankfurt": "法兰克福", "amsterdam": "阿姆斯特丹", "berlin": "柏林", "madrid": "马德里", "barcelona": "巴塞罗那", "rome": "罗马", "milan": "米兰", "moscow": "莫斯科", "sydney": "悉尼", "melbourne": "墨尔本", "brisbane": "布里斯班", "perth": "珀斯", "auckland": "奥克兰", "toronto": "多伦多", "vancouver": "温哥华", "montreal": "蒙特利尔", "calgary": "卡尔加里", "ottawa": "渥太华", "mumbai": "孟买", "delhi": "德里", "new delhi": "新德里", "bangalore": "班加罗尔", "bangkok": "曼谷", "kuala lumpur": "吉隆坡", "jakarta": "雅加达", "manila": "马尼拉", "ho chi minh city": "胡志明市", "hanoi": "河内", "dubai": "迪拜", "abu dhabi": "阿布扎比", "doha": "多哈", "riyadh": "利雅得", "tel aviv": "特拉维夫", "istanbul": "伊斯坦布尔", "cairo": "开罗", "johannesburg": "约翰内斯堡", "cape town": "开普敦", "mexico city": "墨西哥城", "sao paulo": "圣保罗", "rio de janeiro": "里约热内卢", "buenos aires": "布宜诺斯艾利斯", "santiago": "圣地亚哥", "lima": "利马", "bogota": "波哥大"
  };

  // 城市名转中文: 已是中文的去后缀直接用, 英文的查 cityNameCn 表, 查不到留空
  function cityCn(name) {
    const raw = String(name || "").trim();
    if (!raw) return "";
    if (!/[a-zA-Z]/.test(raw)) return trimAdmin(raw);
    return cityNameCn[raw.toLowerCase()] || "";
  }

  function getCnTitle(c, r, d) {
    let res = [];
    const hasEng = (str) => /[a-zA-Z]/.test(str);
    let c_cn = c;
    if (c && hasEng(c) && countryMap[c.toLowerCase()]) c_cn = countryMap[c.toLowerCase()];
    if (c_cn) res.push(c_cn);
    if (r && r !== c_cn && !hasEng(r)) res.push(r);
    if (d && d !== c_cn && d !== r && !hasEng(d)) res.push(d);
    return res.join(" ").trim() || "未知节点";
  }

  function getEnDetail(c, r, d) {
    let res = [];
    let c_low = (c || "").toLowerCase();
    let r_low = (r || "").toLowerCase();
    let d_low = (d || "").toLowerCase();
    if (c) res.push(c);
    if (r && r_low !== c_low && !r_low.includes(c_low)) res.push(r);
    if (d && d_low !== c_low && d_low !== r_low && !d_low.includes(c_low)) res.push(d);
    return res.join(" ").trim() || "未知";
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function saveProxyCache() {
    try {
      ctx.storage.setString("ipapi_proxy_v1", JSON.stringify({
        t: Date.now(),
        d: { ip: proxyData.ip, title: proxyData.title, detail: proxyData.detail, isp: proxyData.isp, flag: proxyData.flag, risk: proxyData.risk, isDC: proxyData.isDC }
      }));
    } catch (e) {}
  }

  function loadProxyCache() {
    try {
      const raw = ctx.storage.getString("ipapi_proxy_v1");
      if (!raw) return false;
      const c = JSON.parse(raw);
      if (!c || !c.d || !c.d.ip || (Date.now() - (c.t || 0)) > 24 * 3600 * 1000) return false;
      proxyData.ip = c.d.ip; proxyData.title = c.d.title; proxyData.detail = c.d.detail;
      proxyData.isp = c.d.isp; proxyData.flag = c.d.flag; proxyData.risk = c.d.risk || 0;
      proxyData.isDC = !!c.d.isDC; proxyData.success = true;
      return true;
    } catch (e) { return false; }
  }

  // en/cn 任一成功即可填充: cn 优先作标题源 (中文地名), en 优先作详情源
  // 在线翻译 (双接口, 均免 key): 谷歌 gtx 优先, 失败落 MyMemory; 两者都失败回退原文。
  // 城市名翻译用: 内置表查不到的城市 (如 The Dalles) 靠它翻译, 换节点不用改表。
  async function googleTranslate(text, to) {
    const tl = to === "en" ? "en" : "zh-CN";
    const r = await ctx.http.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`, { timeout: TIMEOUT_TRANS, headers: { 'User-Agent': UA } });
    const j = await r.json();
    if (!Array.isArray(j) || !Array.isArray(j[0])) return "";
    return j[0].map(seg => (seg && seg[0]) || "").join("");
  }

  async function myMemoryTranslate(text, to) {
    const pair = to === "en" ? "zh-CN|en" : "en|zh-CN";
    const r = await ctx.http.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(pair)}`, { timeout: TIMEOUT_TRANS, headers: { 'User-Agent': UA } });
    const j = await r.json();
    if (!j || !j.responseData || String(j.responseStatus) !== "200" || j.responseData.quotaFinished) return "";
    return j.responseData.translatedText || "";
  }

  async function translateBatch(texts, to) {
    const list = texts.map(t => t || "");
    const settled = await Promise.allSettled(list.map(async (t) => {
      if (!t || t === "Unknown") return "";
      const hasCjk = /[\u4e00-\u9fff]/.test(t);
      if (to !== "en" && hasCjk && !/[A-Za-z]/.test(t)) return t;
      if (to === "en" && !hasCjk) return t;
      try { const g = await googleTranslate(t, to); if (g) return g; } catch (e) {}
      try { const m = await myMemoryTranslate(t, to); if (m) return m; } catch (e) {}
      return t;
    }));
    return list.map((t, i) => {
      const v = settled[i].status === "fulfilled" ? settled[i].value : "";
      if (!t || t === "Unknown") return v || "";
      return v || t;
    });
  }

  // 代理标题: 中文结果优先, 省/市/州名去后缀 (与本地标题同一规则, 国内出口同样适用);
  // 中文请求全挂时, 用英文结果的国家代码/地区代码/地区名查内置词表恢复中文名,
  // 不再只剩国家; 词表也没有时才退回英文国家名映射
  async function buildProxyTitle(cn, en) {
    let c = "", r = "", d = "";
    let cityEn = "";
    if (cn) { c = cn.country || ""; r = trimAdmin(cn.regionName); d = cityCn(cn.city); cityEn = String(cn.city || "").trim(); }
    if (en) {
      if (!c) c = countryCodeCn[(en.countryCode || "").toUpperCase()] || "";
      if (!r) {
        const cc = (en.countryCode || "").toUpperCase();
        r = trimAdmin((cc && en.region && regionCodeCn[cc + ":" + String(en.region).toUpperCase()]) ||
            regionNameCn[String(en.regionName || "").trim().toLowerCase()] || "");
      }
      if (!d) d = cityCn(en.city);
      if (!cityEn) cityEn = String(en.city || "").trim();
    }
    // 城市名是英文且内置表查不到时, 在线翻译 (任意城市都适用, 换节点不用改表)
    if (!d && cityEn && /[a-zA-Z]/.test(cityEn)) {
      const [tr] = await translateBatch([cityEn], "zh-Hans");
      if (tr && !/[a-zA-Z]/.test(tr)) d = trimAdmin(tr);
    }
    return getCnTitle(c, r, d) || (en ? getCnTitle(en.country, "", "") : "") || "";
  }

  async function fillProxy(jEn, jCn) {
    const en = (jEn && jEn.status === "success") ? jEn : null;
    const cn = (jCn && jCn.status === "success") ? jCn : null;
    if (!en && !cn) return false;
    const main = en || cn;
    proxyData.ip = main.query;
    proxyData.title = await buildProxyTitle(cn, en);
    // 详情行只用英文结果拼: 英文缺失时宁可占位, 不拿中文结果顶替 (与本地块同一规则)
    proxyData.detail = en ? getEnDetail(en.country, en.regionName, en.city) : "Unknown Location";
    let ispName = main.isp || "";
    let asInfo = main.as || "";
    // 统一格式: ISP 名 (AS号), 如 Oracle Corporation (AS31898); 与 IPPure 一致
    const asnMatch = String(asInfo || "").match(/AS(\d+)/i);
    const asnPart = asnMatch ? `(AS${asnMatch[1]})` : "";
    if (ispName && asnPart) {
      proxyData.isp = `${ispName} ${asnPart}`;
    } else if (ispName && asInfo.toLowerCase().includes(ispName.split(' ')[0].toLowerCase())) {
      proxyData.isp = asInfo;
    } else {
      proxyData.isp = `${ispName} ${asInfo}`.trim() || "未知";
    }
    proxyData.flag = flagEmoji(main.countryCode);
    // 关键词补漏: org/as 含云/机房关键词时也判机房 (ip-api 对谷歌云等漏标 hosting)
    const orgAsText = `${main.org || ""} ${main.as || ""}`.toLowerCase();
    const dcByKeyword = /cloud|hosting|datacenter|data center|\bvps\b|\bidc\b/.test(orgAsText);
    const isHostLike = !!(main.hosting || dcByKeyword);
    proxyData.isDC = !!(isHostLike || main.proxy);
    let score = 0;
    if (main.proxy) score += 50;
    if (isHostLike) score += 40;
    proxyData.risk = Math.min(100, score);
    proxyData.success = true;
    return true;
  }

  // 单次查询: 返回 { j } 成功 / { err, status, ttl } 失败, 不抛异常
  async function tryProxyQuery(url, usePolicy, timeoutMs) {
    const opts = { timeout: timeoutMs || TIMEOUT_PROXY, headers: { 'User-Agent': UA } };
    if (usePolicy && POLICY) opts.policy = POLICY;
    try {
      const r = await ctx.http.get(url, opts);
      const status = r.status || 0;
      if (status === 429) {
        let ttl = 0;
        try { ttl = parseFloat((r.headers && r.headers.get) ? (r.headers.get('x-ttl') || 0) : 0) || 0; } catch (e) {}
        return { err: "HTTP 429 接口限流", status: 429, ttl };
      }
      let j = null;
      try { j = await r.json(); } catch (e) { return { err: "接口响应解析失败" }; }
      if (status !== 200) return { err: `HTTP ${status}` };
      if (j && j.status === "success") return { j };
      return { err: (j && j.message) ? `接口: ${j.message}` : "接口返回异常" };
    } catch (e) {
      return { err: (e && e.message) ? String(e.message).slice(0, 40) : "网络错误" };
    }
  }

  async function fetchProxy() {
    const urlEn = `${API_BASE}${FIELDS}`;
    const urlCn = `${API_BASE}${FIELDS}&lang=zh-CN`;
    let lastErr = "";
    let rlErr = "";
    const note = (r) => { if (r.err) { lastErr = r.err; if (r.status === 429) rlErr = r.err; } };
    // 填充前: 若只有中文结果 (详情行需要英文), 在同一路由补打一次英文请求;
    // 仍失败就由 fillProxy 用英文占位, 不拿中文顶替详情行
    const fillSmart = async (enJ, cnJ, usePolicy) => {
      if (cnJ && !enJ) {
        const rEn2 = await tryProxyQuery(urlEn, usePolicy);
        note(rEn2);
        if (rEn2.j) enJ = rEn2.j;
      }
      return await fillProxy(enJ, cnJ);
    };

    // 第 1 轮: 中英并行 (任一成功即可)
    const [rEn, rCn] = await Promise.all([tryProxyQuery(urlEn, true), tryProxyQuery(urlCn, true)]);
    note(rEn); note(rCn);
    if (await fillSmart(rEn.j || null, rCn.j || null, true)) { saveProxyCache(); return; }

    // 第 2 轮: 隔一会单独重试中文 (被限流时按 X-Ttl 等, 上限 4 秒)
    const ttlWait = Math.max(rEn.ttl || 0, rCn.ttl || 0);
    await sleep(rlErr ? Math.min(Math.max(ttlWait, 1), 4) * 1000 : 800);
    const rCn2 = await tryProxyQuery(urlCn, true);
    note(rCn2);
    if (rCn2.j && await fillSmart(null, rCn2.j, true)) { saveProxyCache(); return; }

    // 第 3 轮: 指定了策略组仍全失败 -> 去掉策略组用默认路由再试一次
    if (POLICY) {
      const rCn3 = await tryProxyQuery(urlCn, false);
      note(rCn3);
      if (rCn3.j && await fillSmart(null, rCn3.j, false)) { saveProxyCache(); return; }
    }

    // 全失败: 缓存顶上; 无缓存显示失败 + 原因
    if (!loadProxyCache()) {
      proxyData.ip = "获取失败";
      const reason = rlErr || lastErr;
      if (reason) proxyData.detail = `⚠ ${reason}`;
    }
  }

  function saveLocalCache() {
    try {
      ctx.storage.setString("ipapi_local_v2", JSON.stringify({
        ip: localData.ip,
        d: { title: localData.title, detail: localData.detail, isp: localData.isp, flag: localData.flag }
      }));
    } catch (e) {}
  }

  function loadLocalCache(ip) {
    try {
      const raw = ctx.storage.getString("ipapi_local_v2");
      if (!raw) return false;
      const c = JSON.parse(raw);
      if (!c || c.ip !== ip || !c.d) return false;
      localData.title = c.d.title; localData.detail = c.d.detail;
      localData.isp = c.d.isp; localData.flag = c.d.flag;
      localData.success = true;
      return true;
    } catch (e) { return false; }
  }

  async function fetchLocal() {
    try {
      let resIp = await ctx.http.get(API_LOCAL_IP, { timeout: TIMEOUT, headers: { 'User-Agent': UA } });
      let jIp = await resIp.json();
      if (jIp.ret === "ok" && jIp.data && jIp.data.ip) {
        localData.ip = jIp.data.ip;
        let loc = jIp.data.location || [];
        // 本地 IP 没变: 详情直接用缓存, 不再烧 ip-api 额度
        if (loadLocalCache(localData.ip)) return;
        const urlCn = `${API_BASE}${localData.ip}${FIELDS}&lang=zh-CN`;
        const urlEn = `${API_BASE}${localData.ip}${FIELDS}`;
        const getJson = async (u) => { const r = await ctx.http.get(u, { timeout: TIMEOUT }); return r.json(); };
        const [rCn, rEn] = await Promise.allSettled([getJson(urlCn), getJson(urlEn)]);
        let cn = (rCn.status === "fulfilled" && rCn.value && rCn.value.status === "success") ? rCn.value : null;
        let en = (rEn.status === "fulfilled" && rEn.value && rEn.value.status === "success") ? rEn.value : null;
        // 中英只有一个成功时 (限流下双请求常只过一个), 缺的那个单独再试一次
        if (!cn && en) { try { const j = await getJson(urlCn); if (j && j.status === "success") cn = j; } catch (e) {} }
        if (!en && cn) { try { const j = await getJson(urlEn); if (j && j.status === "success") en = j; } catch (e) {} }
        if (cn || en) {
          const main = en || cn;
          // 标题用中文结果; 中文请求失败时改用 ipip 自带的中文地名,
          // 不拿英文结果硬拼 (英文地区名会被 getCnTitle 丢弃, 只剩国家)
          localData.title = cn
            ? (getCnTitle(cn.country, trimAdmin(cn.regionName), trimAdmin(cn.city)) || "本地")
            : (getCnTitle(loc[0] || "", trimAdmin(loc[1] || ""), trimAdmin(loc[2] || "")) || "本地");
          // 详情行必须全英文: 英文结果缺失时不拿中文结果顶替
          localData.detail = en ? getEnDetail(en.country, en.regionName, en.city) : "China Location";
          localData.flag = flagEmoji(main.countryCode);
          let carrier = "Unicom";
          const ispRaw = (main.isp || "").toLowerCase();
          if (/telecom|电信|ct/i.test(ispRaw)) carrier = "Telecom";
          else if (/mobile|移动|cmcc/i.test(ispRaw)) carrier = "Mobile";
          else if (/broadnet|广电|cbn/i.test(ispRaw)) carrier = "Broadnet";
          localData.isp = `China ${carrier}`;
          localData.success = true;
          saveLocalCache();
          return;
        }
        localData.title = getCnTitle(loc[0]||"本地", trimAdmin(loc[1]||""), trimAdmin(loc[2]||""));
        localData.detail = "China Location";
        localData.isp = loc[4] || "未知";
        localData.flag = "🇨🇳";
      }
    } catch (e) {
      localData.ip = "获取失败";
    }
  }

  await Promise.allSettled([fetchProxy(), fetchLocal()]);

  function flagEmoji(code) {
    if (!code || code.length !== 2) return "🏳️";
    if (code.toUpperCase() === "TW") code = "CN";
    if (code.toUpperCase() === "UK") code = "GB";
    return String.fromCodePoint(...code.toUpperCase().split('').map(c => 127397 + c.charCodeAt()));
  }

  function getRiskColor(score) {
    if (score <= 20) return "#34C759"; 
    if (score <= 40) return "#32ADE6"; 
    if (score <= 60) return "#FFCC00"; 
    if (score <= 80) return "#FF9500"; 
    return "#FF3B30"; 
  }

  function buildInfoBlock(data, isLocal, compact) {
    const fFlag = compact ? 11 : 12;
    const fTitle = compact ? 10 : 11;
    const fIp = compact ? 13 : 16;
    const fSub = compact ? 9 : 10;
    const titleColor = { light: "#333333", dark: "#FFFFFF" };
    const subColor = { light: "#666666", dark: "#AAAAAA" };
    return {
      type: "stack", direction: "column", gap: compact ? 2 : 3,
      children: [
        { 
          type: "stack", direction: "row", alignItems: "center", gap: 4,
          children: [
            { type: "text", text: data.flag, font: { size: fFlag } },
            { type: "text", text: data.title, font: { size: fTitle, weight: "bold" }, textColor: titleColor, maxLines: 1 }
          ]
        },
        { type: "text", text: data.ip, font: { size: fIp, weight: "bold" }, textColor: titleColor, maxLines: 1, minScale: 0.5 },
        { 
          type: "stack", direction: "row", alignItems: "center", gap: 4,
          children: [
            { type: "image", src: isLocal ? "sf-symbol:location.fill" : "sf-symbol:map.fill", color: "#8E8E93", width: 10, height: 10 },
            { type: "text", text: data.detail, font: { size: fSub }, textColor: subColor, maxLines: 1, minScale: 0.8 }
          ]
        },
        { 
          type: "stack", direction: "row", alignItems: "center", gap: 4,
          children: [
            { type: "image", src: isLocal ? "sf-symbol:antenna.radiowaves.left.and.right" : "sf-symbol:server.rack", color: "#8E8E93", width: 10, height: 10 },
            { type: "text", text: data.isp, font: { size: fSub }, textColor: subColor, maxLines: 1, minScale: 0.8 }
          ]
        }
      ]
    };
  }

  const riskColor = getRiskColor(proxyData.risk);

  // 小号: 只保留节点网络 + 本地网络两组信息, 去掉右侧圆环/原生住宅/IP-API 标注
  if ((ctx.widgetFamily || "") === "systemSmall") {
    return {
      type: "widget",
      url: "egern://",
      padding: 12,
      backgroundColor: { light: "#FFFFFF", dark: "#121212" },
      children: [
        {
          type: "stack", direction: "column", gap: 10,
          children: [
            buildInfoBlock(proxyData, false, true),
            buildInfoBlock(localData, true, true)
          ]
        }
      ]
    };
  }

  return {
    type: "widget",
    url: "egern://",
    padding: 16,
    backgroundColor: { light: "#FFFFFF", dark: "#121212" },
    children: [
      {
        type: "stack", direction: "row", alignItems: "center",
        children: [
          {
            type: "stack", direction: "column", gap: 12, flex: 1,
            children: [
              buildInfoBlock(proxyData, false),
              buildInfoBlock(localData, true)
            ]
          },
          {
            type: "stack", direction: "column", alignItems: "center", justifyContent: "center", width: 90, gap: 8,
            children: [
              {
                type: "stack", direction: "column", alignItems: "center", justifyContent: "center",
                width: 76, height: 76, borderRadius: 38,
                borderWidth: 6, borderColor: riskColor,
                backgroundColor: { light: "#FFFFFF", dark: "#1C1C1E" },
                children: [
                  { type: "text", text: `${proxyData.risk}`, font: { size: 28, weight: "heavy" }, textColor: riskColor },
                  { type: "text", text: "风险指数", font: { size: 9, weight: "bold" }, textColor: { light: "#FF9F0A", dark: "#FF9F0A" } }
                ]
              },
              {
                type: "stack", direction: "column", alignItems: "center", gap: 2,
                children: [
                  // 💡 仅在此处将 "非原生" 改为 "商业"
                  { type: "text", text: proxyData.isDC ? "商业" : "原生", font: { size: 11, weight: "bold" }, textColor: { light: "#333333", dark: "#DDDDDD" } },
                  { type: "text", text: proxyData.isDC ? "机房" : "住宅", font: { size: 11, weight: "bold" }, textColor: { light: "#333333", dark: "#DDDDDD" } }
                ]
              },
              { type: "text", text: "IP-API", font: { size: 8, weight: "medium" }, textColor: "#34C759" }
            ]
          }
        ]
      }
    ]
  };
}
