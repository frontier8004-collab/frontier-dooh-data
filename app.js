/* =========================================================
   Frontier DOOH 전국 DB - app.js (v1.1.28)
   - index.html/app.js 분리 구조 유지
   - 데이터 로드 실패 시 배너 + 경로/시도경로 표시
   - 전역 오류 핸들링으로 흰 화면 방지
   ========================================================= */

(() => {
  "use strict";

  const VERSION = "v1.1.28";
  const DATA_URL = "./data_public.json";
   
  const CATEGORY_TREE = [
    { high:"전광판 / 빌보드 / 외벽", lows:["전광판","빌보드","외벽"] },
    { high:"교통매체", lows:["버스광고","지하철 광고","택시 광고","차량 광고","주요 도로 야립 광고","공항 / 기내, 항공기 광고","버스 쉘터 광고","KTX 광고","터미널 광고"] },
    { high:"복합 쇼핑몰 / 대형마트", lows:["복합 쇼핑몰","대형마트"] },
    { high:"극장 / 레저 / 휴양 시설", lows:["극장","레저","휴양, 편의시설"] },
    { high:"생활 밀착형 매체", lows:["엘리베이터 광고","병원 / 약국","학원 / 교육","오피스","주거 단지","편의점 / 카페 / F&B"] },
    { high:"기타", lows:["기타"] },
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

  const $ = (id) => document.getElementById(id);

  function showErrorBanner(msg, url, tried){
    const b = $("errBanner");
    if (!b) return;

    const mEl = $("errMsg");
    if (mEl) mEl.textContent = msg || "알 수 없는 오류";

    const uEl = $("errUrl");
    if (uEl) uEl.textContent = url || "-";

    const tEl = $("errTried");
    if (tEl){
      if (Array.isArray(tried) && tried.length){
        tEl.textContent = tried.join(", ");
      }else{
        tEl.textContent = "-";
      }
    }

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
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function fmtMoney(x){
    if (x == null || x === "") return "";
    const n = Number(String(x).replace(/[^\d.]/g,""));
    if (!Number.isFinite(n) || n <= 0) return "";
    return n.toLocaleString("ko-KR") + "원";
  }

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

  function norm(s){
    return (s ?? "").toString().trim();
  }
  function normKey(s){
    return norm(s).toLowerCase();
  }

  function isValidLatLng(lat,lng){
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    return lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
  }

  async function fetchJsonRobust(url){
    const r = await fetch(url, { cache:"no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} (${url})`);
    const txt = await r.text();
    try{
      return JSON.parse(txt);
    }catch(e){
      throw new Error(`JSON 파싱 실패 (${url})`);
    }
  }

  async function loadDataWithFallback(urls){
    const tried = [];
    const errors = [];

    const list = Array.isArray(urls) ? urls.filter(Boolean) : [];
    for (const url of list){
      tried.push(url);
      try{
        const json = await fetchJsonRobust(url);
        const raw = Array.isArray(json) ? json
          : (Array.isArray(json.items) ? json.items
          : (Array.isArray(json.data) ? json.data
          :  []));
        return { raw, url, tried };
      }catch(err){
        errors.push({ url, message: err?.message || String(err) });
      }
    }

    const last = errors[errors.length - 1];
    const msg = last
      ? `모든 데이터 경로에서 로드 실패. 마지막 오류: ${last.url} → ${last.message}`
      : "모든 데이터 경로에서 로드 실패 (원인 불명)";
    const e = new Error(msg);
    e.tried = tried;
    e.last = last;
    throw e;
  }

  function buildCategoryOptions(){
    const sel = $("cat");
    sel.innerHTML = "";
    addOption(sel, "", "매체 카테고리 (전체)");
    for (const group of CATEGORY_TREE){
      addOption(sel, `__HIGH__:${group.high}`, group.high);
      for (const low of group.lows){
        addOption(sel, `__LOW__:${group.high}:${low}`, ` └ ${low}`);
      }
    }
  }

  function getCatMatch(item, catVal){
    if (!catVal) return true;
    const g = norm(item.media_group_kor || item.media_group || "");
    const l = norm(item.media_type_low_kor || item.media_type_low || "");
    if (catVal.startsWith("__HIGH__:")){
      const high = catVal.split(":").slice(1).join(":");
      const group = CATEGORY_TREE.find(x => x.high === high);
      if (!group) return true;
      return group.lows.includes(l);
    }
    if (catVal.startsWith("__LOW__:")){
      const parts = catVal.split(":");
      const low = parts.slice(2).join(":");
      return l === low;
    }
    return true;
  }

  function stableShuffle(arr){
    // 법적/랜덤 이슈 피하려고 "완전 랜덤"이 아니라 seed 기반 섞기
    const a = arr.slice();
    let seed = shuffleSeed;
    for (let i=a.length-1;i>0;i--){
      seed = (seed * 9301 + 49297) % 233280;
      const j = Math.floor(seed/233280 * (i+1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function readSessionJSON(key, fallback){
    try{
      const s = sessionStorage.getItem(key);
      if (!s) return fallback;
      return JSON.parse(s);
    }catch(_){
      return fallback;
    }
  }
  function writeSessionJSON(key, value){
    try{
      sessionStorage.setItem(key, JSON.stringify(value));
    }catch(_){}
  }

  function ensureArrayUnique(arr){
    const seen = new Set();
    const out = [];
    for (const x of arr){
      const k = String(x);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(x);
    }
    return out;
  }

  function getItemKey(it){
    return norm(it.unique_key || it.id || it.uid || it.key || it.name || it.media_name || it.title || "");
  }

  // ===== UI helpers =====
  function setPillLoaded(n){
    const el = $("pillLoaded");
    if (el) el.textContent = String(n ?? 0);
  }

  function setZoomVal(z){
    const el = $("zoomVal");
    if (el) el.textContent = String(z ?? "-");
  }

  function setChips(total, filtered, inView){
    const t = $("chipTotal");
    const f = $("chipFiltered");
    const v = $("chipInView");
    if (t) t.textContent = String(total ?? 0);
    if (f) f.textContent = String(filtered ?? 0);
    if (v) v.textContent = String(inView ?? 0);
  }

  // ===== Detail / Cart / Recent =====
  let recentKeys = ensureArrayUnique(readSessionJSON(SS_RECENT, []));
  let cartKeys   = ensureArrayUnique(readSessionJSON(SS_CART, []));

  function saveRecent(){ writeSessionJSON(SS_RECENT, recentKeys); }
  function saveCart(){ writeSessionJSON(SS_CART, cartKeys); }

  function updateCartCount(){
    const el = $("cartCount");
    if (el) el.textContent = String(cartKeys.length);
  }

  function renderRecentList(itemByKey){
    const box = $("recentList");
    const cap = $("recentCap");
    if (!box) return;

    const max = 4;
    const trimmed = recentKeys.slice(0, max);
    if (cap) cap.textContent = `${trimmed.length}/${max}`;

    box.innerHTML = "";
    for (const key of trimmed){
      const it = itemByKey.get(key);
      if (!it) continue;

      const div = document.createElement("div");
      div.className = "miniItem";
      div.setAttribute("data-key", key);
      div.innerHTML = `
        <div class="x" data-x="1">×</div>
        <div style="font-weight:900; font-size:12px; line-height:1.2;">${escapeHtml(norm(it.media_name_kor || it.media_name || it.name || "NO NAME"))}</div>
        <div style="margin-top:6px; color:rgba(255,255,255,.62); font-size:11px; line-height:1.2;">
          ${escapeHtml(norm(it.address_kor || it.address || ""))}
        </div>
        <div style="margin-top:6px; font-weight:900; color:rgba(162,222,204,.92); font-size:11px;">
          ${escapeHtml(fmtMoney(it.price_min || it.price || it.price_kor || ""))}
        </div>
      `;
      box.appendChild(div);
    }
  }

  function addRecent(key){
    if (!key) return;
    recentKeys = [key, ...recentKeys.filter(x => x !== key)];
    recentKeys = recentKeys.slice(0, 20);
    saveRecent();
  }

  function addCart(key){
    if (!key) return;
    if (!cartKeys.includes(key)){
      cartKeys = [key, ...cartKeys];
      cartKeys = cartKeys.slice(0, 200);
      saveCart();
    }
    updateCartCount();
  }

  function removeCart(key){
    cartKeys = cartKeys.filter(x => x !== key);
    saveCart();
    updateCartCount();
  }

  function renderCartModal(itemByKey){
    const body = $("cartModalBody");
    if (!body) return;

    body.innerHTML = "";
    if (!cartKeys.length){
      body.innerHTML = `<div style="color:rgba(255,255,255,.65); font-size:13px;">장바구니가 비었습니다.</div>`;
      return;
    }

    for (const key of cartKeys){
      const it = itemByKey.get(key);
      if (!it) continue;

      const div = document.createElement("div");
      div.className = "miniItem";
      div.innerHTML = `
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
          <div style="min-width:0;">
            <div style="font-weight:900; font-size:13px; line-height:1.2;">${escapeHtml(norm(it.media_name_kor || it.media_name || it.name || "NO NAME"))}</div>
            <div style="margin-top:6px; color:rgba(255,255,255,.62); font-size:12px; line-height:1.2;">
              ${escapeHtml(norm(it.address_kor || it.address || ""))}
            </div>
            <div style="margin-top:8px; font-weight:900; color:rgba(162,222,204,.92); font-size:12px;">
              ${escapeHtml(fmtMoney(it.price_min || it.price || it.price_kor || ""))}
            </div>
          </div>
          <button class="resetBtn" data-remove="${escapeHtml(key)}" style="height:34px;">삭제</button>
        </div>
      `;
      body.appendChild(div);
    }

    const line = document.createElement("div");
    line.className = "cartLine";
    line.innerHTML = `
      <div>총 <b style="color:rgba(255,255,255,.92);">${cartKeys.length}</b>개</div>
      <div style="display:flex; gap:8px;">
        <button class="btn" id="cartClear">비우기</button>
      </div>
    `;
    body.appendChild(line);

    const clearBtn = $("cartClear");
    if (clearBtn){
      clearBtn.onclick = () => {
        cartKeys = [];
        saveCart();
        updateCartCount();
        renderCartModal(itemByKey);
      };
    }
  }

  // ===== Detail Modal =====
  let returnToCartAfterDetail = false;

  function openOverlay(id){
    const el = $(id);
    if (!el) return;
    el.style.display = "flex";
    document.body.style.overflow = "hidden";
  }
  function closeOverlay(id){
    const el = $(id);
    if (!el) return;
    el.style.display = "none";
    document.body.style.overflow = "hidden";
  }

  function setHashForKey(key){
    try{
      if (!key) return;
      location.hash = `#k=${encodeURIComponent(key)}`;
    }catch(_){}
  }
  function getKeyFromHash(){
    const h = location.hash || "";
    const m = h.match(/#k=([^&]+)/);
    if (!m) return "";
    try{ return decodeURIComponent(m[1]); }catch(_){ return m[1]; }
  }
  function clearHash(){
    try{
      history.replaceState(null, "", location.pathname + location.search);
    }catch(_){
      location.hash = "";
    }
  }

  function buildDetailRows(it){
    const rows = [];
    const push = (k,v) => {
      const vv = norm(v);
      if (!vv) return;
      rows.push(`
        <div class="kv">
          <div class="k">${escapeHtml(k)}</div>
          <div class="v">${escapeHtml(vv)}</div>
        </div>
      `);
    };

    push("매체명", it.media_name_kor || it.media_name || it.name);
    push("주소", it.address_kor || it.address);
    push("카테고리", it.media_type_low_kor || it.media_type_low || "");
    push("그룹", it.media_group_kor || it.media_group || "");
    push("가격", fmtMoney(it.price_min || it.price || it.price_kor));
    push("규격", it.size || it.spec || it.dimension);
    push("노출", it.exposure || it.impression || it.traffic);
    push("설명", it.description || it.memo);

    return rows.join("");
  }

  function openDetail(it, fromRecent=false){
    const key = getItemKey(it);
    if (key) setHashForKey(key);

    const title = $("dTitle");
    const body  = $("dBody");
    if (title) title.textContent = norm(it.media_name_kor || it.media_name || it.name || "상세");

    const rows = buildDetailRows(it);
    const addBtnHtml = key ? `<button class="resetBtn" id="dAddCart" style="margin-top:12px; width:100%; height:42px; background:rgba(162,222,204,.10); border-color:rgba(162,222,204,.28);">담기</button>` : "";

    if (body){
      body.innerHTML = `
        ${rows || `<div style="color:rgba(255,255,255,.65); font-size:13px;">표시할 정보가 없습니다.</div>`}
        ${addBtnHtml}
      `;
    }

    if (key){
      const btn = $("dAddCart");
      if (btn){
        btn.onclick = () => {
          addCart(key);
        };
      }
    }

    // 최근 본 기록
    if (!fromRecent && key){
      addRecent(key);
    }

    openOverlay("dOverlay");
  }

  function closeDetail(goBackToCart){
    closeOverlay("dOverlay");
    clearHash();
    if (goBackToCart){
      openOverlay("cOverlay");
    }
  }

  function openCart(itemByKey){
    renderCartModal(itemByKey);
    openOverlay("cOverlay");
  }
  function closeCart(){
    closeOverlay("cOverlay");
  }

  function openDetailByHash(){
    const key = getKeyFromHash();
    if (!key) return false;
    // 실제 itemByKey는 init 안에서 세팅 후 호출
    return true;
  }

  // ===== Search / Filter =====
  function buildSugPool(raw){
    const pool = [];
    const meta = new Map();

    const add = (s, type) => {
      const t = norm(s);
      if (!t) return;
      const k = normKey(t);
      if (meta.has(k)) return;
      meta.set(k, { text:t, type });
      pool.push(t);
    };

    for (const s of QUICK_SUGGEST) add(s, "quick");

    for (const it of raw){
      add(it.media_name_kor || it.media_name || it.name, "name");
      add(it.address_kor || it.address, "addr");
      add(it.city_kor || it.city, "city");
      add(it.district_kor || it.district, "dist");
    }

    SUG_POOL = pool.slice(0, 3000);
    SUG_META = meta;
  }

  function scoreMatch(text, q){
    const t = normKey(text);
    const qq = normKey(q);
    if (!qq) return 0;
    if (!t) return 0;

    // 정확매칭 우선
    if (t === qq) return 1000;

    // 포함
    if (t.includes(qq)) return 400;

    // 공백 제거 포함
    const t2 = t.replace(/\s+/g,"");
    const q2 = qq.replace(/\s+/g,"");
    if (t2.includes(q2)) return 300;

    return 0;
  }

  function makeSearchPredicate(q){
    const qq = norm(q);
    const qqKey = normKey(qq);

    if (!qqKey){
      return () => true;
    }

    return (it) => {
      const fields = [
        it.media_name_kor, it.media_name, it.name,
        it.address_kor, it.address,
        it.city_kor, it.city,
        it.district_kor, it.district,
        it.media_type_low_kor, it.media_type_low,
        it.media_group_kor, it.media_group,
      ];
      let best = 0;
      for (const f of fields){
        best = Math.max(best, scoreMatch(f, qqKey));
        if (best >= 1000) break;
      }
      return best > 0;
    };
  }

  function applyFilters(raw, q, catVal){
    const pred = makeSearchPredicate(q);
    return raw.filter(it => pred(it) && getCatMatch(it, catVal));
  }

  // ===== Leaflet Map =====
  let map = null;
  let cluster = null;
  let markerByKey = new Map();

  function makeMarkerIcon(){
    const svg = `
      <svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="g" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.2" result="b"/>
            <feColorMatrix in="b" type="matrix" values="0 0 0 0 0.63  0 0 0 0 0.87  0 0 0 0 0.80  0 0 0 .85 0" result="c"/>
            <feMerge>
              <feMergeNode in="c"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <circle cx="11" cy="11" r="7" fill="rgba(162,222,204,.92)" filter="url(#g)"/>
        <circle cx="11" cy="11" r="3" fill="rgba(0,0,0,.55)"/>
      </svg>
    `;
    return L.divIcon({
      className: "",
      html: svg,
      iconSize: [22,22],
      iconAnchor: [11,11],
    });
  }

  function initMap(){
    map = L.map("map", {
      zoomControl:false,
      preferCanvas:true,
    });

    // OSM
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);

    // 기본 뷰 (대한민국 중심)
    map.setView([36.3, 127.9], 8);
    setZoomVal(map.getZoom());

    map.on("zoomend", () => setZoomVal(map.getZoom()));
  }

  function clearMarkers(){
    if (cluster){
      cluster.clearLayers();
    }
    markerByKey.clear();
  }

  function addMarkers(points){
    clearMarkers();

    cluster = L.markerClusterGroup({
      chunkedLoading:true,
      maxClusterRadius: 58,
      spiderfyOnMaxZoom:true,
      showCoverageOnHover:false,
    });

    const icon = makeMarkerIcon();

    for (const it of points){
      const key = getItemKey(it);
      if (!key) continue;
      if (!isValidLatLng(it.lat, it.lng)) continue;

      const m = L.marker([it.lat, it.lng], { icon });
      m.on("click", () => {
        // 핀 클릭 시 상세 열기
        openDetail(it, false);
      });

      markerByKey.set(key, m);
      cluster.addLayer(m);
    }
    map.addLayer(cluster);
  }

  function getBoundsKey(b){
    // bounds 변화를 조잡하게 문자열로 만든 뒤 비교(최적화용)
    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    return [
      sw.lat.toFixed(4), sw.lng.toFixed(4),
      ne.lat.toFixed(4), ne.lng.toFixed(4),
      map.getZoom()
    ].join("|");
  }

  // ===== List Rendering =====
  let itemByKey = new Map();
  let baseAll = [];
  let baseFiltered = [];
  let lastBoundsKey = "";

  function renderList(items){
    const grid = $("grid");
    if (!grid) return;

    const arr = stableShuffle(items).slice(0, 500); // 과부하 방지
    grid.innerHTML = "";

    for (const it of arr){
      const key = getItemKey(it);
      const div = document.createElement("div");
      div.className = "card";
      div.setAttribute("data-key", key);
      div.innerHTML = `
        <div class="thumb">NO IMAGE</div>
        <div class="cardBody">
          <div class="badgeRow">
            <span class="badge">${escapeHtml(norm(it.media_group_kor || it.media_group || "그룹"))}</span>
            <span class="badge">${escapeHtml(norm(it.media_type_low_kor || it.media_type_low || "카테고리"))}</span>
          </div>
          <div class="title">${escapeHtml(norm(it.media_name_kor || it.media_name || it.name || "NO NAME"))}</div>
          <div class="meta">${escapeHtml(norm(it.address_kor || it.address || ""))}</div>
          <div class="price">${escapeHtml(fmtMoney(it.price_min || it.price || it.price_kor || "")) || "문의"}</div>
        </div>
      `;
      grid.appendChild(div);
    }
  }

  function getInViewItems(items){
    if (!map) return items;
    const b = map.getBounds();
    return items.filter(it => isValidLatLng(it.lat, it.lng) && b.contains([it.lat, it.lng]));
  }

  function renderMarkersAndListFromBase(base){
    baseFiltered = base;

    const inView = getInViewItems(baseFiltered);
    setChips(baseAll.length, baseFiltered.length, inView.length);
    renderList(inView);

    addMarkers(inView);
  }

  function runSearchFromUI(){
    const q = $("q") ? $("q").value : "";
    const catVal = $("cat") ? $("cat").value : "";
    const base = applyFilters(baseAll, q, catVal);
    renderMarkersAndListFromBase(base);

    // 검색 후 자동 줌은 억지로 하지 않음(안정화)
  }

  function resetAll(){
    if ($("q")) $("q").value = "";
    if ($("cat")) $("cat").value = "";
    sugIndex = -1;
    renderMarkersAndListFromBase(baseAll);
  }

  function openDetailByKey(key){
    const it = itemByKey.get(key);
    if (!it) return;
    openDetail(it, true);
  }

  // ===== init =====
  async function init(){
    // 전역 오류도 배너로 노출(흰 화면 방지)
    if (!window.__frontierGlobalErrHooked){
      window.__frontierGlobalErrHooked = true;

      window.addEventListener("error", (ev) => {
        try{
          const msg = ev?.message || "스크립트 오류";
          showErrorBanner(`스크립트 오류: ${msg}`, "app.js", []);
        }catch(_){}
      });

      window.addEventListener("unhandledrejection", (ev) => {
        try{
          const reason = ev?.reason;
          const msg = reason?.message || String(reason || "Promise 오류");
          showErrorBanner(`Promise 오류: ${msg}`, "app.js", []);
        }catch(_){}
      });
    }

    // 기본 UI
    buildCategoryOptions();

    const closeBtn = $("errClose");
    if (closeBtn){
      closeBtn.addEventListener("click", hideErrorBanner);
    }

    // 지도
    initMap();

    // 줌 버튼
    $("zIn").addEventListener("click", () => map.setZoom(map.getZoom() + 1));
    $("zOut").addEventListener("click", () => map.setZoom(map.getZoom() - 1));

    // 장바구니 모달
    $("openCart").addEventListener("click", () => openCart(itemByKey));
    $("cx").addEventListener("click", closeCart);
    $("cOverlay").addEventListener("click", (e) => { if (e.target.id === "cOverlay") closeCart(); });

    // 검색/초기화
    $("qGo").addEventListener("click", runSearchFromUI);
    $("q").addEventListener("keydown", (e) => {
      if (e.key === "Enter"){
        e.preventDefault();
        runSearchFromUI();
      }
    });
    $("cat").addEventListener("change", runSearchFromUI);
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

    // 최근 본 영역 클릭
    $("recentList").addEventListener("click", (e) => {
      const x = e.target?.closest?.("[data-x='1']");
      const item = e.target?.closest?.(".miniItem");
      if (!item) return;
      const key = item.getAttribute("data-key");
      if (!key) return;

      if (x){
        // 최근본 삭제
        recentKeys = recentKeys.filter(k => k !== key);
        saveRecent();
        renderRecentList(itemByKey);
        return;
      }

      openDetailByKey(key);
    });

    // 장바구니 모달 삭제 버튼
    $("cartModalBody").addEventListener("click", (e) => {
      const btn = e.target?.closest?.("[data-remove]");
      if (!btn) return;
      const key = btn.getAttribute("data-remove");
      if (!key) return;
      removeCart(key);
      renderCartModal(itemByKey);
    });

    // 리스트 클릭 → 상세
    $("grid").addEventListener("click", (e) => {
      const card = e.target?.closest?.(".card");
      if (!card) return;

      const key = card.getAttribute("data-key");
      if (!key) return;

      const it = itemByKey.get(key);
      if (!it) return;

      openDetail(it, false);
    });

    // ===== 데이터 로드 1회 =====
    let raw = [];
    let dataSrc = "-";
    const dataCandidates = Array.from(new Set([
      DATA_URL,
      "./data_public.json",
      "./data_v13_med_high.json",
      "./data.json",
    ].filter(Boolean)));

    try{
      const r = await loadDataWithFallback(dataCandidates);
      raw = r.raw;
      dataSrc = r.url || DATA_URL;
      hideErrorBanner();
    }catch(err){
      console.error("[DATA LOAD FAIL]", err);
      const tried = err?.tried || dataCandidates;
      const lastUrl = err?.last?.url || tried[tried.length - 1] || DATA_URL;
      showErrorBanner(err?.message || "data 로드 실패", lastUrl, tried);
      raw = [];
    }

    const pts = (raw || [])
      .map(x => {
        const la = (typeof x.lat === "number") ? x.lat : parseFloat(String(x.lat ?? "").trim());
        const ln = (typeof x.lng === "number") ? x.lng : parseFloat(String(x.lng ?? "").trim());
        return { ...x, lat: la, lng: ln };
      })
      .filter(x => isValidLatLng(x.lat, x.lng));

    baseAll = pts;

    // 키 맵
    itemByKey = new Map();
    for (const it of baseAll){
      const key = getItemKey(it);
      if (!key) continue;
      if (!itemByKey.has(key)){
        itemByKey.set(key, it);
      }
    }

    // 자동완성 풀 구성
    buildSugPool(baseAll);

    // 최근본/장바구니
    recentKeys = ensureArrayUnique(recentKeys).filter(k => itemByKey.has(k));
    cartKeys   = ensureArrayUnique(cartKeys).filter(k => itemByKey.has(k));
    saveRecent();
    saveCart();
    updateCartCount();
    renderRecentList(itemByKey);

    // 초기 렌더
    setPillLoaded(baseAll.length);

    // 지도 moveend 최적화 (bounds 같으면 생략)
    map.on("moveend", () => {
      const b = map.getBounds();
      const k = getBoundsKey(b);
      if (k === lastBoundsKey) return;
      lastBoundsKey = k;

      const inView = getInViewItems(baseFiltered);
      setChips(baseAll.length, baseFiltered.length, inView.length);
      renderList(inView);
      addMarkers(inView);
    });

    // 최초 boundsKey 저장
    lastBoundsKey = getBoundsKey(map.getBounds());

    const base = applyFilters(baseAll, $("q")?.value || "", $("cat")?.value || "");
    renderMarkersAndListFromBase(base);

    // 해시 상세 열기
    const hk = getKeyFromHash();
    if (hk){
      const it = itemByKey.get(hk);
      if (it) openDetail(it, true);
    }
  }

  // DOM 준비 후 실행 (index.html에서 defer로 불러오는 것을 전제로 함)
  document.addEventListener("DOMContentLoaded", () => {
    init().catch(err => {
      console.error("[INIT FAIL]", err);
      showErrorBanner(err?.message || "초기화 실패", "app.js", []);
    });
  });

})();
