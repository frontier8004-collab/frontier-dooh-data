/* =========================================================
Frontier DOOH 전국 DB JS 분리 버전 (v1.1.26 기반 안정화)
- index.html 안의  내용을 이 파일로 이동합니다.
- index.html에는 <script src="./app.js"></script> 한 줄만 남깁니다.
========================================================= */

(() => {
  "use strict";

  // ====== 버전 / 기본 설정 ======
  const APP_VERSION = "v1.1.26 (patched: list limit 300 + load more 200)";
  const DEBUG = false;

  // ====== DOM Helpers ======
  const $ = (id) => document.getElementById(id);

  // ====== 기본 상수 ======
  const BATCH = 36;
  const STEP  = 24;

  // 리스트 폭주 방지(내부용): 초기 300개 + 200개 더보기
  const LIST_INIT_LIMIT = 300;
  const LIST_MORE_STEP  = 200;

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

  // ====== 전역 상태 ======
  let map = null;
  let cluster = null;

  const itemByKey = new Map();
  const cardByKey = new Map();

  let allItems = [];
  let curInView = [];

  let renderLimit = BATCH;
  let pinnedTopKey = null;
  let hoverKey = null;
  let activeMiniKey = null;
  let currentOpenKey = null;

  let suspendViewportOnce = false;
  let suppressHashHandler = false;
  let returnToCartAfterDetail = false;

  // 검색 / 필터
  let activeQuery = "";
  let shuffleSeed = 0;

  // 최근 본 / 장바구니 (세션)
  const SS_RECENT = "frontier_dooh_recent_keys";
  const SS_CART   = "frontier_dooh_cart_keys";

  let recentKeys = [];
  let cartKeys = [];

  const RECENT_PAGE_SIZE = 4;
  let recentPage = 0;

  // ====== 유틸 ======
  function escapeHtml(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function parsePriceNumber(v){
    if (v == null) return null;
    const s = String(v).replace(/[^\d]/g, "");
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function fmtWon(v, unit){
    if (v == null || v === "") return "문의";
    const n = parsePriceNumber(v);
    if (n == null) return "문의";
    const won = n.toLocaleString("ko-KR") + "원";
    return unit ? `${won} (${unit})` : won;
  }

  function guessPlace(it){
    const parts = [];
    if (it.sido) parts.push(it.sido);
    if (it.sigungu) parts.push(it.sigungu);
    if (it.address && (!it.sido && !it.sigungu)) parts.push(it.address);
    return parts.join(" ");
  }

  function stableHash(seed, key){
    // 간단한 안정 해시(셔플용)
    let h = seed ^ 0x9e3779b9;
    const s = String(key);
    for (let i=0;i<s.length;i++){
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x5bd1e995) >>> 0;
      h ^= h >>> 15;
    }
    return h >>> 0;
  }

  function clearAllCardHighlights(){
    for (const el of cardByKey.values()){
      el.classList.remove("flash");
      el.classList.remove("active");
    }
  }

  function highlightCard(key, flash){
    const el = cardByKey.get(key);
    if (!el) return;
    el.classList.add("active");
    if (flash){
      el.classList.add("flash");
      setTimeout(()=>el.classList.remove("flash"), 550);
    }
  }

  function unhighlightCard(key){
    const el = cardByKey.get(key);
    if (!el) return;
    el.classList.remove("active");
  }

  function setHoverKey(key){
    hoverKey = key;
  }

  function setActiveMiniKey(key){
    activeMiniKey = key;
  }

  function clearClusterHighlight(){
    // v1.1.26 기준 placeholder (클러스터 하이라이트 제거)
  }

  function highlightClusterOnlyByKey(_key){
    // v1.1.26 기준 placeholder (클러스터 하이라이트)
  }

  function ensureCardVisible(key){
    const el = cardByKey.get(key);
    if (!el) return;
    el.scrollIntoView({ block:"nearest" });
  }

  function pinToTopAndFlash(key){
    pinnedTopKey = key;
    appendList(curInView);
    setTimeout(()=>highlightCard(key, true), 0);
  }

  // ====== 미니 팝업 HTML ======
  function miniPopupHtml(it){
    const img = it.thumb ? `<img src="${escapeHtml(it.thumb)}" alt="" style="width:100%;height:110px;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,.08);"/>` : `
NO IMAGE
`;
    const title = `<div style="font-weight:900;margin:8px 0 6px;">${escapeHtml(it.title || "-")}</div>`;
    const cat = `<div style="opacity:.85">${escapeHtml(it._high || "")}${it._low ? " > " + escapeHtml(it._low) : ""}</div>`;
    const price = `<div style="margin-top:8px;font-weight:900;">${escapeHtml(fmtWon(it.price, it.price_unit))}</div>`;
    return `
${img}
${title}
${cat}
${price}
<div style="opacity:.75;margin-top:8px;">클릭하면 상세보기</div>
<div style="display:flex;gap:8px;margin-top:10px;">
  <button class="btnMiniAdd" style="flex:1;padding:10px;border-radius:10px;border:1px solid rgba(162,222,204,.55);background:rgba(0,0,0,.35);color:#e9f5f2;font-weight:900;cursor:pointer;">담기</button>
  <button class="btnMiniOpen" style="flex:1;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.25);color:#e9f5f2;font-weight:900;cursor:pointer;">상세보기</button>
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

  function closeMiniPopup(){
    activeMiniKey = null;
    try{ map.closePopup(); }catch(_){}
  }

  // ====== 해시 딥링크 (상세) ======
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

  // ====== 최근 본 ======
  function saveRecentKey(key){
    if (!key) return;
    recentKeys = recentKeys.filter(k => k !== key);
    recentKeys.unshift(key);
    if (recentKeys.length > 200) recentKeys.length = 200;
    try{ sessionStorage.setItem(SS_RECENT, JSON.stringify(recentKeys)); }catch(_){}
    recentPage = 0;
    renderRecentPanel();
  }

  function renderRecentPanel(){
    const list = $("recentList");
    if (!list) return;
    list.innerHTML = "";

    const valid = recentKeys.filter(k => itemByKey.has(k));
    recentKeys = valid;
    try{ sessionStorage.setItem(SS_RECENT, JSON.stringify(recentKeys)); }catch(_){}

    const total = valid.length;
    const pages = Math.max(1, Math.ceil(total / RECENT_PAGE_SIZE));
    if (recentPage >= pages) recentPage = pages - 1;

    const from = recentPage * RECENT_PAGE_SIZE;
    const slice = valid.slice(from, from + RECENT_PAGE_SIZE);

    slice.forEach((key) => {
      const it = itemByKey.get(key);
      if (!it) return;
      const el = document.createElement("div");
      el.className = "rItem";
      el.innerHTML = `
${it.thumb ? `` : `
NO IMAGE
`}
${escapeHtml(it.title || "-")}
${escapeHtml(fmtWon(it.price, it.price_unit))}
<span class="rX" style="float:right;opacity:.8;cursor:pointer;">✕</span>
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
      list.appendChild(el);
    });

    const pager = $("recentPager");
    const meta = $("recentMeta");
    const prev = $("recentPrev");
    const next = $("recentNext");
    if (pager && meta && prev && next){
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
  }

  // ====== 상세 모달 ======
  function openDetail(it, sethash){
    closeMiniPopup();
    currentOpenKey = it._key;

    $("dt").textContent = it.title || "-";
    $("ds").textContent = `${it._high || "-"}${it._low ? " > " + it._low : ""}`;
    $("dcat").textContent = `${it._high || "-"}${it._low ? " > " + it._low : ""}`;
    $("dprice").textContent = fmtWon(it.price, it.price_unit);
    $("daddr").textContent = it.address || "-";
    $("dop").textContent = it.operator || "문의";

    $("dimg").innerHTML = it.thumb ? `<img src="${escapeHtml(it.thumb)}" alt="" style="width:100%;height:220px;object-fit:cover;border-radius:12px;border:1px solid rgba(255,255,255,.08);"/>` : `
NO IMAGE
`;

    const kakao = `https://map.kakao.com/link/map/${encodeURIComponent(it.title||"DOOH")},${it.lat},${it.lng}`;
    const google = `https://www.google.com/maps?q=${it.lat},${it.lng}`;
    $("dlinks").innerHTML = `<a href="${kakao}" target="_blank" rel="noopener">카카오맵</a> · <a href="${google}" target="_blank" rel="noopener">구글맵</a>`;

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

  // ====== 상태 판단 ======
  function isNeutralState(){
    const catSel = $("catHigh");
    return (!activeQuery || !activeQuery.trim()) && !(catSel && catSel.value);
  }

  // ====== 리스트 (핵심 변경: 300 + 더보기 200) ======
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
${it.thumb ? `` : `
NO IMAGE
`}
${it._high ? `${it._high}` : ``} ${it._low ? `${it._low}` : ``}
${escapeHtml(it.title || "-")}
${escapeHtml(guessPlace(it))}
${escapeHtml(fmtWon(it.price, it.price_unit))}
${escapeHtml(it.price_unit ? it.price_unit : "")}
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

  // ====== 장바구니 ======
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
장바구니가 비어 있습니다.
`;
    }else{
      valid.forEach((key) => {
        const it = itemByKey.get(key);
        if (!it) return;
        const row = document.createElement("div");
        row.className = "mRow";
        row.innerHTML = `
${it.thumb ? `` : ``}
${escapeHtml(it.title || "-")}
${escapeHtml(fmtWon(it.price, it.price_unit))}
<span class="mX" data-k="${escapeHtml(key)}" style="float:right;cursor:pointer;">✕</span>
`;
        row.querySelector(".mX").addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          removeFromCart(key);
          openCartModal();
        });
        body.appendChild(row);
      });
    }

    $("cartTotal").textContent = cartTotalText();
    $("cartModal").style.display = "block";
  }

  function closeCartModal(){
    $("cartModal").style.display = "none";
  }

  // ====== 데이터 로드 (현재 v1.1.26 로직 유지) ======
  async function loadData(){
    // v1.1.26에서는 index.html에서 DATA_URL을 주입하거나, 여기서 기본값을 씁니다.
    // (실제 프로젝트에서는 기존 로직을 그대로 유지하고 있을 가능성이 높습니다.)
    const url = window.DATA_URL || "./data_public.json";

    $("status").textContent = "Loading...";
    const r = await fetch(url, { cache:"no-store" });
    if (!r.ok) throw new Error(`DATA fetch failed: ${r.status} ${r.statusText} (${url})`);
    const data = await r.json();

    const items = Array.isArray(data.items) ? data.items : [];
    allItems = items.map((it) => normalizeItem(it)).filter(Boolean);

    itemByKey.clear();
    for (const it of allItems){
      itemByKey.set(it._key, it);
    }

    $("status").textContent = `Loaded ${allItems.length}`;
    return allItems;
  }

  function normalizeItem(it){
    if (!it) return null;
    const key = it.id || it._key || (it.title ? String(it.title) : null);
    if (!key) return null;

    const lat = Number(it.lat);
    const lng = Number(it.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const out = {
      ...it,
      _key: String(key),
      _high: it.category_high || it._high || it.media_group || "UNKNOWN",
      _low: it.category_low || it._low || it.category || "",
      lat,
      lng,
    };

    // 공개용일 때 대략좌표/정확좌표 혼용 대응(이미 프로젝트에 있을 수 있음)
    out._latDisp = (Number.isFinite(Number(it.lat_disp)) ? Number(it.lat_disp) : undefined);
    out._lngDisp = (Number.isFinite(Number(it.lng_disp)) ? Number(it.lng_disp) : undefined);

    return out;
  }

  // ====== 지도 초기화 (v1.1.26 구조 유지: 최소 구현) ======
  function initMap(){
    // Leaflet은 index.html에서 로드된 상태 가정
    const center = [36.35, 127.95];
    map = L.map("map", { zoomControl:false }).setView(center, 7);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);

    cluster = L.markerClusterGroup({
      showCoverageOnHover:false,
      spiderfyOnMaxZoom:true,
      disableClusteringAtZoom: 16,
      maxClusterRadius: 50
    });

    map.addLayer(cluster);

    map.on("moveend", () => {
      if (suspendViewportOnce) return;
      updateInView();
    });
  }

  function updateInView(){
    const b = map.getBounds();
    curInView = allItems.filter(it => b.contains([it.lat, it.lng]));
    renderList(curInView);
  }

  function updateZoomUI(){
    // v1.1.26 UI 유지용 placeholder
  }

  // ====== 이벤트 바인딩 ======
  function bindUI(){
    // 상세 닫기
    $("dClose")?.addEventListener("click", () => closeDetail(false));
    $("dOverlay")?.addEventListener("click", (e) => {
      if (e.target && e.target.id === "dOverlay") closeDetail(false);
    });

    // 해시 변경
    window.addEventListener("hashchange", () => {
      if (suppressHashHandler) return;
      openDetailByHash();
    });

    // 최근 본 페이지
    $("recentPrev")?.addEventListener("click", () => { recentPage = Math.max(0, recentPage - 1); renderRecentPanel(); });
    $("recentNext")?.addEventListener("click", () => { recentPage = recentPage + 1; renderRecentPanel(); });

    // 장바구니
    $("cartBtn")?.addEventListener("click", () => openCartModal());
    $("cartClose")?.addEventListener("click", () => closeCartModal());
    $("cartModal")?.addEventListener("click", (e) => {
      if (e.target && e.target.id === "cartModal") closeCartModal();
    });
  }

  function loadSession(){
    try{
      recentKeys = JSON.parse(sessionStorage.getItem(SS_RECENT) || "[]") || [];
    }catch(_){ recentKeys = []; }

    try{
      cartKeys = JSON.parse(sessionStorage.getItem(SS_CART) || "[]") || [];
    }catch(_){ cartKeys = []; }
  }

  // ====== 시작 ======
  async function init(){
    $("ver") && ($("ver").textContent = APP_VERSION);

    loadSession();
    bindUI();
    initMap();

    setupInfiniteScroll();

    await loadData();
    renderCartSummary();
    renderRecentPanel();

    // 초기 인뷰 렌더
    updateInView();

    // 딥링크(상세)
    openDetailByHash();
  }

  // 실행
  init().catch((err) => {
    console.error(err);
    const banner = $("errBanner");
    if (banner){
      banner.style.display = "block";
      banner.textContent = String(err && err.message ? err.message : err);
    }else{
      alert(String(err && err.message ? err.message : err));
    }
  });

})();
