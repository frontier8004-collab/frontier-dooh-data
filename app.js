/* =========================================================
Frontier DOOH 전국 DB
JS 분리 버전 (v1.1.27 기반 안정화)

- index.html 안의 <script>...</script> 내용을 이 파일로 이동합니다.
- index.html에는 <script src="./app.js" defer></script> 한 줄만 남깁니다.
========================================================= */
(() => {
  "use strict";

  const VERSION = "v1.1.27.2";
  const DATA_URL = "./data_public.json";

  const CATEGORY_TREE = [
    { high:"전광판 / 빌보드 / 외벽", lows:["전광판","빌보드","외벽"] },
    { high:"교통매체", lows:["버스광고","지하철 광고","택시 광고","차량 광고","주요 도로 야립 광고","공항 / 기내, 항공기 광고","버스 쉘터 광고","KTX 광고","터미널 광고"] },
    { high:"복합 쇼핑몰 / 대형마트", lows:["복합 쇼핑몰","대형마트"] },
    { high:"극장 / 레저 / 휴양 시설", lows:["극장","레저","휴양, 편의시설"] },
    { high:"생활 밀착형 매체", lows:["엘리베이터 광고","병원","편의점","운동시설","캠퍼스","식당, 주점","약국","헤어&뷰티살롱","드럭스토어"] },
  ];

  const HOME_ZOOM = 8;

  const HOME_BOUNDS_FIXED = { north:39.5, south:33.0, west:123.5, east:130.5 };
  const HOME_CENTER_SHIFT = { upPct:-0.07, leftPct:-0.10 };

  function computeHomeCenter(){
    const midLat = (HOME_BOUNDS_FIXED.north + HOME_BOUNDS_FIXED.south) / 2;
    const midLng = (HOME_BOUNDS_FIXED.west + HOME_BOUNDS_FIXED.east) / 2;
    const latSpan = (HOME_BOUNDS_FIXED.north - HOME_BOUNDS_FIXED.south);
    const lngSpan = (HOME_BOUNDS_FIXED.east - HOME_BOUNDS_FIXED.west);

    const latShift = latSpan * HOME_CENTER_SHIFT.upPct;
    const lngShift = lngSpan * HOME_CENTER_SHIFT.leftPct;
    return [ midLat + latShift, midLng - lngShift ];
  }
  const HOME_CENTER = computeHomeCenter();

  let ALL = [];
  let map = null;
  let markers = null;

  const markerByKey = new Map();
  const cardByKey = new Map();
  const itemByKey = new Map();

  const BATCH = 36;
  const LIST_INITIAL_LIMIT = 200;
  const LIST_MORE_STEP = 200;
  const STEP = 24;

  let renderLimit = BATCH;
  let curInView = [];
  let curBase = [];
  let currentOpenKey = null;

  let suppressHashHandler = false;
  let highlightedClusterEl = null;

  let isMapInteracting = false;
  let suspendViewportOnce = false;

  let activeQuery = "";

  const QUICK_SUGGEST = ["강남구","강남역","홍대","홍대역","오송역","전광판","KTX","공항"];
  let SUG_POOL = [];
  let SUG_META = new Map();
  let sugIndex = -1;

  let hoverKey = null;
  let activeMiniKey = null;

  let shuffleSeed = Math.random();

  const SS_RECENT = "frontier_recent_viewed_v1";
  const SS_CART = "frontier_cart_v1";
  const LS_QHIST = "frontier_query_hist_v1";

  let recentKeys = [];
  let cartKeys = [];

  const RECENT_PAGE_SIZE = 4;
  let recentPage = 0;

  let pinnedTopKey = null;
  let pinFlashTimer = null;

  let returnToCartAfterDetail = false;

  let lastInViewHash = "";

  const $ = (id) => document.getElementById(id);

  function showErrorBanner(msg){
    const b = $("errBanner");
    if (!b) return;
    $("errMsg").textContent = msg || "알 수 없는 오류";
    $("errUrl").textContent = DATA_URL;
    b.style.display = "block";
  }
  function hideErrorBanner(){
    const b = $("errBanner");
    if (!b) return;
    b.style.display = "none";
  }

  function addOption(sel, value, label){
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label ?? value;
    sel.appendChild(o);
  }

  function escapeHtml(s){
    return (s ?? "").toString()
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }

  function searchNorm(s){
    return (s ?? "")
      .toString()
      .toLowerCase()
      .replace(/\s+/g,"")
      .replace(/[()［］\[\]{}<>.,\-_/\\]/g,"");
  }

  function stripDigits(s){
    return (s ?? "").toString().replace(/[0-9]/g,"");
  }

  function extractTokens(text){
    const s = (text ?? "").toString();
    const m = s.match(/[가-힣A-Za-z0-9]+/g);
    return m ? m : [];
  }

  // 한글 자모 분해
  const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  const JUNG = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
  const JONG = ["","ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];

  function isCompatConsonant(c){
    const code = c.charCodeAt(0);
    return (code >= 0x3131 && code <= 0x314E);
  }

  function toJamo(str){
    const s = (str ?? "").toString();
    let out = "";
    for (let i=0;i<s.length;i++){
      const ch = s[i];
      const code = ch.charCodeAt(0);
      if (code >= 0xAC00 && code <= 0xD7A3){
        const v = code - 0xAC00;
        const cho = Math.floor(v / 588);
        const jung = Math.floor((v % 588) / 28);
        const jong = v % 28;
        out += (CHO[cho] || "") + (JUNG[jung] || "") + (JONG[jong] || "");
      }else if (isCompatConsonant(ch) || (code >= 0x314F && code <= 0x3163)){
        out += ch;
      }
    }
    return out;
  }

  function stripAdminSuffix(t){
    return (t ?? "").toString().replace(/(특별시|광역시|자치시|도|시|군|구|읍|면|동|리|가)$/,"");
  }
  function stripRoadSuffix(t){
    return (t ?? "").toString().replace(/(대로|로|길)$/,"");
  }
  function stripStationSuffix(t){
    return (t ?? "").toString().replace(/(역)$/,"");
  }

  const PROTECT_SHORT_NORM = new Set([
    searchNorm("대구"), searchNorm("대전"), searchNorm("부산"), searchNorm("광주"),
    searchNorm("울산"), searchNorm("인천"), searchNorm("서울"), searchNorm("세종")
  ]);

  function isProtectedShortWord(raw){
    const t = (raw ?? "").toString().trim();
    if (!t) return false;
    const n0 = searchNorm(t);
    if (PROTECT_SHORT_NORM.has(n0)) return true;
    const n1 = stripAdminSuffix(stripDigits(n0));
    if (n1 && PROTECT_SHORT_NORM.has(n1)) return true;
    const baseStation = searchNorm(stripStationSuffix(t));
    if (baseStation && PROTECT_SHORT_NORM.has(baseStation)) return true;
    return false;
  }

  function tokenVariantsForLoose(tok){
    const raw = (tok ?? "").toString().trim();
    if (!raw) return [];
    const t0 = searchNorm(raw);
    const t1 = stripDigits(t0);
    const vars = new Set();
    if (t0) vars.add(t0);
    if (t1) vars.add(t1);
    const a0 = stripAdminSuffix(t1);
    if (a0 && a0 !== t1) vars.add(a0);
    const r0 = stripRoadSuffix(t1);
    if (r0 && r0 !== t1) vars.add(r0);
    const s0 = searchNorm(stripStationSuffix(raw));
    if (s0 && s0 !== t1) vars.add(s0);

    if (/[동리가면읍구군시도]$/.test(raw)){
      const base = a0 || stripAdminSuffix(t1) || t1;
      if (base){
        vars.add(base);
        vars.add(base + "로");
        vars.add(base + "길");
        vars.add(base + "대로");
      }
    }

    if (/(대로|로|길)$/.test(raw)){
      const base = r0 || stripRoadSuffix(t1) || t1;
      if (base){
        vars.add(base);
        vars.add(base + "동");
      }
    }

    if (/역$/.test(raw)){
      const base = s0 || t1;
      if (base){
        vars.add(base);
        vars.add(base + "역");
      }
    }

    return Array.from(vars).filter(v => v && v.length >= 1);
  }

  function fmtWon(price, unit){
    const s = (price ?? "").toString();
    const n = parseInt(s.replace(/[^\d]/g,""), 10);
    if (!n || isNaN(n)) return "문의";
    const won = "₩" + n.toLocaleString("ko-KR");
    const u = (unit ?? "").toString().trim();
    return u ? `${won} / ${u}` : won;
  }

  function parsePriceNumber(price){
    const s = (price ?? "").toString();
    const n = parseInt(s.replace(/[^\d]/g,""), 10);
    if (!n || isNaN(n)) return null;
    return n;
  }

  function guessPlace(item){
    const addr = (item.address || "").trim();
    const toks = addr.split(" ").filter(Boolean);
    return toks.slice(0, Math.min(4, toks.length)).join(" ") || (item.title || "-");
  }

  function norm(s){
    return (s ?? "").toString().toLowerCase().replace(/\s+/g,"");
  }

  function normalizeLow(raw){
    const s = norm(raw);
    if (s.includes("전광판") || s.includes("옥외전광판") || s.includes("디지털") || s.includes("digital") || s.includes("signage") || s.includes("screen") || s.includes("display") || s.includes("led")) return "전광판";
    if (s.includes("빌보드") || s.includes("billboard")) return "빌보드";
    if (s.includes("외벽") || s.includes("미디어파사드") || s.includes("facade") || s.includes("façade")) return "외벽";

    if (s.includes("지하철") || s.includes("subway") || s.includes("metro")) return "지하철 광고";
    if (s.includes("택시") || s.includes("taxi")) return "택시 광고";
    if (s.includes("ktx")) return "KTX 광고";
    if (s.includes("터미널") || s.includes("terminal")) return "터미널 광고";
    if (s.includes("공항") || s.includes("airport") || s.includes("항공") || s.includes("기내") || s.includes("inflight")) return "공항 / 기내, 항공기 광고";
    if (s.includes("쉘터") || s.includes("shelter") || s.includes("정류장")) return "버스 쉘터 광고";
    if (s.includes("야립") || s.includes("도로")) return "주요 도로 야립 광고";
    if (s.includes("차량") || s.includes("vehicle")) return "차량 광고";
    if (s.includes("버스") || s.includes("bus")) return "버스광고";

    return "";
  }

  function mapOriginalHigh(it){
    const mg = norm(it.media_group);
    const cl = norm(it.category_low);
    const title = norm(it.title);
    const any = mg + " " + cl + " " + title;

    if (any.includes("전광판") || any.includes("billboard") || any.includes("led") || any.includes("digital") || any.includes("signage") || any.includes("screen") || any.includes("display") || any.includes("미디어파사드") || any.includes("facade") || any.includes("façade") || any.includes("외벽")) return "전광판 / 빌보드 / 외벽";
    if (any.includes("교통") || any.includes("버스") || any.includes("지하철") || any.includes("택시") || any.includes("ktx") || any.includes("터미널") || any.includes("공항") || any.includes("airport")) return "교통매체";
    if (any.includes("쇼핑몰") || any.includes("마트") || any.includes("대형") || any.includes("백화점") || any.includes("아울렛")) return "복합 쇼핑몰 / 대형마트";
    if (any.includes("극장") || any.includes("cgv") || any.includes("메가박스") || any.includes("롯데시네마") || any.includes("레저") || any.includes("휴양") || any.includes("리조트")) return "극장 / 레저 / 휴양 시설";
    if (any.includes("엘리베이터") || any.includes("병원") || any.includes("편의점") || any.includes("약국") || any.includes("캠퍼스") || any.includes("식당") || any.includes("주점") || any.includes("뷰티") || any.includes("드럭") || any.includes("헬스") || any.includes("피트니스") || any.includes("필라테스")) return "생활 밀착형 매체";
    return "";
  }

  function assignTaxonomy(it){
    const high = mapOriginalHigh(it);
    const raw = (it.category_low || it.media_group || it.title || "").toString();
    const low = normalizeLow(raw);

    if (high === "전광판 / 빌보드 / 외벽"){
      const l = low || normalizeLow(it.media_group) || normalizeLow(it.title);
      return { high, low: l || "전광판" };
    }
    return { high, low };
  }

  function setCatHighOptions(){
    const sel = $("catHigh");
    if (!sel) return;
    sel.innerHTML = "";
    addOption(sel, "", "매체 카테고리 (전체)");
    CATEGORY_TREE.map(x=>x.high).forEach(v => addOption(sel, v, v));
  }

  function makeSearchText(it){
    const parts = [];
    const add = (v) => {
      if (typeof v !== "string") return;
      const s = v.trim();
      if (!s) return;
      parts.push(s);
    };
    add(it.title);
    add(it.address);
    add(it._high);
    add(it._low);

    const commonKeys = [
      "address_road","road_address","addr_road","address_jibun","jibun_address","addr_jibun",
      "sido","sigungu","si","gu","gun","dong","emd","eupmyeondong","legal_dong","admin_dong",
      "region_1","region_2","region_3"
    ];
    for (const k of commonKeys) add(it[k]);

    for (const [k, v] of Object.entries(it)){
      if (typeof v !== "string") continue;
      const lk = String(k).toLowerCase();
      if (lk.includes("thumb") || lk.includes("image") || lk.includes("img")) continue;
      if (lk.includes("url") || lk.includes("link") || lk.includes("api")) continue;
      add(v);
    }
    return parts.join(" ");
  }

  function metersToLat(m){ return m / 111320; }
  function metersToLng(m, lat){
    const r = Math.cos((lat * Math.PI) / 180);
    return m / (111320 * Math.max(0.2, r));
  }

  function applyOverlapJitter(items){
    const CELL = 1e-4;
    const groups = new Map();
    for (const it of items){
      const k = Math.round(it.lat / CELL) + "," + Math.round(it.lng / CELL);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(it);
    }
    for (const arr of groups.values()){
      if (arr.length <= 1) continue;
      const centerLat = arr.reduce((a,x)=>a + x.lat, 0) / arr.length;
      const centerLng = arr.reduce((a,x)=>a + x.lng, 0) / arr.length;
      const base = 10;
      const step = 9;
      for (let i=0;i<arr.length;i++){
        const ang = (i / arr.length) * Math.PI * 2;
        const r = base + step * Math.floor(i / 6);
        const dx = Math.cos(ang) * r;
        const dy = Math.sin(ang) * r;
        const it = arr[i];
        it._latDisp = it.lat + metersToLat(dy);
        it._lngDisp = it.lng + metersToLng(dx, centerLat);
      }
      arr[0]._latDisp = centerLat;
      arr[0]._lngDisp = centerLng;
    }
  }

  function normalizeBlob(it){
    const txt = makeSearchText(it);
    it._blob = searchNorm(txt);
    it._jamo = toJamo(txt);
  }

  function isAdminSuffixToken(raw){
    const t = (raw ?? "").toString().trim();
    if (!t) return false;
    return /(특별시|광역시|자치시|도|시|군|구|읍|면|동|리|가)$/.test(t);
  }

  function tokenMatchItem(raw, it){
    const protectedShort = isProtectedShortWord(raw);
    const qn = searchNorm(raw);
    if (!qn) return false;

    const qj = toJamo(raw);
    const blob = it._blob || "";
    const jamo = it._jamo || "";

    if (protectedShort){
      const vars = tokenVariantsForLoose(raw);
      const tns = vars.map(v => v).filter(Boolean);
      if (tns.length >= 3){
        for (const tn of tns){
          if (tn && blob.includes(tn)) return true;
        }
      }
      if (qj && qj.length >= 6){
        if (jamo && jamo.includes(qj)) return true;
      }
      return false;
    }

    const vars = tokenVariantsForLoose(raw);
    if (vars.length){
      if (vars.some(v => blob.includes(v))) return true;
    }

    if (qj && qj.length >= 6 && jamo && jamo.includes(qj)) return true;
    if (qn && qn.length >= 3 && blob && blob.includes(qn)) return true;

    if (isAdminSuffixToken(raw)) return false;

    return false;
  }

  function getFilteredBase(){
    const catSel = $("catHigh");
    const high = catSel ? catSel.value : "";
    const qRaw = (activeQuery || "").trim();
    let arr = ALL;
    if (qRaw){
      const tokens = qRaw.split(/\s+/).map(s=>s.trim()).filter(Boolean);
      arr = arr.filter(x => tokens.every(tok => tokenMatchItem(tok, x)));
    }
    if (high) arr = arr.filter(x => x._high === high);
    return arr;
  }

  /* ===== ICONS ===== */

  function pinSvg(fill, stroke){
    return `
      <svg width="32" height="46" viewBox="0 0 32 46" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 45C16 45 30 29.8 30 17C30 7.6 23.7 1 16 1C8.3 1 2 7.6 2 17C2 29.8 16 45 16 45Z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
        <circle cx="16" cy="17" r="6" fill="rgba(255,255,255,0.92)"/>
      </svg>
    `;
  }

  function pinSvgHover(fill, stroke){
    return `
      <svg width="38" height="56" viewBox="0 0 38 56" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 55C19 55 36 36 36 21C36 9.7 28.4 2 19 2C9.6 2 2 9.7 2 21C2 36 19 55 19 55Z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
        <circle cx="19" cy="21" r="7" fill="rgba(255,255,255,0.94)"/>
      </svg>
    `;
  }

  const normalIcon = L.divIcon({
    className:"",
    html: pinSvg("rgba(42,158,255,0.92)", "rgba(255,255,255,0.85)"),
    iconSize:[30,42],
    iconAnchor:[15,41]
  });

  const hoverIcon = L.divIcon({
    className:"",
    html: pinSvgHover("rgba(162,222,204,0.98)", "rgba(0,0,0,0.35)"),
    iconSize:[36,50],
    iconAnchor:[18,49]
  });

  // v1.1.27.2 pin colors (category-based)
  const PIN_COLORS_BY_HIGH = {
    "전광판 / 빌보드 / 외벽": ["rgba(255,170,200,0.95)", "rgba(0,0,0,0.35)"],  // 연핑크
    "교통매체": ["rgba(162,222,204,0.95)", "rgba(0,0,0,0.35)"],              // 민트
    "복합 쇼핑몰 / 대형마트": ["rgba(255,240,160,0.95)", "rgba(0,0,0,0.35)"], // 연노랑
    "극장 / 레저 / 휴양 시설": ["rgba(255,200,150,0.95)", "rgba(0,0,0,0.35)"], // 연주황
    "생활 밀착형 매체": ["rgba(220,190,255,0.95)", "rgba(0,0,0,0.35)"],       // 연보라
  };

  function resolveHighCategory(group){
    if(!group) return null;

    // 1) CATEGORY_TREE(공식 분류표) lows 우선 매칭
    try{
      for(const node of (CATEGORY_TREE || [])){
        for(const low of (node.lows || [])){
          if(group.includes(low)) return node.high;
        }
      }
    }catch(_){}

    // 2) fallback 키워드 (실데이터 변형 대응)
    const g = String(group);

    if (/(전광|빌보드|외벽)/.test(g)) return "전광판 / 빌보드 / 외벽";
    if (/(버스|지하철|택시|차량|KTX|터미널|공항|기내|항공|쉘터|도로)/.test(g)) return "교통매체";
    if (/(복합|쇼핑|몰|마트|백화점)/.test(g)) return "복합 쇼핑몰 / 대형마트";
    if (/(극장|영화|CGV|롯데시네마|메가박스|레저|테마|파크|휴양|편의)/.test(g)) return "극장 / 레저 / 휴양 시설";
    if (/(엘리베이터|승강기|아파트|오피스텔|로비|병원|의원|약국|편의점|운동|헬스|피트니스|캠퍼스|식당|주점|헤어|뷰티|드럭)/.test(g)) return "생활 밀착형 매체";

    return null;
  }

  function getCategoryColor(group){
    const high = resolveHighCategory(group);
    return PIN_COLORS_BY_HIGH[high] || ["rgba(42,158,255,0.92)", "rgba(255,255,255,0.85)"]; // 기본 파랑
  }

  function makePinIcon(color, shadow){
    return L.divIcon({
      className:"",
      html: pinSvg(color, shadow),
      iconSize:[30,42],
      iconAnchor:[15,41]
    });
  }

  function makeHoverPinIcon(color, shadow){
    return L.divIcon({
      className:"",
      html: pinSvgHover(color, shadow),
      iconSize:[36,50],
      iconAnchor:[18,49]
    });
  }

  /* 유니크 키 생성 */
  function stableHash(seed, str){
    let h = 2166136261 ^ Math.floor(seed * 1e9);
    for (let i=0; i<str.length; i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function makeUniqueKeys(rawItems){
    const seen = new Map();
    return rawItems.map((it, idx) => {
      const hasId = (it.id != null && String(it.id).trim() !== "");
      let base = hasId ? ("id:" + String(it.id).trim()) : ("k:" + idx);

      if (seen.has(base)){
        const c = (seen.get(base) || 1) + 1;
        seen.set(base, c);
        const salt = (it.title || "") + "|" + (it.lat ?? "") + "|" + (it.lng ?? "") + "|" + idx;
        base = base + "#" + c + "-" + stableHash(0.12345, salt);
      }else{
        seen.set(base, 1);
      }
      return base;
    });
  }

  function clearClusterHighlight(){
    if (highlightedClusterEl){
      highlightedClusterEl.classList.remove("clusterHighlight");
      highlightedClusterEl = null;
    }
  }

  function highlightClusterElement(el){
    clearClusterHighlight();
    if (!el) return;
    el.classList.add("clusterHighlight");
    highlightedClusterEl = el;
  }

  function highlightCard(key, doScroll){
    const el = cardByKey.get(key);
    if (!el) return;
    el.classList.add("isActive");
    if (doScroll){
      el.scrollIntoView({ block:"start", behavior:"auto" });
    }
  }

  function unhighlightCard(key){
    const el = cardByKey.get(key);
    if (!el) return;
    el.classList.remove("isActive");
    el.classList.remove("isPinFlash");
  }

  function clearAllCardHighlights(){
    for (const el of cardByKey.values()){
      el.classList.remove("isActive");
      el.classList.remove("isPinFlash");
    }
  }

  function updateMarkerVisual(key){
    const m = markerByKey.get(key);
    if (!m) return;
    const mint = (key === activeMiniKey) || (key === hoverKey);
    try{
      const { c, s } = m._baseIcon || {};
      if (c && s) m.setIcon(mint ? makeHoverPinIcon(c,s) : makePinIcon(c,s));
      else m.setIcon(mint ? hoverIcon : normalIcon);
      m.setZIndexOffset(mint ? 9999 : 0);
    }catch(_){}
  }

  function setHoverKey(next){
    const prev = hoverKey;
    if (prev === next) return;
    hoverKey = next;
    if (prev) updateMarkerVisual(prev);
    if (next) updateMarkerVisual(next);
  }

  function setActiveMiniKey(next){
    const prev = activeMiniKey;
    if (prev === next) return;
    activeMiniKey = next;
    if (prev) updateMarkerVisual(prev);
    if (next) updateMarkerVisual(next);
  }

  function ensureCardVisible(key){
    if (cardByKey.has(key)) return;
    const idx = curInView.findIndex(x => x._key === key);
    if (idx < 0) return;
    if (idx < renderLimit) return;
    let next = renderLimit;
    while (next <= idx) next += STEP;
    renderLimit = Math.min(curInView.length, next);
    appendList(curInView);
  }

  function highlightClusterOnlyByKey(key){
    clearClusterHighlight();
    const m = markerByKey.get(key);
    if (!m || !markers) return;
    const parent = markers.getVisibleParent(m);
    if (!parent) return;
    if (parent && parent !== m && typeof parent.getElement === "function"){
      highlightClusterElement(parent.getElement());
    }
  }

  function clearAllMarkerStates(){
    hoverKey = null;
    activeMiniKey = null;
    for (const k of markerByKey.keys()){
      try{
        const m = markerByKey.get(k);
        const { c, s } = m._baseIcon || {};
        if (c && s) m.setIcon(makePinIcon(c,s));
        else m.setIcon(normalIcon);
        m.setZIndexOffset(0);
      }catch(_){}
    }
    clearClusterHighlight();
  }

  function closeMiniPopup(){
    if (!activeMiniKey) return;
    const key = activeMiniKey;
    const m = markerByKey.get(key);
    try{ m && m.closePopup && m.closePopup(); }catch(_){}
    setActiveMiniKey(null);
    clearAllCardHighlights();
    clearClusterHighlight();
  }

  function pinToTopAndFlash(key){
    pinnedTopKey = key;
    appendList(curInView);
    const el = cardByKey.get(key);
    if (el){
      el.classList.add("isPinFlash");
      if (pinFlashTimer) clearTimeout(pinFlashTimer);
      pinFlashTimer = setTimeout(()=>{
        try{ el.classList.remove("isPinFlash"); }catch(_){}
      }, 900);
    }
  }

  function miniPopupHtml(it){
    const title = escapeHtml(it.title || "-");
    const cat = escapeHtml(`${it._high || "-"}${it._low ? " > " + it._low : ""}`);
    const price = escapeHtml(fmtWon(it.price, it.price_unit));
    const img = it.thumb
      ? `<img src="${escapeHtml(it.thumb)}" alt="" loading="lazy" onerror="this.remove(); this.parentElement.innerHTML='<div class=&quot;fallback&quot;>NO IMAGE</div>'"/>`
      : `<div class="fallback">NO IMAGE</div>`;

    return `
      <div class="pinPop">
        ${img}
        <div class="t">${title}</div>
        <div class="c">${cat}</div>
        <div class="p">${price}</div>
        <div class="h">클릭하면 상세보기</div>
        <div class="b">
          <button class="miniAdd" data-key="${escapeHtml(it._key)}">담기</button>
          <button class="miniDetail" data-key="${escapeHtml(it._key)}">상세보기</button>
        </div>
      </div>
    `;
  }

  function openMiniPopupFor(it, marker){
    clearClusterHighlight();
    if (activeMiniKey && activeMiniKey !== it._key){
      closeMiniPopup();
    }
    setActiveMiniKey(it._key);
    pinToTopAndFlash(it._key);
    clearAllCardHighlights();
    ensureCardVisible(it._key);
    highlightCard(it._key, true);
    try{
      marker.setPopupContent(miniPopupHtml(it));
      marker.openPopup();
    }catch(_){}
  }

  function setHash(key){
    const next = "#item=" + encodeURIComponent(key);
    if (location.hash !== next){
      suppressHashHandler = true;
      location.hash = next;
      setTimeout(()=>{ suppressHashHandler = false; }, 0);
    }
  }

  function clearHash(){
    if (!location.hash.startsWith("#item=")) return;
    suppressHashHandler = true;
    location.hash = "";
    setTimeout(()=>{ suppressHashHandler = false; }, 0);
  }

  function saveRecentKey(key){
    if (!key) return;
    recentKeys = recentKeys.filter(k => k !== key);
    recentKeys.unshift(key);
    if (recentKeys.length > 200) recentKeys.length = 200;
    try{ sessionStorage.setItem(SS_RECENT, JSON.stringify(recentKeys)); }catch(_){}
    recentPage = 0;
    renderRecentPanel();
  }

  function openDetail(it, sethash){
    closeMiniPopup();
    currentOpenKey = it._key;

    $("dt").textContent = it.title || "-";
    $("ds").textContent = `${it._high || "-"}${it._low ? " > " + it._low : ""}`;
    $("dcat").textContent = `${it._high || "-"}${it._low ? " > " + it._low : ""}`;
    $("dprice").textContent = fmtWon(it.price, it.price_unit);
    $("daddr").textContent = it.address || "-";
    $("dop").textContent = it.operator || "문의";
    $("dimg").innerHTML = it.thumb ? `<img src="${escapeHtml(it.thumb)}" alt="" loading="lazy" onerror="this.remove(); this.parentElement.innerHTML='<div class=&quot;fallback&quot;>NO IMAGE</div>'"/>` : `<div class="fallback">NO IMAGE</div>`;

    const kakao = `https://map.kakao.com/link/map/${encodeURIComponent(it.title||"DOOH")},${it.lat},${it.lng}`;
    const google = `https://www.google.com/maps?q=${it.lat},${it.lng}`;
    $("dlinks").innerHTML = `<a href="${kakao}" target="_blank" rel="noopener noreferrer">카카오맵</a> <a href="${google}" target="_blank" rel="noopener noreferrer">구글맵</a>`;

    $("dOverlay").style.display = "block";

    suspendViewportOnce = true;
    map.once("moveend", () => { suspendViewportOnce = false; updateZoomUI(); });

    const la = (it._latDisp ?? it.lat);
    const ln = (it._lngDisp ?? it.lng);
    map.setView([la, ln], Math.max(map.getZoom(), 15), { animate:false });

    saveRecentKey(it._key);
    if (sethash) setHash(it._key);
  }

  function closeDetail(fromHashChange){
    $("dOverlay").style.display = "none";
    currentOpenKey = null;
    if (!fromHashChange) clearHash();
    if (returnToCartAfterDetail){
      returnToCartAfterDetail = false;
      setTimeout(()=>{ try{ openCartModal(); }catch(_){ } }, 0);
    }
  }

  function openDetailByHash(){
    if (!location.hash.startsWith("#item=")) return;
    const key = decodeURIComponent(location.hash.replace("#item=", ""));
    if (currentOpenKey === key && $("dOverlay").style.display === "block") return;
    const it = itemByKey.get(key);
    if (!it) return;
    openDetail(it, false);
  }

  function isNeutralState(){
    const catSel = $("catHigh");
    return (!activeQuery || !activeQuery.trim()) && !(catSel && catSel.value);
  }

  function renderList(items){
    const list = $("list");
    list.innerHTML = "";
    cardByKey.clear();

    // v1.1.27 PATCH: 초기 표시 상한 200
    renderLimit = Math.min(items.length, LIST_INITIAL_LIMIT);

    $("empty").style.display = items.length ? "none" : "block";

    $("moreHint").style.display = "none";
    appendList(items);
  }

  function updateLoadMoreUI(items){
    const box = $("moreHint");
    if (!box) return;

    const total = items.length;
    const shown = Math.min(renderLimit, total);

    if (!total || shown >= total){
      box.style.display = "none";
      box.innerHTML = "";
      return;
    }

    box.style.display = "block";
    box.innerHTML = `<button id="loadMoreBtn">더보기 (+${LIST_MORE_STEP}개)</button> — ${shown}/${total}`;

    const btn = document.getElementById("loadMoreBtn");
    if (!btn) return;
    btn.onclick = () => {
      renderLimit = Math.min(items.length, renderLimit + LIST_MORE_STEP);
      appendList(items);
    };
  }

  function appendList(items){
    const list = $("list");

    let arr = items.slice();
    if (isNeutralState()){
      arr.sort((a,b) => (stableHash(shuffleSeed, a._key) - stableHash(shuffleSeed, b._key)));
    }

    if (pinnedTopKey){
      const idx = arr.findIndex(x => x._key === pinnedTopKey);
      if (idx >= 0){
        const [one] = arr.splice(idx, 1);
        arr.unshift(one);
      }
    }

    const slice = arr.slice(0, renderLimit);
    list.innerHTML = "";
    cardByKey.clear();

    for (const it of slice){
      const el = document.createElement("div");
      el.className = "item";
      el.dataset.key = it._key;

      el.innerHTML = `
        <div class="thumb">${it.thumb ? `<img src="${escapeHtml(it.thumb)}" alt="" loading="lazy" onerror="this.remove(); this.parentElement.innerHTML='<div class=&quot;fallback&quot;>NO IMAGE</div>'"/>` : `<div class="fallback">NO IMAGE</div>`}</div>
        <div class="meta">
          <div class="cat">${escapeHtml(it._high || "")}${it._low ? " · " + escapeHtml(it._low) : ""}</div>
          <div class="ttl">${escapeHtml(it.title || "-")}</div>
          <div class="addr">${escapeHtml(guessPlace(it))}</div>
          <div class="price">${escapeHtml(fmtWon(it.price, it.price_unit))}</div>
        </div>
      `;

      cardByKey.set(it._key, el);

      el.addEventListener("mouseenter", () => {
        clearAllCardHighlights();
        highlightCard(it._key, false);
        setHoverKey(it._key);
        highlightClusterOnlyByKey(it._key);
      });
      el.addEventListener("mouseleave", () => {
        unhighlightCard(it._key);
        if (hoverKey === it._key) setHoverKey(null);
        clearClusterHighlight();
        if (activeMiniKey) highlightCard(activeMiniKey, false);
      });
      el.addEventListener("click", () => {
        returnToCartAfterDetail = false;
        openDetail(it, true);
      });

      list.appendChild(el);
    }

    updateLoadMoreUI(items);
  }

  function loadSessionArrays(){
    try{
      recentKeys = JSON.parse(sessionStorage.getItem(SS_RECENT) || "[]") || [];
    }catch(_){ recentKeys = []; }
    try{
      cartKeys = JSON.parse(sessionStorage.getItem(SS_CART) || "[]") || [];
    }catch(_){ cartKeys = []; }
  }

  function saveCart(){
    try{ sessionStorage.setItem(SS_CART, JSON.stringify(cartKeys)); }catch(_){}
    renderCartBadge();
  }

  function renderCartBadge(){
    const n = cartKeys.length;
    const b = $("cartBadge");
    if (b) b.textContent = (n > 99 ? "99+" : String(n));
  }

  function cartSumText(){
    const sum = cartKeys.reduce((acc, k) => {
      const it = itemByKey.get(k);
      const n = it ? parsePriceNumber(it.price) : null;
      return acc + (n || 0);
    }, 0);
    if (!sum) return "₩0 (VAT 별도)";
    return "₩" + sum.toLocaleString("ko-KR") + " (VAT 별도)";
  }

  function openCartModal(){
    $("cartModal").style.display = "block";
    renderCartModal();
  }

  function closeCartModal(){
    $("cartModal").style.display = "none";
  }

  function renderCartModal(){
    const box = $("cartList");
    box.innerHTML = "";
    $("cartSum").textContent = cartSumText();

    const arr = cartKeys.map(k => itemByKey.get(k)).filter(Boolean);

    if (!arr.length){
      box.innerHTML = `<div class="emptyCart">담아둔 목록이 비어 있습니다.</div>`;
      return;
    }

    for (const it of arr){
      const row = document.createElement("div");
      row.className = "cartRow";
      row.innerHTML = `
        <div class="ct">${escapeHtml(it.title || "-")}</div>
        <div class="cp">${escapeHtml(fmtWon(it.price, it.price_unit))}</div>
        <div class="cb">
          <button class="cDetail" data-key="${escapeHtml(it._key)}">보기</button>
          <button class="cDel" data-key="${escapeHtml(it._key)}">삭제</button>
        </div>
      `;
      box.appendChild(row);
    }

    box.querySelectorAll(".cDetail").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const key = e.currentTarget.dataset.key;
        const it = itemByKey.get(key);
        if (!it) return;
        returnToCartAfterDetail = true;
        closeCartModal();
        openDetail(it, true);
      });
    });

    box.querySelectorAll(".cDel").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const key = e.currentTarget.dataset.key;
        cartKeys = cartKeys.filter(k => k !== key);
        saveCart();
        renderCartModal();
      });
    });
  }

  function renderRecentPanel(){
    const box = $("recentList");
    if (!box) return;
    box.innerHTML = "";

    const arr = recentKeys.map(k => itemByKey.get(k)).filter(Boolean);

    const total = arr.length;
    const totalPages = Math.max(1, Math.ceil(total / RECENT_PAGE_SIZE));
    if (recentPage >= totalPages) recentPage = 0;

    const start = recentPage * RECENT_PAGE_SIZE;
    const slice = arr.slice(start, start + RECENT_PAGE_SIZE);

    $("recentCount").textContent = total > 99 ? "99+" : String(total);

    for (const it of slice){
      const row = document.createElement("div");
      row.className = "recentRow";
      row.innerHTML = `
        <div class="rt">${escapeHtml(it.title || "-")}</div>
        <div class="rc">${escapeHtml(fmtWon(it.price, it.price_unit))}</div>
      `;
      row.addEventListener("click", () => {
        returnToCartAfterDetail = false;
        openDetail(it, true);
      });
      box.appendChild(row);
    }

    $("recentPage").textContent = total ? `${recentPage+1}/${totalPages}` : "0/0";
  }

  function nextRecentPage(){
    const total = recentKeys.length;
    const totalPages = Math.max(1, Math.ceil(total / RECENT_PAGE_SIZE));
    recentPage = (recentPage + 1) % totalPages;
    renderRecentPanel();
  }

  function clearRecent(){
    recentKeys = [];
    try{ sessionStorage.setItem(SS_RECENT, "[]"); }catch(_){}
    recentPage = 0;
    renderRecentPanel();
  }

  function buildSuggestPool(){
    const set = new Set();
    const meta = new Map();

    QUICK_SUGGEST.forEach(v => set.add(v));

    for (const it of ALL){
      const tokens = extractTokens(it.address || "");
      tokens.slice(0, 4).forEach(t => set.add(t));
      const high = it._high || "";
      if (high) set.add(high);
      const low = it._low || "";
      if (low) set.add(low);
      if (it.title) set.add(it.title);
    }

    const arr = Array.from(set).filter(x => (x || "").toString().trim().length >= 2);

    for (const v of arr){
      meta.set(v, { hint: "추천" });
    }

    SUG_POOL = arr;
    SUG_META = meta;
  }

  function suggestForInput(q){
    const raw = (q ?? "").toString().trim();
    if (!raw) return [];
    const n = searchNorm(raw);
    if (!n) return [];
    const out = [];
    for (const v of SUG_POOL){
      if (out.length >= 10) break;
      const vn = searchNorm(v);
      if (vn.includes(n) || n.includes(vn)){
        out.push(v);
      }
    }
    return out;
  }

  function showSuggest(values){
    const box = $("qSuggest");
    if (!box) return;
    const arr = Array.isArray(values) ? values : [];
    if (!arr.length){
      box.style.display = "none";
      box.innerHTML = "";
      sugIndex = -1;
      return;
    }
    box.innerHTML = "";
    arr.forEach((v) => {
      const row = document.createElement("div");
      row.className = "qSugItem";
      row.setAttribute("role","option");
      row.dataset.value = v;
      const meta = SUG_META.get(v);
      const hint = meta?.hint || "추천";
      row.innerHTML = `<span class="t">${escapeHtml(v)}</span><span class="h">${escapeHtml(hint)}</span>`;
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        applyQueryFromSuggest(v);
      });
      box.appendChild(row);
    });
    box.style.display = "block";
    sugIndex = -1;
  }

  function applyQueryFromSuggest(v){
    $("q").value = v;
    showSuggest([]);
    setQuery(v);
  }

  function handleQueryKeydown(e){
    const box = $("qSuggest");
    if (!box || box.style.display === "none") return;
    const items = Array.from(box.querySelectorAll(".qSugItem"));
    if (!items.length) return;

    if (e.key === "ArrowDown"){
      e.preventDefault();
      sugIndex = Math.min(items.length - 1, sugIndex + 1);
      items.forEach((el, i) => el.classList.toggle("on", i === sugIndex));
      return;
    }
    if (e.key === "ArrowUp"){
      e.preventDefault();
      sugIndex = Math.max(-1, sugIndex - 1);
      items.forEach((el, i) => el.classList.toggle("on", i === sugIndex));
      return;
    }
    if (e.key === "Enter"){
      if (sugIndex >= 0){
        e.preventDefault();
        const v = items[sugIndex].dataset.value;
        applyQueryFromSuggest(v);
      }
    }
    if (e.key === "Escape"){
      showSuggest([]);
    }
  }

  function setQuery(q){
    activeQuery = (q ?? "").toString();
    const base = getFilteredBase();
    curBase = base;
    curInView = base.slice();
    renderList(curInView);
    rebuildMarkers(curInView);
    updateCountPill(curInView.length);
  }

  function updateCountPill(n){
    const el = $("loadedPill");
    if (!el) return;
    el.textContent = `Loaded ${n.toLocaleString("ko-KR")}`;
  }

  function rebuildMarkers(items){
    markerByKey.clear();
    if (markers) markers.clearLayers();

    const ms = [];
    for (const it of items){
      const la = (it._latDisp ?? it.lat);
      const ln = (it._lngDisp ?? it.lng);

      const [c,s] = getCategoryColor(it.media_group);
      const m = L.marker([la, ln], { icon: makePinIcon(c,s) });
      m._baseIcon = { c, s };
      m.__key = it._key;

      m.bindPopup(miniPopupHtml(it), {
        closeButton:false,
        autoClose:true,
        closeOnClick:false,
        autoPan:false,
        className:"pinPopWrap",
        offset: L.point(0, -86)
      });

      m.on("mouseover", () => {
        if (isMapInteracting) return;
        setHoverKey(it._key);
        highlightClusterOnlyByKey(it._key);

        clearAllCardHighlights();
        ensureCardVisible(it._key);
        highlightCard(it._key, false);
      });

      m.on("mouseout", () => {
        if (isMapInteracting) return;
        if (hoverKey === it._key) setHoverKey(null);
        clearClusterHighlight();
        clearAllCardHighlights();
        if (activeMiniKey) highlightCard(activeMiniKey, false);
      });

      m.on("click", (ev) => {
        try{
          if (ev && ev.originalEvent){
            L.DomEvent.stopPropagation(ev.originalEvent);
            L.DomEvent.preventDefault(ev.originalEvent);
          }
        }catch(_){}

        suspendViewportOnce = true;
        map.once("moveend", () => { suspendViewportOnce = false; updateZoomUI(); });

        try{ map.panTo(m.getLatLng(), { animate:true, duration:0.35 }); }catch(_){}

        if (activeMiniKey === it._key && m.isPopupOpen && m.isPopupOpen()){
          returnToCartAfterDetail = false;
          openDetail(it, true);
          return;
        }
        openMiniPopupFor(it, m);

        const btnAdd = document.querySelector(".pinPopWrap .miniAdd");
        const btnDetail = document.querySelector(".pinPopWrap .miniDetail");
        if (btnAdd){
          btnAdd.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            addToCart(it._key);
          });
        }
        if (btnDetail){
          btnDetail.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            returnToCartAfterDetail = false;
            openDetail(it, true);
          });
        }
      });

      markerByKey.set(it._key, m);
      ms.push(m);
    }

    if (markers){
      ms.forEach(x => markers.addLayer(x));
    }
  }

  function addToCart(key){
    if (!key) return;
    if (!cartKeys.includes(key)) cartKeys.unshift(key);
    saveCart();
    renderCartModal();
  }

  function updateZoomUI(){
    if (suspendViewportOnce) return;
    const z = map ? map.getZoom() : 0;
    const el = $("zoomPill");
    if (el) el.textContent = `Zoom ${z}`;
  }

  function setupMap(){
    map = L.map("map", {
      zoomControl:true,
      preferCanvas:true
    }).setView(HOME_CENTER, HOME_ZOOM);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    markers = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      maxClusterRadius: 60
    });

    map.addLayer(markers);

    map.on("movestart", ()=>{ isMapInteracting = true; });
    map.on("moveend", ()=>{
      isMapInteracting = false;
      updateZoomUI();
    });

    updateZoomUI();
  }

  function wireUI(){
    setCatHighOptions();

    $("q").addEventListener("input", (e) => {
      const q = e.target.value;
      showSuggest(suggestForInput(q));
    });

    $("q").addEventListener("keydown", handleQueryKeydown);

    $("q").addEventListener("keyup", (e) => {
      if (e.key === "Enter"){
        showSuggest([]);
        setQuery($("q").value);
      }
    });

    $("go").addEventListener("click", () => {
      showSuggest([]);
      setQuery($("q").value);
    });

    $("clear").addEventListener("click", () => {
      $("q").value = "";
      showSuggest([]);
      setQuery("");
    });

    $("catHigh").addEventListener("change", () => {
      setQuery($("q").value);
    });

    $("homeBtn").addEventListener("click", () => {
      closeMiniPopup();
      clearAllMarkerStates();
      try{ map.setView(HOME_CENTER, HOME_ZOOM, { animate:true }); }catch(_){}
    });

    $("closeDetail").addEventListener("click", () => closeDetail(false));
    $("dOverlay").addEventListener("click", (e) => {
      if (e.target && e.target.id === "dOverlay") closeDetail(false);
    });

    $("openCart").addEventListener("click", openCartModal);
    $("closeCart").addEventListener("click", closeCartModal);
    $("cartModal").addEventListener("click", (e) => {
      if (e.target && e.target.id === "cartModal") closeCartModal();
    });

    $("cartClear").addEventListener("click", () => {
      cartKeys = [];
      saveCart();
      renderCartModal();
    });

    $("recentNext").addEventListener("click", nextRecentPage);
    $("recentClear").addEventListener("click", clearRecent);

    window.addEventListener("hashchange", () => {
      if (suppressHashHandler) return;
      openDetailByHash();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape"){
        if ($("dOverlay").style.display === "block") closeDetail(false);
        if ($("cartModal").style.display === "block") closeCartModal();
      }
    });
  }

  async function loadData(){
    hideErrorBanner();
    try{
      const res = await fetch(DATA_URL, { cache:"no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();

      const rawItems = Array.isArray(json) ? json : (json.items || json.data || []);
      if (!Array.isArray(rawItems)) throw new Error("Invalid JSON format");

      const keys = makeUniqueKeys(rawItems);

      const items = rawItems.map((it, idx) => {
        const x = Object.assign({}, it);
        x._key = keys[idx];

        x.lat = Number(x.lat);
        x.lng = Number(x.lng);
        if (!isFinite(x.lat) || !isFinite(x.lng)) return null;

        const tax = assignTaxonomy(x);
        x._high = tax.high || "";
        x._low = tax.low || "";

        normalizeBlob(x);
        return x;
      }).filter(Boolean);

      applyOverlapJitter(items);

      ALL = items;
      itemByKey.clear();
      ALL.forEach(it => itemByKey.set(it._key, it));

      loadSessionArrays();
      renderCartBadge();
      renderRecentPanel();

      buildSuggestPool();

      setQuery("");
      updateCountPill(ALL.length);

    }catch(err){
      console.error(err);
      showErrorBanner(String(err?.message || err));
    }
  }

  function boot(){
    setupMap();
    wireUI();
    loadData();
    openDetailByHash();
  }

  document.addEventListener("DOMContentLoaded", boot);

})();
