/* Frontier DOOH DB - app.js (v1.1.26 compatible)
   - Category dropdown: 대분류(catGroup) + 하위(catSub)
   - Deep-link filter: #catHigh=...&catLow=... (also supports catGroup/catSub)
*/
"use strict";

const DATA_URL = "./data_public.json";

// ===== Helpers =====
const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat("ko-KR");

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function addOption(sel, value, label) {
  if (!sel) return;
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = label;
  sel.appendChild(opt);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function loadJSON(url) {
  return fetch(url, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error(`Fetch failed ${r.status} ${r.statusText}`);
    return r.json();
  });
}

function parseHashParams() {
  const h = (location.hash || "").replace(/^#/, "");
  if (!h) return {};
  const p = new URLSearchParams(h);
  const obj = {};
  for (const [k, v] of p.entries()) obj[k] = v;
  return obj;
}

function setText(id, v) {
  const el = $(id);
  if (el) el.textContent = String(v);
}

// ===== Category Tree (홈페이지 구조) =====
// key/label은 대분류, children는 하위
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
      { key: "공항 / 기내, 항공기 광고", label: "공항 / 기내, 항공기 광고" },
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
    key: "극장 / 레저 / 휴양 시설",
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
  {
    key: "기타 매체",
    label: "기타 매체",
    children: [],
  },
  {
    key: "해외 옥외 매체",
    label: "해외 옥외 매체",
    children: [],
  },
];

// ===== Data + State =====
let ALL = [];
let map, cluster;
let markersById = new Map();
let current = []; // filtered items

function getHigh(it) {
  const v = (it.category_high ?? it.media_group ?? "").trim();
  return v;
}
function getLow(it) {
  const v = (it.category_low ?? it.media_sub ?? "").trim();
  return v;
}

function initCategorySelects() {
  const selGroup = $("catGroup") || $("catHigh"); // fallback
  const selSub = $("catSub") || $("catLow"); // fallback

  if (!selGroup) return;

  // group options
  selGroup.innerHTML = "";
  addOption(selGroup, "", "매체 카테고리(대분류)");
  CATEGORY_TREE.forEach((n) => addOption(selGroup, n.key, n.label || n.key));

  // sub options
  if (selSub) {
    selSub.innerHTML = "";
    addOption(selSub, "", "하위 카테고리(전체)");
    selSub.disabled = true;
  }

  selGroup.addEventListener("change", () => {
    const g = selGroup.value || "";
    if (selSub) {
      selSub.innerHTML = "";
      addOption(selSub, "", "하위 카테고리(전체)");
      const node = CATEGORY_TREE.find((x) => x.key === g);
      const kids = node?.children || [];
      kids.forEach((k) => addOption(selSub, k.key, k.label || k.key));
      selSub.disabled = !g || kids.length === 0;
      selSub.value = "";
    }
    applyFilters(true);
  });

  if (selSub) {
    selSub.addEventListener("change", () => applyFilters(true));
  }

  // deep-link apply (hash)
  const hp = parseHashParams();
  const dg = hp.catGroup || hp.catHigh || "";
  const ds = hp.catSub || hp.catLow || "";
  if (dg) {
    selGroup.value = dg;
    // trigger population
    selGroup.dispatchEvent(new Event("change"));
    if (selSub && ds) selSub.value = ds;
  }
}

function initMap() {
  map = L.map("map", {
    zoomControl: false,
    preferCanvas: true,
  });

  // Base tiles
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19,
  }).addTo(map);

  // cluster
  cluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 48,
  });
  map.addLayer(cluster);

  // initial view
  map.setView([36.4, 127.9], 8);

  // custom zoom UI
  const zIn = $("zIn");
  const zOut = $("zOut");
  const zVal = $("zVal");
  function syncZoom() {
    if (zVal) zVal.textContent = String(map.getZoom());
  }
  map.on("zoomend", syncZoom);
  syncZoom();
  if (zIn) zIn.addEventListener("click", () => map.zoomIn());
  if (zOut) zOut.addEventListener("click", () => map.zoomOut());
}

function clearMarkers() {
  markersById.clear();
  cluster.clearLayers();
}

function renderMarkers(items) {
  clearMarkers();
  for (const it of items) {
    const lat = Number(it.lat), lng = Number(it.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const m = L.marker([lat, lng]);
    m.on("click", () => {
      openDetail(it);
    });
    cluster.addLayer(m);
    markersById.set(it.id, m);
  }
}

function renderList(items) {
  const wrap = $("list");
  if (!wrap) return;

  wrap.innerHTML = items.map((it) => cardHTML(it)).join("");
  // card click bind (event delegation)
  wrap.querySelectorAll("[data-id]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-id");
      const found = items.find((x) => String(x.id) === String(id));
      if (!found) return;
      focusItem(found);
      openDetail(found);
    });
  });
}

