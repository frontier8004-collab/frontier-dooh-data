/* =========================================================
   Frontier DOOH 전국 DB
   JS 분리 버전 (v1.1.26 기반 안정화)
   - index.html 안의 <script>...</script> 내용을 이 파일로 이동합니다.
   - index.html에는 <script src="./app.js" defer></script> 한 줄만 남깁니다.
   ========================================================= */

(() => {
  "use strict";

  const VERSION = "v1.1.27";
  const DATA_URL = "./data_public.json";
   
  const CATEGORY_TREE = [
    { high:"전광판 / 빌보드 / 외벽", lows:["전광판","빌보드","외벽"] },
    { high:"교통매체", lows:["버스광고","지하철 광고","택시 광고","차량 광고","주요 도로 야립 광고","공항 / 기내, 항공기 광고","버스 쉘터 광고","KTX 광고","터미널 광고"] },
    { high:"복합 쇼핑몰/대형마트", lows:["복합 쇼핑몰","대형마트"] },
    { high:"극장 / 레저 / 휴양 시설", lows:["극장","골프장 / 골프연습장","스키장","워터파크","리조트","테마파크","캠핑장"] },
    { high:"생활 밀착형 매체", lows:["아파트 광고","병의원 광고","약국 광고","프랜차이즈(카페/식당)","주유소/충전소","학원/교육기관","미용실/네일샵","헬스장/필라테스"] },
    { high:"기타 매체", lows:["공공기관 광고","공연장/전시장","편의점 광고","오피스 광고","엘리베이터 광고","화장실 광고","기타"] },
    { high:"4대 매체(ATL)", lows:["TV","라디오","신문","잡지"] },
  ];

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

  const MAX_RECENT = 4;

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

  // 리스트 과부하 방지: 초기 300개만 표시 + "더보기"로 200개씩 추가
  const LIST_INIT_LIMIT = 300;
  const LIST_MORE_STEP  = 200;
  let renderHardLimit = LIST_INIT_LIMIT;

  let renderLimit = BATCH;
  let curInView = [];
  let curBase = [];

  let currentOpenKey = null;
  let suppressHashHandler = false;

  let highlightedClusterEl = null;

  let cart = [];
  let recent = [];

  let returnToCartAfterDetail = false;
  let turnToCartAfterDetail = false;

  let lastInViewHash = "";

  function $(id){
    return document.getElementById(id);
  }

  function showErrorBanner(msg){
    const b = $("errBanner");
    if (!b) return;

    const em = $("errMsg");
    if (em) em.textContent = msg || "알 수 없는 오류";

    // index.html에 errUrl 요소가 없을 수 있으므로 안전 처리
    const eu = $("errUrl");
    if (eu) eu.textContent = DATA_URL;

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
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }

  function num(v){
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function clamp(v, lo, hi){
    return Math.max(lo, Math.min(hi, v));
  }

  function safeLatLng(it){
    const lat = num(it.lat);
    const lng = num(it.lng);
    if (lat == null || lng == null) return null;
    if (lat < 30 || lat > 45) return null;
    if (lng < 120 || lng > 135) return null;
    return [lat, lng];
  }

  function normalizeLow(s){
    return (s ?? "").toString().trim();
  }

  function normalizeHigh(s){
    return normalizeLow(s).replace(/\s+/g," ").trim();
  }

  function mapOriginalHigh(high){
    const h = normalizeHigh(high);
    if (!h) return "UNKNOWN";
    return h;
  }

  function assignTaxonomy(items){
    for (const it of items){
      if (!it.category_high){
        it.category_high = mapOriginalHigh(it.category_low);
      }else{
        it.category_high = mapOriginalHigh(it.category_high);
      }
      it.category_low = normalizeLow(it.category_low);
    }
    return items;
  }

  function setCatHighOptions(items){
    const sel = $("catHigh");
    if (!sel) return;
    sel.innerHTML = "";
    addOption(sel, "", "매체 카테고리 (전체)");

    const set = new Set();
    for (const it of items){
      const h = it.category_high || "UNKNOWN";
      set.add(h);
    }
    const arr = Array.from(set).sort((a,b)=>a.localeCompare(b,"ko"));
    for (const h of arr){
      addOption(sel, h, h);
    }
  }

  function makeSearchText(it){
    const parts = [
      it.title, it.media_group, it.category_high, it.category_low,
      it.sido, it.sigungu, it.address, it.operator, it.status
    ].map(v => (v ?? "").toString());
    return parts.join(" ").toLowerCase();
  }

  function searchNorm(s){
    return (s ?? "").toString().trim().toLowerCase();
  }

  function stableHash(seed, s){
    let h = 2166136261 ^ (seed * 1000000 | 0);
    for (let i=0;i<s.length;i++){
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function stableHash32(seed, s){
    return stableHash(seed, s);
  }

  function isNeutralState(){
    const q = $("q")?.value?.trim() || "";
    const h = $("catHigh")?.value || "";
    return !q && !h;
  }

  function buildCard(it){
    const el = document.createElement("div");
    el.className = "mCard";

    const img = it.thumb ? `<img src="${escapeHtml(it.thumb)}" alt="" loading="lazy"/>` : `<div class="noImg">NO IMAGE</div>`;
    const p = (it.price ? escapeHtml(it.price) : "문의");
    const addr = escapeHtml(it.address || `${it.sido||""} ${it.sigungu||""}`.trim());

    const tags = [];
    if (it.category_high) tags.push(it.category_high);
    if (it.category_low) tags.push(it.category_low);
    if (it.media_group) tags.push(it.media_group);

    el.innerHTML = `
      <div class="mThumb">${img}</div>
      <div class="mBody">
        <div class="mTags">${tags.slice(0,3).map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
        <div class="mTitle">${escapeHtml(it.title || "(무제)")}</div>
        <div class="mAddr">${addr}</div>
        <div class="mPrice">${p}</div>
      </div>
    `;

    return el;
  }

  function renderStats(total, filtered, inView){
    const a = $("mAll");
    const f = $("mFilter");
    const v = $("mInView");
    if (a) a.textContent = String(total ?? 0);
    if (f) f.textContent = String(filtered ?? 0);
    if (v) v.textContent = String(inView ?? 0);
  }

  function setLoadedPill(n){
    const pill = $("pillLoaded");
    if (pill) pill.textContent = String(n ?? 0);
  }

  function ensureLoadMoreUI(total){
    const box = $("moreHint");
    if (!box) return;

    box.style.display = "none";
    box.innerHTML = "";

    if (total <= renderHardLimit) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `더보기 (+${LIST_MORE_STEP})`;
    btn.style.cssText = [
      "width:100%",
      "padding:10px 12px",
      "border-radius:12px",
      "border:1px solid rgba(162,222,204,.35)",
      "background:rgba(0,0,0,.25)",
      "color:var(--text)",
      "cursor:pointer",
      "font-size:12px"
    ].join(";");

    const meta = document.createElement("div");
    meta.textContent = `${renderHardLimit}/${total} 표시 중`;
    meta.style.cssText = "margin-top:8px;color:var(--muted);font-size:12px;";

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      renderHardLimit = Math.min(total, renderHardLimit + LIST_MORE_STEP);
      renderLimit = Math.min(renderHardLimit, renderLimit + LIST_MORE_STEP);
      appendList(curInView);
      ensureLoadMoreUI(total);
    });

    box.appendChild(btn);
    box.appendChild(meta);
    box.style.display = "block";
  }

  function renderList(items){
    const list = $("list");
    list.innerHTML = "";
    cardByKey.clear();

    renderHardLimit = LIST_INIT_LIMIT;
    renderLimit = Math.min(BATCH, renderHardLimit);

    $("empty").style.display = items.length ? "none" : "block";
    ensureLoadMoreUI(items.length);

    appendList(items);
  }

  function appendList(items){
    const list = $("list");
    let arr = items.slice();

    // 중립 상태에서는 셔플(기존 동작 유지)
    if (isNeutralState()){
      arr.sort((a,b)=> (stableHash32(shuffleSeed, a._key) - stableHash32(shuffleSeed, b._key)));
    }

    for (let i = list.childElementCount; i < Math.min(arr.length, renderLimit); i++){
      const it = arr[i];
      const key = it._key;
      if (cardByKey.has(key)) continue;

      const el = buildCard(it);
      el.dataset.key = key;
      cardByKey.set(key, el);

      el.addEventListener("mouseenter", () => {
        hoverKey = key;
        highlightMarker(key, true);
      });
      el.addEventListener("mouseleave", () => {
        hoverKey = null;
        highlightMarker(key, false);
      });

      el.addEventListener("click", () => {
        returnToCartAfterDetail = false;
        openDetail(it, true);
      });

      list.appendChild(el);
    }

    ensureLoadMoreUI(items.length);
  }

  function setupInfiniteScroll(){
    const panel = $("panel");
    panel.addEventListener("scroll", () => {
      const nearBottom = (panel.scrollTop + panel.clientHeight) > (panel.scrollHeight - 600);
      if (!nearBottom) return;
      if (renderLimit >= curInView.length) return;

      renderLimit = Math.min(Math.min(curInView.length, renderHardLimit), renderLimit + STEP);
      appendList(curInView);
    }, { passive:true });
  }

  function showSuggest(values){
    const box = $("qSuggest");
    if (!box) return;

    const arr = Array.isArray(values) ? values : [];
    if (!arr.length){
      box.style.display = "none";
      box.innerHTML = "";
      return;
    }
    box.innerHTML = arr.map((t,i)=> `<div class="sugRow" data-i="${i}">${escapeHtml(t)}</div>`).join("");
    box.style.display = "block";

    box.querySelectorAll(".sugRow").forEach(row => {
      row.addEventListener("mousedown", (e)=>{
        e.preventDefault();
        const t = row.textContent || "";
        selectSuggest(t);
      });
    });
  }

  function selectSuggest(t){
    const q = $("q");
    if (!q) return;
    q.value = t;
    showSuggest([]);
    applyFilters();
  }

  function buildSuggestPool(){
    const mapT = new Map();
    const add = (t, hint) => {
      t = (t ?? "").toString().trim();
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

      const src = `${it.title || ""} ${it.address || ""} ${it.sido || ""} ${it.sigungu || ""}`;
      const toks = src.split(/\s+/).filter(Boolean);
      for (const w of toks){
        if (w.length >= 2 && w.length <= 12) add(w, "키워드");
      }
    }

    for (const t of QUICK_SUGGEST){
      add(t, "추천");
    }

    const pool = Array.from(mapT.values())
      .sort((a,b)=> b.count - a.count)
      .slice(0, 200);

    SUG_POOL = pool.map(x=>x.term);
    SUG_META = new Map(pool.map(x=>[x.term, x]));
  }

  function updateSuggest(){
    const q = $("q");
    const box = $("qSuggest");
    if (!q || !box) return;

    const t = q.value.trim();
    if (t.length < 2){
      showSuggest([]);
      sugIndex = -1;
      return;
    }

    const low = t.toLowerCase();
    const matches = [];
    for (const cand of SUG_POOL){
      if (cand.toLowerCase().includes(low)){
        matches.push(cand);
        if (matches.length >= 8) break;
      }
    }
    showSuggest(matches);
    sugIndex = -1;
  }

  function handleSuggestKey(e){
    const box = $("qSuggest");
    if (!box || box.style.display === "none") return false;

    const rows = Array.from(box.querySelectorAll(".sugRow"));
    if (!rows.length) return false;

    if (e.key === "ArrowDown"){
      e.preventDefault();
      sugIndex = clamp(sugIndex + 1, 0, rows.length-1);
    }else if (e.key === "ArrowUp"){
      e.preventDefault();
      sugIndex = clamp(sugIndex - 1, 0, rows.length-1);
    }else if (e.key === "Enter"){
      if (sugIndex >= 0 && sugIndex < rows.length){
        e.preventDefault();
        selectSuggest(rows[sugIndex].textContent || "");
        return true;
      }
      return false;
    }else if (e.key === "Escape"){
      e.preventDefault();
      showSuggest([]);
      return true;
    }else{
      return false;
    }

    rows.forEach((r,i)=>{
      r.classList.toggle("active", i === sugIndex);
    });
    return true;
  }

  function normalizeForSearch(s){
    return (s ?? "").toString().toLowerCase().trim();
  }

  function applyFilters(){
    if (!ALL.length) return;

    const q = normalizeForSearch($("q")?.value || "");
    const cat = $("catHigh")?.value || "";

    let base = ALL;

    if (cat){
      base = base.filter(it => (it.category_high || "UNKNOWN") === cat);
    }

    if (q){
      base = base.filter(it => (it._search || "").includes(q));
    }

    curBase = base;

    updateInView(true);
  }

  function updateInView(resetView){
    if (!map) return;

    const b = map.getBounds();
    const inView = curBase.filter(it => {
      const ll = it._ll;
      if (!ll) return false;
      return b.contains(ll);
    });

    curInView = inView;

    renderStats(ALL.length, curBase.length, curInView.length);
    renderList(curInView);
    refreshMarkers(curInView, resetView);
    updateHashFromState();
  }

  function refreshMarkers(items, resetView){
    if (!map || !markers) return;

    markers.clearLayers();
    markerByKey.clear();

    for (const it of items){
      if (!it._ll) continue;
      const m = L.marker(it._ll, { title: it.title || "" });
      m._key = it._key;

      m.on("click", () => {
        returnToCartAfterDetail = false;
        openDetail(it, true);
      });

      markerByKey.set(it._key, m);
      markers.addLayer(m);
    }

    if (resetView){
      tryFit(items);
    }
  }

  function tryFit(items){
    const pts = [];
    for (const it of items){
      if (it._ll) pts.push(it._ll);
    }
    if (!pts.length){
      map.setView(HOME_CENTER, HOME_ZOOM);
      return;
    }
    const bounds = L.latLngBounds(pts);
    map.fitBounds(bounds, { padding:[20,20], maxZoom:13 });
  }

  function highlightMarker(key, on){
    const m = markerByKey.get(key);
    if (!m) return;

    try{
      if (on){
        m.setZIndexOffset(1000);
      }else{
        m.setZIndexOffset(0);
      }
    }catch(_){}
  }

  function buildDetailLinks(it){
    const links = [];
    if (it.address){
      const q = encodeURIComponent(it.address);
      links.push({ label:"지도", url:`https://map.naver.com/v5/search/${q}` });
      links.push({ label:"구글", url:`https://www.google.com/maps/search/?api=1&query=${q}` });
    }
    return links;
  }

  function openDetail(it, pushHash){
    activeMiniKey = it._key;
    currentOpenKey = it._key;

    const o = $("dOverlay");
    if (!o) return;

    $("dimg").innerHTML = it.thumb ? `<img src="${escapeHtml(it.thumb)}" alt="" />` : `<div class="noImg">NO IMAGE</div>`;
    $("dt").textContent = it.title || "(무제)";
    $("ds").textContent = `${it.sido || ""} ${it.sigungu || ""}`.trim();
    $("daddr").textContent = it.address || "";
    $("dcat").textContent = `${it.category_high || "UNKNOWN"} / ${it.category_low || ""}`.trim();
    $("dop").textContent = it.operator || "";
    $("dprice").textContent = it.price ? `${it.price}${it.price_unit ? " " + it.price_unit : ""}` : "문의";

    const links = buildDetailLinks(it);
    $("dlinks").innerHTML = links.map(l=>`<a class="dLink" href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.label)}</a>`).join("");

    o.style.display = "flex";

    addRecent(it);

    if (pushHash){
      updateHashFromState(true);
    }
  }

  function closeDetail(){
    const o = $("dOverlay");
    if (!o) return;
    o.style.display = "none";

    activeMiniKey = null;

    if (turnToCartAfterDetail){
      turnToCartAfterDetail = false;
      openCart();
      return;
    }
    if (returnToCartAfterDetail){
      returnToCartAfterDetail = false;
      openCart();
    }
  }

  function loadRecent(){
    try{
      const raw = sessionStorage.getItem(SS_RECENT);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr;
    }catch(_){
      return [];
    }
  }

  function saveRecent(){
    try{
      sessionStorage.setItem(SS_RECENT, JSON.stringify(recent));
    }catch(_){}
  }

  function addRecent(it){
    if (!it?._key) return;
    recent = recent.filter(k => k !== it._key);
    recent.unshift(it._key);
    recent = recent.slice(0, MAX_RECENT);
    saveRecent();
    renderRecent();
  }

  function renderRecent(){
    const list = $("recentList");
    const meta = $("recentMeta");
    if (!list || !meta) return;

    list.innerHTML = "";
    meta.textContent = `${recent.length}/${MAX_RECENT}`;

    for (const k of recent){
      const it = itemByKey.get(k);
      if (!it) continue;

      const row = document.createElement("div");
      row.className = "recentRow";
      row.textContent = it.title || "(무제)";
      row.addEventListener("click", ()=>{
        returnToCartAfterDetail = false;
        openDetail(it, true);
      });
      list.appendChild(row);
    }
  }

  function loadCart(){
    try{
      const raw = sessionStorage.getItem(SS_CART);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr;
    }catch(_){
      return [];
    }
  }

  function saveCart(){
    try{
      sessionStorage.setItem(SS_CART, JSON.stringify(cart));
    }catch(_){}
  }

  function isInCart(key){
    return cart.includes(key);
  }

  function addToCart(it){
    const key = it?._key;
    if (!key) return;
    if (!cart.includes(key)) cart.push(key);
    saveCart();
    updateCartUI();
  }

  function removeFromCart(key){
    cart = cart.filter(k => k !== key);
    saveCart();
    updateCartUI();
  }

  function updateCartUI(){
    const c = $("cartCount");
    if (c) c.textContent = String(cart.length);

    const body = $("cartModalBody");
    if (!body) return;

    body.innerHTML = "";
    if (!cart.length){
      body.innerHTML = `<div style="padding:12px;color:var(--muted);font-size:12px;">장바구니가 비어있습니다.</div>`;
      return;
    }

    for (const k of cart){
      const it = itemByKey.get(k);
      if (!it) continue;

      const row = document.createElement("div");
      row.className = "cartRow";
      row.innerHTML = `
        <div class="cartTitle">${escapeHtml(it.title || "(무제)")}</div>
        <button class="cartRemove" type="button">삭제</button>
      `;

      row.querySelector(".cartTitle").addEventListener("click", ()=>{
        closeCart();
        returnToCartAfterDetail = true;
        openDetail(it, true);
      });
      row.querySelector(".cartRemove").addEventListener("click", ()=>{
        removeFromCart(k);
      });

      body.appendChild(row);
    }
  }

  function openCart(){
    const o = $("cartModalOverlay");
    if (!o) return;
    updateCartUI();
    o.style.display = "flex";
  }

  function closeCart(){
    const o = $("cartModalOverlay");
    if (!o) return;
    o.style.display = "none";
  }

  function setupCart(){
    $("cartBtn")?.addEventListener("click", openCart);
    $("cartClose")?.addEventListener("click", closeCart);
    $("cartModalOverlay")?.addEventListener("click", (e)=>{
      if (e.target === $("cartModalOverlay")) closeCart();
    });

    $("dAddCart")?.addEventListener("click", ()=>{
      if (!currentOpenKey) return;
      const it = itemByKey.get(currentOpenKey);
      if (!it) return;
      addToCart(it);
      turnToCartAfterDetail = true;
      closeDetail();
    });
  }

  function setupZoomControls(){
    $("zIn")?.addEventListener("click", ()=> map && map.zoomIn());
    $("zOut")?.addEventListener("click", ()=> map && map.zoomOut());
  }

  function updateZoomUI(){
    const z = $("zVal");
    if (!z || !map) return;
    z.textContent = String(map.getZoom());
  }

  function updateHashFromState(forcePush){
    if (suppressHashHandler) return;

    const q = $("q")?.value?.trim() || "";
    const cat = $("catHigh")?.value || "";
    const z = map ? map.getZoom() : HOME_ZOOM;
    const c = map ? map.getCenter() : L.latLng(HOME_CENTER[0], HOME_CENTER[1]);

    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (cat) params.set("catHigh", cat);
    params.set("z", String(z));
    params.set("lat", c.lat.toFixed(6));
    params.set("lng", c.lng.toFixed(6));

    const next = "#" + params.toString();
    if (!forcePush && next === lastInViewHash) return;
    lastInViewHash = next;

    if (forcePush){
      history.pushState(null, "", next);
    }else{
      history.replaceState(null, "", next);
    }
  }

  function applyStateFromHash(){
    const hash = location.hash || "";
    if (!hash.startsWith("#")) return false;

    const qs = hash.slice(1);
    if (!qs) return false;

    const p = new URLSearchParams(qs);

    const q = p.get("q") || "";
    const catHigh = p.get("catHigh") || "";

    const z = num(p.get("z"));
    const lat = num(p.get("lat"));
    const lng = num(p.get("lng"));

    if ($("q")) $("q").value = q;
    if ($("catHigh")) $("catHigh").value = catHigh;

    if (map && z != null && lat != null && lng != null){
      map.setView([lat,lng], z, { animate:false });
    }

    return true;
  }

  function bindUI(){
    $("titleReset")?.addEventListener("click", ()=>{
      resetAll(true);
    });

    $("reset")?.addEventListener("click", ()=>{
      resetAll(true);
    });

    $("q")?.addEventListener("input", ()=>{
      updateSuggest();
    });

    $("q")?.addEventListener("keydown", (e)=>{
      if (handleSuggestKey(e)) return;
      if (e.key === "Enter"){
        e.preventDefault();
        showSuggest([]);
        applyFilters();
      }
    });

    $("qGo")?.addEventListener("click", ()=>{
      showSuggest([]);
      applyFilters();
    });

    $("catHigh")?.addEventListener("change", ()=>{
      applyFilters();
    });

    $("errClose")?.addEventListener("click", hideErrorBanner);

    $("dOverlay")?.addEventListener("click", (e)=>{
      if (e.target === $("dOverlay")) closeDetail();
    });

    window.addEventListener("hashchange", ()=>{
      if (suppressHashHandler) return;
      suppressHashHandler = true;
      try{
        applyStateFromHash();
        applyFilters();
      }finally{
        suppressHashHandler = false;
      }
    });
  }

  function resetAll(resetMap){
    if ($("q")) $("q").value = "";
    if ($("catHigh")) $("catHigh").value = "";
    showSuggest([]);

    shuffleSeed = Math.random();

    if (map && resetMap){
      map.setView(HOME_CENTER, HOME_ZOOM, { animate:false });
    }
    applyFilters();
  }

  async function loadData(){
    try{
      hideErrorBanner();

      const res = await fetch(DATA_URL, { cache:"no-store" });
      if (!res.ok){
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      const items = Array.isArray(data?.items) ? data.items : [];

      ALL = assignTaxonomy(items);

      for (const it of ALL){
        it._key = it.id || `${it.title || ""}__${it.address || ""}__${it.lat || ""},${it.lng || ""}`;
        it._ll = safeLatLng(it) ? L.latLng(safeLatLng(it)) : null;
        it._search = makeSearchText(it);

        itemByKey.set(it._key, it);
      }

      setLoadedPill(ALL.length);
      setCatHighOptions(ALL);
      buildSuggestPool();

      return ALL;
    }catch(err){
      const msg = (err && err.message) ? err.message : String(err);
      showErrorBanner(`데이터 로드 실패: ${msg}`);
      setLoadedPill(0);
      renderStats(0,0,0);
      throw err;
    }
  }

  function initMap(){
    map = L.map("map", {
      zoomControl:false,
      minZoom: 6,
      maxZoom: 18,
    }).setView(HOME_CENTER, HOME_ZOOM);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
      subdomains: "abcd",
      maxZoom: 19
    }).addTo(map);

    markers = L.markerClusterGroup({
      showCoverageOnHover:false,
      maxClusterRadius: 55,
      spiderfyOnMaxZoom:true
    });
    map.addLayer(markers);

    map.on("zoomend", ()=>{
      updateZoomUI();
      updateHashFromState();
    });
    map.on("moveend", ()=>{
      updateInView(false);
    });

    updateZoomUI();
  }

  async function boot(){
    bindUI();
    setupInfiniteScroll();
    setupZoomControls();
    setupCart();

    cart = loadCart();
    updateCartUI();

    recent = loadRecent();
    renderRecent();

    initMap();

    // 해시가 있으면 먼저 반영
    suppressHashHandler = true;
    try{
      applyStateFromHash();
    }finally{
      suppressHashHandler = false;
    }

    await loadData();
    applyFilters();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
