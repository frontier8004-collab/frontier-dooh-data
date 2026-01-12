/* Frontier DOOH DB - app.js (v1.1.26 base)
   - Category dropdown: 대분류 → 하위 카테고리
   - Deep-link filter: ?catHigh=...&catLow=...
*/

"use strict";

const DATA_URL = "./data_public.json";

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat("ko-KR");

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function addOption(sel, value, label){
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = label;
  sel.appendChild(opt);
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function has(text, needles){
  const t = String(text || "").toLowerCase();
  return needles.some(x => t.includes(String(x).toLowerCase()));
}

// ---------- Category tree (홈페이지 구조 고정) ----------
const CATEGORY_TREE = [
  {
    key: "전광판/빌보드/외벽",
    label: "전광판 / 빌보드 / 외벽",
    children: [
      { key: "전광판", label: "전광판" },
      { key: "빌보드", label: "빌보드" },
      { key: "외벽", label: "외벽" },
    ],
  },
  {
    key: "교통매체",
    label: "교통매체",
    children: [
      { key: "버스광고", label: "버스광고" },
      { key: "지하철 광고", label: "지하철 광고" },
      { key: "택시 광고", label: "택시 광고" },
      { key: "차량 광고", label: "차량 광고" },
      { key: "주요 도로 야립 광고", label: "주요 도로 야립 광고" },
      { key: "공항/기내, 항공기 광고", label: "공항 / 기내, 항공기 광고" },
      { key: "버스 쉘터 광고", label: "버스 쉘터 광고" },
      { key: "KTX 광고", label: "KTX 광고" },
      { key: "터미널 광고", label: "터미널 광고" },
    ],
  },
  {
    key: "복합 쇼핑몰/대형마트",
    label: "복합 쇼핑몰 / 대형마트",
    children: [
      { key: "복합 쇼핑몰", label: "복합 쇼핑몰" },
      { key: "대형마트", label: "대형마트" },
    ],
  },
  {
    key: "극장/레저/휴양 시설",
    label: "극장 / 레저 / 휴양 시설",
    children: [
      { key: "극장", label: "극장" },
      { key: "레저", label: "레저" },
      { key: "휴양, 편의시설", label: "휴양, 편의시설" },
    ],
  },
  {
    key: "생활 밀착형 매체",
    label: "생활 밀착형 매체",
    children: [
      { key: "엘리베이터 광고", label: "엘리베이터 광고" },
      { key: "병원", label: "병원" },
      { key: "편의점", label: "편의점" },
      { key: "운동시설", label: "운동시설" },
      { key: "캠퍼스", label: "캠퍼스" },
      { key: "식당, 주점", label: "식당, 주점" },
      { key: "약국", label: "약국" },
      { key: "헤어&뷰티살롱", label: "헤어&뷰티살롱" },
      { key: "드럭스토어", label: "드럭스토어" },
    ],
  },
  {
    key: "4대 매체(ATL)",
    label: "4대 매체(ATL)",
    children: [
      { key: "TV", label: "TV" },
      { key: "라디오", label: "라디오" },
      { key: "매거진", label: "매거진" },
      { key: "신문", label: "신문" },
    ],
  },
  { key: "기타 매체", label: "기타 매체", children: [] },
  { key: "해외 옥외 매체", label: "해외 옥외 매체", children: [] },
];

// ---------- Category normalization ----------
function normalizeLow(s){
  const low = String(s || "").trim();

  if (!low) return "";

  // traffic
  if (has(low, ["버스", "bus"])) return "버스광고";
  if (has(low, ["지하철", "subway", "metro"])) return "지하철 광고";
  if (has(low, ["택시", "taxi"])) return "택시 광고";
  if (has(low, ["차량", "vehicle", "car"])) return "차량 광고";
  if (has(low, ["야립", "도로", "road"])) return "주요 도로 야립 광고";
  if (has(low, ["공항", "기내", "항공", "airport", "inflight"])) return "공항/기내, 항공기 광고";
  if (has(low, ["쉘터", "shelter"])) return "버스 쉘터 광고";
  if (has(low, ["ktx"])) return "KTX 광고";
  if (has(low, ["터미널", "terminal"])) return "터미널 광고";

  // shopping
  if (has(low, ["복합", "쇼핑몰"])) return "복합 쇼핑몰";
  if (has(low, ["대형마트", "마트"])) return "대형마트";

  // leisure
  if (has(low, ["극장", "cinema"])) return "극장";
  if (has(low, ["레저", "leisure"])) return "레저";
  if (has(low, ["휴양", "편의"])) return "휴양, 편의시설";

  // life
  if (has(low, ["엘리베이터", "elevator"])) return "엘리베이터 광고";
  if (has(low, ["병원", "hospital"])) return "병원";
  if (has(low, ["편의점", "convenience"])) return "편의점";
  if (has(low, ["운동", "헬스", "gym"])) return "운동시설";
  if (has(low, ["캠퍼스", "대학", "univ"])) return "캠퍼스";
  if (has(low, ["식당", "주점", "restaurant", "bar"])) return "식당, 주점";
  if (has(low, ["약국", "pharmacy"])) return "약국";
  if (has(low, ["헤어", "뷰티", "살롱", "salon"])) return "헤어&뷰티살롱";
  if (has(low, ["드럭", "drugstore"])) return "드럭스토어";

  // screen
  if (has(low, ["빌보드", "billboard"])) return "빌보드";
  if (has(low, ["외벽", "wall"])) return "외벽";
  if (has(low, ["전광판", "디지털", "LED", "스크린"])) return "전광판";
  // 4대 매체(ATL)
  if (has(low, ["tv", "티비", "방송"])) return "TV";
  if (has(low, ["라디오"])) return "라디오";
  if (has(low, ["매거진", "잡지"])) return "매거진";
  if (has(low, ["신문"])) return "신문";

  // default: keep as-is (but trimmed)
  return low;
}

function normalizeHigh(s){
  const text = String(s || "").toLowerCase();

  if (has(text, ["교통", "버스", "지하철", "택시", "ktx", "터미널", "공항"])) return "교통매체";
  if (has(text, ["쇼핑몰", "대형마트", "마트"])) return "복합 쇼핑몰/대형마트";
  if (has(text, ["극장", "레저", "휴양"])) return "극장/레저/휴양 시설";
  if (has(text, ["엘리베이터", "병원", "편의점", "약국", "캠퍼스", "살롱", "드럭", "식당", "주점"])) return "생활 밀착형 매체";
  if (has(text, ["tv", "티비", "방송", "라디오", "매거진", "잡지", "신문"])) return "4대 매체(ATL)";
  if (has(text, ["해외"])) return "해외 옥외 매체";
  if (has(text, ["기타"])) return "기타 매체";
  return "전광판/빌보드/외벽";
}

function mapOriginalHigh(it){
  const norm = (v) => String(v || "").toLowerCase();
  const mg = norm(it.media_group || it.category || it.group);
  const cl = norm(it.category_low);
  const ch = norm(it.category_high || it.categoryHigh);
  const title = norm(it.title);
  const any = mg + " " + ch + " " + cl + " " + title;
  return normalizeHigh(any);
}

// ---------- State ----------
let ALL = [];
let FILTERED = [];
let MAP = null;
let CLUSTER = null;
let markerIndex = new Map(); // key -> marker
let pinnedTopKey = null;

const RECENT_KEY = "frontier_recent_v1";
const CART_KEY   = "frontier_cart_v1";

// ---------- Load JSON ----------
async function loadJSON(url){
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}

function buildSearchString(it){
  const parts = [];
  const pick = (k) => (it[k] != null ? String(it[k]).trim() : "");
  ["title","address","sido","sigungu","dong","category_high","category_low","media_group","operator","note"].forEach(k=>{
    const v = pick(k);
    if (v) parts.push(v);
  });
  parts.push(it._high || "");
  parts.push(it._low || "");
  return parts.join(" ").toLowerCase();
}

function assignTaxonomy(it){
  const high = mapOriginalHigh(it);
  const low = normalizeLow(it.category_low || it.categoryLow || it.media_group || it.category || it.group || "");
  it._high = high;
  it._low = low;

  // for UI badges
  const a = [];
  if (it._high) a.push(it._high);
  if (it._low) a.push(it._low);
  it._badge = a.join(" / ");

  it._key = String(it.id || it.public_id || it.uid || it.key || it.title || "") + "|" + String(it.lat || "") + "," + String(it.lng || "");
  it._search = buildSearchString(it);
}

function money(v){
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  return fmt.format(Math.round(n)) + "원";
}

// ---------- Category UI (대분류 → 하위) ----------
function getHighNode(highKey){
  return CATEGORY_TREE.find(n => n.key === highKey) || null;
}

function setCatGroupOptions(){
  const sel = $("catGroup");
  if (!sel) return;
  sel.innerHTML = "";
  addOption(sel, "", "매체 카테고리(대분류)");
  CATEGORY_TREE.forEach(n => addOption(sel, n.key, n.label));
}

function setCatSubOptions(highKey){
  const sel = $("catSub");
  if (!sel) return;

  const node = getHighNode(highKey);
  const children = node && Array.isArray(node.children) ? node.children : [];

  sel.innerHTML = "";
  addOption(sel, "", "하위 카테고리(전체)");
  children.forEach(c => addOption(sel, c.key, c.label));

  const hasHigh = !!(highKey && highKey.trim());
  sel.disabled = !(hasHigh && children.length);
  if (sel.disabled) sel.value = "";
}

function inferHighFromLow(lowKey){
  if (!lowKey) return "";
  for (const n of CATEGORY_TREE){
    if ((n.children || []).some(c => c.key === lowKey)) return n.key;
  }
  return "";
}

function applyCategoryFromUrl(){
  const q = new URLSearchParams(location.search);
  let high = (q.get("catHigh") || q.get("high") || q.get("catGroup") || q.get("group") || "").trim();
  let low  = (q.get("catLow")  || q.get("low")  || q.get("catSub")   || q.get("sub")   || "").trim();

  // hash도 지원: #catHigh=...&catLow=...
  const h = (location.hash || "").trim();
  if ((!high && !low) && h && !h.startsWith("#item=") && h.includes("=")){
    const hp = new URLSearchParams(h.replace(/^#/, ""));
    high = (hp.get("catHigh") || hp.get("high") || hp.get("catGroup") || "").trim();
    low  = (hp.get("catLow")  || hp.get("low")  || hp.get("catSub")  || "").trim();
  }

  if (!high && low) high = inferHighFromLow(low);

  const $g = $("catGroup");
  const $s = $("catSub");
  if (!$g || !$s) return;

  if (high){
    $g.value = high;
    setCatSubOptions(high);
    if (low) $s.value = low;
  } else {
    $g.value = "";
    setCatSubOptions("");
  }
}

// ---------- Filtering ----------
function getFilteredBase(){
  const q = ($("q").value || "").trim();
  const high = (($("catGroup") && $("catGroup").value) || "").trim();
  const low  = (($("catSub") && $("catSub").value) || "").trim();

  let arr = ALL;

  if (high) arr = arr.filter(x => x._high === high);
  if (low)  arr = arr.filter(x => x._low === low);

  if (q){
    // AND 검색(공백 구분)
    const parts = q.split(/\s+/).filter(Boolean);
    arr = arr.filter(x => {
      const hay = (x._search || "").toLowerCase();
      return parts.every(p => hay.includes(p.toLowerCase()));
    });
  }
  return arr;
}

function inMapBounds(arr){
  if (!MAP) return arr;
  const b = MAP.getBounds();
  return arr.filter(x => Number.isFinite(+x.lat) && Number.isFinite(+x.lng) && b.contains([+x.lat, +x.lng]));
}

// ---------- List render ----------
function renderList(arr){
  const grid = $("grid");
  grid.innerHTML = "";

  const frag = document.createDocumentFragment();
  const take = arr.slice(0, 120); // virtualization: first 120 cards
  for (const it of take){
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.key = it._key;

    const thumb = document.createElement("div");
    thumb.className = "thumb";
    thumb.textContent = "NO IMAGE";

    const meta = document.createElement("div");
    meta.className = "meta";

    const tagRow = document.createElement("div");
    tagRow.className = "tagRow";

    const tag1 = document.createElement("span");
    tag1.className = "tag";
    tag1.textContent = it._high || "카테고리";
    tagRow.appendChild(tag1);

    if (it._low){
      const tag2 = document.createElement("span");
      tag2.className = "tag";
      tag2.textContent = it._low;
      tagRow.appendChild(tag2);
    }

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = it.title || "NO NAME";

    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = (it.address || [it.sido, it.sigungu, it.dong].filter(Boolean).join(" ")).trim();

    const price = document.createElement("div");
    price.className = "price";
    price.textContent = money(it.price || it.min_price || it.price_month) || "";

    meta.appendChild(tagRow);
    meta.appendChild(title);
    meta.appendChild(sub);
    if (price.textContent) meta.appendChild(price);

    card.appendChild(thumb);
    card.appendChild(meta);

    card.addEventListener("click", () => {
      openDetail(it);
      flashMarker(it._key);
      pinTop(it._key);
    });

    frag.appendChild(card);
  }

  grid.appendChild(frag);
}

// ---------- Map ----------
function initMap(){
  MAP = L.map("map", {
    zoomControl:false,
    preferCanvas:true,
    inertia:true,
  });

  const homeCenter = [36.35, 127.95];
  const homeZoom = 8;
  MAP.setView(homeCenter, homeZoom);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19,
  }).addTo(MAP);

  CLUSTER = L.markerClusterGroup({
    chunkedLoading:true,
    showCoverageOnHover:false,
    maxClusterRadius:48,
    spiderfyOnMaxZoom:true,
  });

  MAP.addLayer(CLUSTER);

  MAP.on("moveend", () => {
    updateCounts();
  });

  // Zoom panel
  const zNum = $("zNum");
  const syncZoomNum = () => { zNum.textContent = String(MAP.getZoom()); };
  syncZoomNum();
  MAP.on("zoomend", syncZoomNum);

  $("zIn").addEventListener("click", ()=> MAP.setZoom(MAP.getZoom()+1));
  $("zOut").addEventListener("click", ()=> MAP.setZoom(MAP.getZoom()-1));
}

function buildMarkers(arr){
  markerIndex.clear();
  CLUSTER.clearLayers();

  for (const it of arr){
    const lat = Number(it.lat), lng = Number(it.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const m = L.marker([lat, lng]);
    m.on("click", () => {
      openDetail(it);
      pinTop(it._key);
      flashMarker(it._key);
    });
    markerIndex.set(it._key, m);
    CLUSTER.addLayer(m);
  }
}

function flashMarker(key){
  const m = markerIndex.get(key);
  if (!m) return;
  try{
    const el = m.getElement();
    if (!el) return;
    el.style.filter = "drop-shadow(0 0 10px rgba(162,222,204,.9))";
    el.style.transform = "scale(1.08)";
    setTimeout(()=>{ el.style.filter=""; el.style.transform=""; }, 650);
  }catch(e){}
}

function pinTop(key){
  pinnedTopKey = key;
  const wrap = $("listWrap");
  const card = document.querySelector(`.card[data-key="${CSS.escape(key)}"]`);
  if (card && wrap){
    wrap.scrollTo({ top: 0, behavior: "smooth" });
  }
}

// ---------- Modal ----------
function openDetail(it){
  const modal = $("modal");
  const body = $("modalBody");
  const title = $("modalTitle");

  title.textContent = it.title || "상세";

  const kv = [];
  const push = (k, v) => {
    if (v == null || String(v).trim() === "") return;
    kv.push(`<div><b>${escapeHtml(k)}</b></div><div>${escapeHtml(v)}</div>`);
  };

  push("카테고리", it._badge);
  push("주소", it.address || "");
  push("시/도", it.sido || "");
  push("시/군/구", it.sigungu || "");
  push("가격", money(it.price || it.min_price || it.price_month));
  push("운영사", it.operator || "");
  push("상태", it.status || "");
  push("비고", it.note || "");

  body.innerHTML = `<div class="kv">${kv.join("")}</div>`;

  modal.classList.add("on");
  // item hash routing (기존 기능 유지)
  if (it.id) location.hash = `item=${encodeURIComponent(it.id)}`;
}

function closeModal(){
  $("modal").classList.remove("on");
  // close only if item hash
  if ((location.hash || "").startsWith("#item=")) history.replaceState(null,"", location.pathname + location.search);
}

// ---------- Cart/Recent (minimal placeholder) ----------
function loadArr(key){
  try{ return JSON.parse(localStorage.getItem(key) || "[]"); }catch(e){ return []; }
}
function saveArr(key, arr){
  try{ localStorage.setItem(key, JSON.stringify(arr)); }catch(e){}
}
function setCounts(){
  $("cartCnt").textContent = String(loadArr(CART_KEY).length || 0);
  $("recentCnt").textContent = `${Math.min(loadArr(RECENT_KEY).length,4)}/4`;
}

// ---------- UI ----------
function updateCounts(){
  $("cntAll").textContent = String(ALL.length);
  $("cntFiltered").textContent = String(FILTERED.length);
  $("cntList").textContent = String(FILTERED.length);
  $("loadedCnt").textContent = String(ALL.length);

  const inv = inMapBounds(FILTERED);
  $("cntInView").textContent = String(inv.length);
}

function applyFiltersAndRender(){
  FILTERED = getFilteredBase();
  renderList(FILTERED);
  buildMarkers(FILTERED);
  updateCounts();
  setCounts();
}

function resetAll(){
  $("q").value = "";
  $("catGroup").value = "";
  setCatSubOptions("");
  $("catSub").value = "";
  pinnedTopKey = null;
  applyFiltersAndRender();
}

// ---------- Init ----------
async function init(){
  // basic handlers
  $("btnSearch").addEventListener("click", () => applyFiltersAndRender());
  $("q").addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyFiltersAndRender();
  });
  $("resetBtn").addEventListener("click", resetAll);

  $("modalClose").addEventListener("click", closeModal);
  $("modal").addEventListener("click", (e)=> { if (e.target.id === "modal") closeModal(); });

  $("openCart").addEventListener("click", () => {
    alert("장바구니 UI는 다음 단계에서 연결합니다. (현재는 카운트만 유지)");
  });

  initMap();

  // load data
  const raw = await loadJSON(DATA_URL);
  const items = Array.isArray(raw.items) ? raw.items : (Array.isArray(raw) ? raw : []);
  ALL = items.map(x => ({ ...x }));

  for (const it of ALL) assignTaxonomy(it);

  // build category selects
  setCatGroupOptions();
  setCatSubOptions("");
  applyCategoryFromUrl();

  // category filter (대분류 → 하위)
  const $catGroup = $("catGroup");
  const $catSub = $("catSub");
  if ($catGroup){
    $catGroup.addEventListener("change", () => {
      pinnedTopKey = null;
      setCatSubOptions($catGroup.value);
      applyFiltersAndRender();
    });
  }
  if ($catSub){
    $catSub.addEventListener("change", () => {
      pinnedTopKey = null;
      applyFiltersAndRender();
    });
  }

  // initial render
  applyFiltersAndRender();

  // if opened with #item=... keep current behavior (optional)
  const h = (location.hash || "");
  if (h.startsWith("#item=")){
    // no auto-open to avoid surprises; user can click marker/card
  }
}

init().catch(err => {
  console.error(err);
  alert("초기화 실패: 콘솔(F12)에서 오류를 확인하세요.\n" + (err && err.message ? err.message : err));
});