function cardHTML(it) {
  const high = escapeHtml(getHigh(it));
  const low = escapeHtml(getLow(it));
  const title = escapeHtml(it.title || it.name || "(제목없음)");
  const addr = escapeHtml(it.address || "");
  const price = it.price ? `${fmt.format(Number(it.price))}원` : (it.inquiry ? "문의" : "");
  const tags = `
    <span class="tag">${high || "미분류"}</span>
    ${low ? `<span class="tag sub">${low}</span>` : ""}
  `;
  return `
    <div class="card" data-id="${escapeHtml(it.id)}">
      <div class="img">${it.thumb ? `<img src="${escapeHtml(it.thumb)}" alt="">` : `<div class="noimg">NO IMAGE</div>`}</div>
      <div class="body">
        <div class="tags">${tags}</div>
        <div class="title">${title}</div>
        <div class="addr">${addr}</div>
        <div class="price">${escapeHtml(price)}</div>
      </div>
    </div>
  `;
}

function focusItem(it) {
  const lat = Number(it.lat), lng = Number(it.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  map.setView([lat, lng], Math.max(map.getZoom(), 12), { animate: true });
  const m = markersById.get(it.id);
  if (m) m.openPopup?.();
}

// ===== Detail Modal =====
function openDetail(it) {
  const modal = $("detail");
  const inner = $("detailInner");
  if (!modal || !inner) return;

  const high = escapeHtml(getHigh(it));
  const low = escapeHtml(getLow(it));
  const title = escapeHtml(it.title || it.name || "(제목없음)");
  const addr = escapeHtml(it.address || "");
  const price = it.price ? `${fmt.format(Number(it.price))}원` : (it.inquiry ? "문의" : "");
  const op = escapeHtml(it.operator || "");
  inner.innerHTML = `
    <div class="dHead">
      <div class="dTags">
        <span class="tag">${high || "미분류"}</span>
        ${low ? `<span class="tag sub">${low}</span>` : ""}
      </div>
      <div class="dTitle">${title}</div>
      <div class="dAddr">${addr}</div>
    </div>
    <div class="dMeta">
      ${price ? `<div class="dRow"><b>가격</b><span>${escapeHtml(price)}</span></div>` : ""}
      ${op ? `<div class="dRow"><b>운영사</b><span>${op}</span></div>` : ""}
    </div>
  `;

  modal.classList.add("open");
}

function closeDetail() {
  const modal = $("detail");
  if (modal) modal.classList.remove("open");
}

// ===== Filtering =====
function getSelectedGroupSub() {
  const selGroup = $("catGroup") || $("catHigh");
  const selSub = $("catSub") || $("catLow");
  return {
    g: selGroup ? (selGroup.value || "") : "",
    s: selSub ? (selSub.value || "") : "",
  };
}

function applyFilters(resetPage) {
  const q = ($("q")?.value || "").trim().toLowerCase();
  const { g, s } = getSelectedGroupSub();

  let arr = ALL;

  if (g) {
    arr = arr.filter((it) => getHigh(it) === g);
  }
  if (s) {
    arr = arr.filter((it) => getLow(it) === s);
  }

  if (q) {
    arr = arr.filter((it) => {
      const hay = [
        it.title, it.name, it.address, it.operator,
        getHigh(it), getLow(it),
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  current = arr;

  // counts
  setText("countTotal", ALL.length);
  setText("countAll", ALL.length);
  setText("countFiltered", current.length);
  setText("loaded", current.length);

  renderList(current);
  renderMarkers(current);
}

// ===== Init =====
async function boot() {
  // close detail
  $("detailClose")?.addEventListener("click", closeDetail);
  $("detailBg")?.addEventListener("click", closeDetail);

  // search
  $("q")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyFilters(true);
  });
  $("qGo")?.addEventListener("click", () => applyFilters(true));

  // reset
  $("reset")?.addEventListener("click", () => {
    const selGroup = $("catGroup") || $("catHigh");
    const selSub = $("catSub") || $("catLow");
    if ($("q")) $("q").value = "";
    if (selGroup) selGroup.value = "";
    if (selSub) {
      selSub.value = "";
      selSub.disabled = true;
      selSub.innerHTML = "";
      addOption(selSub, "", "하위 카테고리(전체)");
    }
    applyFilters(true);
  });

  initCategorySelects();
  initMap();

  // data load
  const raw = await loadJSON(DATA_URL);
  const items = Array.isArray(raw) ? raw : (Array.isArray(raw.items) ? raw.items : []);
  ALL = items;

  applyFilters(true);
}

boot().catch((err) => {
  console.error("[BOOT ERROR]", err);
  alert("앱 초기화 중 에러가 발생했습니다. 콘솔(Console)을 열어 에러 메시지를 확인해 주세요.");
});
