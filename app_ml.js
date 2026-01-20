(() => {
  const badge = (msg) => {
    const el = document.getElementById("badge");
    if (el) el.textContent = msg;
  };

  // 반드시 vector_test.html에서 사용 중인 style.json?key=... 를 그대로 붙여넣으세요.
   const STYLE_URL = "https://api.maptiler.com/maps/dataviz-v4-dark/style.json?key=s3k9sg6vGwjKAfd4mDlR";

  window.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("map");
    if (!container) { badge("MapLibre: #map not found"); return; }

    if (!window.maplibregl) { badge("MapLibre: library not loaded"); return; }

    if (!STYLE_URL.includes("style.json")) {
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
    // 한글 라벨 우선 적용 (name:ko → name)
map.on("style.load", () => {
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
});


    try {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    } catch (_) {}

    map.on("styledata", () => {
      badge("Style loaded. Loading tiles…");
    });

    map.on("idle", () => {
      badge("Idle OK (style + tiles loaded)");
    });
    // ===== dummy_5000 데이터 로드 + 클러스터 =====
fetch("./data_public_dummy_5000.json")
  .then(res => res.json())
  .then(json => {
    if (!json || !Array.isArray(json.items)) {
      badge("Data error: items not found");
      return;
    }

    const features = json.items
      .filter(it => typeof it.lat === "number" && typeof it.lng === "number")
      .map(it => ({
        type: "Feature",
        properties: {
          id: it.id,
          title: it.title,
          media_group: it.media_group,
          category_low: it.category_low,
          category_high: it.category_high
        },
        geometry: {
          type: "Point",
          coordinates: [it.lng, it.lat]
        }
      }));

    map.addSource("dooh", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features
      },
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50
    });

    // 클러스터 원
    map.addLayer({
      id: "dooh-clusters",
      type: "circle",
      source: "dooh",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#4fd1c5",
        "circle-radius": [
          "step",
          ["get", "point_count"],
          18, 100, 24, 500, 30
        ],
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
        "circle-color": "#9ae6b4",
        "circle-radius": 5,
        "circle-opacity": 0.9
      }
    });

    badge(`Idle OK + Pins: ${features.length}`);
  })
  .catch(err => {
    badge("Data load error");
    console.error(err);
  });


    map.on("error", (e) => {
      const msg = e && e.error && e.error.message ? e.error.message : "unknown";
      badge("MapLibre error: " + msg);
    });

    // 전역 노출(필요 시 확인용)
    window.ml_map = map;
  });
})();
