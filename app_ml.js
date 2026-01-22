(() => {
  // 실행 체크(콘솔 없이도 확인용)
  window.__APP_ML_STARTED__ = "app_ml.js: started";

  function badge(msg) {
    const el = document.getElementById("badge");
    if (el) el.textContent = msg;
  }

  // vector_test.html에서 쓰는 style.json?key=... 그대로
  const STYLE_URL = "https://api.maptiler.com/maps/dataviz-v4-dark/style.json?key=WotAoBRFnYvSNdp5ox05";

  function applyKoreanLabels(map) {
    try {
      const style = map.getStyle();
      if (!style || !style.layers) return;

      style.layers.forEach((layer) => {
        if (layer.type !== "symbol") return;
        if (!layer.layout || !layer.layout["text-field"]) return;

        map.setLayoutProperty(layer.id, "text-field", [
          "coalesce",
          ["get", "name:ko"],
          ["get", "name"]
        ]);
      });
    } catch (_) {}
  }

  function addDoohLayers(map, featureCount) {
    // 이미 레이어가 있으면 건너뜀(새로고침/중복 안전)
    if (map.getLayer("dooh-clusters")) {
      badge("Idle OK + Pins: " + featureCount);
      return;
    }

    // 클러스터 원
    map.addLayer({
      id: "dooh-clusters",
      type: "circle",
      source: "dooh",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#4fd1c5",
        "circle-radius": ["step", ["get", "point_count"], 18, 100, 24, 500, 30],
        "circle-opacity": 0.85
      }
    });

    // 클러스터 숫자
    map.addLayer({
      id: "dooh-cluster-count",
      type: "symbol",
      source: "dooh",
      filter: ["has", "point_count"],
      layout: {
        "text-field": "{point_count_abbreviated}",
        "text-font": ["Noto Sans Regular"],
        "text-size": 12
      },
      paint: {
        "text-color": "#0b0c0d"
      }
    });

    // 개별 핀
    map.addLayer({
      id: "dooh-point",
      type: "circle",
      source: "dooh",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": ["match", ["get", "category_high"], "지하철", "#60a5fa", "버스", "#f59e0b", "대형마트", "#34d399", "편의점", "#a78bfa", "교통매체", "#fb7185", "기타", "#9ae6b4", "#9ae6b4"],
        "circle-radius": 5,
        "circle-opacity": 0.9
      }
    });
// 개별 핀 클릭 시 정보 표시(팝업)
let doohPopup = null;

map.on("click", "dooh-point", (e) => {
  try {
    const f = e.features && e.features[0];
    if (!f) return;

    const p = f.properties || {};
    const title = p.title || "";
    const media = p.media_group || "";
    const high = p.category_high || "";
    const low  = p.category_low || "";
    const id   = p.id || "";

    const html =
      `<div style="min-width:220px;max-width:320px;font:12px/1.4 system-ui;color:#d8dee6;">` +
      `<div style="font-weight:700;font-size:13px;margin-bottom:6px;color:#a2decc;">${escapeHtml(title)}</div>` +
      `<div style="opacity:.9;margin-bottom:4px;">${escapeHtml(high)} ${low ? " / " + escapeHtml(low) : ""}</div>` +
      `<div style="opacity:.9;margin-bottom:6px;">${escapeHtml(media)}</div>` +
      `<div style="opacity:.65;">${escapeHtml(id)}</div>` +
      `</div>`;

    const coord = f.geometry && f.geometry.coordinates ? f.geometry.coordinates.slice() : null;
    if (!coord) return;

    if (doohPopup) doohPopup.remove();
    doohPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 10, className: "frontier-popup" })
      .setLngLat(coord)
      .setHTML(html)
      .addTo(map);
  } catch (_) {}
});

// 마우스가 핀 위에 올라가면 커서 변경
map.on("mouseenter", "dooh-point", () => { map.getCanvas().style.cursor = "pointer"; });
map.on("mouseleave", "dooh-point", () => { map.getCanvas().style.cursor = ""; });

// 간단한 HTML 이스케이프(깨짐/보안 방지)
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

    // 클릭 시 클러스터 확대(편의)
    map.on("click", "dooh-clusters", (e) => {
      try {
        const f = e.features && e.features[0];
        if (!f) return;
        const clusterId = f.properties.cluster_id;
        const source = map.getSource("dooh");
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          map.easeTo({ center: f.geometry.coordinates, zoom: zoom });
        });
      } catch (_) {}
    });

    badge("Idle OK + Pins: " + featureCount);
  }

  function loadDummyAndCluster(map) {
    badge("Data: loading…");

    fetch("./data_public.json")
      .then((res) => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then((json) => {
        if (!json || !Array.isArray(json.items)) {
          badge("Data error: items not found");
          return;
        }

        const features = json.items
          .filter((it) => typeof it.lat === "number" && typeof it.lng === "number")
          .map((it) => ({
            type: "Feature",
            properties: {
              id: it.id || "",
              title: it.title || "",
              category_high: it.category_high || "",
              category_low: it.category_low || "",
              media_group: it.media_group || ""
            },
            geometry: { type: "Point", coordinates: [it.lng, it.lat] }
          }));

        const fc = { type: "FeatureCollection", features: features };

        // 소스가 이미 있으면 데이터만 교체
        if (map.getSource("dooh")) {
          map.getSource("dooh").setData(fc);
          addDoohLayers(map, features.length);
          return;
        }

        map.addSource("dooh", {
          type: "geojson",
          data: fc,
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50
        });

        addDoohLayers(map, features.length);
      })
      .catch((err) => {
        badge("Data load error: " + (err && err.message ? err.message : "unknown"));
      });
  }

  function init() {
    const container = document.getElementById("map");
    if (!container) {
      badge("MapLibre: #map not found");
      return;
    }
    if (!window.maplibregl) {
      badge("MapLibre: library not loaded");
      return;
    }
    if (!STYLE_URL || STYLE_URL.indexOf("style.json") === -1) {
      badge("MapLibre: STYLE_URL not set");
      return;
    }

    badge("MapLibre: creating map…");

    const map = new maplibregl.Map({
      container: "map",
      style: STYLE_URL,
      center: [127.0, 37.5],
      zoom: 7,
      minZoom: 2,
      maxZoom: 19,
      pitchWithRotate: false,
      dragRotate: false
    });

    try {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    } catch (_) {}

    map.on("styledata", () => {
      badge("Style loaded. Loading tiles…");
    });

    map.on("load", () => {
      // 한글 라벨 우선
      applyKoreanLabels(map);
      // 데이터+클러스터
      loadDummyAndCluster(map);
    });

    map.on("idle", () => {
      // idle은 자주 오므로, 여기서는 상태만 유지
      // (배지는 loadDummyAndCluster / addDoohLayers에서 최종 갱신)
    });

    map.on("error", (e) => {
      const msg = e && e.error && e.error.message ? e.error.message : "unknown";
      badge("MapLibre error: " + msg);
    });

    window.ml_map = map;
  }

  // DOM 이미 로드됐으면 즉시, 아니면 로드 후 실행
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
