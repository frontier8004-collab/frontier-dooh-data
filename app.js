/* =========================================================
   Frontier DOOH 전국 DB
   JS 분리 버전 (v1.1.27 PATCH)
   - v1.1.26 기준선 유지 + 리스트 폭주 방지(초기 200 / 더보기 200)
   - index.html에는 <script src="./app.js" defer></script> 한 줄만 남깁니다.
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

  // 기존 값 (v1.1.26 유지)
  const BATCH = 36;
  // v1.1.27 PATCH: 리스트 폭주 방지 (초기 200개, 더보기 200개)
  const LIST_INITIAL_LIMIT = 200;
  const LIST_MORE_STEP = 200;
  // 기본은 '더보기' 버튼 방식. (원하면 true로 바꾸면 무한 스크롤도 가능)
  const USE_INFINITE_SCROLL = false;
  const STEP  = LIST_MORE_STEP;

  const SS_RECENT = "frontier_recent_keys_v2";
  const SS_CART   = "frontier_cart_keys_v1";

  const RECENT_MAX = 200;
  const RECENT_PAGE_SIZE = 4;

  const $ = (id) => document.getElementById(id);

  // -------- state --------
  let ALL = [];
  let map = null;
  let cluster = null;

  let curFiltered = [];
  let curInView = [];
  let renderLimit = BATCH;

  let activeQuery = "";
  let shuffleSeed = 0;
  let pinnedTopKey = null;
  let hoverKey = null;

  let suppressHashHandler = false;
  let currentOpenKey = null;

  let activeMiniKey = null;
  let miniPopup = null;

  let itemByKey = new Map();
  let markerByKey = new Map();
  let cardByKey = new Map();

  let recentKeys = [];
  let recentPage = 0;

  let cartKeys = [];
  let returnToCartAfterDetail = false;

  let suspendViewportOnce = false;

  // -------- utils --------
  function escapeHtml(s){
    return String(s ?? "")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  }

  function stableHash(seed, str){
    let h = 2166136261 ^ seed;
    for (let i=0;i<str.length;i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0);
  }

  function fmtWon(price, unit){
    if (price == null || price === "") return "문의";
    const s = String(price).trim();
    const n = parsePriceNumber(s);
    if (n == null) return s || "문의";
    const won = n.toLocaleString("ko-KR") + "원";
    if (unit) return won;
    return won;
  }

  function parsePriceNumber(x){
    if (x == null) return null;
    const s = String(x);
    const m = s.replace(/[^\d]/g,"");
    if (!m) return null;
    const n = Number(m);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  function guessPlace(it){
    const addr = it.address || "";
    const m = addr.match(/(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/);
    if (m) return m[1];
    return addr ? addr.split(" ").slice(0,2).join(" ") : "-";
  }

  function withinBounds(lat,lng){
    if (lat == null || lng == null) return false;
    const b = HOME_BOUNDS_FIXED;
    return lat <= b.north && lat >= b.south && lng >= b.west && lng <= b.east;
  }

  // -------- error UI --------
  function showError(msg, url){
    const banner = $("errBanner");
    const em = $("errMsg");
    const eu = $("errUrl");
    if (em) em.textContent = msg || "데이터 로드 실패";
    if (eu) eu.textContent = url || "-";
    if (banner) banner.style.display = "block";
  }

  function hideError(){
    const banner = $("errBanner");
    if (banner) banner.style.display = "none";
  }

  // -------- category --------
  function buildCategorySelect(){
    const sel = $("catHigh");
    if (!sel) return;

    sel.innerHTML = `<option value="">카테고리</option>`;
    CATEGORY_TREE.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.high;
      opt.textContent = c.high;
      sel.appendChild(opt);
    });

    sel.addEventListener("change", () => {
      applyFilters();
    });
  }

  // -------- map --------
  function initMap(){
    const mapEl = $("map");
    map = L.map(mapEl, {
      zoomControl:false,
      attributionControl:false,
      preferCanvas:true
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18
    }).addTo(map);

    map.setView(HOME_CENTER, HOME_ZOOM, { animate:false });

    cluster = L.markerClusterGroup({
      showCoverageOnHover:false,
      maxClusterRadius: 60,
      spiderfyOnMaxZoom:true,
      chunkedLoading:true,
    });
    map.addLayer(cluster);

    map.on("moveend", () => {
      if (suspendViewportOnce) return;
      updateInView();
      updateZoomUI();
    });

    map.on("zoomend", () => {
      if (suspendViewportOnce) return;
      updateZoomUI();
    });

    // zoom buttons
    const zPlus = $("zPlus");
    const zMinus = $("zMinus");
    if (zPlus) zPlus.addEventListener("click", () => map.zoomIn());
    if (zMinus) zMinus.addEventListener("click", () => map.zoomOut());

    // home
    const zHome = $("zHome");
    if (zHome) zHome.addEventListener("click", () => {
      resetToHome();
    });
  }

  function updateZoomUI(){
    const zVal = $("zVal");
    if (zVal) zVal.textContent = String(map.getZoom());
  }

  function resetToHome(){
    clearActiveMiniKey();
    clearAllCardHighlights();
    clearClusterHighlight();

    pinnedTopKey = null;
    shuffleSeed = (Date.now() % 100000) | 0;

    const sel = $("catHigh");
    if (sel) sel.value = "";
    const q = $("q");
    if (q) q.value = "";

    activeQuery = "";
    applyFilters();

    suspendViewportOnce = true;
    map.once("moveend", () => {
      suspendViewportOnce = false;
      updateZoomUI();
      updateInView();
    });

    map.setView(HOME_CENTER, HOME_ZOOM, { animate:false });
  }

  // -------- markers --------
  function makeIcon(it){
    return L.divIcon({
      className: "pin",
      html: `<div class="pinDot"></div>`,
      iconSize: [12,12],
      iconAnchor: [6,6]
    });
  }

  function clearMarkers(){
    if (!cluster) return;
    cluster.clearLayers();
    markerByKey.clear();
  }

  function addMarkers(items){
    clearMarkers();

    items.forEach((it) => {
      const marker = L.marker([it.lat, it.lng], { icon: makeIcon(it) });
      markerByKey.set(it._key, marker);

      marker.on("click", () => {
        openMiniPopupFor(it, marker);
      });

      cluster.addLayer(marker);
    });
  }

  // -------- mini popup / detail --------
  function clearActiveMiniKey(){
    activeMiniKey = null;
  }
  function setActiveMiniKey(key){
    activeMiniKey = key;
  }

  function miniPopupHtml(it){
    const img = it.thumb ? `<div class="mThumb"><img src="${it.thumb}" alt=""></div>` : `<div class="mThumb"><div class="fallback">NO IMAGE</div></div>`;
    const title = `<div class="mTitle">${escapeHtml(it.title || "-")}</div>`;
    const cat = `<div class="mCat">${escapeHtml(it._high || "-")}${it._low ? " > " + escapeHtml(it._low) : ""}</div>`;
    const price = `<div class="mPrice">${escapeHtml(fmtWon(it.price, it.price_unit))}</div>`;

    return `
      <div class="mWrap">
        ${img}
        <div class="mBody">
          ${title}
          ${cat}
          ${price}
          <div class="mHint">클릭하면 상세보기</div>
          <div class="mBtns">
            <button class="mBtn" data-act="cart">담기</button>
            <button class="mBtn" data-act="detail">상세보기</button>
          </div>
        </div>
      </div>
    `;
  }

  function closeMiniPopup(){
    if (miniPopup){
      try { map.closePopup(miniPopup); } catch(_){}
    }
    miniPopup = null;
    clearActiveMiniKey();
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
      if (!miniPopup){
        miniPopup = L.popup({ closeButton:false, autoClose:false, closeOnClick:false, offset:[0,-10] });
      }
      miniPopup
        .setLatLng(marker.getLatLng())
        .setContent(miniPopupHtml(it));
      miniPopup.openOn(map);

      const el = miniPopup.getElement();
      if (el){
        el.addEventListener("click", (e) => {
          const btn = e.target.closest("button");
          if (!btn) return;
          const act = btn.getAttribute("data-act");
          if (act === "cart"){
            addToCart(it._key);
            // mini 팝업은 유지
          }else if (act === "detail"){
            returnToCartAfterDetail = false;
            openDetail(it, true);
          }
        });
      }
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
    if (recentKeys.length > RECENT_MAX) recentKeys.length = RECENT_MAX;
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
    $("dimg").innerHTML = it.thumb ? `<img src="${it.thumb}" alt="">` : `
      <div class="fallback" style="height:220px; display:flex; align-items:center; justify-content:center;">NO IMAGE</div>
    `;

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

  // -------- highlight helpers --------
  function setHoverKey(key){ hoverKey = key; }

  function highlightCard(key, flash){
    const el = cardByKey.get(key);
    if (!el) return;
    el.classList.add("active");
    if (flash){
      el.classList.add("flash");
      setTimeout(()=>{ el.classList.remove("flash"); }, 450);
    }
  }

  function unhighlightCard(key){
    const el = cardByKey.get(key);
    if (!el) return;
    el.classList.remove("active");
    el.classList.remove("flash");
  }

  function clearAllCardHighlights(){
    cardByKey.forEach((el) => {
      el.classList.remove("active");
      el.classList.remove("flash");
    });
  }

  function ensureCardVisible(key){
    const el = cardByKey.get(key);
    const panel = $("panel");
    if (!el || !panel) return;

    const rect = el.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();

    const above = rect.top < pr.top + 110;
    const below = rect.bottom > pr.bottom - 90;

    if (above || below){
      el.scrollIntoView({ block:"center", behavior:"smooth" });
    }
  }

  function pinToTopAndFlash(key){
    pinnedTopKey = key;
    renderLimit = Math.max(renderLimit, Math.min(curInView.length, LIST_INITIAL_LIMIT));
    appendList(curInView);
    highlightCard(key, true);
  }

  function clearClusterHighlight(){
    const el = $("clusterHint");
    if (el) el.style.opacity = 1;
  }

  function highlightClusterOnlyByKey(key){
    // v1.1.26 방식 유지: CSS로 처리(필요시 확장)
    const el = $("clusterHint");
    if (!el) return;
    el.style.opacity = 0.75;
  }

  // -------- filter / search --------
  function isNeutralState(){
    const catSel = $("catHigh");
    return (!activeQuery || !activeQuery.trim()) && !(catSel && catSel.value);
  }

  function applyFilters(){
    const q = $("q");
    const query = (q ? q.value : "").trim();
    activeQuery = query;

    const sel = $("catHigh");
    const high = sel ? sel.value : "";

    // filter by query + category
    let arr = ALL.slice();

    if (high){
      arr = arr.filter(x => (x._high === high));
    }

    if (query){
      const qq = query.toLowerCase();
      arr = arr.filter(x => {
        const t = (x.title||"").toLowerCase();
        const a = (x.address||"").toLowerCase();
        const o = (x.operator||"").toLowerCase();
        return t.includes(qq) || a.includes(qq) || o.includes(qq);
      });
    }

    curFiltered = arr;

    // stats
    $("mAll").textContent = String(ALL.length);
    $("mFilter").textContent = String(curFiltered.length);

    updateInView(true);
  }

  function updateInView(force){
    if (!map) return;

    const b = map.getBounds();
    const inView = curFiltered.filter(it => b.contains([it.lat, it.lng]));
    curInView = inView;

    $("mInView").textContent = String(curInView.length);

    // list
    renderList(curInView);

    // markers
    addMarkers(curInView);

    if (force){
      // noop
    }
  }

  // -------- list render (v1.1.27 PATCH) --------
  function renderList(items){
    const list = $("list");
    list.innerHTML = "";
    cardByKey.clear();

    // v1.1.27 PATCH: 초기 표시 상한 (리스트 폭주 방지)
    renderLimit = Math.min(items.length, LIST_INITIAL_LIMIT);

    $("empty").style.display = items.length ? "none" : "block";

    // 리스트 렌더
    appendList(items);
  }

  function updateLoadMoreUI(items){
    const box = $("moreHint");
    if (!box) return;

    const total = items.length;
    const shown = Math.min(renderLimit, total);

    if (!total || shown >= total){
      box.style.display = "none";
      box.innerHTML = "더 불러오는 중…";
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
      <div style="margin-top:6px; opacity:.85; color:var(--muted);">
        (리스트 폭주 방지: 초기 ${LIST_INITIAL_LIMIT}개, 클릭 시 ${LIST_MORE_STEP}개씩)
      </div>
    `;

    const btn = document.getElementById("loadMoreBtn");
    if (!btn) return;

    btn.addEventListener("click", () => {
      renderLimit = Math.min(curInView.length, renderLimit + LIST_MORE_STEP);
      appendList(curInView);
    }, { once:true });
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

  function setupInfiniteScroll(){
    const panel = $("panel");
    if (!USE_INFINITE_SCROLL) return;

    panel.addEventListener("scroll", () => {
      const nearBottom = (panel.scrollTop + panel.clientHeight) > (panel.scrollHeight - 600);
      if (!nearBottom) return;
      if (renderLimit >= curInView.length) return;

      renderLimit = Math.min(curInView.length, renderLimit + STEP);
      appendList(curInView);
    }, { passive:true });
  }

  // -------- suggest (v1.1.26 유지) --------
  const SUG_META = new Map();
  let sugIndex = -1;

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
        applyFilters();
      });

      box.appendChild(row);
    });

    box.style.display = "block";
    sugIndex = -1;
  }

  function computeSuggest(){
    const q = $("q");
    const box = $("qSuggest");
    if (!q || !box) return;

    const query = q.value.trim().toLowerCase();
    if (!query){
      showSuggest([]);
      return;
    }

    const cand = [];
    for (const it of ALL){
      const t = (it.title||"").toLowerCase();
      const a = (it.address||"").toLowerCase();
      if (t.includes(query)) cand.push(it.title);
      else if (a.includes(query)) cand.push(it.address);
      if (cand.length >= 10) break;
    }

    const uniq = Array.from(new Set(cand)).slice(0, 8);
    uniq.forEach(v => SUG_META.set(v, { hint:"검색" }));
    showSuggest(uniq);
  }

  // -------- recent panel --------
  function renderRecentPanel(){
    const body = $("recentBody");
    const meta = $("recentMeta");
    const prev = $("recentPrev");
    const next = $("recentNext");
    const count = $("recentCount");

    if (count) count.textContent = `${recentKeys.length}/${RECENT_PAGE_SIZE}`;

    if (!body || !meta || !prev || !next) return;

    body.innerHTML = "";

    const valid = recentKeys.filter(k => itemByKey.has(k));
    recentKeys = valid;
    try{ sessionStorage.setItem(SS_RECENT, JSON.stringify(recentKeys)); }catch(_){}

    const pages = Math.max(1, Math.ceil(valid.length / RECENT_PAGE_SIZE));
    if (recentPage >= pages) recentPage = pages - 1;

    const start = recentPage * RECENT_PAGE_SIZE;
    const slice = valid.slice(start, start + RECENT_PAGE_SIZE);

    slice.forEach((key) => {
      const it = itemByKey.get(key);
      if (!it) return;

      const el = document.createElement("div");
      el.className = "rItem";
      el.dataset.key = it._key;
      el.innerHTML = `
        <div class="rThumb">
          ${it.thumb ? `<img src="${it.thumb}" alt="">` : `<div class="fallback">NO IMAGE</div>`}
        </div>
        <div class="rBody">
          <div class="rTitle">${escapeHtml(it.title || "-")}</div>
          <div class="rPrice">${escapeHtml(fmtWon(it.price, it.price_unit))}</div>
        </div>
        <button class="rX" type="button">✕</button>
      `;

      el.addEventListener("click", () => {
        returnToCartAfterDetail = false;
        openDetail(it, true);
      });

      el.querySelector(".rX").addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        recentKeys = recentKeys.filter(x => x !== key);
        try{ sessionStorage.setItem(SS_RECENT, JSON.stringify(recentKeys)); }catch(_){}
        renderRecentPanel();
      });

      body.appendChild(el);
    });

    if (valid.length > RECENT_PAGE_SIZE){
      $("recentPager").style.display = "flex";
      meta.textContent = `${recentPage + 1}/${pages}`;
      prev.disabled = (recentPage <= 0);
      next.disabled = (recentPage >= pages - 1);
    }else{
      $("recentPager").style.display = "none";
      meta.textContent = "1/1";
    }
  }

  // -------- cart --------
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
      if (n == null) hasInquiry = true;
      else sum += n;
    }

    const won = sum.toLocaleString("ko-KR") + "원";
    return hasInquiry ? `${won} + α(문의)` : won;
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
      body.innerHTML = `
        <div style="padding:14px; color:var(--muted); font-size:13px;">
          장바구니가 비어 있습니다.
        </div>
      `;
    }else{
      valid.forEach((key) => {
        const it = itemByKey.get(key);
        if (!it) return;

        const row = document.createElement("div");
        row.className = "mRow";
        row.innerHTML = `
          <div class="mThumb">
            ${it.thumb ? `<img src="${it.thumb}" alt="">` : `<div class="fallback">NO IMAGE</div>`}
          </div>
          <div class="mBody">
            <div class="mTitle">${escapeHtml(it.title || "-")}</div>
            <div class="mPrice">${escapeHtml(fmtWon(it.price, it.price_unit))}</div>
          </div>
          <button class="mX" type="button">✕</button>
        `;

        row.addEventListener("click", () => {
          returnToCartAfterDetail = true;
          openDetail(it, true);
        });

        row.querySelector(".mX").addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          removeFromCart(key);
          openCartModal();
        });

        body.appendChild(row);
      });

      const total = document.createElement("div");
      total.style.padding = "12px 10px";
      total.style.color = "var(--muted)";
      total.style.fontSize = "13px";
      total.style.borderTop = "1px solid rgba(255,255,255,.06)";
      total.innerHTML = `합계: <b style="color:var(--mint);">${escapeHtml(cartTotalText())}</b>`;
      body.appendChild(total);
    }

    $("cartModal").style.display = "block";
  }

  function closeCartModal(){
    $("cartModal").style.display = "none";
  }

  // -------- load data --------
  async function loadData(){
    hideError();

    try{
      const res = await fetch(DATA_URL, { cache:"no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      const items = Array.isArray(json?.items) ? json.items : [];
      const cleaned = [];

      items.forEach((x, idx) => {
        const lat = Number(x.lat);
        const lng = Number(x.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        if (!withinBounds(lat, lng)) return;

        const high = x.high || x._high || x.category_high || "";
        const low  = x.low  || x._low  || x.category_low  || "";

        const key = x.key || x._key || `${lat},${lng},${idx}`;

        const it = {
          ...x,
          lat, lng,
          _key: String(key),
          _high: String(high || "").trim(),
          _low:  String(low || "").trim(),
        };

        cleaned.push(it);
      });

      ALL = cleaned;
      itemByKey = new Map();
      ALL.forEach(it => itemByKey.set(it._key, it));

      // UI stats
      const loaded = $("loaded");
      if (loaded) loaded.textContent = String(ALL.length);

      // category select
      buildCategorySelect();

      // init map + list
      initMap();

      // recent / cart load
      try{
        recentKeys = JSON.parse(sessionStorage.getItem(SS_RECENT) || "[]");
        if (!Array.isArray(recentKeys)) recentKeys = [];
      }catch(_){ recentKeys = []; }

      try{
        cartKeys = JSON.parse(sessionStorage.getItem(SS_CART) || "[]");
        if (!Array.isArray(cartKeys)) cartKeys = [];
      }catch(_){ cartKeys = []; }

      renderRecentPanel();
      renderCartSummary();

      // handlers
      setupHandlers();
      setupInfiniteScroll();

      // first filter render
      shuffleSeed = (Date.now() % 100000) | 0;
      applyFilters();
      openDetailByHash();
    }catch(err){
      console.error(err);
      showError("데이터 로드 실패", DATA_URL);
    }
  }

  // -------- handlers --------
  function setupHandlers(){
    const errClose = $("errClose");
    if (errClose) errClose.addEventListener("click", hideError);

    const reset = $("reset");
    if (reset) reset.addEventListener("click", resetToHome);

    const q = $("q");
    if (q){
      q.addEventListener("input", () => {
        computeSuggest();
        // 실시간 필터링
        applyFilters();
      });
      q.addEventListener("keydown", (e) => {
        if (e.key === "Enter"){
          e.preventDefault();
          applyFilters();
          const box = $("qSuggest");
          if (box) box.style.display = "none";
        }
      });
    }

    const dClose = $("dClose");
    if (dClose) dClose.addEventListener("click", () => closeDetail(false));

    const dOverlay = $("dOverlay");
    if (dOverlay){
      dOverlay.addEventListener("click", (e) => {
        if (e.target === dOverlay) closeDetail(false);
      });
    }

    window.addEventListener("hashchange", () => {
      if (suppressHashHandler) return;
      if (location.hash.startsWith("#item=")){
        openDetailByHash();
      }else{
        if ($("dOverlay").style.display === "block"){
          closeDetail(true);
        }
      }
    });

    const cartBtn = $("cartBtn");
    if (cartBtn) cartBtn.addEventListener("click", openCartModal);

    const cartClose = $("cartClose");
    if (cartClose) cartClose.addEventListener("click", closeCartModal);

    const recentPrev = $("recentPrev");
    const recentNext = $("recentNext");
    if (recentPrev) recentPrev.addEventListener("click", () => { recentPage = Math.max(0, recentPage - 1); renderRecentPanel(); });
    if (recentNext) recentNext.addEventListener("click", () => { recentPage += 1; renderRecentPanel(); });

    const dAddCart = $("dAddCart");
    if (dAddCart) dAddCart.addEventListener("click", () => {
      if (!currentOpenKey) return;
      addToCart(currentOpenKey);
    });
  }

  // -------- boot --------
  loadData();

})();
