/**
 * 🌏 Egern IPPure 小组件
 * 版本：v1.8 (2026-11-04)
 * 环境变量 (可选):
 * 名称：POLICY
 * 值：自定义策略组节点名称，例如 美国节点；不填则按默认路由查询
 */

const API_MAIN = "https://my.ippure.com/v1/info";
const API_LOCAL_IP = "https://myip.ipip.net/json";
const TIMEOUT = 5000;
const TIMEOUT_PROXY = 6000;
const TIMEOUT_TRANS = 3000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.61 Safari/537.36';

export default async function(ctx) {
  // 1. 初始化数据容器 (配合 IP-API 的 UI)
  let proxyData = { ip: "获取中...", title: "节点网络", detail: "未知", isp: "未知", flag: "🏳️", risk: 0, isDC: false, success: false };
  let localData = { ip: "获取中...", title: "本地网络", detail: "未知", isp: "未知", flag: "🇨🇳", success: false };
  const POLICY = ((ctx.env && ctx.env.POLICY) || "").toString().trim();

  // 💡 终极防线：常见国家名强制兜底字典
  const countryMap = { "united states": "美国", "us": "美国", "singapore": "新加坡", "japan": "日本", "hong kong": "香港", "taiwan": "台湾", "united kingdom": "英国", "uk": "英国", "korea": "韩国", "south korea": "韩国" };

  // 💡 国家代码中文表 (翻译接口失效时兜底, 保证第一行国家名是中文)
  const countryCodeCn = { US: "美国", CN: "中国", HK: "香港", TW: "台湾", MO: "澳门", JP: "日本", KR: "韩国", SG: "新加坡", GB: "英国", UK: "英国", DE: "德国", FR: "法国", CA: "加拿大", AU: "澳大利亚", NL: "荷兰", CH: "瑞士", SE: "瑞典", NO: "挪威", DK: "丹麦", FI: "芬兰", IT: "意大利", ES: "西班牙", PT: "葡萄牙", IE: "爱尔兰", AT: "奥地利", BE: "比利时", PL: "波兰", CZ: "捷克", HU: "匈牙利", GR: "希腊", TR: "土耳其", RU: "俄罗斯", UA: "乌克兰", IN: "印度", TH: "泰国", VN: "越南", MY: "马来西亚", ID: "印度尼西亚", PH: "菲律宾", NZ: "新西兰", MX: "墨西哥", BR: "巴西", AR: "阿根廷", CL: "智利", CO: "哥伦比亚", PE: "秘鲁", ZA: "南非", EG: "埃及", NG: "尼日利亚", KE: "肯尼亚", IL: "以色列", AE: "阿联酋", SA: "沙特阿拉伯", QA: "卡塔尔", KW: "科威特", IR: "伊朗", IQ: "伊拉克", PK: "巴基斯坦", BD: "孟加拉国", LK: "斯里兰卡", MM: "缅甸", KH: "柬埔寨", LA: "老挝", MN: "蒙古", NP: "尼泊尔", KZ: "哈萨克斯坦", UZ: "乌兹别克斯坦" };

  // 💡 地区中文表: 按 "国家代码:地区代码" 查 (接口自带 regionCode, 不依赖翻译接口)
  const regionCodeCn = {
    "US:AL": "阿拉巴马州", "US:AK": "阿拉斯加州", "US:AZ": "亚利桑那州", "US:AR": "阿肯色州", "US:CA": "加利福尼亚州", "US:CO": "科罗拉多州", "US:CT": "康涅狄格州", "US:DE": "特拉华州", "US:FL": "佛罗里达州", "US:GA": "佐治亚州", "US:HI": "夏威夷州", "US:ID": "爱达荷州", "US:IL": "伊利诺伊州", "US:IN": "印第安纳州", "US:IA": "艾奥瓦州", "US:KS": "堪萨斯州", "US:KY": "肯塔基州", "US:LA": "路易斯安那州", "US:ME": "缅因州", "US:MD": "马里兰州", "US:MA": "马萨诸塞州", "US:MI": "密歇根州", "US:MN": "明尼苏达州", "US:MS": "密西西比州", "US:MO": "密苏里州", "US:MT": "蒙大拿州", "US:NE": "内布拉斯加州", "US:NV": "内华达州", "US:NH": "新罕布什尔州", "US:NJ": "新泽西州", "US:NM": "新墨西哥州", "US:NY": "纽约州", "US:NC": "北卡罗来纳州", "US:ND": "北达科他州", "US:OH": "俄亥俄州", "US:OK": "俄克拉荷马州", "US:OR": "俄勒冈州", "US:PA": "宾夕法尼亚州", "US:RI": "罗得岛州", "US:SC": "南卡罗来纳州", "US:SD": "南达科他州", "US:TN": "田纳西州", "US:TX": "得克萨斯州", "US:UT": "犹他州", "US:VT": "佛蒙特州", "US:VA": "弗吉尼亚州", "US:WA": "华盛顿州", "US:WV": "西弗吉尼亚州", "US:WI": "威斯康星州", "US:WY": "怀俄明州", "US:DC": "哥伦比亚特区", "US:PR": "波多黎各", "US:GU": "关岛", "US:VI": "美属维尔京群岛", "US:AS": "美属萨摩亚", "US:MP": "北马里亚纳群岛",
    "CA:AB": "阿尔伯塔省", "CA:BC": "不列颠哥伦比亚省", "CA:MB": "曼尼托巴省", "CA:NB": "新不伦瑞克省", "CA:NL": "纽芬兰与拉布拉多省", "CA:NS": "新斯科舍省", "CA:NT": "西北地区", "CA:NU": "努纳武特地区", "CA:ON": "安大略省", "CA:PE": "爱德华王子岛省", "CA:QC": "魁北克省", "CA:SK": "萨斯喀彻温省", "CA:YT": "育空地区",
    "AU:ACT": "澳大利亚首都领地", "AU:NSW": "新南威尔士州", "AU:NT": "北领地", "AU:QLD": "昆士兰州", "AU:SA": "南澳大利亚州", "AU:TAS": "塔斯马尼亚州", "AU:VIC": "维多利亚州", "AU:WA": "西澳大利亚州",
    "CN:BJ": "北京市", "CN:TJ": "天津市", "CN:HE": "河北省", "CN:SX": "山西省", "CN:NM": "内蒙古自治区", "CN:LN": "辽宁省", "CN:JL": "吉林省", "CN:HL": "黑龙江省", "CN:SH": "上海市", "CN:JS": "江苏省", "CN:ZJ": "浙江省", "CN:AH": "安徽省", "CN:FJ": "福建省", "CN:JX": "江西省", "CN:SD": "山东省", "CN:HA": "河南省", "CN:HB": "湖北省", "CN:HN": "湖南省", "CN:GD": "广东省", "CN:GX": "广西壮族自治区", "CN:HI": "海南省", "CN:CQ": "重庆市", "CN:SC": "四川省", "CN:GZ": "贵州省", "CN:YN": "云南省", "CN:XZ": "西藏自治区", "CN:SN": "陕西省", "CN:GS": "甘肃省", "CN:QH": "青海省", "CN:NX": "宁夏回族自治区", "CN:XJ": "新疆维吾尔自治区", "CN:HK": "香港特别行政区", "CN:MO": "澳门特别行政区", "CN:TW": "台湾省",
    "GB:ENG": "英格兰", "GB:SCT": "苏格兰", "GB:WLS": "威尔士", "GB:NIR": "北爱尔兰"
  };

  // 💡 地区中文表: 按英文全名查 (regionCode 缺失时兜底, 覆盖美国各州与中国各省)
  const regionNameCn = {
    "alabama": "阿拉巴马州", "alaska": "阿拉斯加州", "arizona": "亚利桑那州", "arkansas": "阿肯色州", "california": "加利福尼亚州", "colorado": "科罗拉多州", "connecticut": "康涅狄格州", "delaware": "特拉华州", "florida": "佛罗里达州", "georgia": "佐治亚州", "hawaii": "夏威夷州", "idaho": "爱达荷州", "illinois": "伊利诺伊州", "indiana": "印第安纳州", "iowa": "艾奥瓦州", "kansas": "堪萨斯州", "kentucky": "肯塔基州", "louisiana": "路易斯安那州", "maine": "缅因州", "maryland": "马里兰州", "massachusetts": "马萨诸塞州", "michigan": "密歇根州", "minnesota": "明尼苏达州", "mississippi": "密西西比州", "missouri": "密苏里州", "montana": "蒙大拿州", "nebraska": "内布拉斯加州", "nevada": "内华达州", "new hampshire": "新罕布什尔州", "new jersey": "新泽西州", "new mexico": "新墨西哥州", "new york": "纽约州", "north carolina": "北卡罗来纳州", "north dakota": "北达科他州", "ohio": "俄亥俄州", "oklahoma": "俄克拉荷马州", "oregon": "俄勒冈州", "pennsylvania": "宾夕法尼亚州", "rhode island": "罗得岛州", "south carolina": "南卡罗来纳州", "south dakota": "南达科他州", "tennessee": "田纳西州", "texas": "得克萨斯州", "utah": "犹他州", "vermont": "佛蒙特州", "virginia": "弗吉尼亚州", "washington": "华盛顿州", "west virginia": "西弗吉尼亚州", "wisconsin": "威斯康星州", "wyoming": "怀俄明州", "district of columbia": "哥伦比亚特区", "puerto rico": "波多黎各", "guam": "关岛",
    "beijing": "北京市", "tianjin": "天津市", "hebei": "河北省", "shanxi": "山西省", "inner mongolia": "内蒙古自治区", "liaoning": "辽宁省", "jilin": "吉林省", "heilongjiang": "黑龙江省", "shanghai": "上海市", "jiangsu": "江苏省", "zhejiang": "浙江省", "anhui": "安徽省", "fujian": "福建省", "jiangxi": "江西省", "shandong": "山东省", "henan": "河南省", "hubei": "湖北省", "hunan": "湖南省", "guangdong": "广东省", "guangxi": "广西壮族自治区", "hainan": "海南省", "chongqing": "重庆市", "sichuan": "四川省", "guizhou": "贵州省", "yunnan": "云南省", "tibet": "西藏自治区", "shaanxi": "陕西省", "gansu": "甘肃省", "qinghai": "青海省", "ningxia": "宁夏回族自治区", "xinjiang": "新疆维吾尔自治区"
  };

  const isPureCn = (s) => !!s && !/[A-Za-z]/.test(s);

  function localizedCountry(country, countryCode, translated) {
    if (isPureCn(translated)) return String(translated).trim();
    const byCode = countryCodeCn[(countryCode || "").toUpperCase()];
    if (byCode) return byCode;
    const byName = countryMap[(country || "").toLowerCase()];
    if (byName) return byName;
    return isPureCn(country) ? String(country).trim() : "";
  }

  // 翻译给出的地区名若是词表标准名的前缀 (如 MyMemory 把 California 译成
  // 加利福尼亚, 少了州字), 补全为标准名 (加利福尼亚州); 词表没有、
  // 或译名并非标准名前缀时原样返回, 不改动谷歌等正常译名
  function completeRegion(countryCode, regionEn, regionCode, cn) {
    if (!cn) return cn;
    const cc = (countryCode || "").toUpperCase();
    const rc = (regionCode || "").toUpperCase();
    const canonical = (cc && rc && regionCodeCn[cc + ":" + rc]) || regionNameCn[String(regionEn || "").trim().toLowerCase()] || "";
    return (canonical && canonical !== cn && canonical.startsWith(cn)) ? canonical : cn;
  }

  function localizedRegion(countryCode, region, regionCode, translated) {
    if (isPureCn(translated)) return completeRegion(countryCode, region, regionCode, String(translated).trim());
    const cc = (countryCode || "").toUpperCase();
    const rc = (regionCode || "").toUpperCase();
    if (cc && rc && regionCodeCn[cc + ":" + rc]) return regionCodeCn[cc + ":" + rc];
    const byName = regionNameCn[(region || "").trim().toLowerCase()];
    if (byName) return byName;
    return isPureCn(region) ? String(region).trim() : "";
  }

  // 💡 终极防线：纯中文标题提取器（只要带英文直接丢弃去重）
  function getCnTitle(c, r, d) {
    let res = [];
    const hasEng = (str) => /[a-zA-Z]/.test(str);
    let c_cn = c;
    if (c && hasEng(c) && countryMap[c.toLowerCase()]) c_cn = countryMap[c.toLowerCase()];
    if (c_cn) res.push(c_cn);
    // 省和市：只要包含任何英文字母，直接抛弃
    if (r && r !== c_cn && !hasEng(r)) res.push(r);
    if (d && d !== c_cn && d !== r && !hasEng(d)) res.push(d);
    return res.join(" ").trim() || "未知节点";
  }

  // 💡 终极防线：纯英文详情提取器（包含国家名直接丢弃去重）
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

  // 省/市名去掉末尾的省/市两个字 (广东省 -> 广东, 广州市 -> 广州)
  function trimAdmin(s) {
    return String(s || "").trim().replace(/(省|市)$/, "");
  }

  // 2. 在线翻译 (双接口, 均免 key): 谷歌 gtx 优先 (地名质量最好), 逐条失败
  // 再落 MyMemory (可直连); 两者都失败回退原文。已是目标语种的条目直接跳过,
  // 不发请求。批量条目并行发出, 不再串行瀑布。
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

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function saveProxyCache() {
    try {
      ctx.storage.setString("ippure_proxy_v4", JSON.stringify({
        t: Date.now(),
        d: { ip: proxyData.ip, title: proxyData.title, detail: proxyData.detail, isp: proxyData.isp, flag: proxyData.flag, risk: proxyData.risk, isDC: proxyData.isDC }
      }));
    } catch (e) {}
  }

  function loadProxyCache() {
    try {
      const raw = ctx.storage.getString("ippure_proxy_v4");
      if (!raw) return false;
      const c = JSON.parse(raw);
      if (!c || !c.d || !c.d.ip || (Date.now() - (c.t || 0)) > 24 * 3600 * 1000) return false;
      proxyData.ip = c.d.ip; proxyData.title = c.d.title; proxyData.detail = c.d.detail;
      proxyData.isp = c.d.isp; proxyData.flag = c.d.flag; proxyData.risk = c.d.risk || 0;
      proxyData.isDC = !!c.d.isDC; proxyData.success = true;
      return true;
    } catch (e) { return false; }
  }

  // 3. 按 IP 查本地化地名: ip-api 支持指定任意 IP + lang 返回对应语言地名
  // (与 IP-API 组件同源)。代理标题要中文名 (zh-CN), 本地详情要全英文名 (en)。
  // 这是按 IP 查数据库, 不经过代理出口, 不影响 IPPure 主数据; 结果按 IP
  // 缓存 24h。在线翻译给不全地名时由本函数补缺, 查不到返回 null。
  async function lookupGeo(ip, lang) {
    if (!ip) return null;
    const key = "ippure_geo_v1:" + lang + ":" + ip;
    try {
      const raw = ctx.storage.getString(key);
      if (raw) {
        const c = JSON.parse(raw);
        if (c && c.d && (Date.now() - (c.t || 0)) < 24 * 3600 * 1000) return c.d;
      }
    } catch (e) {}
    try {
      const r = await ctx.http.get(`http://ip-api.com/json/${ip}?lang=${lang}&fields=status,country,regionName,city`, { timeout: 4000, headers: { 'User-Agent': UA } });
      const g = await r.json();
      if (!g || g.status !== "success" || !g.country) return null;
      const d = { country: g.country || "", region: g.regionName || "", city: g.city || "" };
      try { ctx.storage.setString(key, JSON.stringify({ t: Date.now(), d })); } catch (e) {}
      return d;
    } catch (e) { return null; }
  }

  // 4. 数据获取 (接口地址不变)
  async function fetchProxyOnce() {
    const opts = { timeout: TIMEOUT_PROXY, headers: { 'User-Agent': UA } };
    if (POLICY) opts.policy = POLICY;
    let res = await ctx.http.get(API_MAIN, opts);
    let j = await res.json();
    if (!j || !j.ip) return false;

    proxyData.ip = j.ip;
    let country = j.country || "";
    let region = j.region || j.regionName || "";
    let city = j.city || "";

    // 第一行 = 国家 + 地区 (均为中文): 首选在线翻译 (谷歌 gtx -> MyMemory),
    // 翻译给不全时按 IP 查到的中文地名补缺, 最后才用内置地名表
    const [countryTr, regionTr, cityTr] = await translateBatch([country, region, city], "zh-Hans");
    let countryCn = isPureCn(countryTr) ? countryTr.trim() : "";
    let regionCn = isPureCn(regionTr) ? regionTr.trim() : (isPureCn(cityTr) ? cityTr.trim() : "");
    if (regionCn) regionCn = completeRegion(j.countryCode, isPureCn(regionTr) ? region : city, isPureCn(regionTr) ? j.regionCode : "", regionCn);
    if (!countryCn || !regionCn) {
      const geoCn = await lookupGeo(j.ip, "zh-CN");
      if (geoCn && isPureCn(geoCn.country)) {
        if (!countryCn) countryCn = geoCn.country;
        if (!regionCn) regionCn = isPureCn(geoCn.region) ? geoCn.region : (isPureCn(geoCn.city) ? geoCn.city : "");
      }
    }
    if (!countryCn) countryCn = localizedCountry(country, j.countryCode, countryTr);
    if (!regionCn) {
      regionCn = localizedRegion(j.countryCode, region, j.regionCode, regionTr);
      if (!regionCn) regionCn = localizedRegion(j.countryCode, city, "", cityTr);
    }
    const title = [countryCn, regionCn].filter(Boolean).join(" ");
    proxyData.title = title || "未知节点";
    proxyData.detail = getEnDetail(country, region, city);

    const asOrg = j.asOrganization || "";
    const asn = (j.asn !== undefined && j.asn !== null && j.asn !== "") ? j.asn : "";
    proxyData.isp = (asOrg || asn) ? `${asOrg} (AS${asn})`.trim() : "未知";
    proxyData.flag = flagEmoji(j.countryCode);
    proxyData.risk = j.fraudScore || 0;
    // isResidential 缺失时旧版 !undefined 会误判商业/机房, 改为缺失按住宅
    proxyData.isDC = (typeof j.isResidential === "boolean") ? !j.isResidential : false;
    proxyData.success = true;
    return true;
  }

  async function fetchProxy() {
    try { if (await fetchProxyOnce()) { saveProxyCache(); return; } } catch (e) {}
    try {
      await sleep(800);
      if (await fetchProxyOnce()) { saveProxyCache(); return; }
    } catch (e) {}
    if (!loadProxyCache()) proxyData.ip = "获取失败";
  }

  async function fetchLocal() {
    try {
      let res = await ctx.http.get(API_LOCAL_IP, { timeout: TIMEOUT, headers: { 'User-Agent': UA } });
      let localSimple = await res.json();

      if (localSimple.ret === "ok" && localSimple.data && localSimple.data.ip) {
        localData.ip = localSimple.data.ip;
        let loc = localSimple.data.location || [];
        let country = loc[0] || "";
        let prov = loc[1] || "";
        let city = loc[2] || "";

        // 运营商全字匹配转英文 (原逻辑不变)
        let localCarrierEn = "Unicom";
        let locStr = loc.join("").toLowerCase();
        if (locStr.includes("电信") || locStr.includes("telecom") || locStr.includes("ct")) {
          localCarrierEn = "Telecom";
        } else if (locStr.includes("移动") || locStr.includes("mobile") || locStr.includes("cmcc")) {
          localCarrierEn = "Mobile";
        } else if (locStr.includes("广电") || locStr.includes("broadnet") || locStr.includes("cbn")) {
          localCarrierEn = "Broadnet";
        }
        localData.isp = `China ${localCarrierEn}`;

        // 标题 (中文) = 国家 + 省 + 市 (省市名不带省/市字); ipip 给不全
        // (蜂窝下常缺城市) 时, 按本地 IP 查到的中文地名补缺
        const zh = await translateBatch([country, prov, city], "zh-Hans");
        let tProv = trimAdmin(zh[1]);
        let tCity = trimAdmin(zh[2]);
        if (tCity && tCity === tProv) tCity = "";
        if (!tProv || !tCity) {
          const geoCn = await lookupGeo(localData.ip, "zh-CN");
          if (geoCn) {
            if (!tProv) tProv = trimAdmin(geoCn.region);
            if (!tCity) { const gc = trimAdmin(geoCn.city); if (gc && gc !== tProv) tCity = gc; }
          }
        }
        localData.title = getCnTitle(zh[0], tProv, tCity) || "本地网络";

        // 详情行 (全英文): 首选在线翻译; 译文带中文 (翻译失败) 或源数据
        // 缺省/缺市时, 按本地 IP 查到的英文地名补全
        const en = await translateBatch([prov, city], "en");
        const enDetail = getEnDetail("China", en[0], en[1]);
        const enOk = !!enDetail && !/[\u4e00-\u9fff]/.test(enDetail);
        if (enOk && prov && city) {
          localData.detail = enDetail;
        } else {
          const geoEn = await lookupGeo(localData.ip, "en");
          const geoDetail = geoEn ? getEnDetail(geoEn.country, geoEn.region, geoEn.city) : "";
          localData.detail = (geoDetail && (!enOk || geoDetail.split(" ").length > enDetail.split(" ").length)) ? geoDetail : enDetail;
        }

        localData.flag = "🇨🇳";
        localData.success = true;
      } else {
        localData.ip = "获取失败";
      }
    } catch (e) {
      localData.ip = "获取失败";
    }
  }

  // 并发拉取
  await Promise.allSettled([fetchProxy(), fetchLocal()]);

  // 4. 辅助格式化函数
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

  // 5. UI 构建器 (原封不动套用 IP-API 的排版)
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

  // 小号: 只保留节点网络 + 本地网络两组信息, 去掉右侧圆环/原生住宅/IPPure 标注
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

  // 6. 组装终极布局
  return {
    type: "widget",
    url: "egern://",
    padding: 16,
    backgroundColor: { light: "#FFFFFF", dark: "#121212" },
    children: [
      {
        type: "stack", direction: "row", alignItems: "center",
        children: [
          // 左侧信息栏 (代理在上，本地在下)
          {
            type: "stack", direction: "column", gap: 12, flex: 1,
            children: [
              buildInfoBlock(proxyData, false),
              buildInfoBlock(localData, true)
            ]
          },
          
          // 右侧风险评估盘
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
              // 原生/商业 状态标签
              {
                type: "stack", direction: "column", alignItems: "center", gap: 2,
                children: [
                  // 💡 真正修改这行：将 "非原生" 替换为 "商业"
                  { type: "text", text: proxyData.isDC ? "商业" : "原生", font: { size: 11, weight: "bold" }, textColor: { light: "#333333", dark: "#DDDDDD" } },
                  // 💡 恢复为原本的 "机房"
                  { type: "text", text: proxyData.isDC ? "机房" : "住宅", font: { size: 11, weight: "bold" }, textColor: { light: "#333333", dark: "#DDDDDD" } }
                ]
              },
              // 底部来源标识
              { type: "text", text: "IPPure", font: { size: 8, weight: "medium" }, textColor: "#34C759" }
            ]
          }
        ]
      }
    ]
  };
}
