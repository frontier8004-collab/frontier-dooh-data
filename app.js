/* =========================================================
   Frontier DOOH 전국 DB - app.js
   - 안정화 우선: 정적 GitHub Pages + data_public.json
   - v1.1.26 기반 (표기 유지)
   - 2단 카테고리(catGroup → catSub) + 해시 딥링크(#cat=...&sub=...)
   ========================================================= */

(() => {
  "use strict";

  const VERSION = "v1.1.26";
  const DATA_URL = "./data_public.json";

  // ====== DOM helper ======
  const $ = (id) => document.getElementById(id);

  function esc(s){
    return String(s ?? "").replace(/[&<>"']/g, m => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
    }[m]));
  }

  function addOption(sel, value, label){
    const op = document.createElement("option");
    op.value = value;
    op.textContent = label;
    sel.appendChild(op);
  }

  // ====== Category Tree (대분류 → 하위) ======
  // ※ 여기의 high/low는 data_public.json에 반영된 _high/_low 기준으로 필터링합니다.
  const CATEGORY_TREE = [
    { high:"전광판", lows:["전광판","LED전광판","옥외전광판","실내전광판","도로전광판","지하철전광판"] },
    { high:"빌보드", lows:["빌보드","야립","고정식","대형빌보드","루프탑","고가도로"] },
    { high:"외벽",   lows:["외벽","건물외벽","미디어파사드","래핑","대형현수막"] },
    { high:"교통매체", lows:["버스","버스쉘터","지하철","택시","KTX/철도","공항/항공","터미널","렌터카/차량"] },
    { high:"극장/레저", lows:["극장","영화관","레저","스키장","골프","테마파크"] },
    { high:"리테일", lows:["백화점","대형마트","편의점","쇼핑몰","아울렛","면세점"] },
    { high:"주거/오피스", lows:["아파트","오피스","엘리베이터","로비","상가"] },
    { high:"기타", lows:["기타"] }
  ];

  function findHighByLow(low){
    if (!low) return "";
    for (const node of CATEGORY_TREE){
      if (node.lows && node.lows.includes(low)) return node.high;
    }
    return "";
  }

  function setCatGroupOptions(){
    const sel = $("catGroup");
    if (!sel) return;
    sel.innerHTML = "";
    addOption(sel, "", "매체 카테고리(대분류)");
    CATEGORY_TREE.map(x=>x.high).forEach(v => addOption(sel, v, v));
  }

  function setCatSubOptions(high){
    const sel = $("catSub");
    if (!sel) return;
    sel.innerHTML = "";
    addOption(sel, "", "하위 카테고리(전체)");
    if (!high){
      sel.disabled = true;
      return;
    }
    const node = CATEGORY_TREE.find(x => x.high === high);
    const lows = node && node.lows ? node.lows : [];
    lows.forEach(v => addOption(sel, v, v));
    sel.disabled = false;
  }

  function getSelectedCats(){
    const g = $("catGroup");
    const s = $("catSub");
    return {
      high: g ? g.value : "",
      low:  s ? s.value : ""
    };
  }

  // ====== Hash / Deep-link helpers ======
  // 지원 형태:
  // - #cat=전광판&sub=지하철
  // - #item=KEY&cat=...&sub=...
  // (상세 item과 필터 cat/sub를 동시에 유지)
  let suppressHashHandler = false;

  function parseHashParams(){
    const raw = (location.hash || "").replace(/^#/, "");
    return new URLSearchParams(raw);
  }

  function setHashParams(params){
    const next = params.toString();
    const hash = next ? ("#" + next) : "";
    if (location.hash !== hash){
      suppressHashHandler = true;
      location.hash = hash;
      setTimeout(()=>{ suppressHashHandler = false; }, 0);
    }
  }

  function writeCatsToHash(high, low){
    const p = parseHashParams();
    if (high) p.set("cat", high); else p.delete("cat");
    if (low)  p.set("sub", low);  else p.delete("sub");
    setHashParams(p);
  }

  function readCatsFromUrl(){
    const p = parseHashParams();
    let high = (p.get("cat") || "").trim();
    let low  = (p.get("sub") || "").trim();

    // querystring도 안전장치로 지원
    try{
      const q = new URLSearchParams(location.search || "");
      if (!high) high = (q.get("cat") || "").trim();
      if (!low)  low  = (q.get("sub") || "").trim();
    }catch(_){}

    if (!high && low) high = findHighByLow(low);
    return { high, low };
  }

  function applyCatsToUI(fromUrl){
    const { high, low } = fromUrl || { high:"", low:"" };
    const g = $("catGroup");
    const s = $("catSub");
    if (!g || !s) return;

    g.value = high || "";
    setCatSubOptions(g.value);

    if (low && findHighByLow(low) === g.value){
      s.value = low;
    }else{
      s.value = "";
    }
  }

  function setHash(key){
    const p = parseHashParams();
    p.set("item", encodeURIComponent(key));
    setHashParams(p);
  }

  function clearHash(){
    const p = parseHashParams();
    if (!p.has("item")) return;
    p.delete("item");
    setHashParams(p);
  }

  // ====== Data + App State ======
  let ALL = [];
  let curBase = [];
  let map = null;
  let cluster = null;

  let activeQuery = "";
  let pinnedTopKey = null;

  // list infinite scroll
  let listLimit = 60;
  const LIST_STEP = 40;

  // item index
  const itemByKey = new Map();

  // detail modal state
  let currentOpenKey = null;

  // cluster hint
  let clusterHintTimer = null;

  // ====== Error banner ======
  function showErrorBanner(html){
    const b = $("errBanner");
    const t = $("errText");
    if (!b || !t) return;
    t.innerHTML = html;
    b.style.display = "block";
  }
  function hideErrorBanner(){
    const b = $("errBanner");
    if (!b) return;
    b.style.display = "none";
  }

  // ====== Map ======
  function buildMap(){
    map = L.map("map", { zoomControl:false, preferCanvas:true });
    // 초기 뷰 (한국 중심)
    map.setView([36.3, 127.8], 8);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);

    cluster = L.markerClusterGroup({
      chunkedLoading:true,
      spiderfyOnMaxZoom:true,
      showCoverageOnHover:false,
      disableClusteringAtZoom: 15
    });
    map.addLayer(cluster);

    map.on("moveend", () => {
      viewportUpdate();
    });
  }

  // ====== Utility / taxonomy ======
  function normalizeStr(s){
    return String(s ?? "").trim();
  }

  function stableHash(seed, str){
    // simple deterministic-ish
    let h = 2166136261 ^ Math.floor(seed*1e9);
    for (let i=0;i<str.length;i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  function computeKey(it, idx){
    const a = normalizeStr(it.name || it.title || "");
    const b = normalizeStr(it.address || it.addr || "");
    const c = normalizeStr(it.media_group || it.group || "");
    const d = normalizeStr(it.category || it.sub_category || "");
    const base = [a,b,c,d, String(it.lat||""), String(it.lng||"")].join("|");
    return stableHash(0.123, base) + "_" + String(idx);
  }

  function assignTaxonomy(it){
    // data_public.json에 이미 _high/_low가 있으면 우선 사용
    const high = normalizeStr(it._high || it.media_group || it.group || "");
    const low  = normalizeStr(it._low  || it.category || it.sub_category || "");
    // 기본값 방어
    return {
      high: high || "기타",
      low:  low  || "기타"
    };
  }

  function makeSearchText(it){
    const parts = [];
    ["name","title","address","addr","media_group","group","category","sub_category","brand","place"]
      .forEach(k => { if (it[k]) parts.push(String(it[k])); });
    // taxonomy도 포함
    if (it._high) parts.push(it._high);
    if (it._low) parts.push(it._low);
    return parts.join(" ").toLowerCase();
  }

  function tokenMatchItem(token, it){
    const t = token.toLowerCase();
    return (it._searchText || "").includes(t);
  }

  // ====== Filtering ======
  function getFilteredBase(){
    const { high, low } = getSelectedCats();
    const qRaw = (activeQuery || "").trim();

    let arr = ALL;

    if (qRaw){
      const tokens = qRaw.split(/\s+/).map(s=>s.trim()).filter(Boolean);
      arr = arr.filter(x => tokens.every(tok => tokenMatchItem(tok, x)));
    }

    if (high) arr = arr.filter(x => x._high === high);
    if (high && low) arr = arr.filter(x => x._low === low);

    return arr;
  }

  // ====== List rendering ======
  function cardHtml(it){
    const title = esc(it.name || it.title || "(이름 없음)");
    const addr = esc(it.address || it.addr || "");
    const h = esc(it._high || "");
    const l = esc(it._low || "");
    return `
      <div class="card" data-key="${esc(it._key)}">
        <div class="t">${title}</div>
        <div class="s">${addr}</div>
        <div class="tagRow">
          ${h ? `<span class="tag">${h}</span>` : ""}
          ${l ? `<span class="tag">${l}</span>` : ""}
        </div>
      </div>
    `;
  }

  function renderList(arr){
    const list = $("list");
    if (!list) return;
    const lim = Math.min(listLimit, arr.length);
    let html = "";
    for (let i=0;i<lim;i++){
      html += cardHtml(arr[i]);
    }
    list.innerHTML = html;

    // click binding (event delegation)
    list.onclick = (e) => {
      const card = e.target.closest(".card");
      if (!card) return;
      const key = card.getAttribute("data-key");
      if (!key) return;
      const it = itemByKey.get(key);
      if (!it) return;
      openDetail(it, true);
    };
  }

  function setupInfiniteScroll(){
    const sentinel = $("sentinel");
    if (!sentinel) return;

    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting){
          listLimit += LIST_STEP;
          renderList(curInView);
        }
      });
    }, { root: document.querySelector(".listWrap"), threshold: 0.1 });

    io.observe(sentinel);
  }

  // ====== Markers ======
  function renderMarkers(base){
    cluster.clearLayers();
    for (const it of base){
      const lat = Number(it.lat);
      const lng = Number(it.lng);
      if (!isFinite(lat) || !isFinite(lng)) continue;

      const mk = L.marker([lat, lng]);
      mk.on("click", () => openDetail(it, true));
      cluster.addLayer(mk);
    }
  }

  // ====== viewport list update ======
  let curInView = [];
  let suspendViewportOnce = false;

  function viewportUpdate(){
    if (!map) return;

    if (suspendViewportOnce) return;

    const b = map.getBounds();
    const inView = (curBase || []).filter(x => {
      const la = Number(x.lat);
      const ln = Number(x.lng);
      if (!isFinite(la) || !isFinite(ln)) return false;
      return b.contains([la, ln]);
    });

    // 랜덤 셔플 방지: 항상 동일한 정렬
    inView.sort((a,b) => (a._key > b._key ? 1 : -1));

    curInView = inView;

    // reset list limit when viewport changes
    listLimit = 60;
    renderList(curInView);
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

  // ====== Detail Modal ======
  function openDetail(it, setHashFlag){
    currentOpenKey = it._key;

    $("dTitle").textContent = it.name || it.title || "상세";
    const addr = esc(it.address || it.addr || "");
    const h = esc(it._high || "");
    const l = esc(it._low || "");

    $("dBody").innerHTML = `
      <div><b>주소</b> ${addr || "-"}</div>
      <div style="margin-top:6px;"><b>카테고리</b> ${h}${l ? " / " + l : ""}</div>
    `;

    $("dOverlay").style.display = "block";
    $("dModal").style.display = "block";

    if (setHashFlag) setHash(it._key);
  }

  function closeDetail(clearHashFlag){
    currentOpenKey = null;
    $("dOverlay").style.display = "none";
    $("dModal").style.display = "none";
    if (clearHashFlag) clearHash();
  }

  function openDetailByHash(){
    const p = parseHashParams();
    let key = (p.get("item") || "").trim();

    // 구버전 호환: "#item=..." 형태
    if (!key && (location.hash || "").startsWith("#item=")){
      try{ key = decodeURIComponent((location.hash || "").replace("#item=", "")); }catch(_){}
    }
    if (!key) return;

    try{ key = decodeURIComponent(key); }catch(_){}

    if (currentOpenKey === key && $("dOverlay").style.display === "block") return;

    const it = itemByKey.get(key);
    if (!it) return;
    openDetail(it, false);
  }

  // ====== Search / Reset ======
  function applySearchFromUI(){
    const qVal = $("q").value.trim();
    activeQuery = qVal;

    pinnedTopKey = null;

    const base = getFilteredBase();
    renderMarkersAndListFromBase(base);
  }

  function resetAll(){
    $("q").value = "";
    activeQuery = "";

    const g = $("catGroup");
    const s = $("catSub");
    if (g) g.value = "";
    setCatSubOptions("");
    if (s) s.value = "";
    writeCatsToHash("", "");

    closeDetail(false);
    hideErrorBanner();

    pinnedTopKey = null;

    const base = getFilteredBase();
    renderMarkersAndListFromBase(base);

    // 홈 뷰 복귀
    try{
      if (map){
        map.setView([36.3, 127.8], 8, { animate:false });
      }
    }catch(_){}
  }

  function isNeutralState(){
    const { high, low } = getSelectedCats();
    return (!activeQuery || !activeQuery.trim()) && !high && !low;
  }

  // ====== Data load ======
  async function loadData(){
    try{
      const res = await fetch(DATA_URL, { cache:"no-store" });
      if (!res.ok){
        showErrorBanner(`데이터 로드 실패: <code>${esc(DATA_URL)}</code> (HTTP ${res.status})`);
        return [];
      }
      const json = await res.json();
      if (!Array.isArray(json)){
        showErrorBanner(`데이터 형식 오류: <code>${esc(DATA_URL)}</code> (배열이 아닙니다)`);
        return [];
      }
      return json;
    }catch(err){
      showErrorBanner(`데이터 로드 예외: <code>${esc(DATA_URL)}</code><br/>${esc(String(err))}`);
      return [];
    }
  }

  function normalizeItems(raw){
    const out = [];
    for (let i=0;i<raw.length;i++){
      const it = raw[i] || {};
      const lat = Number(it.lat ?? it.latitude);
      const lng = Number(it.lng ?? it.longitude);

      // 좌표 필수 (완전 방어)
      if (!isFinite(lat) || !isFinite(lng)) continue;

      const { high, low } = assignTaxonomy(it);

      const n = {
        ...it,
        lat, lng,
        _high: high,
        _low: low
      };

      n._key = normalizeStr(it._key) || computeKey(n, i);
      n._searchText = makeSearchText(n);

      out.push(n);
    }
    return out;
  }

  // ====== Init ======
  async function init(){
    $("ver").textContent = VERSION;

    const errClose = $("errClose");
    if (errClose) errClose.addEventListener("click", hideErrorBanner);

    buildMap();
    setupInfiniteScroll();

    // 상세 모달 닫기
    $("dx").addEventListener("click", () => closeDetail(true));
    $("dOverlay").addEventListener("click", (e) => {
      if (e.target.id === "dOverlay") closeDetail(true);
    });

    // 검색/초기화
    $("btnSearch").addEventListener("click", applySearchFromUI);
    $("btnReset").addEventListener("click", resetAll);
    $("q").addEventListener("keydown", (e) => {
      if (e.key === "Enter") applySearchFromUI();
    });

    // 카테고리(대분류/하위) - 2단 드롭다운
    $("catGroup").addEventListener("change", () => {
      pinnedTopKey = null;
      const g = $("catGroup").value || "";
      setCatSubOptions(g);
      const s = $("catSub");
      if (s) s.value = "";
      writeCatsToHash(g, "");
      const base = getFilteredBase();
      renderMarkersAndListFromBase(base);
    });

    $("catSub").addEventListener("change", () => {
      pinnedTopKey = null;
      const { high, low } = getSelectedCats();
      writeCatsToHash(high, low);
      const base = getFilteredBase();
      renderMarkersAndListFromBase(base);
    });

    // 해시 변경: 상세(item) + 카테고리(cat/sub) 모두 반영
    window.addEventListener("hashchange", () => {
      if (suppressHashHandler) return;

      const p = parseHashParams();
      if (p.has("item") || (location.hash || "").startsWith("#item=")) openDetailByHash();
      else closeDetail(true);

      const cats = readCatsFromUrl();
      applyCatsToUI(cats);
      const base = getFilteredBase();
      renderMarkersAndListFromBase(base);
    });

    // ===== data load =====
    const raw = await loadData();
    ALL = normalizeItems(raw);

    $("loadedCnt").textContent = String(ALL.length);

    // build index
    itemByKey.clear();
    for (const it of ALL) itemByKey.set(it._key, it);

    // 카테고리 드롭다운 초기 세팅 + URL 반영
    setCatGroupOptions();
    const initCats = readCatsFromUrl();
    applyCatsToUI(initCats);

    const base = getFilteredBase();
    renderMarkersAndListFromBase(base);

    // URL에 item이 있으면 상세 오픈
    openDetailByHash();
  }

  document.addEventListener("DOMContentLoaded", init);

})();
