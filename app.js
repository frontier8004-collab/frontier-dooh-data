/* =========================================================
   Frontier DOOH 전국 DB
   JS 분리 버전 (v1.2.2.2 기준선)
   - index.html 안의 <script>...</script> 내용을 이 파일(app.js)로 분리해 운영합니다.
   - index.html에는 <script src="./app.js" defer></script>만 유지합니다.
   - 롤백은 GitHub History/Revert가 아니라 backups 폴더의 확정 백업 파일로만 교체합니다.
   ========================================================= */

(() => {
  "use strict";
   
 const VERSION = "v1.2.2.4";
 const DATA_URL = new URL("data_public.json", window.location.origin + window.location.pathname).toString();
  const CATEGORY_TREE = [
    { high:"전광판 / 빌보드 / 외벽", lows:["전광판","빌보드","외벽"] },
    { high:"교통매체", lows:["버스광고","지하철 광고","택시 광고","차량 광고","주요 도로 야립 광고","공항 / 기내, 항공기 광고","버스 쉘터 광고","KTX 광고","터미널 광고"] },
    { high:"복합 쇼핑몰 / 대형마트", lows:["복합 쇼핑몰","대형마트"] },
    { high:"극장 / 레저 / 휴양 시설", lows:["극장","레저","휴양, 편의시설"] },
    { high:"생활 밀착형 매체", lows:["엘리베이터 광고","병원","편의점","운동시설","캠퍼스","식당, 주점","약국","헤어&뷰티살롱","드럭스토어"] },
  ];
   
  const HOME_ZOOM = 8;
  const HOME_BOUNDS_FIXED = { north:39.5, south:33.0, west:122.8, east:131.2 };
  const HOME_CENTER_SHIFT = { upPct:-0, leftPct:-0 };
const HOME_MAX_BOUNDS = L.latLngBounds([[HOME_BOUNDS_FIXED.south, HOME_BOUNDS_FIXED.west], [HOME_BOUNDS_FIXED.north, HOME_BOUNDS_FIXED.east]]);

  function computeHomeCenter(){
    const midLat = (HOME_BOUNDS_FIXED.north + HOME_BOUNDS_FIXED.south) / 2;
    const midLng = (HOME_BOUNDS_FIXED.west + HOME_BOUNDS_FIXED.east) / 2;
    const latSpan = (HOME_BOUNDS_FIXED.north - HOME_BOUNDS_FIXED.south);
    const lngSpan = (HOME_BOUNDS_FIXED.east - HOME_BOUNDS_FIXED.west);

    const latShift = latSpan * HOME_CENTER_SHIFT.upPct;
    const lngShift = lngSpan * HOME_CENTER_SHIFT.leftPct;
    return [ midLat + latShift, midLng - lngShift ];
  }
  const HOME_CENTER = [35.9, 128];

  let ALL = [];
  let map = null;
  let markers = null;
let isClampingBounds = false;

  const markerByKey = new Map();
  const cardByKey = new Map();
  const itemByKey = new Map();

  const BATCH = 36;
  const LIST_INITIAL_LIMIT = 200;
  const LIST_MORE_STEP = 200;
  const STEP  = 24;
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
  const SS_CART   = "frontier_cart_v1";
  const LS_QHIST  = "frontier_query_hist_v1";

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
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }

  function searchNorm(s){
    return (s ?? "")
      .toString()
      .toLowerCase()
      .replace(/\s+/g,"")
      .replace(/[()［］\[\]{}<>.,\-_/\\]/g,"");
  }
  function stripDigits(s){ return (s ?? "").toString().replace(/[0-9]/g,""); }

  function extractTokens(text){
    const s = (text ?? "").toString();
    const m = s.match(/[가-힣A-Za-z0-9]+/g);
    return m ? m : [];
  }

  // 한글 자모 분해
  const CHO  = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
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
        const cho  = Math.floor(v / 588);
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

  function norm(s){ return (s ?? "").toString().toLowerCase().replace(/\s+/g,""); }

  function normalizeLow(raw){
    const s = norm(raw);
    if (s.includes("전광판") || s.includes("옥외전광판") || s.includes("디지털") || s.includes("digital") || s.includes("signage") || s.includes("screen") || s.includes("display") || s.includes("led"))
      return "전광판";
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

    if (any.includes("전광판") || any.includes("billboard") || any.includes("led") || any.includes("digital") || any.includes("signage") || any.includes("screen") || any.includes("display") || any.includes("미디어파사드") || any.includes("facade") || any.includes("façade") || any.includes("외벽"))
      return "전광판 / 빌보드 / 외벽";

    if (any.includes("교통") || any.includes("버스") || any.includes("지하철") || any.includes("택시") || any.includes("ktx") || any.includes("터미널") || any.includes("공항") || any.includes("airport"))
      return "교통매체";

    if (any.includes("쇼핑몰") || any.includes("마트") || any.includes("대형") || any.includes("백화점") || any.includes("아울렛"))
      return "복합 쇼핑몰 / 대형마트";

    if (any.includes("극장") || any.includes("cgv") || any.includes("메가박스") || any.includes("롯데시네마") || any.includes("레저") || any.includes("휴양") || any.includes("리조트"))
      return "극장 / 레저 / 휴양 시설";

    if (any.includes("엘리베이터") || any.includes("병원") || any.includes("편의점") || any.includes("약국") || any.includes("캠퍼스") || any.includes("식당") || any.includes("주점") || any.includes("뷰티") || any.includes("드럭") || any.includes("헬스") || any.includes("피트니스") || any.includes("필라테스"))
      return "생활 밀착형 매체";

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
        const it = arr[i];

        if (i === 0){
          it._latDisp = it.lat;
          it._lngDisp = it.lng;
          continue;
        }

        const j = i - 1;
        const a = j * 1.85;
        const r = base + step * Math.sqrt(j);
        const dx = r * Math.cos(a);
        const dy = r * Math.sin(a);

        it._latDisp = centerLat + metersToLat(dy);
        it._lngDisp = centerLng + metersToLng(dx, centerLat);
      }
    }
  }

  function isAdminSuffixToken(raw){
    const s = (raw ?? "").toString().trim();
    if (!s) return false;
    return /(특별시|광역시|자치시|도|시|군|구|읍|면|동|리|가)$/.test(s);
  }

  function tokenMatchItem(tok, it){
    const raw = (tok ?? "").toString().trim();
    if (!raw) return true;

    const qn = searchNorm(raw);
    const qj = toJamo(raw);
    if (!qn && !qj) return true;

    const protectedShort = isProtectedShortWord(raw);

    const tns = it._tokNorms || [];
    const tjs = it._tokJamos || [];

    if (qn){
      for (const tn of tns){
        if (tn && tn.startsWith(qn)) return true;
      }
    }
    if (qj){
      for (const tj of tjs){
        if (tj && tj.startsWith(qj)) return true;
      }
    }

    if (!protectedShort){
      if (qn && qn.length >= 3){
        for (const tn of tns){
          if (tn && tn.includes(qn)) return true;
        }
      }
      if (qj && qj.length >= 6){
        for (const tj of tjs){
          if (tj && tj.includes(qj)) return true;
        }
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
      <div class="pinWrap">
        <svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 41c7-10 13-17 13-26C28 6.7 22.2 1 15 1S2 6.7 2 15c0 9 6 16 13 26z"
                fill="${fill}" stroke="${stroke}" stroke-width="2" />
          <circle cx="15" cy="15" r="6" fill="#0b0c0d" opacity="0.65"/>
          <circle cx="15" cy="15" r="3.5" fill="#ffffff" opacity="0.92"/>
        </svg>
      </div>
    `;
  }
  function pinSvgHover(fill, stroke){
    return `
      <div class="pinHover">
        <svg width="36" height="50" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 41c7-10 13-17 13-26C28 6.7 22.2 1 15 1S2 6.7 2 15c0 9 6 16 13 26z"
                fill="${fill}" stroke="${stroke}" stroke-width="2.5" />
          <circle cx="15" cy="15" r="6.5" fill="#0b0c0d" opacity="0.65"/>
          <circle cx="15" cy="15" r="3.8" fill="#ffffff" opacity="0.95"/>
        </svg>
      </div>
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
  // v1.1.27.2: category pin colors (SAFE: uses it._high only, no data parsing change)
  const PIN_COLORS_BY_HIGH = {
    "전광판 / 빌보드 / 외벽": ["rgba(255,170,200,0.95)", "rgba(0,0,0,0.35)"],       // 연핑크
    "교통매체":              ["rgba(162,222,204,0.95)", "rgba(0,0,0,0.35)"],       // 민트
    "복합 쇼핑몰 / 대형마트": ["rgba(255,240,160,0.95)", "rgba(0,0,0,0.35)"],       // 연노랑
    "극장 / 레저 / 휴양 시설": ["rgba(255,200,150,0.95)", "rgba(0,0,0,0.35)"],      // 연주황
    "생활 밀착형 매체":       ["rgba(220,190,255,0.95)", "rgba(0,0,0,0.35)"],       // 연보라
     "기타": ["rgba(200,200,200,0.95)", "rgba(0,0,0,0.35)"],

  };

  const __pinIconCache = new Map();

  function __getHighSafe(it){
    return (it && typeof it._high === "string") ? it._high : "";
  }

function _getPinIconByHigh(high, isHover){
  const h = (high && typeof high === "string" && high.trim()) ? high.trim() : "기타";
  const colors = PIN_COLORS_BY_HIGH[h] || PIN_COLORS_BY_HIGH["기타"];


    const key = high + "|" + (isHover ? "H" : "N");
    const cached = __pinIconCache.get(key);
    if (cached) return cached;

    const [fill, stroke] = colors;

    const icon = L.divIcon({
      className: "",
      html: isHover ? pinSvgHover(fill, stroke) : pinSvg(fill, stroke),
      iconSize: isHover ? [36,50] : [30,42],
      iconAnchor: isHover ? [18,49] : [15,41],
    });

    __pinIconCache.set(key, icon);
    return icon;
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
      m.setIcon(__getPinIconByHigh(m._high || "", mint));
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
        m.setIcon(__getPinIconByHigh(m._high || "", false));
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
      ? `<img src="${escapeHtml(it.thumb)}" alt="" loading="lazy" onerror="this.remove(); this.parentElement.innerHTML='<div class=&quot;fallback&quot;>NO IMAGE</div>';"/>`
      : `<div class="fallback">NO IMAGE</div>`;

    return `
      <div class="pinPopCard" data-key="${escapeHtml(it._key)}" title="클릭해서 상세보기">
        <div class="pinPopImg">${img}</div>
        <div class="pinPopBody">
          <div class="pinPopTitle">${title}</div>
          <div class="pinPopSub">${cat}</div>
          <div class="pinPopPrice">${price}</div>
          <div class="pinPopCtaRow">
            <div class="pinPopHint">클릭하면 상세보기</div>
            <div class="pinPopBtnRow">
              <button class="pinPopBtn ghost pinPopAddCart" type="button" data-key="${escapeHtml(it._key)}">담기</button>
              <button class="pinPopBtn pinPopGoDetail" type="button">상세보기</button>
            </div>
          </div>
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

    $("dimg").innerHTML = it.thumb
      ? `<img src="${it.thumb}" alt="">`
      : `<div class="fallback">NO IMAGE</div>`;

    const kakao = `https://map.kakao.com/link/map/${encodeURIComponent(it.title||"DOOH")},${it.lat},${it.lng}`;
    const google = `https://www.google.com/maps?q=${it.lat},${it.lng}`;
    $("dlinks").innerHTML = `
      <a href="${kakao}" target="_blank" rel="noopener">카카오맵</a>
      <a href="${google}" target="_blank" rel="noopener">구글맵</a>
    `;

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
  $("moreHint").style.display = "none"; // 아래 appendList에서 필요 시 다시 켬

  appendList(items);
}
function updateLoadMoreUI(items){
  const box = $("moreHint");
  if (!box) return;

  const total = items.length;
  const shown = Math.min(renderLimit, total);

  // 더 볼 게 없으면 숨김(샘플 20개에서는 항상 이 케이스)
  if (!total || shown >= total){
    box.style.display = "none";
    box.innerHTML = "";
    return;
  }

  box.style.display = "block";
  box.innerHTML = `
    <button type="button" id="loadMoreBtn"
      style="width:100%; padding:10px 12px; border:1px solid rgba(162,222,204,.45);
             background:rgba(0,0,0,.25); color:var(--mint); border-radius:12px;
             cursor:pointer; font-weight:700;">
      더보기 (+${LIST_MORE_STEP}개) — ${shown}/${total}
    </button>
  `;

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
        <div class="thumb">
          ${it.thumb ? `<img src="${it.thumb}" alt="">` : `<div class="fallback">NO IMAGE</div>`}
        </div>
        <div class="body">
          <div class="catRow">
            ${it._high ? `<span class="tag">${it._high}</span>` : ``}
            ${it._low ? `<span class="tag">${it._low}</span>` : ``}
          </div>
          <div class="name">${escapeHtml(it.title || "-")}</div>
          <div class="place">${escapeHtml(guessPlace(it))}</div>
          <div class="price">
            <div class="p">${escapeHtml(fmtWon(it.price, it.price_unit))}</div>
            <div class="u">${escapeHtml(it.price_unit ? it.price_unit : "")}</div>
          </div>
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

      row.innerHTML = `<div>${escapeHtml(v)}</div><small>${escapeHtml(hint)}</small>`;
      row.addEventListener("mousedown", (e)=>{ e.preventDefault(); });
      row.addEventListener("click", ()=>{
        $("q").value = v;
        box.style.display = "none";
        applySearchFromUI();
      });
      box.appendChild(row);
    });

    sugIndex = -1;
    box.style.display = "block";
  }

  function buildSuggestPool(){
    const mapT = new Map();

    const add = (term, hint) => {
      const t = (term ?? "").toString().trim();
      if (!t) return;
      if (t.length < 2) return;

      const prev = mapT.get(t);
      if (prev){
        prev.count += 1;
      }else{
        mapT.set(t, { term:t, hint:hint || "추천", count:1 });
      }
    };

    for (const it of ALL){
      add(it.title, "매체명");

      const src = `${it.title || ""} ${it.address || ""}`;
      const ms = src.match(/[가-힣0-9A-Za-z]{2,14}역/g);
      if (ms) ms.forEach(x => add(x, "역"));

      const toks = (it.address || "").match(/[가-힣0-9A-Za-z]{2,20}/g);
      if (toks) toks.forEach(t => add(t, "지역"));
    }

    for (const x of CATEGORY_TREE){
      add(x.high, "카테고리");
      for (const low of (x.lows || [])) add(low, "카테고리");
    }

    SUG_META = new Map();
    SUG_POOL = Array.from(mapT.values()).map(o => {
      SUG_META.set(o.term, { hint:o.hint, count:o.count });
      return {
        term: o.term,
        hint: o.hint,
        count: o.count,
        _norm: searchNorm(o.term),
        _jamo: toJamo(o.term),
      };
    });

    SUG_POOL.sort((a,b)=> (b.count - a.count) || (a.term.length - b.term.length) || a.term.localeCompare(b.term));
  }

  function suggestScore(qNorm, qJ, it){
    let s = 0;

    if (qJ){
      if (it._jamo && it._jamo.startsWith(qJ)) s = Math.max(s, 95);
      else if (it._jamo && it._jamo.includes(qJ)) s = Math.max(s, 65);
    }
    if (qNorm){
      if (it._norm && it._norm.startsWith(qNorm)) s = Math.max(s, 90);
      else if (it._norm && it._norm.includes(qNorm)) s = Math.max(s, 60);
    }
    if (!s) return 0;

    s += Math.min(8, Math.log2(1 + (it.count || 1)));
    s += Math.min(4, 10 / (it.term.length + 2));
    return s;
  }

  function loadQueryHistory(){
    try{
      const raw = localStorage.getItem(LS_QHIST);
      const arr = JSON.parse(raw || "[]");
      return Array.isArray(arr) ? arr.filter(x => typeof x === "string") : [];
    }catch(_){
      return [];
    }
  }
  function saveQueryHistory(q){
    const t = (q || "").trim();
    if (!t) return;
    let arr = loadQueryHistory();
    arr = arr.filter(x => x !== t);
    arr.unshift(t);
    if (arr.length > 10) arr.length = 10;
    try{ localStorage.setItem(LS_QHIST, JSON.stringify(arr)); }catch(_){}
  }

  function updateSuggest(){
    const box = $("qSuggest");
    if (!box) return;

    const qRaw = $("q").value.trim();

    if (!qRaw){
      const hist = loadQueryHistory();
      if (hist.length){
        showSuggest(hist.slice(0, 10));
      }else{
        showSuggest(QUICK_SUGGEST);
      }
      return;
    }

    const qNorm = searchNorm(qRaw);
    const qJ = toJamo(qRaw);

    const scored = [];
    for (const it of SUG_POOL){
      const sc = suggestScore(qNorm, qJ, it);
      if (sc > 0) scored.push({ v: it.term, s: sc, c: it.count });
    }

    scored.sort((a,b)=> (b.s - a.s) || (b.c - a.c) || (a.v.length - b.v.length));

    const out = [];
    const seen = new Set();
    for (const x of scored){
      if (seen.has(x.v)) continue;
      seen.add(x.v);
      out.push(x.v);
      if (out.length >= 10) break;
    }

    showSuggest(out);
  }

  function moveSugIndex(delta){
    const box = $("qSuggest");
    if (box.style.display !== "block") return;
    const items = Array.from(box.querySelectorAll(".qSugItem"));
    if (!items.length) return;

    sugIndex = Math.max(-1, Math.min(items.length-1, sugIndex + delta));
    items.forEach((el, i) => el.classList.toggle("isActive", i === sugIndex));
    if (sugIndex >= 0){
      items[sugIndex].scrollIntoView({block:"nearest"});
    }
  }

  function pickSugIndex(){
    const box = $("qSuggest");
    if (box.style.display !== "block") return false;
    const items = Array.from(box.querySelectorAll(".qSugItem"));
    if (!items.length) return false;
    if (sugIndex < 0 || sugIndex >= items.length) return false;
    const v = items[sugIndex].dataset.value;
    if (!v) return false;
    $("q").value = v;
    box.style.display = "none";
    applySearchFromUI();
    return true;
  }

  function renderMarkersAndListFromBase(base){
    curBase = base;

    if (currentOpenKey){
      const exists = base.some(x => x._key === currentOpenKey);
      if (!exists) closeDetail(false);
    }

    $("mAll").textContent = ALL.length;
    $("mFilter").textContent = base.length;

    renderMarkers(base);
    viewportUpdate();
  }

  function computeInViewHash(arr){
    const keys = arr.map(x=>x._key).sort();
    let s = "";
    for (let i=0;i<Math.min(60, keys.length);i++){
      s += keys[i] + "|";
    }
    return String(keys.length) + "::" + stableHash(0.777, s);
  }

  function viewportUpdate(){
    if (!map) return;
    const b = map.getBounds();
    const inView = (curBase || []).filter(x => {
      const la = (x._latDisp ?? x.lat);
      const ln = (x._lngDisp ?? x.lng);
      return b.contains([la, ln]);
    });

    curInView = inView;
    $("mInView").textContent = inView.length;

    const newHash = computeInViewHash(inView);
    const changed = (newHash !== lastInViewHash);
    lastInViewHash = newHash;

    if (changed){
      const panel = $("panel");
      if (panel) panel.scrollTop = 0;
      renderList(inView);
    }else{
      if (pinnedTopKey){
        appendList(inView);
      }
    }

    if (activeMiniKey){
      ensureCardVisible(activeMiniKey);
      clearAllCardHighlights();
      highlightCard(activeMiniKey, false);
      highlightClusterOnlyByKey(activeMiniKey);
      updateMarkerVisual(activeMiniKey);
    }
  }

  function updateStickyHeights(){
    const topbar = $("topbar");
    const h = topbar ? topbar.getBoundingClientRect().height : 72;
    document.documentElement.style.setProperty("--topbarH", Math.round(h) + "px");
  }

  function updateZoomUI(){
    if (!map) return;
    const zi = Math.round(map.getZoom());
const zDisp = Math.max(1, zi - 6);
$("zVal").textContent = zDisp;
  }

  function forceIntegerZoom(){
    if (!map) return;
    const z = map.getZoom();
    const zi = Math.round(z);
    if (Math.abs(z - zi) > 1e-6){
      try{ map.setZoom(zi, { animate:false }); }catch(_){}
    }
    updateZoomUI();
  }

  function showClusterHint(latlng){
    const hint = $("clusterHint");
    if (!hint) return;
    const p = map.latLngToContainerPoint(latlng);
    hint.style.left = p.x + "px";
    hint.style.top  = p.y + "px";
    hint.style.display = "block";
  }
  function hideClusterHint(){
    const hint = $("clusterHint");
    if (!hint) return;
    hint.style.display = "none";
  }
function applyMovePolicy(){
  if (!map) return;

const zi = Math.round(map.getZoom());
const isZoom1 = (zi === 7); // 내부 zoom 7 == 표시 1 (표시 로직과 동일)

  if (isZoom1){
    map.dragging && map.dragging.disable();
    map.keyboard && map.keyboard.disable();
  } else {
    map.dragging && map.dragging.enable();
    map.keyboard && map.keyboard.enable();
  }
}
// === MapLibre 한글 라벨 패치(전역/동일 스코프) ===
function applyKoreanLabelsToMapLibre(mlMap){
  if (!mlMap || typeof mlMap.getStyle !== "function") return;

  let done = false;

  const run = () => {
    try{
      const style = mlMap.getStyle();
      if (!style || !Array.isArray(style.layers)) return;

      for (const layer of style.layers){
        if (!layer || layer.type !== "symbol") continue;

        const hasTextField =
          layer.layout && (layer.layout["text-field"] !== undefined);

        if (!hasTextField) continue;

        mlMap.setLayoutProperty(layer.id, "text-field", [
          "coalesce",
          ["get", "name:ko"],
          ["get", "name_ko"],
          ["get", "name"],
          ["get", "label"]
        ]);
      }

      console.log("[ML] Korean label patch applied");
    }catch(e){
      console.warn("[ML] Korean label patch failed", e);
    }
  };

  // 로딩 타이밍 대응(1회만 적용)
mlMap.on("idle", run);
mlMap.on("styledata", run);
}
  function buildMap(){
    map = L.map("map", {
      zoomControl:false,
      zoomSnap: 1,
      zoomDelta: 1,
      wheelPxPerZoomLevel: 80,
       maxBounds: L.latLngBounds([[33.0, 123.8], [39.5, 132.2]]),
maxBoundsViscosity: 1.0,

minZoom: 7,
maxZoom: 19,
    }).setView(HOME_CENTER, HOME_ZOOM);
applyMovePolicy();
    const c = map.getContainer();
c.setAttribute("tabindex", "0");
c.focus();
    // MapLibre 벡터 바닥지도(검고/회색) + 한글라벨 준비
const KEY = "WotAoBRFnYvSNdp5ox05";
const ml = L.maplibreGL({
  style: `https://api.maptiler.com/maps/dataviz-v4-dark/style.json?key=${KEY}`,
  attribution: ""
}).addTo(map);
     // MapLibre 한글 라벨 패치(ml = leaflet-maplibre 레이어)
const mlMap =
  (ml && typeof ml.getMaplibreMap === "function") ? ml.getMaplibreMap()
  : (ml && ml._map) ? ml._map
  : null;
try { window.KEY = KEY; } catch (e) {}
try { window.mlMap = mlMap; } catch (e) {}
applyKoreanLabelsToMapLibre(mlMap);
// L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
// maxZoom: 19,
// attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
// }).addTo(map);
    markers = L.markerClusterGroup({
      showCoverageOnHover:false,
      spiderfyOnMaxZoom:false,
      animate:false,
      animateAddingMarkers:false,
      removeOutsideVisibleBounds:false,
      disableClusteringAtZoom: 18,
      maxClusterRadius: 52,
      zoomToBoundsOnClick:false
    });

    markers.on("clustermouseover", (e) => {
      try{
        const el = e.layer && e.layer.getElement ? e.layer.getElement() : null;
        if (el) highlightClusterElement(el);
      }catch(_){}
      if (e && e.layer && e.layer.getLatLng){
        showClusterHint(e.layer.getLatLng());
      }
    });
    markers.on("clustermouseout", () => {
      clearClusterHighlight();
      hideClusterHint();
    });

    markers.on("clusterclick", (e) => {
      try{
        if (e && e.originalEvent){
          L.DomEvent.stopPropagation(e.originalEvent);
          L.DomEvent.preventDefault(e.originalEvent);
        }
      }catch(_){}

      hideClusterHint();
      closeMiniPopup();
      clearAllMarkerStates();
      clearAllCardHighlights();
      clearClusterHighlight();

      const bb = e.layer && e.layer.getBounds ? e.layer.getBounds() : null;

      if (bb && bb.isValid && bb.isValid()){
      map.fitBounds(bb, { padding:[90,90], maxZoom: 18, animate:true, duration:0.7, easeLinearity:0.25 });
      }else if (e.layer && e.layer.getLatLng){
        const ll = e.layer.getLatLng();
      map.setView(ll, Math.min(map.getZoom() + 2, 18), { animate:true, duration:0.7, easeLinearity:0.25 });
      }
    });

    markers.on("spiderfied", () => { clearClusterHighlight(); hideClusterHint(); });
    markers.on("unspiderfied", () => { clearClusterHighlight(); hideClusterHint(); });

    map.addLayer(markers);

    map.on("dragstart", ()=>{ isMapInteracting = true; hideClusterHint(); closeMiniPopup(); clearAllMarkerStates(); clearAllCardHighlights(); });
   map.on("dragend", () => {
  isMapInteracting = false;
  const base = getFilteredBase();
  renderMarkersAndListFromBase(base);
});
    map.on("zoomstart", ()=>{ isMapInteracting = true; hideClusterHint(); closeMiniPopup(); clearAllMarkerStates(); clearAllCardHighlights(); });
    map.on("zoomend", () =>{
  isMapInteracting = false;
  forceIntegerZoom();
  applyMovePolicy();
       const base = getFilteredBase();
renderMarkersAndListFromBase(base);
});


    map.on("click", ()=>{ hideClusterHint(); closeMiniPopup(); });

    window.addEventListener("mouseup", ()=>{ isMapInteracting = false; }, { passive:true });

    map.getContainer().addEventListener("mouseleave", ()=>{
      hideClusterHint();
      closeMiniPopup();
      clearAllMarkerStates();
      clearAllCardHighlights();
    }, { passive:true });
 
  }

  function renderMarkers(items){
    closeMiniPopup();
    clearClusterHighlight();
    setHoverKey(null);

    markerByKey.clear();
    markers.clearLayers();

    const ms = [];
    for (const it of items){
      const la = (it._latDisp ?? it.lat);
      const ln = (it._lngDisp ?? it.lng);

      const high = __getHighSafe(it);
const m = L.marker([la, ln], { icon: _getPinIconByHigh(high, false) });
m._high = high;
m._key = it._key;


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
      });

      m.on("popupclose", () => {
        if (activeMiniKey === it._key){
          setActiveMiniKey(null);
          updateMarkerVisual(it._key);
          clearAllCardHighlights();
        }
      });

      markerByKey.set(it._key, m);
      ms.push(m);
    }

    markers.addLayers(ms);
  }

  function clampRecentPage(total){
    const pages = Math.max(1, Math.ceil(total / RECENT_PAGE_SIZE));
    if (recentPage < 0) recentPage = 0;
    if (recentPage > pages - 1) recentPage = pages - 1;
    return pages;
  }

  function renderRecentPanel(){
    const list = $("recentList");
    const pager = $("recentPager");
    const prev = $("recentPrev");
    const next = $("recentNext");
    const meta = $("recentPageMeta");

    const valid = recentKeys.filter(k => itemByKey.has(k));
    recentKeys = valid;
    try{ sessionStorage.setItem(SS_RECENT, JSON.stringify(recentKeys)); }catch(_){}
    if (recentKeys.length > 99){
    recentKeys = recentKeys.slice(recentKeys.length - 99);
    try{ sessionStorage.setItem(SS_RECENT, JSON.stringify(recentKeys)); }catch(_){}
}

    const pages = clampRecentPage(valid.length);

    const start = recentPage * RECENT_PAGE_SIZE;
    const slice = valid.slice(start, start + RECENT_PAGE_SIZE);

   $("recentMeta").textContent = `${Math.min(valid.length, 99)}`;

    list.innerHTML = "";
    slice.forEach((key) => {
      const it = itemByKey.get(key);
      if (!it) return;

      const el = document.createElement("div");
      el.className = "rRow";
      el.innerHTML = `
        <div class="rThumb">
          ${it.thumb ? `<img src="${it.thumb}" alt="">` : `<div class="fallback">NO IMAGE</div>`}
        </div>
        <div class="rName" title="${escapeHtml(it.title || "-")}">${escapeHtml(it.title || "-")}</div>
        <div class="rPrice">${escapeHtml(fmtWon(it.price, it.price_unit))}</div>
        <div class="rX" title="제거">✕</div>
      `;

      el.addEventListener("click", () => {
        returnToCartAfterDetail = false;
        openDetail(it, true);
      });

      el.querySelector(".rX").addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        recentKeys = recentKeys.filter(x => x !== key);
        try{ sessionStorage.setItem(SS_RECENT, JSON.stringify(recentKeys)); }catch(_){}
        renderRecentPanel();
      });

      list.appendChild(el);
    });

    if (valid.length > RECENT_PAGE_SIZE){
      pager.style.display = "flex";
      meta.textContent = `${recentPage + 1}/${pages}`;
      prev.disabled = (recentPage <= 0);
      next.disabled = (recentPage >= pages - 1);
    }else{
      pager.style.display = "none";
      meta.textContent = "1/1";
    }
  }

  function saveCart(){
    try{ sessionStorage.setItem(SS_CART, JSON.stringify(cartKeys)); }catch(_){}
    renderCartSummary();
  }

  function addToCart(key){
    if (!key) return;
    if (!cartKeys.includes(key)){
      cartKeys.push(key);
      saveCart();
    }
  }

  function removeFromCart(key){
    cartKeys = cartKeys.filter(k => k !== key);
    saveCart();
  }

  function cartTotalText(){
  let sum = 0;
  let hasInquiry = false;

  for (const key of cartKeys){
    const it = itemByKey.get(key);
    if (!it) continue;

    const n = parsePriceNumber(it.price);
    if (n === null) hasInquiry = true;
    else sum += n;
  }

  if (sum === 0 && hasInquiry){
    return "문의";
  }

  const won = "₩" + sum.toLocaleString("ko-KR");
  return hasInquiry
    ? `${won} (VAT 별도) + 문의`
    : `${won} (VAT 별도)`;
}

  function renderCartSummary(){
    const valid = cartKeys.filter(k => itemByKey.has(k));
    cartKeys = valid;
    try{ sessionStorage.setItem(SS_CART, JSON.stringify(cartKeys)); }catch(_){}
    $("cartCount").textContent = String(cartKeys.length);
  }

  function openCartModal(){
    const body = $("cartModalBody");
    body.innerHTML = "";

    const valid = cartKeys.filter(k => itemByKey.has(k));
    if (!valid.length){
      body.innerHTML = `<div style="color:rgba(255,255,255,.65); font-size:13px;">담아둔 목록이 비어 있습니다.</div>`;
    }else{
      valid.forEach((key) => {
        const it = itemByKey.get(key);
        if (!it) return;

        const row = document.createElement("div");
        row.className = "mRow";
        row.innerHTML = `
          <div class="mLeft">
            <div class="mThumb">${it.thumb ? `<img src="${it.thumb}" alt="">` : ``}</div>
            <div class="mTitle">${escapeHtml(it.title || "-")}</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <div class="mPrice">${escapeHtml(fmtWon(it.price, it.price_unit))}</div>
            <button class="mX" title="삭제">✕</button>
          </div>
        `;

        row.addEventListener("click", ()=>{
          returnToCartAfterDetail = true;
          closeCartModal();
          openDetail(it, true);
        });

        row.querySelector(".mX").addEventListener("click", (e)=>{
          e.preventDefault(); e.stopPropagation();
          removeFromCart(key);
          openCartModal();
        });

        body.appendChild(row);
      });

      const sum = document.createElement("div");
      sum.className = "mSum";
      sum.innerHTML = `<div><div class="muted">총합</div><div style="margin-top:2px;color:var(--mint);">${cartTotalText()}</div></div>
                       <div style="color:rgba(255,255,255,.65);font-size:12px;font-weight:900;">총 ${valid.length}개</div>`;
      body.appendChild(sum);
    }

    $("cartModalOverlay").style.display = "block";
  }
  function closeCartModal(){ $("cartModalOverlay").style.display = "none"; }

  function moveMapToSearch(base){
    if (!map) return;
    if (!Array.isArray(base) || !base.length) return;

    if (base.length === 1){
      const it = base[0];
      const la = (it._latDisp ?? it.lat);
      const ln = (it._lngDisp ?? it.lng);
      try{ map.setView([la, ln], 15, { animate:false }); }catch(_){}
      forceIntegerZoom();
      return;
    }

    let bounds = null;
    for (const it of base){
      const la = (it._latDisp ?? it.lat);
      const ln = (it._lngDisp ?? it.lng);
      if (typeof la !== "number" || typeof ln !== "number") continue;
      const ll = L.latLng(la, ln);
      if (!bounds) bounds = L.latLngBounds(ll, ll);
      else bounds.extend(ll);
    }
    if (!bounds || !bounds.isValid()) return;

    try{ map.fitBounds(bounds, { padding:[110,110], maxZoom: 15, animate:false }); }catch(_){}

    try{
      const z = Math.round(map.getZoom());
      if (z < 8) map.setZoom(8, { animate:false });
    }catch(_){}
    forceIntegerZoom();
  }

  function applySearchFromUI(){
    const qVal = $("q").value.trim();
    activeQuery = qVal;
    saveQueryHistory(activeQuery);

    pinnedTopKey = null;

    const base = getFilteredBase();
    renderMarkersAndListFromBase(base);

    if (qVal && base.length){
      moveMapToSearch(base);
    }
  }

  function applyHomeView(animate){
    if (!map) return;

    suspendViewportOnce = true;

    try{
      if (animate) map.flyTo(HOME_CENTER, HOME_ZOOM, { duration: 0.85 });
      else map.setView(HOME_CENTER, HOME_ZOOM, { animate:false });
    }catch(_){}

    map.once("moveend", () => {
      suspendViewportOnce = false;
      forceIntegerZoom();
      viewportUpdate();
      try{ map.panInsideBounds(L.latLngBounds([[33.0, 123.8], [39.5, 132.2]]), { animate:false }); }catch(_){}
    });
  }

  function resetAll(){
    $("q").value = "";
    activeQuery = "";
    $("catHigh").value = "";
    $("qSuggest").style.display = "none";
    closeDetail(false);
    closeMiniPopup();

    shuffleSeed = Math.random();
    pinnedTopKey = null;

    applyHomeView(true);

    const base = getFilteredBase();
    renderMarkersAndListFromBase(base);
  }

  async function fetchJsonRobust(url){
    console.log("[DATA FETCH URL]", url);
    const res = await fetch(url, { cache:"no-store" });
    if (!res.ok){
      const text = await res.text().catch(()=> "");
      throw new Error(`HTTP ${res.status} ${res.statusText} (응답 일부: ${text.slice(0, 80)})`);
    }
    const raw = await res.text();
    try{
      return JSON.parse(raw);
    }catch(e){
      const head = raw.slice(0, 120).replace(/\s+/g," ").trim();
      throw new Error(`JSON 파싱 실패 (응답 시작: ${head})`);
    }
  }

  function loadRecentAndCart(){
    try{
      const r = JSON.parse(sessionStorage.getItem(SS_RECENT) || "[]");
      if (Array.isArray(r)) recentKeys = r.filter(x => typeof x === "string");
    }catch(_){ recentKeys = []; }

    try{
      const c = JSON.parse(sessionStorage.getItem(SS_CART) || "[]");
      if (Array.isArray(c)) cartKeys = c.filter(x => typeof x === "string");
    }catch(_){ cartKeys = []; }
  }

  async function init(){
    updateStickyHeights();
    window.addEventListener("resize", updateStickyHeights);

    const errClose = $("errClose");
    if (errClose) errClose.addEventListener("click", hideErrorBanner);

    buildMap();

    // 미니모달 버튼 처리
    document.addEventListener("click", (e) => {
      const addBtn = e.target && e.target.closest ? e.target.closest(".pinPopAddCart") : null;
      if (addBtn){
        const key = addBtn.getAttribute("data-key");
        if (key){
          e.preventDefault();
          e.stopPropagation();
          addToCart(key);
          renderCartSummary();
        }
        return;
      }

      const goBtn = e.target && e.target.closest ? e.target.closest(".pinPopGoDetail") : null;
      if (goBtn){
        const card = e.target.closest(".pinPopCard");
        const key = card ? card.getAttribute("data-key") : null;
        if (key){
          const it = itemByKey.get(key);
          if (it){
            e.preventDefault();
            e.stopPropagation();
            returnToCartAfterDetail = false;
            openDetail(it, true);
          }
        }
        return;
      }

      const card = e.target && e.target.closest ? e.target.closest(".pinPopCard") : null;
      if (!card) return;
      const key = card.getAttribute("data-key");
      if (!key) return;

      const it = itemByKey.get(key);
      if (!it) return;

      e.preventDefault();
      e.stopPropagation();
      returnToCartAfterDetail = false;
      openDetail(it, true);
    }, true);

    // ===== 데이터 로드 1회 =====
    let raw = [];
    try{
      const json = await fetchJsonRobust(DATA_URL);
      raw = Array.isArray(json) ? json
          : (Array.isArray(json.items)   ? json.items
          :  Array.isArray(json.data)    ? json.data
          :  Array.isArray(json.rows)    ? json.rows
          :  Array.isArray(json.points)  ? json.points
          :  Array.isArray(json.records) ? json.records
          :  []);
      hideErrorBanner();
    }catch(err){
      console.error("[DATA LOAD FAIL]", err);
      showErrorBanner(err?.message || "data 로드 실패");
      raw = [];
    }

    function sanitizePoints(list){
  const stats = {
    total: Array.isArray(list) ? list.length : 0,
    nan: 0,
    outLat: 0,
    outLng: 0,
    korOut: 0,
    kept: 0
  };

  const pts = [];
  const arr = Array.isArray(list) ? list : [];

  for (let i = 0; i < arr.length; i++){
    const x = arr[i] || {};

    const lat = (typeof x.lat === "number")
      ? x.lat
      : parseFloat(String(x.lat ?? "").trim());

    const lng = (typeof x.lng === "number")
      ? x.lng
      : parseFloat(String(x.lng ?? "").trim());

    // 1) 숫자 변환 실패
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { stats.nan++; continue; }

    // 2) 지구 좌표 범위 이탈(이게 MapLibre/Mapbox에서 크래시 유발의 대표 원인)
    if (lat < -90 || lat > 90) { stats.outLat++; continue; }
    if (lng < -180 || lng > 180) { stats.outLng++; continue; }

    // 3) 국내 범위 필터(현 정책 유지)
    if (lat < 32.0 || lat > 39.8 || lng < 123.0 || lng > 132.5) { stats.korOut++; continue; }

    stats.kept++;
    pts.push({ ...x, lat, lng });
  }

  return { pts, stats };
}

const { pts, stats } = sanitizePoints(raw || []);
console.log("[DATA_SANITIZE]", stats);

    const uniqueKeys = makeUniqueKeys(pts);

    ALL = pts.map((it, idx) => {
      const t = assignTaxonomy(it);
      const key = uniqueKeys[idx];

      const row = { ...it, _key: key, _high: t.high, _low: t.low };

      row._blobText = makeSearchText(row);
      row._blob = searchNorm(row._blobText);
      row._jamo = toJamo(row._blobText);

      const toks = extractTokens(row._blobText);
      row._tokNorms = toks.map(x => searchNorm(x)).filter(Boolean);
      row._tokJamos = toks.map(x => toJamo(x)).filter(Boolean);

      return row;
    });

    applyOverlapJitter(ALL);

    itemByKey.clear();
    ALL.forEach(it => itemByKey.set(it._key, it));

    const loaded = $("pillLoaded");
    if (loaded) loaded.textContent = String(ALL.length);

    setCatHighOptions();
    buildSuggestPool();

    loadRecentAndCart();
    renderRecentPanel();
    renderCartSummary();

    applyHomeView(false);
    forceIntegerZoom();

    $("zIn").addEventListener("click", ()=> { map.zoomIn(); setTimeout(forceIntegerZoom, 0); });
    $("zOut").addEventListener("click", ()=> { map.zoomOut(); setTimeout(forceIntegerZoom, 0); });

    $("recentPrev").addEventListener("click", ()=>{
      recentPage = Math.max(0, recentPage - 1);
      renderRecentPanel();
    });
    $("recentNext").addEventListener("click", ()=>{
      const pages = Math.max(1, Math.ceil(recentKeys.length / RECENT_PAGE_SIZE));
      recentPage = Math.min(pages - 1, recentPage + 1);
      renderRecentPanel();
    });

    $("cartBtn").addEventListener("click", openCartModal);
    $("cartClose").addEventListener("click", closeCartModal);
    $("cartModalOverlay").addEventListener("click", (e)=>{ if (e.target.id === "cartModalOverlay") closeCartModal(); });

    $("dAddCart").addEventListener("click", ()=>{
      if (!currentOpenKey) return;
      addToCart(currentOpenKey);
      renderCartSummary();
    });

    $("catHigh").addEventListener("change", () => {
      pinnedTopKey = null;
      const base = getFilteredBase();
      renderMarkersAndListFromBase(base);
    });

    const q = $("q");
    const qBox = $("qSuggest");

    q.addEventListener("focus", updateSuggest);
    q.addEventListener("blur", ()=>{ setTimeout(()=>{ qBox.style.display = "none"; }, 140); });

    document.addEventListener("click", (e)=>{
      const wrap = q.parentElement;
      if (!wrap.contains(e.target)){
        qBox.style.display = "none";
      }
    });

    let sugTimer = null;
    q.addEventListener("input", () => {
      clearTimeout(sugTimer);
      sugTimer = setTimeout(updateSuggest, 60);
    });

    q.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown"){ e.preventDefault(); moveSugIndex(+1); return; }
      if (e.key === "ArrowUp"){ e.preventDefault(); moveSugIndex(-1); return; }
      if (e.key === "Enter"){
        if (pickSugIndex()) return;
        e.preventDefault();
        applySearchFromUI();
        return;
      }
      if (e.key === "Escape"){
        qBox.style.display = "none";
        sugIndex = -1;
        return;
      }
      if (e.key === "Backspace" && !q.value){
        e.preventDefault();
        resetAll();
      }
    });

    $("qGo").addEventListener("click", applySearchFromUI);
    $("reset").addEventListener("click", resetAll);
    $("titleReset").addEventListener("click", resetAll);

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Backspace") return;
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
      const inTyping = (tag === "input" || tag === "textarea" || e.target.isContentEditable);
      if (inTyping) return;
      e.preventDefault();
      resetAll();
    });

    $("dx").addEventListener("click", () => closeDetail(false));
    $("dOverlay").addEventListener("click", (e) => { if (e.target.id === "dOverlay") closeDetail(false); });

    window.addEventListener("hashchange", () => {
      if (suppressHashHandler) return;
      if (location.hash.startsWith("#item=")) openDetailByHash();
      else closeDetail(true);
    });

    const base = getFilteredBase();
    renderMarkersAndListFromBase(base);
    openDetailByHash();
  }

  // DOM 준비 후 실행 (index.html에서 defer로 불러오는 것을 전제로 함)
  document.addEventListener("DOMContentLoaded", () => {
    init().catch(err => {
      console.error("[INIT FAIL]", err);
      showErrorBanner(err?.message || "초기화 실패");
    });
  });

})();
// ===== MAP LEGEND TOGGLE =====
(() => {
  const legend = document.getElementById("mapLegend");
  const toggle = document.getElementById("legendToggle");
  if (!legend || !toggle) return;

  const body = legend.querySelector(".legendBody");

  // 애니메이션 속도(ms) - 숫자 1개만 바꾸면 전체 속도 변경됨
  const LEGEND_ANIM_MS = 280;
  try { legend.style.setProperty("--legendAnimMs", `${LEGEND_ANIM_MS}ms`); } catch (e) {}

  // 높이 동기화(슬라이드) - 다른 코드에서도 재사용 가능하게 전역 노출
  const syncHeight = () => {
    if (!body) return;

    const isCollapsed = legend.classList.contains("collapsed");
    if (isCollapsed) {
      body.style.maxHeight = "0px";
      return;
    }

    // 렌더 이후 측정(정확한 scrollHeight)
    requestAnimationFrame(() => {
      try { body.style.maxHeight = body.scrollHeight + "px"; } catch (e) {}
    });
  };

  try { window.__fr_syncLegendHeight = syncHeight; } catch (e) {}

  // 헤더 텍스트도 안전하게 보정(혹시 index 수정 누락 대비)
  try {
    const t = legend.querySelector(".legendHeader span");
    if (t) t.textContent = "범례 및 지도";
  } catch (e) {}

  // 최초 1회: 현재 상태 기준 세팅
  syncHeight();

  toggle.addEventListener("click", () => {
    const collapsed = legend.classList.toggle("collapsed");
    toggle.textContent = collapsed ? "+" : "-";
    toggle.setAttribute(
      "aria-label",
      collapsed ? "범례 및 지도 펼치기" : "범례 및 지도 접기"
    );
    syncHeight();
  });

  // 리사이즈 시 열려 있으면 높이 재계산(레이아웃 바뀌어도 부드럽게 유지)
  window.addEventListener("resize", () => {
    if (!legend.classList.contains("collapsed")) syncHeight();
  });
})();
// ===== MAP STYLE PANEL (inside legend) =====
(() => {
  const legend = document.getElementById("mapLegend");
  if (!legend) return;

  // 중복 생성 방지
  if (document.getElementById("mapStylePanel")) return;

  // 스타일(세로 1열로 고정, 가로폭 확장 방지)
  const styleEl = document.createElement("style");
  styleEl.textContent = `
    #mapStylePanel{ margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,.12); width:100%; box-sizing:border-box; }
    #mapStylePanel .msTitle{ font-size:11px; color:rgba(255,255,255,.85); margin-bottom:8px; text-align:center; }
    #mapStylePanel .msCol{ display:flex; flex-direction:column; gap:6px; }
    #mapStylePanel .msCard{
  display:flex;
  flex-direction:column;
  gap:6px;
  width:100%;
  padding:6px 8px;
  border-radius:10px;
  border:1px solid rgba(255,255,255,.18);
  background:rgba(0,0,0,.18);
  color:#fff;
  cursor:pointer;
  font-size:12px;
  text-align:center;
}
    #mapStylePanel .msThumb{
  width:100%;
  height:64px;
  border-radius:12px;
  background:rgba(255,255,255,.08);
  background-size:cover;
  background-position:center;
  background-repeat:no-repeat;
  border:1px solid rgba(255,255,255,.14);
}
#mapStylePanel .msLabel{
  margin-top:8px;
  font-size:12px;
  color:rgba(255,255,255,.85);
}
    #mapStylePanel .msCard.isActive{ background:rgba(255,255,255,.18); }
    #mapStylePanel .msCard:disabled{ opacity:.55; cursor:not-allowed; }
  `;
  document.head.appendChild(styleEl);

  const panel = document.createElement("div");
  panel.id = "mapStylePanel";

  const title = document.createElement("div");
  title.className = "msTitle";
  title.textContent = "지도 스타일";
  panel.appendChild(title);

  const col = document.createElement("div");
  col.className = "msCol";
  panel.appendChild(col);

  const STYLES = [
    { id: "dataviz-v4-dark",  label: "다크(기본)" },
    { id: "dataviz-v4-light", label: "화이트" },
    { id: "streets-v4",       label: "스트리트" },
    { id: "hybrid-v4",        label: "위성(하이브리드)" },
  ];

  const getKey = () => (typeof window.KEY !== "undefined" && window.KEY) ? window.KEY : null;
  const styleUrl = (slug) => {
    const k = getKey();
    if (!k) return null;
    return `https://api.maptiler.com/maps/${slug}/style.json?key=${k}`;
  };

  const setActive = (styleId) => {
    const btns = col.querySelectorAll("button.msCard");
    btns.forEach((b) => b.classList.toggle("isActive", b.getAttribute("data-style-id") === styleId));
  };

  const setDisabled = (v) => {
   const btns = col.querySelectorAll("button.msCard");
    btns.forEach((b) => (b.disabled = !!v));
  };

  const reapplyKoAfterSetStyle = (_mlMap) => {
    if (!_mlMap || typeof _mlMap.once !== "function") return;
    _mlMap.once("idle", () => {
      try {
        if (typeof applyKoreanLabelsToMapLibre === "function") applyKoreanLabelsToMapLibre(_mlMap);
      } catch (e) {}
    });
  };

  const switchStyle = (styleId) => {
    const _mlMap = (typeof window.mlMap !== "undefined" && window.mlMap) ? window.mlMap : null;
    if (!_mlMap || typeof _mlMap.setStyle !== "function") {
      console.warn("[STYLE] mlMap not ready; skip setStyle");
      return;
    }

    const url = styleUrl(styleId);
    if (!url) {
      console.warn("[STYLE] KEY missing; cannot build style URL");
      return;
    }

    console.log(`[STYLE] setStyle -> ${styleId}`);
    setDisabled(true);

    try {
      _mlMap.setStyle(url);
      reapplyKoAfterSetStyle(_mlMap);

      // 선택 유지(옵션)
      try { localStorage.setItem("frontier_style_id", styleId); } catch (e) {}

      setActive(styleId);
    } catch (e) {
      console.error("[STYLE] setStyle failed", e);
    } finally {
      // idle가 안 오는 경우 대비(잠금 해제)
      setTimeout(() => setDisabled(false), 2500);
    }
  };
  // ===== THUMB (local assets) =====
const thumbUrl = (styleId) => {
  const map = {
    "dataviz-v4-dark":  "assets/thumbs/thumb_dark.webp",
    "dataviz-v4-light": "assets/thumbs/thumb_light.webp",
    "streets-v4":       "assets/thumbs/thumb_streets.webp",
    "hybrid-v4":        "assets/thumbs/thumb_sat.webp",
  };
  return map[styleId] || null;
};
  // 버튼 생성
STYLES.forEach((s) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "msCard";
  btn.setAttribute("data-style-id", s.id);

  const th = document.createElement("div");
  th.className = "msThumb";
  const u = thumbUrl(s.id);
  if (u) th.style.backgroundImage = `url("${u}")`;

  const lb = document.createElement("div");
  lb.className = "msLabel";
  lb.textContent = s.label;

  btn.appendChild(th);
  btn.appendChild(lb);

  btn.addEventListener("click", () => switchStyle(s.id));
  col.appendChild(btn);
});

  // 초기 active만 세팅(자동 setStyle은 안 함: 기준선 보존)
  try {
    const last = localStorage.getItem("frontier_style_id");
    if (last && STYLES.some((x) => x.id === last)) setActive(last);
    else setActive("dataviz-v4-dark");
  } catch (e) {
    setActive("dataviz-v4-dark");
  }

  // 범례 내부에 삽입(겹침/z-index 싸움 제거)
const body = legend.querySelector(".legendBody");
(body || legend).appendChild(panel);
   try { if (typeof window.__fr_syncLegendHeight === "function") window.__fr_syncLegendHeight(); } catch (e) {}
})();



