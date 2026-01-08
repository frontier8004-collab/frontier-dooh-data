/* =========================================================
   Frontier DOOH 전국 DB (v1.1.28 기반 안정화)
   - index.html의 <script>...</script> 내용을 이 파일로 이동합니다.
   - index.html에는 <script src="./app.js" defer></script>만 남기는 구조.
   ========================================================= */

(() => {
  "use strict";

  // =========================
  // Version / Config
  // =========================
  const VERSION = "v1.1.28";
  const DATA_URL = "./data_public.json";

  // 데이터 URL 후보 (첫 번째 성공한 것을 사용)
  // - 기본: data_public.json
  // - 예비: data_v13_med_high.json / data.json
  const DATA_URL_CANDIDATES = [DATA_URL, "./data_v13_med_high.json", "./data.json"];
  let LAST_DATA_URL = DATA_URL;

  const HOME_CENTER = [36.4, 127.8];
  const HOME_ZOOM = 8;

  // 대한민국 좌표 대략 범위(너무 튀는 좌표 제거)
  const KOREA_BOUNDS = {
    minLat: 33.0,
    maxLat: 38.9,
    minLng: 124.5,
    maxLng: 132.0
  };

  // =========================
  // Helpers
  // =========================
  const $ = (id) => document.getElementById(id);

  function safeText(s) {
    return (s === null || s === undefined) ? "" : String(s);
  }

  function showErrorBanner(msg, detail){
    const b = $("errBanner");
    if (!b) return;

    const errMsgEl = $("errMsg");
    const errUrlEl = $("errUrl");
    if (errMsgEl) errMsgEl.textContent = msg || "알 수 없는 오류";
    if (errUrlEl)  errUrlEl.textContent  = (detail && detail.usedUrl) ? detail.usedUrl : (LAST_DATA_URL || DATA_URL);

    // 상세 영역(없으면 생성)
    let detailEl = $("errDetail");
    if (!detailEl){
      detailEl = document.createElement("pre");
      detailEl.id = "errDetail";
      detailEl.style.whiteSpace = "pre-wrap";
      detailEl.style.margin = "10px 0 0";
      detailEl.style.padding = "10px 12px";
      detailEl.style.border = "1px solid rgba(255,255,255,0.12)";
      detailEl.style.borderRadius = "10px";
      detailEl.style.background = "rgba(0,0,0,0.25)";
      detailEl.style.fontSize = "12px";
      detailEl.style.lineHeight = "1.5";
      b.appendChild(detailEl);
    }

    const tried = (detail && detail.triedUrls && detail.triedUrls.length) ? detail.triedUrls : [];
    const parts = [];

    if (tried.length){
      parts.push(`[시도한 경로]\n- ${tried.join("\n- ")}`);
    }

    const errObj = detail && detail.error;
    const rawMsg = (errObj && (errObj.message || String(errObj))) || "";
    if (rawMsg){
      parts.push(`\n[오류 메시지]\n${rawMsg}`);
    }

    // 환경 힌트
    const proto = location && location.protocol ? location.protocol : "";
    if (proto === "file:"){
      parts.push("\n[힌트]\n현재 file:// 로 열려 있습니다. GitHub Pages URL(https://...)로 접속해야 data_public.json을 정상 로드할 수 있습니다.");
    }else{
      parts.push("\n[힌트]\n1) Ctrl+F5 강력 새로고침\n2) GitHub > Actions > pages build and deployment 에서 초록 체크 확인\n3) 레포 루트에 data_public.json 파일 존재 확인(대소문자/경로 포함)\n4) 광고차단(AdBlock) 사용 중이면 일시 해제 후 재시도");
    }

    detailEl.textContent = parts.join("\n");

    // 재시도 버튼(없으면 생성)
    let retryBtn = $("errRetry");
    if (!retryBtn){
      retryBtn = document.createElement("button");
      retryBtn.id = "errRetry";
      retryBtn.type = "button";
      retryBtn.textContent = "다시 시도";
      retryBtn.style.marginTop = "10px";
      retryBtn.style.padding = "10px 12px";
      retryBtn.style.borderRadius = "10px";
      retryBtn.style.border = "1px solid rgba(255,255,255,0.18)";
      retryBtn.style.background = "rgba(255,255,255,0.06)";
      retryBtn.style.color = "inherit";
      retryBtn.style.cursor = "pointer";
      retryBtn.addEventListener("click", () => location.reload());
      b.appendChild(retryBtn);
    }

    b.style.display = "block";
  }

  function hideErrorBanner(){
    const b = $("errBanner");
    if (!b) return;
    b.style.display = "none";
  }

  async function fetchJsonRobust(url){
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok){
      throw new Error(`데이터 로드 실패: HTTP ${res.status} ${res.statusText} (URL: ${url})`);
    }
    const text = await res.text();
    try{
      return JSON.parse(text);
    }catch(_e){
      const head = text.slice(0, 200);
      throw new Error(`JSON 파싱 실패 (응답 시작: ${head})`);
    }
  }

  async function fetchJsonWithFallback(urls){
    const triedUrls = [];
    let lastErr = null;

    const uniq = [];
    (urls || []).forEach(u => {
      const x = String(u || "").trim();
      if (!x) return;
      if (uniq.indexOf(x) === -1) uniq.push(x);
    });

    for (const u of uniq){
      triedUrls.push(u);
      try{
        const json = await fetchJsonRobust(u);
        return { json, usedUrl: u, triedUrls };
      }catch(e){
        lastErr = e;
      }
    }

    const err = lastErr || new Error("데이터 로드 실패");
    err._triedUrls = triedUrls;
    throw err;
  }

  // =========================
  // Main (기존 로직 유지 + 2순위 강화)
  // =========================
  async function init(){
    try{
      // 버전 표기(있으면)
      const verEls = document.querySelectorAll(".ver");
      verEls.forEach(el => el.textContent = VERSION);

      // 에러 배너 닫기
      const closeBtn = $("errClose");
      if (closeBtn){
        closeBtn.addEventListener("click", () => hideErrorBanner());
      }

      // 데이터 로드
      let raw = [];
      try{
        const pack = await fetchJsonWithFallback(DATA_URL_CANDIDATES);
        const json = pack.json;
        LAST_DATA_URL = pack.usedUrl || DATA_URL;

        raw = Array.isArray(json) ? json
            : (Array.isArray(json.items)   ? json.items
            :  Array.isArray(json.data)    ? json.data
            :  Array.isArray(json.rows)    ? json.rows
            :  Array.isArray(json.points)  ? json.points
            :  Array.isArray(json.records) ? json.records
            :  []);
        hideErrorBanner();
      }catch(err){
        console.error("[DATA LOAD FAIL]", err);
        const triedUrls = (err && err._triedUrls && err._triedUrls.length) ? err._triedUrls : DATA_URL_CANDIDATES.slice();
        showErrorBanner(err?.message || "data 로드 실패", { triedUrls, usedUrl: triedUrls[triedUrls.length-1] || DATA_URL, error: err });
        raw = [];
      }

      const pts = (raw || [])
        .map(x => {
          const la = (typeof x.lat === "number") ? x.lat : parseFloat(String(x.lat ?? "").trim());
          const lo = (typeof x.lng === "number") ? x.lng : parseFloat(String(x.lng ?? "").trim());
          if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
          if (la < KOREA_BOUNDS.minLat || la > KOREA_BOUNDS.maxLat || lo < KOREA_BOUNDS.minLng || lo > KOREA_BOUNDS.maxLng) return null;
          return { ...x, lat: la, lng: lo };
        })
        .filter(Boolean);

      // 데이터 품질 통계(디버깅용): raw -> 유효좌표 pts
      try{
        const rawCount = Array.isArray(raw) ? raw.length : 0;
        const validCount = Array.isArray(pts) ? pts.length : 0;
        const dropped = Math.max(0, rawCount - validCount);
        window.__DATA_STATS = { rawCount, validCount, dropped, usedUrl: LAST_DATA_URL };
        if (dropped > 0){
          console.warn(`[DATA] 좌표/형식 문제로 제외된 항목: ${dropped} / ${rawCount}`, window.__DATA_STATS);
        }
      }catch(_e){}

      // ======================================================
      // 아래부터는 기존 v1.1.27 로직(지도/클러스터/리스트/검색/장바구니/최근본) 그대로 유지되어야 합니다.
      // 현재 레포의 app.js 구조가 길기 때문에, 여기서 전부 재작성하지 않고,
      // 실제 적용은 “당신 레포의 app.js 전체”에 위 변경이 포함된 상태여야 합니다.
      // ======================================================

      // (중요) 이 답변은 "데이터 로드/오류 방지" 부분만 강화한 패치입니다.
      // 만약 기존 로직이 여기 아래에 이미 존재하는 app.js라면,
      // 위에서 만든 init() 앞부분만 교체되어야 합니다.

    }catch(e){
      console.error("[INIT FAIL]", e);
      showErrorBanner(e?.message || "초기화 실패", { triedUrls: DATA_URL_CANDIDATES.slice(), usedUrl: LAST_DATA_URL, error: e });
    }
  }

  // DOM Ready
  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  }else{
    init();
  }

})();
