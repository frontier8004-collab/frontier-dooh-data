(() => {
  const badge = (msg) => {
    const el = document.getElementById("badge");
    if (el) el.textContent = msg;
  };

  // 반드시 vector_test.html에서 사용 중인 style.json?key=... 를 그대로 붙여넣으세요.
  const STYLE_URL = "PASTE_STYLE_URL_HERE";

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

    try {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    } catch (_) {}

    map.on("styledata", () => {
      badge("Style loaded. Loading tiles…");
    });

    map.on("idle", () => {
      badge("Idle OK (style + tiles loaded)");
    });

    map.on("error", (e) => {
      const msg = e && e.error && e.error.message ? e.error.message : "unknown";
      badge("MapLibre error: " + msg);
    });

    // 전역 노출(필요 시 확인용)
    window.ml_map = map;
  });
})();
