/* =========================================================
Frontier DOOH 전국 DB JS 분리 버전 (v1.1.26 기반 안정화)
   - index.html 안의 <script>...</script> 내용을 이 파일로 이동합니다.
   - index.html에는 <script src="./app.js"></script> 한 줄만 남깁니다.
========================================================= */
(() => {
  "use strict";

  const VERSION = "v1.1.27";
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
  const STEP  = 24;
  // 리스트 폭주 방지(내부용): 초기 300개 + 200개 더보기
  const LIST_INIT_LIMIT = 300;
  const LIST_MORE_STEP  = 200;

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
    searchNorm("대구"), searchNorm("대전"), searchNorm("부산"),
    searchNorm("광주"), searchNorm("울산"), searchNorm("인천"),
    searchNorm("서울"), searchNorm("세종"),
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
    const won = n.toLocaleString("ko-KR") + "원";
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
        const angle = (i / arr.length) * Math.PI * 2;
        const r = base + step * Math.floor(i / 8);
        const dLat = metersToLat(r) * Math.sin(angle);
        const dLng = metersToLng(r, centerLat) * Math.cos(angle);
        arr[i]._latDisp = centerLat + dLat;
        arr[i]._lngDisp = centerLng + dLng;
      }
    }
  }

  function isAdminSuffixToken(raw){
    return /(특별시|광역시|자치시|도|시|군|구|읍|면|동|리|가)$/.test((raw ?? "").toString().trim());
  }

  function tokenMatchItem(raw, it){
    const t = (raw ?? "").toString().trim();
    if (!t) return true;

    const protectedShort = isProtectedShortWord(t);

    const qn = searchNorm(t);
    const qj = toJamo(t);

    const tns = it._tokensNorm || [];
    const tjs = it._tokensJamo || [];

    if (qn && qn.length >= 2){
      for (const tn of tns){
        if (tn && tn.includes(qn)) return true;
      }
    }
    if (qj && qj.length >= 3){
      for (const tj of tjs){
        if (tj && tj.includes(qj)) return true;
      }
    }

    if (qj && qj.length >= 6){
      for (const tj of tjs){
        if (tj && tj.includes(qj)) return true;
      }
    }

    if (!protectedShort){
      if (qj && qj.length >= 6 && it._jamo && it._jamo.includes(qj)) return true;
      if (qn && qn.length >= 3 && it._blob && it._blob.includes(qn)) return true;
    }

    if (isAdminSuffixToken(raw)) return false;

    if (!protectedShort){
      const vars = tokenVariantsForLoose(raw);
      const blob = it._blob || "";
      if (vars.length && vars.some(v => blob.includes(v))) return true;
    }

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
      <svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 27 15 27s15-16.5 15-27C30 6.7 23.3 0 15 0z" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
        <circle cx="15" cy="15" r="6" fill="rgba(0,0,0,0.25)"/>
      </svg>
    `;
  }
  function pinSvgHover(fill, stroke){
    return `
      <svg width="36" height="50" viewBox="0 0 36 50" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 0C8 0 0 8 0 18c0 12.5 18 32 18 32s18-19.5 18-32C36 8 28 0 18 0z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
        <circle cx="18" cy="18" r="7" fill="rgba(0,0,0,0.25)"/>
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

  /* 유니크 키 생성 */
  function stableHash(seed, str){
    let h = 2166136261 ^ Math.floor(seed * 1e9);
    for (let i=0; i<str.length; i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0);
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
      m.setIcon(mint ? hoverIcon : normalIcon);
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
        m.setIcon(normalIcon);
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
      pinFlashTimer = setTimeout(()=>{ try{ el.classList.remove("isPinFlash"); }catch(_){} }, 900);
    }
  }

  function miniPopupHtml(it){
    const title = escapeHtml(it.title || "-");
    const cat = escapeHtml(`${it._high || "-"}${it._low ? " > " + it._low : ""}`);
    const price = escapeHtml(fmtWon(it.price, it.price_unit));
    const img = it.thumb ? `<img src="${escapeHtml(it.thumb)}" alt="" style="width:100%;height:110px;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,.08);"/>` : `
      <div class="noImgMini">NO IMAGE</div>
    `;
    return `
      <div class="miniWrap">
        ${img}
        <div class="miniTitle">${title}</div>
        <div class="miniCat">${cat}</div>
        <div class="miniPrice">${price}</div>
        <div class="miniHint">클릭하면 상세보기</div>
        <div class="miniBtns">
          <button class="btnMiniAdd">담기</button>
          <button class="btnMiniOpen">상세보기</button>
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
    $("dimg").innerHTML = it.thumb ? `<img src="${escapeHtml(it.thumb)}" alt="" />` : `<div class="noImgDetail">NO IMAGE</div>`;

    const kakao = `https://map.kakao.com/link/map/${encodeURIComponent(it.title||"DOOH")},${it.lat},${it.lng}`;
    const google = `https://www.google.com/maps?q=${it.lat},${it.lng}`;
    $("dlinks").innerHTML = `<a href="${kakao}" target="_blank" rel="noopener">카카오맵</a> · <a href="${google}" target="_blank" rel="noopener">구글맵</a>`;

    $("dOverlay").style.display = "block";

    suspendViewportOnce = true;
    map.once("moveend", () => {
      suspendViewportOnce = false;
      updateZoomUI();
    });

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

  // ===== v1.1.27: 리스트 300 상한 + 200 더보기 버튼 =====
  function renderMoreHint(total){
    const box = $("moreHint");
    if (!box) return;

    const shown = Math.min(renderLimit, total);

    if (total <= shown){
      box.style.display = "none";
      box.innerHTML = "";
      return;
    }

    box.style.display = "block";
    box.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;justify-content:space-between;">
        <div style="opacity:.9;">
          결과가 많습니다. <b>총 ${total.toLocaleString()}</b>개 중 <b>${shown.toLocaleString()}</b>개만 표시 중입니다.
          (필터/지도 범위를 좁히면 더 정확합니다.)
        </div>
        <button id="btnMore" type="button"
          style="cursor:pointer;padding:10px 12px;border-radius:10px;border:1px solid rgba(162,222,204,.55);
                 background:rgba(0,0,0,.35);color:#e9f5f2;font-weight:800;">
          +${LIST_MORE_STEP}개 더 보기
        </button>
      </div>
    `;

    const btn = $("btnMore");
    if (btn){
      btn.onclick = () => {
        if (renderLimit >= curInView.length) return;
        renderLimit = Math.min(curInView.length, renderLimit + LIST_MORE_STEP);
        appendList(curInView);
      };
    }
  }

  function renderList(items){
    const list = $("list");
    list.innerHTML = "";
    cardByKey.clear();

    // 초기 300개 상한
    renderLimit = Math.min(items.length, LIST_INIT_LIMIT);

    $("empty").style.display = items.length ? "none" : "block";
    renderMoreHint(items.length);

    appendList(items);
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
        ${it.thumb ? `<img class="thumb" src="${escapeHtml(it.thumb)}" alt="" />` : `<div class="noImg">NO IMAGE</div>`}
        <div class="cat">${it._high ? `${it._high}` : ``} ${it._low ? `${it._low}` : ``}</div>
        <div class="title">${escapeHtml(it.title || "-")}</div>
        <div class="place">${escapeHtml(guessPlace(it))}</div>
        <div class="price">${escapeHtml(fmtWon(it.price, it.price_unit))}</div>
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

    // 더보기 안내/버튼 갱신
    renderMoreHint(items.length);
  }

  function setupInfiniteScroll(){
    // 내부용 3만+ 대비: 무한 스크롤 대신 "더 보기" 버튼 사용
    return;
  }

  /* 이하 v1.1.26 원본 로직 계속 ... (데이터 로드/지도/필터/검색/최근본/장바구니 등) */

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
      row.innerHTML = `
        <div class="qSugMain">${escapeHtml(v)}</div>
        <div class="qSugHint">${escapeHtml(hint)}</div>
      `;
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        applySuggest(v);
      });
      box.appendChild(row);
    });
    box.style.display = "block";
  }

  function applySuggest(v){
    const q = $("q");
    if (!q) return;
    q.value = v;
    activeQuery = v;
    saveQueryHistory(v);
    runFilterAndRender(true);
    showSuggest([]);
  }

  function saveQueryHistory(q){
    const t = (q ?? "").toString().trim();
    if (!t) return;
    try{
      const arr = JSON.parse(localStorage.getItem(LS_QHIST) || "[]") || [];
      const next = [t, ...arr.filter(x => x !== t)].slice(0, 50);
      localStorage.setItem(LS_QHIST, JSON.stringify(next));
    }catch(_){}
  }

  function loadQueryHistory(){
    try{
      const arr = JSON.parse(localStorage.getItem(LS_QHIST) || "[]") || [];
      return Array.isArray(arr) ? arr : [];
    }catch(_){
      return [];
    }
  }

  function buildSuggestPool(){
    SUG_POOL = [];
    SUG_META = new Map();

    const hist = loadQueryHistory();
    for (const h of hist){
      SUG_POOL.push(h);
      SUG_META.set(h, { hint:"최근 검색" });
    }
    for (const q of QUICK_SUGGEST){
      if (!SUG_META.has(q)){
        SUG_POOL.push(q);
        SUG_META.set(q, { hint:"추천" });
      }
    }
  }

  function suggestForInput(input){
    const q = (input ?? "").toString().trim();
    if (!q){
      showSuggest([]);
      return;
    }
    const n = searchNorm(q);
    const j = toJamo(q);
    const protectedShort = isProtectedShortWord(q);

    const out = [];
    for (const v of SUG_POOL){
      const vn = searchNorm(v);
      const vj = toJamo(v);

      if (n && vn.includes(n)) out.push(v);
      else if (j && vj.includes(j) && j.length >= (protectedShort ? 4 : 2)) out.push(v);

      if (out.length >= 8) break;
    }
    showSuggest(out);
  }

  async function loadData(){
    hideErrorBanner();
    $("status").textContent = "Loading...";

    let res;
    try{
      res = await fetch(DATA_URL, { cache:"no-store" });
    }catch(e){
      showErrorBanner("데이터를 불러오지 못했습니다. 네트워크를 확인하세요.");
      $("status").textContent = "Loaded: 0";
      return;
    }

    if (!res.ok){
      showErrorBanner(`데이터 로드 실패 (HTTP ${res.status})`);
      $("status").textContent = "Loaded: 0";
      return;
    }

    let json;
    try{
      json = await res.json();
    }catch(e){
      showErrorBanner("JSON 파싱 실패 (형식 오류)");
      $("status").textContent = "Loaded: 0";
      return;
    }

    const items = Array.isArray(json.items) ? json.items : [];
    const keys = makeUniqueKeys(items);

    ALL = items.map((it, idx) => {
      const lat = Number(it.lat);
      const lng = Number(it.lng);
      if (!isFinite(lat) || !isFinite(lng)) return null;

      const tax = assignTaxonomy(it);
      const o = {
        ...it,
        lat, lng,
        _key: keys[idx],
        _high: tax.high || (it.category_high || it.media_group || "UNKNOWN"),
        _low: tax.low || (it.category_low || ""),
      };
      o._blob = searchNorm(makeSearchText(o));
      o._jamo = toJamo(makeSearchText(o));
      const toks = extractTokens(makeSearchText(o));
      o._tokensNorm = toks.map(searchNorm).filter(Boolean);
      o._tokensJamo = toks.map(toJamo).filter(Boolean);
      return o;
    }).filter(Boolean);

    applyOverlapJitter(ALL);

    itemByKey.clear();
    for (const it of ALL) itemByKey.set(it._key, it);

    $("status").textContent = `Loaded: ${ALL.length}`;
  }

  function initMap(){
    map = L.map("map", {
      zoomControl:false,
      preferCanvas:true,
      attributionControl:false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 20,
    }).addTo(map);

    markers = L.markerClusterGroup({
      showCoverageOnHover:false,
      spiderfyOnMaxZoom:true,
      removeOutsideVisibleBounds:true,
      maxClusterRadius: 60,
    });

    map.addLayer(markers);

    map.setView(HOME_CENTER, HOME_ZOOM, { animate:false });

    map.on("movestart", () => { isMapInteracting = true; });
    map.on("moveend", () => {
      isMapInteracting = false;
      if (suspendViewportOnce) return;
      updateInViewAndRender();
      updateZoomUI();
    });

    map.on("zoomstart", () => { isMapInteracting = true; });
    map.on("zoomend", () => {
      isMapInteracting = false;
      if (suspendViewportOnce) return;
      updateInViewAndRender();
      updateZoomUI();
    });
  }

  function updateZoomUI(){
    const z = map.getZoom();
    const el = $("zoomNum");
    if (el) el.textContent = `ZOOM${z}`;
  }

  function updateInViewAndRender(){
    const b = map.getBounds();
    const inView = curBase.filter(it => b.contains([it._latDisp ?? it.lat, it._lngDisp ?? it.lng]));
    const hash = `${inView.length}|${activeQuery}|${$("catHigh")?.value || ""}|${map.getZoom()}`;

    if (hash === lastInViewHash) return;
    lastInViewHash = hash;

    curInView = inView;
    renderList(curInView);

    $("cntAll").textContent = ALL.length.toLocaleString("ko-KR");
    $("cntFilter").textContent = curBase.length.toLocaleString("ko-KR");
    $("cntView").textContent = curInView.length.toLocaleString("ko-KR");
  }

  function rebuildMarkers(items){
    markers.clearLayers();
    markerByKey.clear();

    items.forEach((it) => {
      const la = (it._latDisp ?? it.lat);
      const ln = (it._lngDisp ?? it.lng);

      const m = L.marker([la, ln], { icon: normalIcon });
      m.on("mouseover", () => {
        setHoverKey(it._key);
        highlightCard(it._key, false);
        highlightClusterOnlyByKey(it._key);
      });
      m.on("mouseout", () => {
        if (hoverKey === it._key) setHoverKey(null);
        unhighlightCard(it._key);
        clearClusterHighlight();
      });
      m.on("click", () => {
        openMiniPopupFor(it, m);
      });

      m.bindPopup(miniPopupHtml(it), { closeButton:false, className:"miniPopup" });
      m.on("popupopen", () => {
        const el = m.getPopup()?.getElement();
        if (!el) return;
        const btnAdd = el.querySelector(".btnMiniAdd");
        const btnOpen = el.querySelector(".btnMiniOpen");
        if (btnAdd){
          btnAdd.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            addToCart(it._key);
            renderCart();
          };
        }
        if (btnOpen){
          btnOpen.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            returnToCartAfterDetail = false;
            openDetail(it, true);
          };
        }
      });

      markerByKey.set(it._key, m);
      markers.addLayer(m);
    });
  }

  function addToCart(key){
    if (!key) return;
    if (cartKeys.includes(key)) return;
    cartKeys.push(key);
    try{ sessionStorage.setItem(SS_CART, JSON.stringify(cartKeys)); }catch(_){}
  }

  function loadCart(){
    try{
      const v = sessionStorage.getItem(SS_CART);
      cartKeys = v ? JSON.parse(v) : [];
      if (!Array.isArray(cartKeys)) cartKeys = [];
    }catch(_){
      cartKeys = [];
    }
  }

  function renderCart(){
    $("cartCount").textContent = cartKeys.length.toString();
    const list = $("cartList");
    if (!list) return;

    list.innerHTML = "";
    let sum = 0;
    let hasInquiry = false;

    cartKeys.forEach((k) => {
      const it = itemByKey.get(k);
      if (!it) return;

      const row = document.createElement("div");
      row.className = "cartRow";
      row.innerHTML = `
        <div class="cartTitle">${escapeHtml(it.title || "-")}</div>
        <div class="cartPrice">${escapeHtml(fmtWon(it.price, it.price_unit))}</div>
        <button class="cartDel" data-k="${escapeHtml(k)}">✕</button>
      `;
      row.querySelector(".cartDel").onclick = (e) => {
        e.preventDefault();
        const key = e.currentTarget.getAttribute("data-k");
        cartKeys = cartKeys.filter(x => x !== key);
        try{ sessionStorage.setItem(SS_CART, JSON.stringify(cartKeys)); }catch(_){}
        renderCart();
      };
      list.appendChild(row);

      const n = parsePriceNumber(it.price);
      if (n == null) hasInquiry = true;
      else sum += n;
    });

    const totalText = hasInquiry ? `${sum.toLocaleString("ko-KR")}원 + α(문의)` : `${sum.toLocaleString("ko-KR")}원`;
    $("cartTotal").textContent = totalText;
  }

  function openCartModal(){
    $("cartModal").style.display = "block";
    renderCart();
  }
  function closeCartModal(){
    $("cartModal").style.display = "none";
  }

  function loadRecent(){
    try{
      const v = sessionStorage.getItem(SS_RECENT);
      recentKeys = v ? JSON.parse(v) : [];
      if (!Array.isArray(recentKeys)) recentKeys = [];
    }catch(_){
      recentKeys = [];
    }
  }

  function renderRecentPanel(){
    const box = $("recentList");
    if (!box) return;

    const valid = recentKeys.filter(k => itemByKey.has(k));
    recentKeys = valid;
    try{ sessionStorage.setItem(SS_RECENT, JSON.stringify(recentKeys)); }catch(_){}

    const total = valid.length;
    const pages = Math.max(1, Math.ceil(total / RECENT_PAGE_SIZE));
    if (recentPage >= pages) recentPage = pages - 1;

    const from = recentPage * RECENT_PAGE_SIZE;
    const slice = valid.slice(from, from + RECENT_PAGE_SIZE);

    box.innerHTML = "";
    slice.forEach((key) => {
      const it = itemByKey.get(key);
      if (!it) return;

      const el = document.createElement("div");
      el.className = "recentItem";
      el.innerHTML = `
        <div class="recentTitle">${escapeHtml(it.title || "-")}</div>
        <div class="recentPrice">${escapeHtml(fmtWon(it.price, it.price_unit))}</div>
      `;
      el.onclick = () => {
        returnToCartAfterDetail = false;
        openDetail(it, true);
      };
      box.appendChild(el);
    });

    $("recentMeta").textContent = `${recentPage + 1}/${pages}`;
    $("recentCount").textContent = `${Math.min(total, RECENT_PAGE_SIZE)}/${RECENT_PAGE_SIZE}`;
    $("btnRecentPrev").disabled = (recentPage <= 0);
    $("btnRecentNext").disabled = (recentPage >= pages - 1);
  }

  function runFilterAndRender(rebuild){
    curBase = getFilteredBase();
    if (rebuild){
      rebuildMarkers(curBase);
      lastInViewHash = "";
    }
    updateInViewAndRender();
  }

  function bindUI(){
    $("ver").textContent = VERSION;

    setCatHighOptions();
    buildSuggestPool();

    $("btnReset").onclick = () => {
      const q = $("q");
      if (q) q.value = "";
      activeQuery = "";
      const cat = $("catHigh");
      if (cat) cat.value = "";
      pinnedTopKey = null;
      lastInViewHash = "";
      map.setView(HOME_CENTER, HOME_ZOOM, { animate:false });
      runFilterAndRender(true);
    };

    $("q").addEventListener("input", (e) => {
      activeQuery = e.target.value || "";
      suggestForInput(activeQuery);
      runFilterAndRender(false);
    });

    $("q").addEventListener("keydown", (e) => {
      const box = $("qSuggest");
      const items = box ? Array.from(box.querySelectorAll(".qSugItem")) : [];
      if (e.key === "ArrowDown"){
        if (!items.length) return;
        e.preventDefault();
        sugIndex = Math.min(items.length - 1, sugIndex + 1);
        items.forEach((x,i)=>x.classList.toggle("isSel", i===sugIndex));
      }else if (e.key === "ArrowUp"){
        if (!items.length) return;
        e.preventDefault();
        sugIndex = Math.max(0, sugIndex - 1);
        items.forEach((x,i)=>x.classList.toggle("isSel", i===sugIndex));
      }else if (e.key === "Enter"){
        if (sugIndex >= 0 && items[sugIndex]){
          e.preventDefault();
          const v = items[sugIndex].dataset.value;
          applySuggest(v);
          sugIndex = -1;
        }else{
          saveQueryHistory(activeQuery);
          showSuggest([]);
          runFilterAndRender(true);
        }
      }else if (e.key === "Escape"){
        showSuggest([]);
        sugIndex = -1;
      }
    });

    $("catHigh").addEventListener("change", () => {
      pinnedTopKey = null;
      runFilterAndRender(true);
    });

    $("btnZoomIn").onclick = () => map.zoomIn();
    $("btnZoomOut").onclick = () => map.zoomOut();

    $("btnCart").onclick = () => openCartModal();
    $("cartClose").onclick = () => closeCartModal();
    $("cartModal").addEventListener("click", (e) => {
      if (e.target && e.target.id === "cartModal") closeCartModal();
    });

    $("dClose").onclick = () => closeDetail(false);
    $("dOverlay").addEventListener("click", (e) => {
      if (e.target && e.target.id === "dOverlay") closeDetail(false);
    });

    $("errClose").onclick = () => hideErrorBanner();

    $("btnRecentPrev").onclick = () => { recentPage = Math.max(0, recentPage - 1); renderRecentPanel(); };
    $("btnRecentNext").onclick = () => { recentPage = recentPage + 1; renderRecentPanel(); };

    window.addEventListener("hashchange", () => {
      if (suppressHashHandler) return;
      openDetailByHash();
    });
  }

  async function init(){
    bindUI();
    loadCart();
    loadRecent();

    initMap();
    setupInfiniteScroll();

    await loadData();

    curBase = ALL.slice();
    rebuildMarkers(curBase);

    runFilterAndRender(true);
    renderCart();
    renderRecentPanel();

    openDetailByHash();
  }

  init().catch((e) => {
    console.error(e);
    showErrorBanner(e?.message || String(e));
    $("status").textContent = "Loaded: 0";
  });

})();
