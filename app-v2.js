/* FRONTIER_PHASE4_2_ADAPTER_START */
(function () {
  "use strict";

  /* FRONTIER_PHASE5_OPERATOR_SWITCH_START */
(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  var value = (params.get("adapter") || "").toLowerCase().trim();

  if (value === "off" || value === "legacy" || value === "false" || value === "0") {
    localStorage.setItem("FRONTIER_USE_ADAPTER", "false");
  }

  if (value === "on" || value === "core" || value === "true" || value === "1") {
    localStorage.setItem("FRONTIER_USE_ADAPTER", "true");
  }

  if (value === "reset" || value === "clear") {
    localStorage.removeItem("FRONTIER_USE_ADAPTER");
  }

  var stored = localStorage.getItem("FRONTIER_USE_ADAPTER");

  window.FRONTIER_USE_ADAPTER = stored === "false" ? false : true;

  window.FRONTIER_OPERATOR_SWITCH = {
    adapter: window.FRONTIER_USE_ADAPTER ? "on" : "off",
    urlValue: value || null,
    storedValue: stored,
    usage: {
      off: "?adapter=off",
      on: "?adapter=on",
      reset: "?adapter=reset"
    }
  };
})();
/* FRONTIER_PHASE5_OPERATOR_SWITCH_END */

/* FRONTIER_PHASE5_2_1_UI_DISPATCH_THROTTLE_START */
(function () {
  "use strict";

  window.FRONTIER_UI_THROTTLE_ENABLED = true;
  window.FRONTIER_UI_DISPATCH_DEBOUNCE_MS = Number(window.FRONTIER_UI_DISPATCH_DEBOUNCE_MS || 90);
  window.FRONTIER_PATCH_DEBOUNCE_MS = Number(window.FRONTIER_PATCH_DEBOUNCE_MS || 120);
  window.FRONTIER_PATCH_MIN_INTERVAL_MS = Number(window.FRONTIER_PATCH_MIN_INTERVAL_MS || 320);

  function now() {
    return window.performance && typeof window.performance.now === "function"
      ? window.performance.now()
      : Date.now();
  }

  function installPhase521Throttle() {
    if (!window.FrontierCoreAdapter || !window.frontierCore || !window.FrontierCoreAdapter.prototype) {
      setTimeout(installPhase521Throttle, 120);
      return;
    }

    var proto = window.FrontierCoreAdapter.prototype;

    if (proto.__frontierPhase521ThrottleInstalled === true) {
      return;
    }

    if (typeof proto.patchCanonicalDataset !== "function" || typeof proto.dispatchResult !== "function") {
      setTimeout(installPhase521Throttle, 120);
      return;
    }

    proto.__frontierPhase521ThrottleInstalled = true;

    var originalPatchCanonicalDataset = proto.__phase521OriginalPatchCanonicalDataset || proto.patchCanonicalDataset;
    var originalDispatchResult = proto.__phase521OriginalDispatchResult || proto.dispatchResult;

    proto.__phase521OriginalPatchCanonicalDataset = originalPatchCanonicalDataset;
    proto.__phase521OriginalDispatchResult = originalDispatchResult;

    var state = {
      patchCount: 0,
      skippedPatchCalls: 0,
      dispatchCount: 0,
      skippedDispatchCalls: 0,
      lastPatchAt: 0,
      lastPatchMs: 0,
      lastDispatchMs: 0,
      lastPatchResult: null,
      pendingPatchTimer: null,
      pendingPatchRaf: null,
      pendingPatchAdapter: null,
      pendingPatchRoot: null,
      pendingPatchOptions: null,
      pendingDispatchTimer: null,
      pendingDispatchRaf: null,
      pendingDispatchAdapter: null,
      pendingDispatchResult: null
    };

    function publishTelemetry() {
      window.__FRONTIER_PHASE521_THROTTLE__ = {
        enabled: !!window.FRONTIER_UI_THROTTLE_ENABLED,
        patchCount: state.patchCount,
        skippedPatchCalls: state.skippedPatchCalls,
        dispatchCount: state.dispatchCount,
        skippedDispatchCalls: state.skippedDispatchCalls,
        lastPatchMs: Number(state.lastPatchMs.toFixed(2)),
        lastDispatchMs: Number(state.lastDispatchMs.toFixed(2)),
        pendingPatch: !!(state.pendingPatchTimer || state.pendingPatchRaf),
        pendingDispatch: !!(state.pendingDispatchTimer || state.pendingDispatchRaf || state.pendingDispatchResult),
        dispatchDebounceMs: window.FRONTIER_UI_DISPATCH_DEBOUNCE_MS,
        patchDebounceMs: window.FRONTIER_PATCH_DEBOUNCE_MS,
        patchMinIntervalMs: window.FRONTIER_PATCH_MIN_INTERVAL_MS,
        timestamp: new Date().toISOString()
      };

      return window.__FRONTIER_PHASE521_THROTTLE__;
    }

    function runFullPatch(adapter, root, options, reason) {
      if (!adapter || typeof originalPatchCanonicalDataset !== "function") {
        return state.lastPatchResult || { patched: 0, candidates: 0, mode: "adapter_not_ready" };
      }

      var start = now();
      var result = originalPatchCanonicalDataset.call(
        adapter,
        root || document,
        Object.assign({}, options || {}, { reason: reason || "phase5-2-1-full-patch" })
      );

      state.lastPatchAt = now();
      state.lastPatchMs = state.lastPatchAt - start;
      state.patchCount += 1;
      state.lastPatchResult = result;

      publishTelemetry();

      return result;
    }

    function schedulePatch(adapter, root, options, reason) {
      state.pendingPatchAdapter = adapter || window.frontierCore;
      state.pendingPatchRoot = root || document;
      state.pendingPatchOptions = Object.assign({}, options || {}, { reason: reason || "phase5-2-1-debounced-patch" });

      if (state.pendingPatchTimer) {
        clearTimeout(state.pendingPatchTimer);
      }

      state.pendingPatchTimer = setTimeout(function () {
        state.pendingPatchTimer = null;

        var execute = function () {
          state.pendingPatchRaf = null;
          runFullPatch(
            state.pendingPatchAdapter || window.frontierCore,
            state.pendingPatchRoot || document,
            state.pendingPatchOptions || {},
            state.pendingPatchOptions && state.pendingPatchOptions.reason
          );
        };

        if (typeof requestAnimationFrame === "function") {
          if (state.pendingPatchRaf) {
            cancelAnimationFrame(state.pendingPatchRaf);
          }
          state.pendingPatchRaf = requestAnimationFrame(execute);
        } else {
          execute();
        }
      }, window.FRONTIER_PATCH_DEBOUNCE_MS);

      publishTelemetry();
    }

    proto.patchCanonicalDataset = function (root, options) {
      var opts = options || {};

      if (!window.FRONTIER_USE_ADAPTER || !window.FRONTIER_UI_THROTTLE_ENABLED) {
        return originalPatchCanonicalDataset.call(this, root || document, opts);
      }

      var force =
        opts.force === true ||
        opts.immediate === true ||
        opts.reason === "manual" ||
        opts.reason === "phase5-2-1-force";

      var elapsed = now() - state.lastPatchAt;

      if (force || !state.lastPatchResult || elapsed >= window.FRONTIER_PATCH_MIN_INTERVAL_MS) {
        return runFullPatch(this, root || document, opts, opts.reason || "phase5-2-1-direct");
      }

      state.skippedPatchCalls += 1;
      schedulePatch(this, root || document, opts, opts.reason || "phase5-2-1-throttled");

      return Object.assign({}, state.lastPatchResult || {}, {
        throttled: true,
        scheduled: true,
        skippedPatchCalls: state.skippedPatchCalls
      });
    };

    function flushDispatch() {
      var adapter = state.pendingDispatchAdapter || window.frontierCore;
      var result = state.pendingDispatchResult;

      state.pendingDispatchTimer = null;
      state.pendingDispatchRaf = null;
      state.pendingDispatchAdapter = null;
      state.pendingDispatchResult = null;

      if (!adapter || !result) {
        publishTelemetry();
        return null;
      }

      var start = now();
      var out = originalDispatchResult.call(adapter, result);
      state.lastDispatchMs = now() - start;
      state.dispatchCount += 1;

      schedulePatch(adapter, document, { reason: "phase5-2-1-after-dispatch" }, "phase5-2-1-after-dispatch");
      publishTelemetry();

      return out;
    }

    function scheduleDispatch(adapter, result) {
      state.pendingDispatchAdapter = adapter || window.frontierCore;
      state.pendingDispatchResult = result;

      if (state.pendingDispatchTimer) {
        clearTimeout(state.pendingDispatchTimer);
      }

      state.pendingDispatchTimer = setTimeout(function () {
        state.pendingDispatchTimer = null;

        var execute = function () {
          state.pendingDispatchRaf = null;
          flushDispatch();
        };

        if (typeof requestAnimationFrame === "function") {
          if (state.pendingDispatchRaf) {
            cancelAnimationFrame(state.pendingDispatchRaf);
          }
          state.pendingDispatchRaf = requestAnimationFrame(execute);
        } else {
          execute();
        }
      }, window.FRONTIER_UI_DISPATCH_DEBOUNCE_MS);

      publishTelemetry();

      return result;
    }

    proto.dispatchResult = function (result, options) {
      var opts = options || {};

      if (!window.FRONTIER_USE_ADAPTER || !window.FRONTIER_UI_THROTTLE_ENABLED) {
        return originalDispatchResult.call(this, result);
      }

      if (opts.force === true || opts.immediate === true) {
        var start = now();
        var out = originalDispatchResult.call(this, result);
        state.lastDispatchMs = now() - start;
        state.dispatchCount += 1;
        publishTelemetry();
        return out;
      }

      state.skippedDispatchCalls += 1;
      return scheduleDispatch(this, result);
    };

    try {
      if (
        window.__FRONTIER_PHASE421_MUTATION_OBSERVER__ &&
        typeof window.__FRONTIER_PHASE421_MUTATION_OBSERVER__.disconnect === "function"
      ) {
        window.__FRONTIER_PHASE421_MUTATION_OBSERVER__.disconnect();
      }
    } catch (_) {}

    if ("MutationObserver" in window && document.body) {
      var throttledObserver = new MutationObserver(function (mutations) {
        if (!window.FRONTIER_USE_ADAPTER || !window.FRONTIER_UI_THROTTLE_ENABLED) return;

        var hasAddedNodes = mutations.some(function (m) {
          return m.addedNodes && m.addedNodes.length;
        });

        if (hasAddedNodes) {
          state.skippedPatchCalls += 1;
          schedulePatch(window.frontierCore, document, { reason: "phase5-2-1-mutation" }, "phase5-2-1-mutation");
        }
      });

      throttledObserver.observe(document.body, {
        childList: true,
        subtree: true
      });

      window.__FRONTIER_PHASE521_MUTATION_OBSERVER__ = throttledObserver;
    }

    window.FRONTIER_FLUSH_UI_THROTTLE = function () {
      flushDispatch();
      if (window.frontierCore) {
        runFullPatch(window.frontierCore, document, { reason: "manual", force: true }, "manual");
      }
      return publishTelemetry();
    };

    publishTelemetry();

    console.info("📢 [PHASE 5.2.1] UI dispatch throttle installed", window.__FRONTIER_PHASE521_THROTTLE__);
  }

  installPhase521Throttle();
})();
/* FRONTIER_PHASE5_2_1_UI_DISPATCH_THROTTLE_END */



  class FrontierCoreAdapter {
    constructor(options = {}) {
      this.version = "frontier-core-adapter-v1";
      this.paths = {
        searchIndex: "phase3-search-core/output/frontier-search-index.json",
        searchHierarchy: "phase3-search-core/output/frontier-search-hierarchy.json",
        contract: "phase3-search-core/output/frontier-card-engine-contract.json",
        ...(options.paths || {})
      };
      this.expectedCount = Number(options.expectedCount || 21894);
      this.autoBind = options.autoBind !== false;
      this.hooks = options.hooks || {};
      this.levels = ["region_group", "area_group", "sido", "sigungu", "eupmyeondong"];
      this.strictAliases = {
        CU: ["cu", "씨유", "cu ds", "cuds"],
        GS: ["gs", "gs25", "gstv", "지에스"],
        세븐: ["세븐", "세븐일레븐", "7eleven", "seven eleven", "seveneleven"],
        약국: ["약국", "pharmacy"],
        병원: ["병원", "의원", "의료", "메디컬", "클리닉", "치과", "이비인후과", "피부과", "내과", "산부인과"],
        강남: ["강남", "강남구", "강남대로"],
        역삼: ["역삼", "역삼동"]
      };
      this.state = {
        ready: false,
        fallbackMode: false,
        loading: false,
        error: null,
        searchIndex: null,
        hierarchy: null,
        contract: null,
        items: [],
        itemsById: {},
        tokenIndex: {},
        nodes: {},
        nodeIdsByItemId: {},
        lastResult: null
      };
    }

    async init() {
      if (this.state.ready || this.state.loading) return this;
      this.state.loading = true;

      try {
        const [searchIndex, hierarchy, contract] = await Promise.all([
          this.loadJson(this.paths.searchIndex),
          this.loadJson(this.paths.searchHierarchy),
          this.loadJson(this.paths.contract)
        ]);

        this.state.searchIndex = searchIndex;
        this.state.hierarchy = hierarchy;
        this.state.contract = contract;
        this.state.items = Array.isArray(searchIndex.items) ? searchIndex.items : [];
        this.state.itemsById = searchIndex.items_by_id || {};
        this.state.tokenIndex = searchIndex.token_index || {};
        this.state.nodes = hierarchy.nodes || {};
        this.state.nodeIdsByItemId = hierarchy.node_ids_by_item_id || {};

        this.assertCoreInvariants();

        this.state.ready = true;
        this.state.fallbackMode = false;
        this.state.loading = false;

        this.emit("frontier:core:ready", this.getStatus());
        if (this.autoBind) this.bindDefaultDom();

        return this;
      } catch (error) {
        this.critical(error);
        this.state.ready = false;
        this.state.fallbackMode = true;
        this.state.loading = false;
        this.state.error = error;
        this.emit("frontier:core:error", { error, status: this.getStatus() });
        return this;
      }
    }
    /* FRONTIER_PHASE6_2_GUEST_LOADER_SWITCH_START */
    /* FRONTIER_PHASE6_3_4_RUNTIME_SYNC_PATCH */
    getDataTier() {
      return "guest";
    }

    getGuestDataPaths() {
      return {
        index: "phase6-security-core/output/frontier-search-index.guest.json",
        hierarchy: "phase6-security-core/output/frontier-search-hierarchy.guest.json",
        contract: "phase6-security-core/output/frontier-card-engine-contract.guest.json"
      };
    }

    resolveDataUrl(url) {
      const raw = String(url || "").replace(/\\/g, "/");
      const paths = this.getGuestDataPaths();

      if (this.getDataTier() === "guest") {
        if (/frontier-search-index\.parts\//.test(raw)) {
          throw new Error("FRONTIER SECURITY BLOCK: Guest mode cannot load split index parts.");
        }

        if (/frontier-search-index\.json(?:\?.*)?$/.test(raw)) {
          return paths.index;
        }

        if (/frontier-search-hierarchy\.json(?:\?.*)?$/.test(raw)) {
          return paths.hierarchy;
        }

        if (/frontier-card-engine-contract\.json(?:\?.*)?$/.test(raw)) {
          return paths.contract;
        }
      }

      return url;
    }

    async fetchJsonDirect(url) {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`FrontierCoreAdapter JSON load failed: ${res.status} ${url}`);
      }
      return await res.json();
    }

    async ensureGuestIndexLoaded() {
      if (this.__phase634GuestIndex && Array.isArray(this.__phase634GuestIndex.items)) {
        return this.__phase634GuestIndex;
      }

      const paths = this.getGuestDataPaths();
      const index = await this.fetchJsonDirect(paths.index);
      const normalized = this.normalizeGuestIndex(index);

      this.__phase634GuestIndex = normalized;

      window.__FRONTIER_PHASE62_GUEST_LOADER__ = window.__FRONTIER_PHASE62_GUEST_LOADER__ || {
        enabled: true,
        tier: "guest",
        indexLoaded: false,
        hierarchyLoaded: false,
        contractLoaded: false,
        splitBlocked: true,
        loadedUrls: [],
        loadedAt: new Date().toISOString()
      };

      window.__FRONTIER_PHASE62_GUEST_LOADER__.indexLoaded = true;
      window.__FRONTIER_PHASE62_GUEST_LOADER__.items = normalized.items.length;
      window.__FRONTIER_PHASE62_GUEST_LOADER__.itemsById = Object.keys(normalized.items_by_id || {}).length;

      return normalized;
    }

    async loadJson(url) {
      const requestedUrl = String(url || "");
      const resolvedUrl = this.resolveDataUrl(requestedUrl);
      const paths = this.getGuestDataPaths();

      window.__FRONTIER_PHASE62_GUEST_LOADER__ = window.__FRONTIER_PHASE62_GUEST_LOADER__ || {
        enabled: true,
        tier: "guest",
        indexLoaded: false,
        hierarchyLoaded: false,
        contractLoaded: false,
        splitBlocked: true,
        loadedUrls: [],
        loadedAt: new Date().toISOString()
      };

      window.__FRONTIER_PHASE62_GUEST_LOADER__.loadedUrls.push(resolvedUrl);

      if (this.getDataTier() === "guest") {
        if (/frontier-search-index\.parts\//.test(resolvedUrl)) {
          throw new Error("FRONTIER SECURITY BLOCK: Guest mode cannot load split index parts.");
        }

        if (resolvedUrl === paths.index || /frontier-search-index\.guest\.json(?:\?.*)?$/.test(resolvedUrl)) {
          const json = await this.fetchJsonDirect(paths.index);

          if (json && json.__frontier_split_index === true) {
            throw new Error("FRONTIER SECURITY BLOCK: split index manifest is forbidden in Guest mode.");
          }

          const normalized = this.normalizeGuestIndex(json);
          this.__phase634GuestIndex = normalized;

          window.__FRONTIER_PHASE62_GUEST_LOADER__.indexLoaded = true;
          window.__FRONTIER_PHASE62_GUEST_LOADER__.items = normalized.items.length;
          window.__FRONTIER_PHASE62_GUEST_LOADER__.itemsById = Object.keys(normalized.items_by_id || {}).length;

          return normalized;
        }

        if (resolvedUrl === paths.hierarchy || /frontier-search-hierarchy\.guest\.json(?:\?.*)?$/.test(resolvedUrl)) {
          const guestIndex = await this.ensureGuestIndexLoaded();

          let rawHierarchy = null;
          try {
            rawHierarchy = await this.fetchJsonDirect(paths.hierarchy);
          } catch (error) {
            rawHierarchy = null;
          }

          const runtimeHierarchy = this.buildGuestHierarchyCompat(guestIndex, rawHierarchy);

          window.__FRONTIER_PHASE62_GUEST_LOADER__.hierarchyLoaded = true;
          window.__FRONTIER_PHASE62_GUEST_LOADER__.hierarchyIndexedItems = runtimeHierarchy.indexed_items;
          window.__FRONTIER_PHASE62_GUEST_LOADER__.leafIndexedItems = runtimeHierarchy.leaf_indexed_items;
          window.__FRONTIER_PHASE62_GUEST_LOADER__.hierarchyCompatNodes = runtimeHierarchy.nodes.length;

          return runtimeHierarchy;
        }

        if (resolvedUrl === paths.contract || /frontier-card-engine-contract\.guest\.json(?:\?.*)?$/.test(resolvedUrl)) {
          const json = await this.fetchJsonDirect(paths.contract);
          window.__FRONTIER_PHASE62_GUEST_LOADER__.contractLoaded = true;
          return json;
        }
      }

      const json = await this.fetchJsonDirect(resolvedUrl);

      if (json && json.__frontier_split_index === true) {
        return await this.loadSplitSearchIndex(resolvedUrl, json);
      }

      return json;
    }

    async loadSplitSearchIndex(url, manifest) {
      if (this.getDataTier() === "guest") {
        throw new Error("FRONTIER SECURITY BLOCK: loadSplitSearchIndex is disabled in Guest mode.");
      }

      throw new Error("FRONTIER SECURITY BLOCK: split index loader is disabled in production Guest runtime.");
    }

    normalizeGuestIndex(index) {
      if (!index || typeof index !== "object") {
        throw new Error("Invalid guest index");
      }

      const items = Array.isArray(index.items) ? index.items : [];
      const itemsById = Object.create(null);

      for (const item of items) {
        const publicId = item.public_id || item.canonical_id || item.id;

        if (!publicId) {
          throw new Error("Guest item missing public_id");
        }

        item.public_id = publicId;
        item.canonical_id = publicId;
        item.id = publicId;

        if (!item.sido) item.sido = "미분류";
        if (!item.sigungu) item.sigungu = "미분류";
        if (!item.eupmyeondong) item.eupmyeondong = "생활권";

        itemsById[publicId] = item;
      }

      if (items.length !== Object.keys(itemsById).length) {
        throw new Error("Guest index public_id collision or items_by_id mismatch");
      }

      index.items = items;
      index.items_by_id = itemsById;
      index.indexed_items = items.length;
      index.tier = "guest";
      index.runtime_id_policy = "public_id";

      return index;
    }

    buildGuestHierarchyCompat(guestIndex, rawHierarchy) {
      const items = Array.isArray(guestIndex.items) ? guestIndex.items : [];
      const itemsById = guestIndex.items_by_id || Object.create(null);

      const nodes = [];
      const nodesById = Object.create(null);
      const itemsByNode = Object.create(null);
      const itemToLeafNode = Object.create(null);
      const itemToNodeIds = Object.create(null);
      const nodeIdsByItemId = Object.create(null);
      const leafNodeIdsByItemId = Object.create(null);
      const nodeItemSets = new Map();

      const safe = value => String(value || "미분류").replace(/\s+/g, " ").trim() || "미분류";

      const ensureNode = (id, type, name, parentId, path, depth, isLeaf) => {
        if (!nodesById[id]) {
          nodesById[id] = {
            id,
            canonical_id: id,
            type,
            level: type,
            name,
            label: name,
            parent_id: parentId || null,
            parentId: parentId || null,
            path,
            depth,
            is_leaf: !!isLeaf,
            leaf: !!isLeaf,
            count: 0,
            item_count: 0,
            total_count: 0,
            visible_count: 0,
            item_ids: [],
            itemIds: [],
            children: [],
            child_ids: [],
            children_ids: [],
            childrenIds: []
          };

          nodes.push(nodesById[id]);
          itemsByNode[id] = nodesById[id].item_ids;
          nodeItemSets.set(id, new Set());

          if (parentId && nodesById[parentId]) {
            if (!nodesById[parentId].children.includes(id)) {
              nodesById[parentId].children.push(id);
              nodesById[parentId].child_ids.push(id);
              nodesById[parentId].children_ids.push(id);
              nodesById[parentId].childrenIds.push(id);
            }
          }
        }

        return nodesById[id];
      };

      const attachItem = (nodeId, itemId) => {
        const node = nodesById[nodeId];
        if (!node || !itemId) return;

        if (!itemsById[itemId]) {
          throw new Error("Guest hierarchy references unknown public_id: " + itemId);
        }

        const set = nodeItemSets.get(nodeId);
        if (!set.has(itemId)) {
          set.add(itemId);
          node.item_ids.push(itemId);
          node.itemIds = node.item_ids;
          node.count = node.item_ids.length;
          node.item_count = node.count;
          node.total_count = node.count;
          node.visible_count = node.count;
          itemsByNode[nodeId] = node.item_ids;
        }
      };

      ensureNode("guest:root", "root", "전국", null, ["전국"], 0, false);

      for (const item of items) {
        const publicId = item.public_id || item.canonical_id || item.id;

        if (!publicId) {
          throw new Error("Guest hierarchy build failed: item missing public_id");
        }

        const sido = safe(item.sido || "미분류");
        const sigungu = safe(item.sigungu || "미분류");
        const emd = safe(item.eupmyeondong || "생활권");

        const rootId = "guest:root";
        const sidoId = "guest:sido:" + sido;
        const sigunguId = "guest:sigungu:" + sido + ":" + sigungu;
        const emdId = "guest:emd:" + sido + ":" + sigungu + ":" + emd;

        ensureNode(sidoId, "sido", sido, rootId, [sido], 1, false);
        ensureNode(sigunguId, "sigungu", sigungu, sidoId, [sido, sigungu], 2, false);
        ensureNode(emdId, "eupmyeondong", emd, sigunguId, [sido, sigungu, emd], 3, true);

        const pathNodeIds = [rootId, sidoId, sigunguId, emdId];

        for (const nodeId of pathNodeIds) {
          attachItem(nodeId, publicId);
        }

        item.node_ids = pathNodeIds;
        item.nodeIds = pathNodeIds;
        item._node_ids = pathNodeIds;
        item.leaf_node_id = emdId;
        item.leafNodeId = emdId;
        item.node_id = emdId;

        itemToLeafNode[publicId] = emdId;
        leafNodeIdsByItemId[publicId] = emdId;
        itemToNodeIds[publicId] = pathNodeIds;
        nodeIdsByItemId[publicId] = pathNodeIds;
      }

      for (const node of nodes) {
        node.item_ids = Array.from(new Set(node.item_ids));
        node.itemIds = node.item_ids;
        node.children = Array.from(new Set(node.children));
        node.child_ids = Array.from(new Set(node.child_ids));
        node.children_ids = Array.from(new Set(node.children_ids));
        node.childrenIds = node.children_ids;
        node.count = node.item_ids.length;
        node.item_count = node.count;
        node.total_count = node.count;
        node.visible_count = node.count;
        itemsByNode[node.id] = node.item_ids;

        if (typeof node.count !== "number" || !Number.isFinite(node.count)) {
          throw new Error("FRONTIER GUEST HIERARCHY COUNT CONTRACT FAILED: " + node.id);
        }
      }

      const leafNodes = nodes.filter(node => node.is_leaf === true || node.type === "eupmyeondong");
      const leafItemIds = new Set();

      for (const node of leafNodes) {
        if (typeof node.count !== "number") {
          throw new Error("FRONTIER GUEST LEAF COUNT UNDEFINED: " + node.id);
        }

        if (node.count !== node.item_ids.length) {
          throw new Error("FRONTIER GUEST LEAF COUNT MISMATCH: " + node.id);
        }

        for (const id of node.item_ids || []) {
          if (!itemsById[id]) {
            throw new Error("FRONTIER GUEST LEAF CONNECTIVITY BROKEN: " + id);
          }
          leafItemIds.add(id);
        }
      }

      for (const item of items) {
        const publicId = item.public_id || item.canonical_id || item.id;
        if (!leafItemIds.has(publicId)) {
          throw new Error("FRONTIER GUEST LEAF CONNECTIVITY BROKEN: " + publicId);
        }
      }

      if (leafItemIds.size !== items.length) {
        throw new Error(`FRONTIER GUEST LEAF INDEXED ITEMS MISMATCH: ${leafItemIds.size} !== ${items.length}`);
      }

      const compat = Object.assign({}, rawHierarchy || {}, {
        version: "frontier-search-hierarchy.guest.runtime-final.v4",
        tier: "guest",
        indexed_items: items.length,
        hierarchy_node_count: nodes.length,
        node_count: nodes.length,
        leaf_node_count: leafNodes.length,
        leaf_indexed_items: leafItemIds.size,
        root_id: "guest:root",
        id_policy: "public_id_only_original_ids_removed",
        policy: {
          item_ids_exposed: true,
          item_ids_are_public_ids: true,
          original_ids_exposed: false,
          count_contract: "node.count === unique item_ids.length",
          reverse_index_contract: "_node_ids_by_item_id built before adapter invariant",
          max_public_depth: "eupmyeondong",
          detail_locked: true
        },
        nodes,
        nodes_by_id: nodesById,
        node_index: nodesById,
        items_by_node: itemsByNode,
        item_to_leaf_node: itemToLeafNode,
        item_to_node_ids: itemToNodeIds,
        node_ids_by_item_id: leafNodeIdsByItemId,
        node_path_ids_by_item_id: nodeIdsByItemId,
        leaf_node_ids_by_item_id: leafNodeIdsByItemId,
        _node_ids_by_item_id: leafNodeIdsByItemId,
        levels: {
          root: 1,
          sido: nodes.filter(n => n.type === "sido").length,
          sigungu: nodes.filter(n => n.type === "sigungu").length,
          eupmyeondong: leafNodes.length
        }
      });

      this._node_ids_by_item_id = new Map(Object.entries(leafNodeIdsByItemId));
      this.__node_ids_by_item_id = this._node_ids_by_item_id;
      this._node_path_ids_by_item_id = new Map(Object.entries(nodeIdsByItemId));
      this._item_to_leaf_node = new Map(Object.entries(itemToLeafNode));
      this.__phase634RuntimeHierarchy = compat;

      window.__FRONTIER_PHASE62_GUEST_LOADER__ = window.__FRONTIER_PHASE62_GUEST_LOADER__ || {};
      window.__FRONTIER_PHASE62_GUEST_LOADER__.hierarchyCompatNodes = nodes.length;
      window.__FRONTIER_PHASE62_GUEST_LOADER__.hierarchyIndexedItems = items.length;
      window.__FRONTIER_PHASE62_GUEST_LOADER__.leafIndexedItems = leafItemIds.size;
      window.__FRONTIER_PHASE62_GUEST_LOADER__.reverseIndexBuilt = true;
      window.__FRONTIER_PHASE62_GUEST_LOADER__.reverseIndexSize = Object.keys(nodeIdsByItemId).length;
      window.__FRONTIER_PHASE62_GUEST_LOADER__.countContract = "node.count === unique item_ids.length";
      window.__FRONTIER_PHASE62_GUEST_LOADER__.runtimeHierarchyVersion = compat.version;
      window.__FRONTIER_PHASE62_GUEST_LOADER__.adapterReverseIndexContract = "public_id -> leaf_node_id";

      window.__FRONTIER_PHASE634_RUNTIME_SYNC__ = {
        pass: true,
        version: compat.version,
        adapterReverseIndexContract: "public_id -> leaf_node_id",
        items: items.length,
        leafIndexedItems: leafItemIds.size,
        reverseIndexSize: Object.keys(nodeIdsByItemId).length,
        builtAt: new Date().toISOString()
      };

      return compat;
    }
    /* FRONTIER_PHASE6_2_GUEST_LOADER_SWITCH_END */

    assertCoreInvariants() {
      const items = this.state.items;
      const itemsById = this.state.itemsById;
      const hierarchy = this.state.hierarchy || {};
      const contract = this.state.contract || {};
      const itemCount = items.length;
      const mapCount = Object.keys(itemsById).length;
      const hierarchyCount = Number(hierarchy?.counts?.indexed_items || 0);
      const runtimePolicy = String(contract?.id_policy?.only_valid_id || contract?.id_policy?.runtime_id || "").trim();
      const failures = [];

      if (itemCount !== this.expectedCount) failures.push(`items.length ${itemCount} !== ${this.expectedCount}`);
      if (mapCount !== this.expectedCount) failures.push(`items_by_id count ${mapCount} !== ${this.expectedCount}`);
      if (itemCount !== mapCount) failures.push(`items.length ${itemCount} !== items_by_id count ${mapCount}`);
      if (hierarchyCount !== this.expectedCount) failures.push(`hierarchy indexed_items ${hierarchyCount} !== ${this.expectedCount}`);
      if (!["canonical_id", "stable_id"].includes(runtimePolicy)) failures.push(`invalid runtime id policy: ${runtimePolicy}`);

      for (const item of items) {
        const id = this.getCanonicalId(item);
        if (!id || !itemsById[id]) {
          failures.push(`items_by_id missing: ${id || "EMPTY_ID"}`);
          break;
        }
      }

      for (const item of items) {
        const id = this.getCanonicalId(item);
        const leafId = this.clean(this.state.nodeIdsByItemId[id]?.eupmyeondong);
        const leaf = this.state.nodes[leafId];

        if (!leaf || !Array.isArray(leaf.item_ids) || !leaf.item_ids.includes(id)) {
          failures.push(`leaf connectivity broken: ${id}`);
          break;
        }
      }

      for (const node of Object.values(this.state.nodes)) {
        if (!Array.isArray(node.item_ids)) {
          failures.push(`node.item_ids not array: ${node.node_id}`);
          break;
        }
        if (node.count !== node.item_ids.length) {
          failures.push(`node.count mismatch: ${node.node_id}`);
          break;
        }
      }

      if (failures.length) {
        throw new Error("FRONTIER ADAPTER INVARIANT VIOLATION: " + failures.join(" | "));
      }
    }

    critical(error) {
      console.error("🚨 [CRITICAL] FRONTIER ADAPTER INVARIANT VIOLATION", error);
    }

    clean(value) {
      return (value ?? "").toString().trim();
    }

    normalize(value) {
      return this.clean(value)
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[㈜]/g, " ")
        .replace(/[(){}\[\]<>]/g, " ")
        .replace(/[|/\\,;:~!@#$%^&*+=?'"`]/g, " ")
        .replace(/[-_]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    compact(value) {
      return this.normalize(value).replace(/\s+/g, "");
    }

    unique(values) {
      return [...new Set((values || []).map((v) => this.clean(v)).filter(Boolean))].sort();
    }

    getCanonicalId(input) {
      if (!input) return "";
      if (typeof input === "string") return this.clean(input);
      return this.clean(input.canonical_id || input.stable_id_v2 || input.stable_id || input.id);
    }

    getStatus() {
      return {
        version: this.version,
        ready: this.state.ready,
        fallbackMode: this.state.fallbackMode,
        error: this.state.error ? String(this.state.error.message || this.state.error) : null,
        counts: {
          items: this.state.items.length,
          itemsById: Object.keys(this.state.itemsById || {}).length,
          tokens: Object.keys(this.state.tokenIndex || {}).length,
          nodes: Object.keys(this.state.nodes || {}).length
        },
        paths: this.paths
      };
    }

    getItem(id) {
      const canonicalId = this.getCanonicalId(id);
      return this.state.itemsById[canonicalId] || null;
    }

    getItems(ids) {
      return this.unique(ids).map((id) => this.getItem(id)).filter(Boolean);
    }

    getNode(nodeId) {
      return this.state.nodes[this.clean(nodeId)] || null;
    }

    buildQueryTokens(query) {
      const q = this.clean(query);
      const tokens = new Set([this.normalize(q), this.compact(q)].filter(Boolean));

      for (const alias of this.strictAliases[q] || []) {
        tokens.add(this.normalize(alias));
        tokens.add(this.compact(alias));
      }

      const queryAliases = this.state.searchIndex?.query_aliases || {};
      const blockedGenericForBrand = new Set(["편의점", "편의", "store"]);

      for (const key of Object.keys(queryAliases)) {
        if (this.normalize(key) !== this.normalize(q) && this.compact(key) !== this.compact(q)) continue;

        for (const alias of Array.isArray(queryAliases[key]) ? queryAliases[key] : []) {
          const n = this.normalize(alias);
          const c = this.compact(alias);

          if (["CU", "GS", "세븐"].includes(q)) {
            if (blockedGenericForBrand.has(n) || blockedGenericForBrand.has(c)) continue;
          }

          if (n) tokens.add(n);
          if (c) tokens.add(c);
        }
      }

      for (const part of this.normalize(q).split(/\s+/)) {
        if (part) tokens.add(part);
      }

      return [...tokens].filter(Boolean).sort();
    }

    search(query, options = {}) {
      try {
        if (!this.state.ready) return this.emptyResult(query, "adapter_not_ready");

        const tokens = this.buildQueryTokens(query);
        const ids = [];
        const tokenHits = [];

        for (const token of tokens) {
          const hit = Array.isArray(this.state.tokenIndex[token]) ? this.state.tokenIndex[token] : [];
          tokenHits.push({ token, count: hit.length });
          ids.push(...hit);
        }

        let canonicalIds = this.unique(ids);

        if (!canonicalIds.length && options.fallbackScan !== false) {
          const q = this.normalize(query);
          if (q) {
            canonicalIds = this.state.items
              .filter((item) => this.normalize(item.search_text || "").includes(q))
              .map((item) => this.getCanonicalId(item));
          }
        }

        return this.buildResult(canonicalIds, {
          mode: "search",
          query,
          tokens,
          tokenHits
        });
      } catch (error) {
        this.critical(error);
        return this.emptyResult(query, "search_error", error);
      }
    }

    filterByNode(nodeId) {
      try {
        if (!this.state.ready) return this.emptyResult("", "adapter_not_ready");

        const node = this.getNode(nodeId);
        if (!node || !Array.isArray(node.item_ids)) return this.emptyResult("", "node_not_found");

        return this.buildResult(node.item_ids, {
          mode: "node",
          node_id: node.node_id,
          level: node.level,
          label: node.label,
          path: node.path || {}
        });
      } catch (error) {
        this.critical(error);
        return this.emptyResult("", "node_filter_error", error);
      }
    }

    filterByPath(pathFilter = {}) {
      try {
        if (!this.state.ready) return this.emptyResult("", "adapter_not_ready");

        const ids = [];

        for (const item of this.state.items) {
          let ok = true;

          for (const key of this.levels) {
            if (!pathFilter[key]) continue;
            if (this.clean(item[key]) !== this.clean(pathFilter[key])) {
              ok = false;
              break;
            }
          }

          if (ok) ids.push(this.getCanonicalId(item));
        }

        return this.buildResult(ids, {
          mode: "path",
          path: { ...pathFilter }
        });
      } catch (error) {
        this.critical(error);
        return this.emptyResult("", "path_filter_error", error);
      }
    }

    viewportFilter(ids, bounds) {
      try {
        const base = this.getItems(ids);
        const next = base.filter((item) => {
          const lat = Number(item.lat);
          const lng = Number(item.lng);
          return (
            Number.isFinite(lat) &&
            Number.isFinite(lng) &&
            lat >= Number(bounds.minLat) &&
            lat <= Number(bounds.maxLat) &&
            lng >= Number(bounds.minLng) &&
            lng <= Number(bounds.maxLng)
          );
        });

        return this.buildResult(next.map((item) => this.getCanonicalId(item)), {
          mode: "viewport",
          bounds
        });
      } catch (error) {
        this.critical(error);
        return this.emptyResult("", "viewport_filter_error", error);
      }
    }

    buildResult(ids, meta = {}) {
      const canonicalIds = this.unique(ids);
      const missingIds = canonicalIds.filter((id) => !this.state.itemsById[id]);

      if (missingIds.length) {
        throw new Error(`items_by_id missing canonical ids: ${missingIds.slice(0, 20).join(", ")}`);
      }

      const items = canonicalIds.map((id) => this.state.itemsById[id]).filter(Boolean);
      const rollup = this.rollup(canonicalIds);

      const result = {
        ok: true,
        canonical_ids: canonicalIds,
        ids: canonicalIds,
        count: canonicalIds.length,
        items,
        markerPayload: this.toMarkerPayload(items),
        geojson: this.toGeoJSON(items),
        rollup,
        meta: {
          ...meta,
          id_policy: "canonical_id",
          generated_at: new Date().toISOString()
        }
      };

      this.state.lastResult = result;
      return result;
    }

    emptyResult(query = "", reason = "empty", error = null) {
      return {
        ok: false,
        canonical_ids: [],
        ids: [],
        count: 0,
        items: [],
        markerPayload: [],
        geojson: { type: "FeatureCollection", features: [] },
        rollup: this.emptyRollup(),
        meta: {
          query,
          reason,
          error: error ? String(error.message || error) : null,
          id_policy: "canonical_id",
          generated_at: new Date().toISOString()
        }
      };
    }

    emptyRollup() {
      const out = {};
      for (const level of this.levels) out[level] = [];
      return out;
    }

    rollup(ids) {
      const result = this.emptyRollup();

      for (const id of this.unique(ids)) {
        const nodeMap = this.state.nodeIdsByItemId[id];
        if (!nodeMap) throw new Error(`node_ids_by_item_id missing: ${id}`);

        for (const level of this.levels) {
          const nodeId = this.clean(nodeMap[level]);
          const node = this.state.nodes[nodeId];

          if (!node) throw new Error(`hierarchy node missing: ${id} ${level} ${nodeId}`);
          if (!Array.isArray(node.item_ids)) throw new Error(`node.item_ids not array: ${nodeId}`);
          if (node.count !== node.item_ids.length) throw new Error(`node.count mismatch: ${nodeId}`);
          if (!node.item_ids.includes(id)) throw new Error(`node does not contain canonical_id: ${nodeId} ${id}`);

          let bucket = result[level].find((n) => n.node_id === nodeId);

          if (!bucket) {
            bucket = {
              node_id: node.node_id,
              level: node.level,
              label: node.label,
              parent_node_id: node.parent_node_id || null,
              child_node_ids: Array.isArray(node.child_node_ids) ? [...node.child_node_ids] : [],
              item_ids: [],
              count: 0,
              centroid_lat: node.centroid_lat ?? null,
              centroid_lng: node.centroid_lng ?? null,
              bounds: node.bounds || null,
              path: node.path || {}
            };
            result[level].push(bucket);
          }

          bucket.item_ids.push(id);
        }
      }

      for (const level of this.levels) {
        for (const node of result[level]) {
          node.item_ids = this.unique(node.item_ids);
          node.count = node.item_ids.length;
          if (node.count !== node.item_ids.length) {
            throw new Error(`rollup count invariant broken: ${node.node_id}`);
          }
        }
        result[level].sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label), "ko"));
      }

      return result;
    }

    toMarkerPayload(items) {
      return items.map((item) => ({
        canonical_id: this.getCanonicalId(item),
        stable_id_v2: item.stable_id_v2 || item.canonical_id,
        title: item.title || "",
        source: item.source || "",
        category: item.category || "",
        address: item.address || "",
        lat: Number(item.lat),
        lng: Number(item.lng),
        sido: item.sido || "",
        sigungu: item.sigungu || "",
        eupmyeondong: item.eupmyeondong || "",
        brand: item.brand || "",
        business_category: item.business_category || ""
      }));
    }

    toGeoJSON(items) {
      return {
        type: "FeatureCollection",
        features: items
          .map((item) => {
            const lat = Number(item.lat);
            const lng = Number(item.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

            return {
              type: "Feature",
              geometry: { type: "Point", coordinates: [lng, lat] },
              properties: {
                canonical_id: this.getCanonicalId(item),
                stable_id_v2: item.stable_id_v2 || item.canonical_id,
                title: item.title || "",
                source: item.source || "",
                category: item.category || "",
                address: item.address || "",
                sido: item.sido || "",
                sigungu: item.sigungu || "",
                eupmyeondong: item.eupmyeondong || "",
                brand: item.brand || "",
                business_category: item.business_category || ""
              }
            };
          })
          .filter(Boolean)
      };
    }

    applyCanonicalDataset(element, id) {
      if (!element) return element;
      const canonicalId = this.getCanonicalId(id);
      element.dataset.canonicalId = canonicalId;
      element.setAttribute("data-canonical-id", canonicalId);
      return element;
    }

    patchCanonicalDataset(root = document) {
      try {
        const selectors = [
          "[data-stable-id]",
          "[data-item-id]",
          "[data-id]",
          ".frontier-card",
          ".media-card",
          ".sidebar-item",
          ".result-item"
        ];

        const elements = [...root.querySelectorAll(selectors.join(","))];

        for (const el of elements) {
          if (el.hasAttribute("data-canonical-id")) continue;

          const legacyId =
            el.getAttribute("data-stable-id") ||
            el.getAttribute("data-item-id") ||
            el.getAttribute("data-id") ||
            "";

          const item = this.getItem(legacyId);

          if (item) {
            this.applyCanonicalDataset(el, item);
          }
        }
      } catch (error) {
        this.critical(error);
      }
    }

    dispatchResult(result) {
      try {
        this.emit("frontier:core:results", result);

        if (typeof this.hooks.onResults === "function") {
          this.hooks.onResults(result);
        }

        if (window.FrontierV2Bridge && typeof window.FrontierV2Bridge.onCoreResults === "function") {
          window.FrontierV2Bridge.onCoreResults(result);
        }

        if (typeof window.renderFrontierCoreResults === "function") {
          window.renderFrontierCoreResults(result);
        }

        if (typeof window.renderFrontierResults === "function") {
          window.renderFrontierResults(result.items, result);
        }

        if (typeof window.updateMarkers === "function") {
          window.updateMarkers(result.markerPayload, result);
        }

        if (typeof window.updateSidebarList === "function") {
          window.updateSidebarList(result.items, result);
        }

        this.patchCanonicalDataset(document);

        return result;
      } catch (error) {
        this.critical(error);
        return this.emptyResult("", "dispatch_error", error);
      }
    }

    runSearch(query, options = {}) {
      const result = this.search(query, options);
      return this.dispatchResult(result);
    }

    runNodeFilter(nodeId) {
      const result = this.filterByNode(nodeId);
      return this.dispatchResult(result);
    }

    runPathFilter(pathFilter) {
      const result = this.filterByPath(pathFilter);
      return this.dispatchResult(result);
    }

    emit(name, detail) {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    }

    bindDefaultDom() {
      this.bindSearchInputs();
      this.bindQueryButtons();
      this.bindHierarchyClicks();
      this.bindCanonicalClicks();
    }

    bindSearchInputs() {
      const selectors = [
        "[data-frontier-core-search]",
        "[data-frontier-search-input]",
        "#frontier-search-input",
        "#frontierSearchInput",
        "#searchInput",
        ".frontier-search-input",
        "input[type='search']"
      ];

      const inputs = [...document.querySelectorAll(selectors.join(","))];

      for (const input of inputs) {
        if (input.dataset.frontierCoreBound === "true") continue;
        input.dataset.frontierCoreBound = "true";

        input.addEventListener(
          "keydown",
          (event) => {
            if (!window.FRONTIER_USE_ADAPTER) return;
            if (event.key !== "Enter") return;

            event.preventDefault();
            event.stopImmediatePropagation();

            this.runSearch(input.value || "");
          },
          true
        );

        if (input.hasAttribute("data-frontier-live-search")) {
          let timer = null;

          input.addEventListener(
            "input",
            (event) => {
              if (!window.FRONTIER_USE_ADAPTER) return;

              event.stopImmediatePropagation();
              clearTimeout(timer);
              timer = setTimeout(() => {
                this.runSearch(input.value || "");
              }, Number(input.dataset.frontierLiveDelay || 180));
            },
            true
          );
        }
      }
    }

    bindQueryButtons() {
      document.addEventListener(
        "click",
        (event) => {
          if (!window.FRONTIER_USE_ADAPTER) return;

          const el = event.target.closest("[data-frontier-query],[data-search-query],[data-keyword]");
          if (!el) return;

          const query =
            el.getAttribute("data-frontier-query") ||
            el.getAttribute("data-search-query") ||
            el.getAttribute("data-keyword") ||
            "";

          if (!query) return;

          event.preventDefault();
          event.stopImmediatePropagation();

          this.runSearch(query);
        },
        true
      );
    }

    bindHierarchyClicks() {
      document.addEventListener(
        "click",
        (event) => {
          if (!window.FRONTIER_USE_ADAPTER) return;

          const el = event.target.closest("[data-frontier-node-id],[data-node-id],[data-region-group],[data-area-group],[data-sido],[data-sigungu],[data-eupmyeondong]");
          if (!el) return;

          const nodeId = el.getAttribute("data-frontier-node-id") || el.getAttribute("data-node-id");

          event.preventDefault();
          event.stopImmediatePropagation();

          if (nodeId) {
            this.runNodeFilter(nodeId);
            return;
          }

          this.runPathFilter({
            region_group: el.getAttribute("data-region-group") || "",
            area_group: el.getAttribute("data-area-group") || "",
            sido: el.getAttribute("data-sido") || "",
            sigungu: el.getAttribute("data-sigungu") || "",
            eupmyeondong: el.getAttribute("data-eupmyeondong") || ""
          });
        },
        true
      );
    }

    bindCanonicalClicks() {
      document.addEventListener(
        "click",
        (event) => {
          const el = event.target.closest("[data-canonical-id]");
          if (!el) return;

          const id = el.getAttribute("data-canonical-id");
          const item = this.getItem(id);
          if (!item) return;

          this.emit("frontier:core:canonical-click", { canonical_id: id, item });
        },
        true
      );
    }

    static async mount(options = {}) {
      const adapter = new FrontierCoreAdapter(options);
      window.FrontierCoreAdapter = FrontierCoreAdapter;
      window.frontierCore = adapter;
      await adapter.init();
      return adapter;
    }
  }

  function patchRenderer(name, itemArgIndex) {
    const original = window[name];

    if (typeof original !== "function") return;

    if (original.__frontierCorePatched === true) return;

    const patched = function (...args) {
      try {
        const resultArg = args.find((arg) => arg && Array.isArray(arg.canonical_ids));
        const itemsArg = Array.isArray(args[itemArgIndex]) ? args[itemArgIndex] : null;

        if (window.FRONTIER_USE_ADAPTER && window.frontierCore && resultArg && itemsArg) {
          for (const item of itemsArg) {
            if (item && !item.canonical_id) {
              item.canonical_id = item.stable_id_v2 || item.stable_id || item.id || "";
            }
          }
        }

        const out = original.apply(this, args);

        if (window.FRONTIER_USE_ADAPTER && window.frontierCore) {
          window.frontierCore.patchCanonicalDataset(document);
        }

        return out;
      } catch (error) {
        console.error("🚨 [CRITICAL] FRONTIER ADAPTER INVARIANT VIOLATION", error);
        return original.apply(this, args);
      }
    };

    patched.__frontierCorePatched = true;
    patched.__frontierCoreOriginal = original;
    window[name] = patched;
  }

  function patchRenderersWhenReady() {
    patchRenderer("renderFrontierResults", 0);
    patchRenderer("updateSidebarList", 0);
    patchRenderer("updateMarkers", 0);
  }

  function bootFrontierCoreAdapter() {
    window.FrontierCoreAdapter = FrontierCoreAdapter;

    if (!window.frontierCore) {
      window.frontierCore = new FrontierCoreAdapter({
        autoBind: true,
        expectedCount: 21894
      });
    }

    window.frontierCore
      .init()
      .then(() => {
        patchRenderersWhenReady();
        window.dispatchEvent(new CustomEvent("frontier:phase4-2:adapter-mounted", {
          detail: window.frontierCore.getStatus()
        }));
      })
      .catch((error) => {
        console.error("🚨 [CRITICAL] FRONTIER ADAPTER INVARIANT VIOLATION", error);
      });

    const rendererPatchTimer = setInterval(patchRenderersWhenReady, 250);
    setTimeout(() => clearInterval(rendererPatchTimer), 5000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootFrontierCoreAdapter, { once: true });
  } else {
    bootFrontierCoreAdapter();
  }
})();
/* FRONTIER_PHASE4_2_ADAPTER_END */

/* FRONTIER_PHASE4_2_1_CANONICAL_DATASET_HOTFIX_START */
(function () {
  "use strict";

  window.FRONTIER_CANONICAL_DATASET_HOTFIX = true;

  function clean(v) {
    return (v ?? "").toString().trim();
  }

  function normalizeText(v) {
    return clean(v)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[㈜]/g, " ")
      .replace(/[(){}\[\]<>]/g, " ")
      .replace(/[|/\\,;:~!@#$%^&*+=?'"`]/g, " ")
      .replace(/[-_]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function compactText(v) {
    return normalizeText(v).replace(/\s+/g, "");
  }

  function elementText(el) {
    return normalizeText([
      el && el.innerText,
      el && el.textContent,
      el && el.getAttribute && el.getAttribute("title"),
      el && el.getAttribute && el.getAttribute("aria-label"),
      el && el.getAttribute && el.getAttribute("alt")
    ].filter(Boolean).join(" "));
  }

  function isElement(node) {
    return node && node.nodeType === 1;
  }

  function installPhase421Hotfix() {
    if (!window.FrontierCoreAdapter || !window.frontierCore) {
      setTimeout(installPhase421Hotfix, 120);
      return;
    }

    const proto = window.FrontierCoreAdapter.prototype;
    if (!proto || proto.__frontierPhase421HotfixInstalled === true) return;

    proto.__frontierPhase421HotfixInstalled = true;

    proto.__phase421BuildDomIndex = function () {
      const items = Array.isArray(this.state && this.state.items) ? this.state.items : [];

      if (
        this.__phase421DomIndex &&
        this.__phase421DomIndexCount === items.length &&
        this.__phase421DomIndexStamp === (this.state && this.state.searchIndex && this.state.searchIndex.generated_at)
      ) {
        return this.__phase421DomIndex;
      }

      const index = {
        byCanonical: new Map(),
        byOriginal: new Map(),
        byTitle: new Map(),
        byCompactTitle: new Map(),
        byAddress: new Map(),
        byCompactAddress: new Map()
      };

      const push = function (map, key, item) {
        const k = clean(key);
        if (!k) return;
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(item);
      };

      for (const item of items) {
        const canonicalId = clean(item.canonical_id || item.stable_id_v2 || item.stable_id || item.id);
        const originalId = clean(item.original_stable_id);
        const title = normalizeText(item.title || "");
        const compactTitle = compactText(item.title || "");
        const address = normalizeText(item.address || "");
        const compactAddress = compactText(item.address || "");

        if (canonicalId) index.byCanonical.set(canonicalId, item);
        if (originalId) push(index.byOriginal, originalId, item);
        if (title) push(index.byTitle, title, item);
        if (compactTitle) push(index.byCompactTitle, compactTitle, item);
        if (address) push(index.byAddress, address, item);
        if (compactAddress) push(index.byCompactAddress, compactAddress, item);
      }

      this.__phase421DomIndex = index;
      this.__phase421DomIndexCount = items.length;
      this.__phase421DomIndexStamp = this.state && this.state.searchIndex && this.state.searchIndex.generated_at;

      return index;
    };

    proto.__phase421MatchByAttr = function (raw, index) {
      const value = clean(raw);
      if (!value) return null;

      const candidates = [
        value,
        value.replace(/^marker[_:-]/i, ""),
        value.replace(/^pin[_:-]/i, ""),
        value.replace(/^item[_:-]/i, ""),
        value.replace(/^media[_:-]/i, ""),
        value.replace(/^place[_:-]/i, "")
      ].map(clean).filter(Boolean);

      const originalMap = this.state && this.state.searchIndex && this.state.searchIndex.original_to_canonical_ids
        ? this.state.searchIndex.original_to_canonical_ids
        : {};

      for (const candidate of candidates) {
        if (index.byCanonical.has(candidate)) return index.byCanonical.get(candidate);

        const direct = this.getItem && this.getItem(candidate);
        if (direct) return direct;

        const originalHit = originalMap[candidate];
        if (Array.isArray(originalHit) && originalHit.length) {
          return index.byCanonical.get(originalHit[0]) || (this.getItem && this.getItem(originalHit[0])) || null;
        }
      }

      return null;
    };

    proto.__phase421MatchByText = function (el, pool, index) {
      const text = elementText(el);
      const compact = compactText(text);

      if (!text && !compact) return null;

      let best = null;
      let bestScore = 0;

      for (const item of pool) {
        const canonicalId = clean(item.canonical_id || item.stable_id_v2 || item.stable_id || item.id);
        const title = normalizeText(item.title || "");
        const compactTitle = compactText(item.title || "");
        const address = normalizeText(item.address || "");
        const compactAddress = compactText(item.address || "");
        const sido = normalizeText(item.sido || "");
        const sigungu = normalizeText(item.sigungu || "");
        const emd = normalizeText(item.eupmyeondong || "");

        let score = 0;

        if (canonicalId && text.includes(normalizeText(canonicalId))) score += 1000;
        if (title && title.length >= 2 && text.includes(title)) score += 500 + title.length;
        if (compactTitle && compactTitle.length >= 2 && compact.includes(compactTitle)) score += 480 + compactTitle.length;
        if (address && address.length >= 4 && text.includes(address)) score += 260 + address.length;
        if (compactAddress && compactAddress.length >= 4 && compact.includes(compactAddress)) score += 240 + compactAddress.length;
        if (sido && text.includes(sido)) score += 20;
        if (sigungu && text.includes(sigungu)) score += 25;
        if (emd && text.includes(emd)) score += 35;

        if (score > bestScore) {
          best = item;
          bestScore = score;
        }
      }

      if (best && bestScore >= 120) return best;

      const exactTitleHits = index.byTitle.get(text) || index.byCompactTitle.get(compact);
      if (exactTitleHits && exactTitleHits.length === 1) return exactTitleHits[0];

      return null;
    };

    proto.__phase421CandidateElements = function (root) {
      const scope = root || document;

      const selectors = [
        "[data-canonical-id]",
        "[data-stable-id]",
        "[data-item-id]",
        "[data-id]",
        "[data-place-id]",
        "[data-media-id]",
        "[data-marker-id]",
        "[data-pin-id]",
        "[data-frontier-id]",
        "[data-title]",
        "[title]",
        "[aria-label]",
        ".frontier-card",
        ".frontier-core-card",
        ".media-card",
        ".sidebar-item",
        ".result-item",
        ".result-card",
        ".search-result",
        ".search-card",
        ".place-card",
        ".place-item",
        ".list-item",
        ".item",
        ".card",
        ".marker",
        ".marker-card",
        ".mapboxgl-popup",
        ".mapboxgl-popup-content",
        ".leaflet-popup",
        ".leaflet-popup-content",
        ".popup",
        ".popup-content",
        ".modal",
        ".modal-content",
        ".pin-card",
        ".detail-card",
        ".hover-card",
        ".preview-card",
        "li",
        "tr",
        "article",
        "section",
        "div[id^='marker_']",
        "div[id^='pin_']",
        "div[id^='item_']",
        "div[id^='media_']",
        "div[id^='place_']"
      ];

      const found = new Set();

      for (const selector of selectors) {
        try {
          scope.querySelectorAll(selector).forEach(function (el) {
            found.add(el);
          });
        } catch (_) {}
      }

      return Array.from(found).filter(function (el) {
        if (!isElement(el)) return false;

        const tag = clean(el.tagName).toLowerCase();
        if (["html", "head", "body", "script", "style", "link", "meta", "canvas", "svg", "path", "button", "input", "textarea", "select", "option"].includes(tag)) {
          return false;
        }

        if (el.closest && el.closest("script,style,head")) return false;

        const className = clean(el.className);
        const text = elementText(el);

        const hasKnownAttr =
          el.hasAttribute("data-canonical-id") ||
          el.hasAttribute("data-stable-id") ||
          el.hasAttribute("data-item-id") ||
          el.hasAttribute("data-id") ||
          el.hasAttribute("data-place-id") ||
          el.hasAttribute("data-media-id") ||
          el.hasAttribute("data-marker-id") ||
          el.hasAttribute("data-pin-id") ||
          el.hasAttribute("data-frontier-id") ||
          clean(el.id);

        if (hasKnownAttr) return true;
        if (/card|item|result|place|marker|popup|modal|pin|detail|sidebar/i.test(className)) return true;
        if (text.length >= 2 && text.length <= 500) return true;

        return false;
      });
    };

    proto.patchCanonicalDataset = function (root, options) {
      try {
        const scope = root || document;
        const opts = options || {};

        if (!this.state || !this.state.ready) {
          return { patched: 0, candidates: 0, mode: "adapter_not_ready" };
        }

        const index = this.__phase421BuildDomIndex();
        const lastItems = Array.isArray(this.state.lastResult && this.state.lastResult.items)
          ? this.state.lastResult.items
          : [];

        const pool = lastItems.length
          ? lastItems
          : (Array.isArray(this.state.items) ? this.state.items.slice(0, 500) : []);

        const candidates = this.__phase421CandidateElements(scope);

        const attrNames = [
          "data-canonical-id",
          "data-stable-id",
          "data-item-id",
          "data-id",
          "data-place-id",
          "data-media-id",
          "data-marker-id",
          "data-pin-id",
          "data-frontier-id",
          "id",
          "title",
          "aria-label",
          "data-title"
        ];

        let patched = 0;
        const unresolved = [];

        for (const el of candidates) {
          const existing = clean(el.getAttribute("data-canonical-id"));
          if (existing && index.byCanonical.has(existing)) continue;

          let item = null;

          for (const attr of attrNames) {
            item = this.__phase421MatchByAttr(el.getAttribute(attr), index);
            if (item) break;
          }

          if (!item) {
            item = this.__phase421MatchByText(el, pool, index);
          }

          if (item) {
            const canonicalId = this.getCanonicalId(item);
            if (canonicalId) {
              el.dataset.canonicalId = canonicalId;
              el.setAttribute("data-canonical-id", canonicalId);
              patched += 1;
              continue;
            }
          }

          unresolved.push(el);
        }

        if (opts.allowSequential !== false && lastItems.length && unresolved.length) {
          const usable = unresolved.filter(function (el) {
            const tag = clean(el.tagName).toLowerCase();
            const className = clean(el.className);
            const text = elementText(el);

            if (["tr", "li", "article", "section"].includes(tag)) return true;
            if (/card|item|result|place|marker|popup|modal|pin|detail|sidebar/i.test(className)) return true;
            if (text.length >= 2 && text.length <= 300) return true;

            return false;
          });

          const limit = Math.min(usable.length, lastItems.length);

          for (let i = 0; i < limit; i += 1) {
            const el = usable[i];

            if (clean(el.getAttribute("data-canonical-id"))) continue;

            const canonicalId = this.getCanonicalId(lastItems[i]);
            if (!canonicalId) continue;

            el.dataset.canonicalId = canonicalId;
            el.setAttribute("data-canonical-id", canonicalId);
            el.setAttribute("data-frontier-phase421-sequential", "true");
            patched += 1;
          }
        }

        const total = document.querySelectorAll("[data-canonical-id]").length;

        window.__FRONTIER_PHASE421_LAST_PATCH__ = {
          patched,
          candidates: candidates.length,
          totalCanonicalElements: total,
          lastResultCount: lastItems.length,
          timestamp: new Date().toISOString()
        };

        return window.__FRONTIER_PHASE421_LAST_PATCH__;
      } catch (error) {
        console.error("🚨 [CRITICAL] FRONTIER ADAPTER INVARIANT VIOLATION", error);
        return { patched: 0, candidates: 0, error: String(error.message || error) };
      }
    };

    function syncCanonicalDataset(reason) {
      if (!window.FRONTIER_USE_ADAPTER || !window.frontierCore) return;

      const run = function () {
        try {
          window.frontierCore.patchCanonicalDataset(document, { reason });
        } catch (error) {
          console.error("🚨 [CRITICAL] FRONTIER ADAPTER INVARIANT VIOLATION", error);
        }
      };

      run();

      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(run);
        requestAnimationFrame(function () {
          requestAnimationFrame(run);
        });
      }

      [0, 30, 80, 150, 300, 600, 1000, 1600].forEach(function (ms) {
        setTimeout(run, ms);
      });
    }

    function patchRenderer(name) {
      const original = window[name];
      if (typeof original !== "function") return false;
      if (original.__frontierPhase421Patched === true) return true;

      const patched = function (...args) {
        const out = original.apply(this, args);
        syncCanonicalDataset(name);
        return out;
      };

      patched.__frontierPhase421Patched = true;
      patched.__frontierPhase421Original = original;
      window[name] = patched;

      return true;
    }

    function patchAllRenderers() {
      patchRenderer("renderFrontierResults");
      patchRenderer("renderFrontierCoreResults");
      patchRenderer("updateSidebarList");
      patchRenderer("updateMarkers");
      patchRenderer("renderSidebar");
      patchRenderer("renderList");
      patchRenderer("renderResults");
      patchRenderer("renderCards");
      patchRenderer("renderMarkers");
      patchRenderer("showPopup");
      patchRenderer("openModal");
      patchRenderer("showDetail");
    }

    patchAllRenderers();
    syncCanonicalDataset("phase4-2-1-install");

    const patchTimer = setInterval(function () {
      patchAllRenderers();
      syncCanonicalDataset("phase4-2-1-interval");
    }, 400);

    setTimeout(function () {
      clearInterval(patchTimer);
    }, 12000);

    if ("MutationObserver" in window && document.body) {
      const observer = new MutationObserver(function (mutations) {
        if (!window.FRONTIER_USE_ADAPTER) return;

        const hasAddedNodes = mutations.some(function (m) {
          return m.addedNodes && m.addedNodes.length;
        });

        if (hasAddedNodes) {
          syncCanonicalDataset("mutation");
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      window.__FRONTIER_PHASE421_MUTATION_OBSERVER__ = observer;
    }

    window.addEventListener("frontier:core:results", function () {
      syncCanonicalDataset("frontier:core:results");
    });

    window.addEventListener("frontier:core:ready", function () {
      syncCanonicalDataset("frontier:core:ready");
    });

    window.addEventListener("load", function () {
      syncCanonicalDataset("window:load");
    });

    try {
      window.frontierCore.patchCanonicalDataset(document, { reason: "phase4-2-1-immediate" });
      console.info("📢 [PHASE 4.2.1] canonical dataset hotfix installed", window.__FRONTIER_PHASE421_LAST_PATCH__);
    } catch (error) {
      console.error("🚨 [CRITICAL] FRONTIER ADAPTER INVARIANT VIOLATION", error);
    }
  }

  installPhase421Hotfix();
})();
/* FRONTIER_PHASE4_2_1_CANONICAL_DATASET_HOTFIX_END */


(() => {
  "use strict";

  const PUBLIC_LITE_URL = "./frontier-map-v2-public-map-lite-normalized-address.json";
  const DETAILS_URL = "./frontier-map-v2-pin-ready-details.json";
  const COVERAGE_HIERARCHY_URL = "./frontier-map-v2-coverage-hierarchy.json";

  const MAX_RENDER_MARKERS = 1000;
  const MAX_LIST_ITEMS = 80;

  const HOME_CENTER = [36.2, 127.9];
  const HOME_ZOOM = 7;

  const REGION_MAX_ZOOM = 7;
  const AREA_MAX_ZOOM = 9;
  const SIGUNGU_CLUSTER_MAX_ZOOM = 11;
  const SIGUNGU_MAX_ZOOM = 13;
  const EUPMYEONDONG_MAX_ZOOM = 15;
  const DETAIL_AUTO_ZOOM = 16;
  const DETAIL_RETURN_ZOOM = 15;

  const PROTOTYPE_VERSION = "v2.1.26";
  const PROTOTYPE_LABEL = "FRONTIER MAP v2.1.26";

  const PUBLIC_MAJOR_ORDER = [
    "도심 매체",
    "교통 매체",
    "쇼핑 매체",
    "레저 매체",
    "생활 매체",
    "4대매체",
    "기타매체",
    "해외매체"
  ];

  const PUBLIC_MIDDLE_ORDER = {
    "생활 매체": [
      "아파트",
      "오피스",
      "편의점",
      "병원&약국",
      "대학교",
      "피트니스&필라테스",
      "헤어샵",
      "F&B 핫플레이스"
    ],
    "도심 매체": [
      "전광판/미디어파사드",
      "빌보드",
      "외벽 광고/랩핑"
    ],
    "교통 매체": [
      "지하철",
      "버스",
      "택시",
      "도로/고속도로 매체",
      "이동형 차량 매체",
      "공항",
      "기차/KTX",
      "터미널",
      "쉘터/정류장"
    ],
    "쇼핑 매체": [
      "쇼핑몰",
      "백화점",
      "대형마트",
      "아울렛",
      "면세점",
      "H&B스토어"
    ],
    "레저 매체": [
      "극장",
      "골프/스크린골프",
      "리조트/휴양시설",
      "레저시설",
      "스포츠시설"
    ],
    "4대매체": [
      "TV",
      "라디오",
      "신문",
      "잡지"
    ],
    "기타매체": [
      "주유소",
      "비정형 설치 매체",
      "실험형 매체",
      "기타"
    ],
    "해외매체": [
      "글로벌 OOH",
      "해외 랜드마크",
      "국가/도시별 소개"
    ]
  };

  const MIDDLE_COUNT_ALIASES = {
    "아파트": ["아파트", "아파트 엘리베이터"],
    "병원&약국": ["병원", "약국", "병원&약국"],
    "피트니스&필라테스": ["피트니스/필라테스", "피트니스&필라테스"],
    "전광판/미디어파사드": ["전광판", "미디어파사드", "전광판/미디어파사드"],
    "외벽 광고/랩핑": ["외벽", "외벽 광고/랩핑"]
  };

  const SEOUL_GU_ALIASES = {
    "강남": "강남구", "강남구": "강남구",
    "서초": "서초구", "서초구": "서초구",
    "송파": "송파구", "송파구": "송파구",
    "강동": "강동구", "강동구": "강동구",
    "종로": "종로구", "종로구": "종로구",
    "중": "중구", "중구": "중구",
    "용산": "용산구", "용산구": "용산구",
    "마포": "마포구", "마포구": "마포구",
    "서대문": "서대문구", "서대문구": "서대문구",
    "은평": "은평구", "은평구": "은평구",
    "성동": "성동구", "성동구": "성동구",
    "광진": "광진구", "광진구": "광진구",
    "동대문": "동대문구", "동대문구": "동대문구",
    "중랑": "중랑구", "중랑구": "중랑구",
    "성북": "성북구", "성북구": "성북구",
    "강북": "강북구", "강북구": "강북구",
    "도봉": "도봉구", "도봉구": "도봉구",
    "노원": "노원구", "노원구": "노원구",
    "양천": "양천구", "양천구": "양천구",
    "강서": "강서구", "강서구": "강서구",
    "구로": "구로구", "구로구": "구로구",
    "금천": "금천구", "금천구": "금천구",
    "영등포": "영등포구", "영등포구": "영등포구",
    "동작": "동작구", "동작구": "동작구",
    "관악": "관악구", "관악구": "관악구"
  };

  const INCHEON_GU_ALIASES = {
    "중": "중구", "중구": "중구",
    "동": "동구", "동구": "동구",
    "미추홀": "미추홀구", "미추홀구": "미추홀구",
    "남": "미추홀구", "남구": "미추홀구",
    "연수": "연수구", "연수구": "연수구",
    "남동": "남동구", "남동구": "남동구",
    "부평": "부평구", "부평구": "부평구",
    "계양": "계양구", "계양구": "계양구",
    "서": "서구", "서구": "서구",
    "강화": "강화군", "강화군": "강화군",
    "옹진": "옹진군", "옹진군": "옹진군"
  };

  const GYEONGGI_CITY_ALIASES = {
    "수원": "수원시", "수원시": "수원시",
    "성남": "성남시", "성남시": "성남시",
    "용인": "용인시", "용인시": "용인시",
    "화성": "화성시", "화성시": "화성시",
    "오산": "오산시", "오산시": "오산시",
    "평택": "평택시", "평택시": "평택시",
    "안성": "안성시", "안성시": "안성시",
    "이천": "이천시", "이천시": "이천시",
    "여주": "여주시", "여주시": "여주시",
    "부천": "부천시", "부천시": "부천시",
    "안산": "안산시", "안산시": "안산시",
    "시흥": "시흥시", "시흥시": "시흥시",
    "광명": "광명시", "광명시": "광명시",
    "안양": "안양시", "안양시": "안양시",
    "군포": "군포시", "군포시": "군포시",
    "의왕": "의왕시", "의왕시": "의왕시",
    "과천": "과천시", "과천시": "과천시",
    "김포": "김포시", "김포시": "김포시",
    "고양": "고양시", "고양시": "고양시",
    "파주": "파주시", "파주시": "파주시",
    "의정부": "의정부시", "의정부시": "의정부시",
    "양주": "양주시", "양주시": "양주시",
    "동두천": "동두천시", "동두천시": "동두천시",
    "포천": "포천시", "포천시": "포천시",
    "연천": "연천군", "연천군": "연천군",
    "가평": "가평군", "가평군": "가평군", "가평시": "가평군",
    "남양주": "남양주시", "남양주시": "남양주시",
    "구리": "구리시", "구리시": "구리시",
    "하남": "하남시", "하남시": "하남시",
    "광주": "광주시", "광주시": "광주시",
    "양평": "양평군", "양평군": "양평군"
  };

  const state = {
    map: null,
    markers: null,
    coverageLayer: null,
    offscreenCoverageIndicatorEl: null,
    zoomStatusEl: null,
    publicItems: [],
    itemsByFrontierRowId: new Map(),
    hierarchyData: null,
    detailsById: {},
    activeItems: [],
    nodeScope: null,
    viewHistory: [],
    isRestoringHistory: false,
    backControlEl: null,
    hasSearched: false,
    movedAfterSearch: false,
    selectedMajor: "",
    selectedMiddle: "",
    selectedFormat: "",
    keyword: ""
  };

  const $ = (id) => document.getElementById(id);

  function esc(value) {
    return (value ?? "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function clean(value) {
    return (value ?? "").toString().trim();
  }

  function norm(value) {
    return (value ?? "")
      .toString()
      .toLowerCase()
      .replace(/\s+/g, "");
  }

  function numberText(n) {
    return Number(n || 0).toLocaleString("ko-KR");
  }

  function stripParentheses(value) {
    return clean(value)
      .replace(/\([^)]*\)/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeMetropolitanGu(sido, value) {
    const s = stripParentheses(value);
    const first = s.split(" ").filter(Boolean)[0] || s;

    if (sido === "서울") return SEOUL_GU_ALIASES[first] || SEOUL_GU_ALIASES[s] || s;
    if (sido === "인천") return INCHEON_GU_ALIASES[first] || INCHEON_GU_ALIASES[s] || s;

    return s;
  }

  function splitAdministrativeUnit(sido, rawSigungu) {
    const sd = clean(sido);
    const s = stripParentheses(rawSigungu);

    if (!s || s === "미분류") {
      return { map_sigungu: "미분류", detail_sigungu: "미분류" };
    }

    if (sd === "경기" && ["경기", "경기도"].includes(s)) {
      return { map_sigungu: "미분류", detail_sigungu: "미분류" };
    }

    const invalidWideNames = [sd, `${sd}시`, `${sd}광역시`, `${sd}특별시`, `${sd}특별자치시`];
    if (invalidWideNames.includes(s)) {
      return { map_sigungu: "미분류", detail_sigungu: "미분류" };
    }

    if (["서울", "인천"].includes(sd)) {
      const gu = normalizeMetropolitanGu(sd, s);
      return { map_sigungu: gu, detail_sigungu: gu };
    }

    if (["부산", "대구", "광주", "대전", "울산"].includes(sd)) {
      const parts = s.split(" ").filter(Boolean);
      const guGun = parts.find((x) => /[가-힣]+(구|군)$/.test(x));
      return { map_sigungu: guGun || s, detail_sigungu: guGun || s };
    }

    if (sd === "경기") {
      const parts = s.split(" ").filter(Boolean);
      const first = parts[0] || s;
      const city = GYEONGGI_CITY_ALIASES[first] || GYEONGGI_CITY_ALIASES[s];

      if (city) {
        const detail = parts.length >= 2 && /[가-힣]+구$/.test(parts[1])
          ? `${city} ${parts[1]}`
          : city;

        return { map_sigungu: city, detail_sigungu: detail };
      }
    }

    const parts = s.split(" ").filter(Boolean);

    if (parts.length >= 2 && /[가-힣]+시$/.test(parts[0]) && /[가-힣]+구$/.test(parts[1])) {
      return { map_sigungu: parts[0], detail_sigungu: `${parts[0]} ${parts[1]}` };
    }

    if (parts.length >= 1 && /[가-힣]+(시|군|구)$/.test(parts[0])) {
      return { map_sigungu: parts[0], detail_sigungu: s };
    }

    return { map_sigungu: s, detail_sigungu: s };
  }

  function getItemSido(item) {
    return clean(item.normalized_sido || item.sido);
  }

  function getItemMapSigungu(item) {
    const split = splitAdministrativeUnit(
      getItemSido(item),
      clean(item.normalized_sigungu || item.sigungu)
    );

    return split.map_sigungu;
  }

  function getItemDetailSigungu(item) {
    const split = splitAdministrativeUnit(
      getItemSido(item),
      clean(item.normalized_sigungu || item.sigungu)
    );

    return split.detail_sigungu;
  }

  function getItemDisplaySigungu(item) {
    const sido = getItemSido(item);
    const sigungu = getItemMapSigungu(item);
    const nonSeoulMetro = ["부산", "대구", "인천", "광주", "대전", "울산"];

    if (nonSeoulMetro.includes(sido) && /[가-힣]+(구|군)$/.test(sigungu)) {
      return `${sido} ${sigungu}`;
    }

    return sigungu;
  }

  function getRegionGroupFromSido(sido) {
    const s = clean(sido);

    if (["서울", "경기", "인천"].includes(s)) return "수도권";
    if (["부산", "울산", "경남"].includes(s)) return "부산·울산·경남권";
    if (["대구", "경북"].includes(s)) return "대구·경북권";
    if (["대전", "세종", "충남", "충북"].includes(s)) return "충청권";
    if (["광주", "전남", "전북"].includes(s)) return "호남권";
    if (s === "강원") return "강원권";
    if (s === "제주") return "제주권";

    return "";
  }

  function startsWithAny(value, names) {
    const s = clean(value);
    return names.some((name) => s.startsWith(name));
  }

  function getSeoulArea(sigungu) {
    const s = clean(sigungu);

    if (["강남구", "서초구", "송파구", "강동구"].includes(s)) return "서울 강남권";
    if (["종로구", "중구", "용산구"].includes(s)) return "서울 강북권";
    if (["마포구", "서대문구", "은평구"].includes(s)) return "서울 서북권";
    if (["성동구", "광진구", "동대문구", "중랑구", "성북구", "강북구", "도봉구", "노원구"].includes(s)) return "서울 동북권";
    if (["양천구", "강서구", "구로구", "금천구", "영등포구", "동작구", "관악구"].includes(s)) return "서울 서남권";

    return "서울 기타권";
  }

  function getGyeonggiArea(sigungu) {
    const s = clean(sigungu);

    if (startsWithAny(s, ["수원시", "성남시", "용인시", "화성시", "오산시", "평택시", "안성시", "이천시", "여주시"])) return "경기 남부권";
    if (startsWithAny(s, ["부천시", "안산시", "시흥시", "광명시", "안양시", "군포시", "의왕시", "과천시", "김포시"])) return "경기 서부권";
    if (startsWithAny(s, ["고양시", "파주시", "의정부시", "양주시", "동두천시", "포천시", "연천군", "가평군"])) return "경기 북부권";
    if (startsWithAny(s, ["남양주시", "구리시", "하남시", "광주시", "양평군"])) return "경기 동부권";

    return "경기 기타권";
  }

  function getGangwonArea(sigungu) {
    const s = clean(sigungu);

    if (startsWithAny(s, ["춘천시", "원주시", "홍천군", "횡성군", "영월군", "평창군", "정선군", "철원군", "화천군", "양구군", "인제군"])) return "강원 영서권";
    if (startsWithAny(s, ["강릉시", "동해시", "속초시", "삼척시", "태백시", "고성군", "양양군"])) return "강원 영동권";

    return "강원 기타권";
  }

  function getItemAreaGroup(item) {
    const sido = getItemSido(item);
    const sigungu = getItemMapSigungu(item);
    const regionGroup = getRegionGroupFromSido(sido);

    if (sido === "서울") return getSeoulArea(sigungu);
    if (sido === "경기") return getGyeonggiArea(sigungu);
    if (sido === "인천") return "인천권";
    if (sido === "부산") return "부산권";
    if (sido === "울산") return "울산권";
    if (sido === "경남") return "경남권";
    if (sido === "대구") return "대구권";
    if (sido === "경북") return "경북권";
    if (sido === "대전" || sido === "세종") return "대전·세종권";
    if (sido === "충남") return "충남권";
    if (sido === "충북") return "충북권";
    if (sido === "광주" || sido === "전남") return "광주·전남권";
    if (sido === "전북") return "전북권";
    if (sido === "강원") return getGangwonArea(sigungu);
    if (sido === "제주") return "제주권";

    return `${regionGroup} 기타`;
  }

  function getItemBroadAreaGroup(item) {
    const sido = getItemSido(item);

    if (sido === "서울") return "서울권";
    if (sido === "경기") return "경기권";
    if (sido === "인천") return "인천권";

    return getItemAreaGroup(item);
  }

  function displayMiddleCategory(item) {
    const major = item?.public_major_category;
    const middle = item?.public_middle_category || "";

    if (major === "생활 매체") {
      if (middle === "아파트 엘리베이터") return "아파트";
      if (middle === "병원" || middle === "약국") return "병원&약국";
      if (middle === "피트니스/필라테스") return "피트니스&필라테스";
    }

    if (major === "도심 매체") {
      if (middle === "전광판" || middle === "미디어파사드") return "전광판/미디어파사드";
      if (middle === "외벽") return "외벽 광고/랩핑";
    }

    return middle;
  }


  function isPublicHiddenItem(item = {}) {
    return (
      clean(item.public_visibility) === "hidden_until_source_verified" ||
      clean(item.review_bucket) === "source_suspect_public_hidden" ||
      item.exclude_from_public_map === true
    );
  }

  function isPublicVisibleItem(item = {}) {
    return !isPublicHiddenItem(item);
  }

  function getVisibleItemByFrontierRowId(id) {
    const item = state.itemsByFrontierRowId.get(clean(id));
    if (!item || !isPublicVisibleItem(item)) return null;
    return item;
  }

  function getVisibleNodeItemIds(node) {
    const ids = Array.isArray(node?.item_ids) ? node.item_ids.map(clean).filter(Boolean) : [];
    return ids.filter((id) => getVisibleItemByFrontierRowId(id));
  }

  function isValidItem(item) {
    return (
      item &&
      Number.isFinite(Number(item.lat)) &&
      Number.isFinite(Number(item.lng)) &&
      Number(item.lat) >= 32 &&
      Number(item.lat) <= 39.8 &&
      Number(item.lng) >= 124 &&
      Number(item.lng) <= 132
    );
  }

  function injectStyle() {
    if (document.getElementById("frontier-v2-render-style")) return;

    const style = document.createElement("style");
    style.id = "frontier-v2-render-style";
    style.textContent = `
      select,
      input,
      textarea {
        color: #eafff8 !important;
      }

      select option {
        background: #101a17 !important;
        color: #eafff8 !important;
      }

      .frontier-zoom-status {
        margin-top: 8px;
        padding: 7px 10px;
        border-radius: 999px;
        border: 1px solid rgba(162, 222, 204, .55);
        background: rgba(7, 16, 14, .88);
        color: #eafff8;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: -.02em;
        box-shadow: 0 10px 28px rgba(0,0,0,.24);
        backdrop-filter: blur(8px);
      }

      .coverage-label {
        width: var(--label-width, 92px);
        min-height: 46px;
        padding: 8px 10px 9px;
        border-radius: 14px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #eafff8;
        background: linear-gradient(145deg, rgba(8, 19, 16, .95), rgba(20, 42, 35, .88));
        border: 1px solid rgba(162, 222, 204, .68);
        box-shadow:
          0 14px 32px rgba(0, 0, 0, .28),
          0 0 0 1px rgba(255, 255, 255, .06) inset,
          0 0 18px rgba(162, 222, 204, .16);
        font-family: inherit;
        line-height: 1;
        transform: translate(-50%, -50%);
        cursor: pointer;
        user-select: none;
        backdrop-filter: blur(8px);
        box-sizing: border-box;
      }

      .coverage-label small {
        display: block;
        width: 100%;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: -0.04em;
        color: rgba(234, 255, 248, .74);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: center;
      }

      .coverage-label b {
        display: block;
        margin-top: 4px;
        font-size: 19px;
        font-weight: 900;
        letter-spacing: -0.04em;
        white-space: nowrap;
      }

      .coverage-label.is-region {
        border-color: rgba(184, 245, 226, .88);
        box-shadow:
          0 18px 42px rgba(0, 0, 0, .30),
          0 0 0 1px rgba(255, 255, 255, .08) inset,
          0 0 26px rgba(162, 222, 204, .24);
      }

      .coverage-label.is-area {
        border-color: rgba(162, 222, 204, .72);
      }

      .coverage-label.is-cluster {
        border-color: rgba(162, 222, 204, .60);
      }

      .coverage-label.is-sigungu,
      .coverage-label.is-emd {
        border-color: rgba(162, 222, 204, .46);
        background: linear-gradient(145deg, rgba(13, 27, 24, .91), rgba(34, 58, 51, .80));
      }

      .coverage-label:hover {
        z-index: 9999;
        border-color: rgba(210, 255, 242, .96);
        box-shadow:
          0 20px 44px rgba(0, 0, 0, .34),
          0 0 0 1px rgba(255, 255, 255, .10) inset,
          0 0 28px rgba(162, 222, 204, .34);
      }
    `;

    document.head.appendChild(style);

    if (!document.getElementById("frontier-v2-hover-preview-style")) {
      const previewStyle = document.createElement("style");
      previewStyle.id = "frontier-v2-hover-preview-style";
      previewStyle.textContent = `
        .coverage-label {
          position: relative;
          overflow: visible;
          transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
        }

        .coverage-label:hover {
          transform: translate(-50%, -50%) scale(1.045);
        }

        .coverage-preview {
          position: absolute;
          left: 50%;
          top: calc(100% + 7px);
          width: 168px;
          max-width: 168px;
          transform: translateX(-50%);
          padding: 8px 9px 9px;
          border-radius: 12px;
          border: 1px solid rgba(162, 222, 204, .42);
          background: rgba(5, 13, 12, .94);
          box-shadow: 0 14px 34px rgba(0,0,0,.34);
          color: rgba(234, 255, 248, .92);
          opacity: 0;
          pointer-events: none;
          visibility: hidden;
          transition: opacity .12s ease, transform .12s ease;
          box-sizing: border-box;
          backdrop-filter: blur(10px);
          z-index: 99999;
        }

        .coverage-label:hover .coverage-preview {
          opacity: 1;
          visibility: visible;
          transform: translateX(-50%) translateY(2px);
        }

        .coverage-preview-title {
          margin-bottom: 5px;
          font-size: 9px;
          font-weight: 900;
          color: rgba(162, 222, 204, .96);
          letter-spacing: .04em;
          text-align: left;
        }

        .coverage-preview-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px 6px;
        }

        .coverage-preview-item {
          min-width: 0;
          padding: 3px 5px;
          border-radius: 7px;
          background: rgba(255,255,255,.055);
          color: rgba(234,255,248,.90);
          font-size: 10px;
          font-weight: 850;
          letter-spacing: -.045em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          text-align: center;
        }

                .leaflet-marker-icon.frontier-coverage-hovering {
          z-index: 1000000 !important;
        }

        .leaflet-marker-icon.frontier-coverage-hovering .coverage-label {
          z-index: 1000000 !important;
        }

        .leaflet-marker-icon.frontier-coverage-hovering .coverage-preview {
          z-index: 1000001 !important;
        }
.coverage-preview-more {
          margin-top: 5px;
          font-size: 10px;
          font-weight: 850;
          color: rgba(234,255,248,.66);
          text-align: right;
        }
      `;
      document.head.appendChild(previewStyle);
    }
  }

  function setNotice(message, type = "info") {
    const box = $("noticeBox");
    if (!box) return;

    if (!message) {
      box.classList.remove("show");
      box.textContent = "";
      return;
    }

    box.textContent = message;
    box.classList.add("show");

    if (type === "danger") {
      box.style.borderColor = "rgba(255, 138, 138, 0.38)";
      box.style.background = "rgba(255, 138, 138, 0.10)";
    } else {
      box.style.borderColor = "rgba(162, 222, 204, 0.22)";
      box.style.background = "rgba(162, 222, 204, 0.08)";
    }
  }

  function getStageLabel() {
    const zoom = state.map?.getZoom?.() ?? HOME_ZOOM;

    if (state.hasSearched && zoom >= DETAIL_AUTO_ZOOM) return "상세 핀";

    if (zoom <= REGION_MAX_ZOOM) return "권역";
    if (zoom <= AREA_MAX_ZOOM) return "소권역";
    if (zoom <= SIGUNGU_CLUSTER_MAX_ZOOM) return "지역 묶음";
    if (zoom <= SIGUNGU_MAX_ZOOM) return "시군구";
    if (zoom <= EUPMYEONDONG_MAX_ZOOM) return "읍면동";
    return "상세 진입";
  }

  function updateZoomStatus() {
    if (!state.zoomStatusEl || !state.map) return;

    const zoom = state.map.getZoom();
    state.zoomStatusEl.textContent = `${PROTOTYPE_VERSION} · Z${zoom} · ${getStageLabel()}`;
  }

  function uniqueSorted(items, key) {
    return [...new Set(items.map((x) => x[key]).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "ko"));
  }

  function orderedValues(values, order = []) {
    const set = new Set(values.filter(Boolean));
    const ordered = order.filter((x) => set.has(x));
    const rest = [...set]
      .filter((x) => !ordered.includes(x))
      .sort((a, b) => a.localeCompare(b, "ko"));
    return [...ordered, ...rest];
  }

  function fillSelect(selectId, placeholder, values) {
    const select = $(selectId);
    if (!select) return;

    select.innerHTML = "";

    const first = document.createElement("option");
    first.value = "";
    first.textContent = placeholder;
    select.appendChild(first);

    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }

  function populateMajorSelect() {
    const dataMajors = uniqueSorted(state.publicItems, "public_major_category");
    const majors = orderedValues(dataMajors, PUBLIC_MAJOR_ORDER);
    fillSelect("groupSelect", "전체 대분류", majors);
    populateMiddleSelect();
    populateFormatSelect();
  }

  function populateMiddleSelect() {
    let middles = [];

    if (state.selectedMajor) {
      const base = state.publicItems.filter((item) => item.public_major_category === state.selectedMajor);
      const dataMiddles = [...new Set(base.map(displayMiddleCategory).filter(Boolean))];
      const fixedOrder = PUBLIC_MIDDLE_ORDER[state.selectedMajor] || [];
      middles = orderedValues(dataMiddles, fixedOrder);
    } else {
      middles = uniqueSorted(state.publicItems.map((item) => ({
        middle: displayMiddleCategory(item)
      })), "middle");
    }

    fillSelect("subgroupSelect", "전체 중분류", middles);
  }

  function populateFormatSelect() {
    const base = state.publicItems.filter((item) => {
      if (state.selectedMajor && item.public_major_category !== state.selectedMajor) return false;
      if (state.selectedMiddle && displayMiddleCategory(item) !== state.selectedMiddle) return false;
      return true;
    });

    const formats = uniqueSorted(base, "public_format_name");
    fillSelect("familySelect", "전체 매체 형식", formats);
  }

  function getFilteredItems() {
    const keyword = norm(state.keyword);

    return state.publicItems.filter((item) => {
      if (!isValidItem(item)) return false;
      if (!isPublicVisibleItem(item)) return false;

      if (state.selectedMajor && item.public_major_category !== state.selectedMajor) return false;
      if (state.selectedMiddle && displayMiddleCategory(item) !== state.selectedMiddle) return false;
      if (state.selectedFormat && item.public_format_name !== state.selectedFormat) return false;

      if (keyword) {
        const detail = state.detailsById[item.id];
        const text = [
          item.title,
          item.public_major_category,
          displayMiddleCategory(item),
          item.public_middle_category,
          item.public_minor_category,
          item.public_format_name,
          item.internal_render_type,
          item.map_usage_policy,
          item.normalized_sido,
          item.normalized_sigungu,
          getItemMapSigungu(item),
          getItemDetailSigungu(item),
          item.normalized_eupmyeondong,
          item.display_address,
          item.indoor_location_detail,
          item.sido,
          item.sigungu,
          item.address,
          detail?.address,
          detail?.original_category_high,
          detail?.original_category_low,
          detail?.media_group
        ].map(norm).join(" ");

        if (!text.includes(keyword)) return false;
      }

      return true;
    });
  }

  function getStableMapBounds() {
    if (!state.map || typeof state.map.getBounds !== "function") return null;

    const bounds = state.map.getBounds();

    if (!bounds || typeof bounds.pad !== "function") return bounds;

    // 라벨 안정화용 화면 버퍼.
    // 화면을 아주 조금 움직였다고 정상 라벨이 바로 사라지는 것을 줄인다.
    return bounds.pad(0.2);
  }

  function getItemsInCurrentBounds() {
    const bounds = getStableMapBounds();
    return getFilteredItems().filter((item) => bounds.contains([Number(item.lat), Number(item.lng)]));
  }

  function coverageLevelRank(level) {
    const order = ["region_group", "area_group", "sigungu_cluster", "sigungu", "sigungu_detail", "eupmyeondong"];
    const index = order.indexOf(clean(level));
    return index >= 0 ? index : -1;
  }

  function getNodeLabel(node, level) {
    return clean(node?.label_for_map || node?.display_label || node?.name || hierarchyLabel(level));
  }

  function clearNodeScope() {
    state.nodeScope = null;
  }

  let filteredItemIdSetCacheKey = "";
  let filteredItemIdSetCache = null;

  function getFilteredItemIdSetCacheKey() {
    return [
      state.publicItems?.length || 0,
      clean(state.selectedMajor),
      clean(state.selectedMiddle),
      clean(state.selectedFormat)
    ].join("||");
  }

  function getFilteredItemIdSet() {
    const key = getFilteredItemIdSetCacheKey();

    if (filteredItemIdSetCache && filteredItemIdSetCacheKey === key) {
      return filteredItemIdSetCache;
    }

    filteredItemIdSetCacheKey = key;
    filteredItemIdSetCache = new Set(getFilteredItems().map((item) => clean(item.__frontier_item_id)).filter(Boolean));
    return filteredItemIdSetCache;
  }

  function hasActiveCategoryFilter() {
    return Boolean(clean(state.selectedMajor) || clean(state.selectedMiddle) || clean(state.selectedFormat));
  }

  function getItemsForNodeItemIds(node) {
    const ids = Array.isArray(node?.item_ids) ? node.item_ids.map(clean).filter(Boolean) : [];
    if (!ids.length) return null;

    const allowed = getFilteredItemIdSet();
    const out = [];

    for (const id of ids) {
      const item = getVisibleItemByFrontierRowId(id);
      if (!item) continue;
      if (allowed.size && !allowed.has(id)) continue;
      out.push(item);
    }

    return out;
  }

  function getScopedItemsForNode(node, level) {
    const fromIds = getItemsForNodeItemIds(node);
    if (fromIds) return fromIds;

    return getItemsForNodeSafe(node, level);
  }

  function setNodeScope(node, level) {
    const itemIds = getVisibleNodeItemIds(node);
    const scopeId = `${clean(level)}::${clean(node?.id)}::${Date.now()}`;

    state.nodeScope = {
      scopeId,
      node,
      level: clean(level),
      label: getNodeLabel(node, level),
      count: getNodeCount(node),
      itemIds,
      itemIdSet: new Set(itemIds)
    };

    return state.nodeScope;
  }

  function nodeIntersectsScope(node) {
    if (!state.nodeScope) return true;

    const nodeIds = getVisibleNodeItemIds(node);
    if (!nodeIds.length) return false;

    return nodeIds.some((id) => state.nodeScope.itemIdSet.has(clean(id)));
  }

  function getScopedHierarchyItems(level, items) {
    const source = Array.isArray(items) ? items : [];
    if (!state.nodeScope) return source;

    const scopeRank = coverageLevelRank(state.nodeScope.level);
    const currentRank = coverageLevelRank(level);

    if (scopeRank < 0 || currentRank < 0) return source;
    if (currentRank <= scopeRank) return [state.nodeScope.node];

    return source.filter(nodeIntersectsScope);
  }

  function getValidLatLngItems(items) {
    return (Array.isArray(items) ? items : []).filter((item) => {
      const lat = Number(item.lat);
      const lng = Number(item.lng);
      return Number.isFinite(lat) && Number.isFinite(lng);
    });
  }

  function detailMedianNumber(values) {
    const nums = values
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    if (!nums.length) return NaN;

    return nums[Math.floor(nums.length / 2)];
  }

  function fitDetailItemsToCenter(items) {
    const validItems = getValidLatLngItems(items);
    if (!state.map || !validItems.length) return;

    if (typeof state.map.invalidateSize === "function") {
      state.map.invalidateSize(false);
    }

    const panOnce = (latLng) => {
      state.map.panTo(latLng, {
        animate: true,
        duration: 0.26,
        easeLinearity: 0.25
      });
    };

    if (validItems.length === 1) {
      const only = validItems[0];
      panOnce([Number(only.lat), Number(only.lng)]);
      return;
    }

    const medianLat = detailMedianNumber(validItems.map((item) => Number(item.lat)));
    const medianLng = detailMedianNumber(validItems.map((item) => Number(item.lng)));

    if (Number.isFinite(medianLat) && Number.isFinite(medianLng)) {
      panOnce([medianLat, medianLng]);
      return;
    }

    const bounds = L.latLngBounds(validItems.map((item) => [Number(item.lat), Number(item.lng)]));
    panOnce(bounds.getCenter());
  }

  function getActiveRowIds() {
    return (state.activeItems || [])
      .map((item) => clean(item.__frontier_item_id))
      .filter(Boolean);
  }

  function getNodeScopeSnapshot() {
    if (!state.nodeScope) return null;

    const itemIds = Array.isArray(state.nodeScope.itemIds)
      ? state.nodeScope.itemIds.slice()
      : Array.from(state.nodeScope.itemIdSet || []);

    return {
      node: state.nodeScope.node,
      level: state.nodeScope.level,
      label: state.nodeScope.label,
      count: state.nodeScope.count,
      itemIds
    };
  }

  function makeViewSnapshot(reason = "") {
    const center = state.map?.getCenter?.();

    return {
      reason,
      center: center ? [center.lat, center.lng] : HOME_CENTER.slice(),
      zoom: state.map?.getZoom?.() ?? HOME_ZOOM,
      selectedMajor: state.selectedMajor,
      selectedMiddle: state.selectedMiddle,
      selectedFormat: state.selectedFormat,
      keyword: state.keyword,
      hasSearched: state.hasSearched,
      activeRowIds: getActiveRowIds(),
      nodeScope: getNodeScopeSnapshot(),
      notice: clean($("noticeBox")?.textContent || "")
    };
  }

  function refreshBackButton() {
    if (!state.backControlEl) return;

    const enabled = state.viewHistory.length > 0;
    state.backControlEl.disabled = !enabled;
    state.backControlEl.style.opacity = enabled ? "1" : ".42";
    state.backControlEl.style.cursor = enabled ? "pointer" : "default";
  }

  function pushViewHistory(reason = "") {
    if (!state.map || state.isRestoringHistory) return;

    state.viewHistory.push(makeViewSnapshot(reason));

    if (state.viewHistory.length > 50) {
      state.viewHistory.shift();
    }

    try {
      window.history.pushState({ frontierMapHistory: true }, "", window.location.href);
    } catch (e) {}

    refreshBackButton();
  }

  function restoreNodeScope(snapshot) {
    if (!snapshot) {
      state.nodeScope = null;
      return;
    }

    const itemIds = Array.isArray(snapshot.itemIds) ? snapshot.itemIds.map(clean).filter(Boolean) : [];

    state.nodeScope = {
      scopeId: `restored::${Date.now()}`,
      node: snapshot.node,
      level: clean(snapshot.level),
      label: clean(snapshot.label),
      count: Number(snapshot.count || itemIds.length || 0),
      itemIds,
      itemIdSet: new Set(itemIds)
    };
  }

  function goBackView() {
    if (!state.viewHistory.length) {
      refreshBackButton();
      return false;
    }

    const snapshot = state.viewHistory.pop();
    state.isRestoringHistory = true;

    state.selectedMajor = snapshot.selectedMajor || "";
    state.selectedMiddle = snapshot.selectedMiddle || "";
    state.selectedFormat = snapshot.selectedFormat || "";
    state.keyword = snapshot.keyword || "";

    const groupSelect = $("groupSelect");
    const subgroupSelect = $("subgroupSelect");
    const familySelect = $("familySelect");
    const keywordInput = $("keywordInput");

    if (groupSelect) groupSelect.value = state.selectedMajor;

    populateMiddleSelect();
    if (subgroupSelect) subgroupSelect.value = state.selectedMiddle;

    populateFormatSelect();
    if (familySelect) familySelect.value = state.selectedFormat;

    if (keywordInput) keywordInput.value = state.keyword;
    updateSearchButtonLabel();

    restoreNodeScope(snapshot.nodeScope);

    closeModal();
    clearMarkers();
    clearCoverage();

    state.map.setView(snapshot.center || HOME_CENTER, snapshot.zoom || HOME_ZOOM, { animate: false });

    const activeItems = (snapshot.activeRowIds || [])
      .map((id) => state.itemsByFrontierRowId.get(clean(id)))
      .filter(Boolean);

    if (snapshot.hasSearched && activeItems.length) {
      enterDetailMode(activeItems, {
        label: snapshot.nodeScope?.label ? `이전 선택 범위 · ${snapshot.nodeScope.label}` : "이전 상세 화면",
        totalCandidates: snapshot.nodeScope?.count || activeItems.length
      });
    } else {
      state.hasSearched = false;
      state.activeItems = [];
      renderCoverage();
    }

    setNotice("이전 단계로 돌아왔습니다.");
    refreshBackButton();

    window.setTimeout(() => {
      state.isRestoringHistory = false;
      updateZoomStatus();
    }, 80);

    return true;
  }

  function enterNodeScopeDetail() {
    if (!state.nodeScope) return false;

    const items = getScopedItemsForNode(state.nodeScope.node, state.nodeScope.level);

    if (!items.length) {
      setNotice(`${state.nodeScope.label || "선택 범위"} 안에서 표시 가능한 매체를 찾지 못했습니다. 현재 화면 기준으로 넓게 보려면 ‘현재 화면에서 검색’을 누르십시오.`, "danger");
      return true;
    }

    enterDetailMode(items, {
      label: `선택 범위 · ${state.nodeScope.label}`,
      totalCandidates: state.nodeScope.count || items.length
    });

        // v2.1.25: 반복 pan 보정 제거.

    return true;
  }

  function getItemsForNodeSafe(node, level) {
    const filtered = getFilteredItems();

    if (level === "region_group") {
      return filtered.filter((item) => getRegionGroupFromSido(getItemSido(item)) === node.region_group);
    }

    if (level === "area_group") {
      return filtered.filter((item) => {
        return (
          getRegionGroupFromSido(getItemSido(item)) === node.region_group &&
          getItemBroadAreaGroup(item) === node.area_group
        );
      });
    }

    if (level === "sigungu_cluster") {
      const members = Array.isArray(node.members) ? node.members : [];

      return filtered.filter((item) => {
        const sido = getItemSido(item);
        const sigungu = getItemMapSigungu(item);

        return members.some((member) => clean(member.sido) === sido && clean(member.sigungu) === sigungu);
      });
    }

    if (level === "sigungu") {
      return filtered.filter((item) => getItemSido(item) === node.sido && getItemMapSigungu(item) === node.sigungu);
    }

    if (level === "eupmyeondong") {
      return filtered.filter((item) => {
        return (
          getItemSido(item) === node.sido &&
          getItemMapSigungu(item) === node.sigungu &&
          clean(item.normalized_eupmyeondong) === node.eupmyeondong
        );
      });
    }

    return [];
  }

  function getCurrentHierarchySet() {
    const hierarchy = state.hierarchyData?.hierarchy;
    if (!hierarchy) return { level: null, items: [] };

    const zoom = state.map.getZoom();

    if (zoom <= REGION_MAX_ZOOM) return { level: "region_group", items: hierarchy.region_groups || [] };
    if (zoom <= AREA_MAX_ZOOM) return { level: "area_group", items: hierarchy.area_groups || [] };
    if (zoom <= SIGUNGU_CLUSTER_MAX_ZOOM) return { level: "sigungu_cluster", items: hierarchy.sigungu_clusters || [] };
    if (zoom <= SIGUNGU_MAX_ZOOM) return { level: "sigungu", items: hierarchy.sigungu || [] };
    if (zoom <= EUPMYEONDONG_MAX_ZOOM) return { level: "eupmyeondong", items: hierarchy.eupmyeondong || [] };

    return { level: null, items: [] };
  }

  function hierarchyLabel(level) {
    if (level === "region_group") return "권역";
    if (level === "area_group") return "소권역";
    if (level === "sigungu_cluster") return "지역 묶음";
    if (level === "sigungu") return "시군구";
    if (level === "eupmyeondong") return "읍면동";
    return "커버리지";
  }

  function nodeClass(level) {
    if (level === "region_group") return "is-region";
    if (level === "area_group") return "is-area";
    if (level === "sigungu_cluster") return "is-cluster";
    if (level === "sigungu") return "is-sigungu";
    if (level === "eupmyeondong") return "is-emd";
    return "";
  }

  function getNodeCount(node) {
    const rawItemIds = Array.isArray(node?.item_ids) ? node.item_ids.map(clean).filter(Boolean) : [];

    if (rawItemIds.length) {
      if (!hasActiveCategoryFilter()) {
        return getVisibleNodeItemIds(node).length;
      }

      const visibleItems = getItemsForNodeItemIds(node);
      return visibleItems ? visibleItems.length : 0;
    }

    if (state.selectedFormat) return Number(node.by_format?.[state.selectedFormat] || 0);

    if (state.selectedMiddle) {
      const aliases = MIDDLE_COUNT_ALIASES[state.selectedMiddle] || [state.selectedMiddle];
      return aliases.reduce((sum, key) => sum + Number(node.by_middle?.[key] || 0), 0);
    }

    if (state.selectedMajor) return Number(node.by_major?.[state.selectedMajor] || 0);

    return Number(node.display_count || node.count || 0);
  }

  function labelWidth(label, count) {
    const labelLen = clean(label).length;
    const countLen = numberText(count).length;
    return Math.max(78, Math.min(132, 34 + labelLen * 9 + Math.max(0, countLen - 3) * 3));
  }

  function dedupePreviewEntries(entries) {
    const seen = new Set();
    const out = [];

    for (const entry of entries || []) {
      const name = clean(entry?.name || entry?.label || entry);
      if (!name || seen.has(name)) continue;

      seen.add(name);
      out.push({
        name,
        count: Number(entry?.count || 0)
      });
    }

    return out;
  }

  function compactAreaPreviewName(value) {
    return clean(value)
      .replace(/^서울\s+/, "")
      .replace(/^경기\s+/, "")
      .replace(/^인천\s+/, "");
  }

  function collectHierarchyNodesByLevel(level) {
    const targetLevel = clean(level);
    const out = [];
    const seen = new Set();
    const root = state.hierarchyData?.hierarchy || state.hierarchyData || {};

    function walk(value) {
      if (!value) return;

      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }

      if (typeof value !== "object") return;

      const nodeLevel = clean(value.level);
      if (nodeLevel === targetLevel) {
        const key = clean(value.id || `${nodeLevel}:${value.label_for_map || value.display_label || value.name}:${value.lat}:${value.lng}`);
        if (!seen.has(key)) {
          seen.add(key);
          out.push(value);
        }
      }

      Object.values(value).forEach(walk);
    }

    walk(root);
    return out;
  }

  function getHierarchyLevelNodes(level) {
    const h = state.hierarchyData?.hierarchy || {};
    const keyMap = {
      region_group: ["region_groups", "region_group"],
      area_group: ["area_groups", "area_group"],
      sigungu_cluster: ["sigungu_clusters", "sigungu_cluster"],
      sigungu: ["sigungu", "sigungu_nodes", "sigungu_list"],
      sigungu_detail: ["sigungu_detail", "sigungu_details"],
      eupmyeondong: ["eupmyeondong", "eupmyeondongs", "emd", "dong"]
    };

    for (const key of keyMap[level] || []) {
      if (Array.isArray(h[key]) && h[key].length) return h[key];
    }

    return collectHierarchyNodesByLevel(level);
  }

  function getCoveragePreviewEntries(node, level) {
    const label = clean(node?.label_for_map || node?.display_label || node?.name || node?.area_group);
    const normalizedLevel = clean(level);
    let entries = [];

    function getNodeItemIdSet(value) {
      return new Set((Array.isArray(value?.item_ids) ? value.item_ids : []).map(clean).filter(Boolean));
    }

    const nodeItemIdSet = getNodeItemIdSet(node);

    function sharesItemIds(value) {
      if (!nodeItemIdSet.size) return false;

      for (const id of getNodeItemIdSet(value)) {
        if (nodeItemIdSet.has(id)) return true;
      }

      return false;
    }

    function areaCandidateMatches(candidate, areaLabel, regionLabel) {
      const candidateArea = clean(candidate?.area_group);
      const candidateRegion = clean(candidate?.region_group);

      if (sharesItemIds(candidate)) return true;
      if (candidateArea && candidateArea === areaLabel) return true;

      if (areaLabel === "서울권") return candidateArea.startsWith("서울 ");
      if (areaLabel === "경기권") return candidateArea.startsWith("경기 ");
      if (areaLabel === "인천권") return candidateArea === "인천권";

      if (regionLabel && candidateRegion === regionLabel) return true;

      return false;
    }

    function entriesFromMembers(value) {
      if (!Array.isArray(value?.members) || !value.members.length) return [];

      return value.members
        .map((member) => ({
          name: clean(member.sigungu_detail || member.sigungu || member.name),
          count: Number(member.count || 0)
        }))
        .filter((entry) => entry.name);
    }

    function entriesFromClusterForArea(cluster, areaLabel) {
      const compactArea = compactAreaPreviewName(areaLabel);
      const clusterArea = compactAreaPreviewName(cluster.area_group);

      if (clusterArea && clusterArea !== compactArea && clusterArea !== label) {
        return [{
          name: clusterArea,
          count: getNodeCount(cluster)
        }];
      }

      const memberEntries = entriesFromMembers(cluster);
      if (memberEntries.length) return memberEntries;

      if (Array.isArray(cluster.member_names) && cluster.member_names.length) {
        return cluster.member_names
          .map((name) => ({ name: clean(name), count: 0 }))
          .filter((entry) => entry.name);
      }

      const fallbackName = compactAreaPreviewName(cluster.label_for_map || cluster.display_label || cluster.name || cluster.sigungu);
      if (fallbackName && fallbackName !== compactArea && fallbackName !== label) {
        return [{
          name: fallbackName,
          count: getNodeCount(cluster)
        }];
      }

      return [];
    }

    function entriesFromNodeItems() {
      const items = getItemsForNodeItemIds(node) || [];
      const grouped = new Map();

      for (const item of items) {
        const name = clean(
          getItemDetailSigungu(item) ||
          getItemMapSigungu(item) ||
          item.normalized_sigungu ||
          item.sigungu ||
          item.normalized_eupmyeondong
        );

        if (!name) continue;
        grouped.set(name, (grouped.get(name) || 0) + 1);
      }

      return Array.from(grouped.entries()).map(([name, count]) => ({ name, count }));
    }

    if (normalizedLevel === "region_group") {
      entries = getHierarchyLevelNodes("area_group")
        .filter((area) => clean(area.region_group) === clean(node.region_group || label))
        .map((area) => ({
          name: compactAreaPreviewName(area.label_for_map || area.display_label || area.name || area.area_group),
          count: getNodeCount(area)
        }));
    }

    if (normalizedLevel === "area_group") {
      const areaLabel = clean(node.area_group || node.label_for_map || node.display_label || node.name || label);
      const regionLabel = clean(node.region_group);

      const clusters = getHierarchyLevelNodes("sigungu_cluster")
        .filter((cluster) => areaCandidateMatches(cluster, areaLabel, regionLabel));

      entries = clusters.flatMap((cluster) => entriesFromClusterForArea(cluster, areaLabel));

      if (!entries.length) {
        entries = getHierarchyLevelNodes("sigungu")
          .filter((sigungu) => areaCandidateMatches(sigungu, areaLabel, regionLabel))
          .map((sigungu) => ({
            name: clean(sigungu.label_for_map || sigungu.display_label || sigungu.name || sigungu.sigungu),
            count: getNodeCount(sigungu)
          }));
      }

      if (!entries.length) {
        entries = entriesFromNodeItems();
      }
    }

    if (normalizedLevel === "sigungu_cluster") {
      entries = entriesFromMembers(node);

      if (!entries.length && Array.isArray(node.member_names)) {
        entries = node.member_names.map((name) => ({ name, count: 0 }));
      }
    }

    if (normalizedLevel === "sigungu" || normalizedLevel === "sigungu_detail") {
      entries = getHierarchyLevelNodes("eupmyeondong")
        .filter((emd) => (
          clean(emd.sido) === clean(node.sido) &&
          clean(emd.sigungu) === clean(node.sigungu)
        ))
        .map((emd) => ({
          name: clean(emd.label_for_map || emd.display_label || emd.name || emd.eupmyeondong),
          count: getNodeCount(emd)
        }));
    }

    if (normalizedLevel === "eupmyeondong") {
      entries = [];
    }

    return dedupePreviewEntries(entries)
      .filter((entry) => entry.name && entry.name !== label)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));
  }

  function createCoveragePreviewHtml(node, level) {
    const entries = getCoveragePreviewEntries(node, level);

    if (!entries.length) return "";

    const visible = entries.slice(0, 4);
    const more = Math.max(0, entries.length - visible.length);

    return `
          <div class="coverage-preview">
            <div class="coverage-preview-title">INCLUDED AREA</div>
            <div class="coverage-preview-grid">
              ${visible.map((entry) => `<span class="coverage-preview-item">${esc(entry.name)}</span>`).join("")}
            </div>
            ${more > 0 ? `<div class="coverage-preview-more">외 ${numberText(more)}곳</div>` : ""}
          </div>
    `;
  }

  function getCoverageDisplayLabel(node, level) {
    const areaGroup = clean(node?.area_group);

    if (level === "sigungu_cluster" && areaGroup.startsWith("서울 ")) {
      return areaGroup;
    }

    return clean(node?.label_for_map || node?.display_label || node?.name || hierarchyLabel(level));
  }

  let floatingCoveragePreviewEl = null;

  function ensureFloatingCoveragePreviewStyle() {
    if (document.getElementById("frontier-v2-floating-preview-style")) return;

    const style = document.createElement("style");
    style.id = "frontier-v2-floating-preview-style";
    style.textContent = `
      .coverage-label .coverage-preview {
        display: block;
      }

      .coverage-label .coverage-preview { display: block; }

      .frontier-floating-preview {
        position: fixed;
        width: 176px;
        max-width: 176px;
        padding: 9px 10px 10px;
        border-radius: 13px;
        border: 1px solid rgba(162, 222, 204, .58);
        background: rgba(5, 13, 12, .96);
        box-shadow: 0 18px 44px rgba(0,0,0,.42);
        color: rgba(234, 255, 248, .94);
        z-index: 2147483000;
        pointer-events: none;
        box-sizing: border-box;
        backdrop-filter: blur(10px);
      }

      .frontier-floating-preview-title {
        margin-bottom: 6px;
        font-size: 9px;
        font-weight: 900;
        color: rgba(162, 222, 204, .98);
        letter-spacing: .04em;
      }

      .frontier-floating-preview-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 5px 6px;
      }

      .frontier-floating-preview-item {
        min-width: 0;
        padding: 4px 5px;
        border-radius: 7px;
        background: rgba(255,255,255,.06);
        color: rgba(234,255,248,.92);
        font-size: 10px;
        font-weight: 850;
        letter-spacing: -.045em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: center;
      }

      .frontier-floating-preview-more {
        margin-top: 6px;
        font-size: 10px;
        font-weight: 850;
        color: rgba(234,255,248,.68);
        text-align: right;
      }
    `;
    document.head.appendChild(style);
  }

  function hideFloatingCoveragePreview() {
    if (floatingCoveragePreviewEl) {
      floatingCoveragePreviewEl.remove();
      floatingCoveragePreviewEl = null;
    }
  }

  function showFloatingCoveragePreview(node, level, marker) {
    // v2.1.25: floating preview는 마우스와 떨어져 보이고 동작이 부자연스러워 비활성화.
    // 카드 내부 preview만 사용한다.
    return;
  }

  function createCoverageIcon(node, count, level) {
    const label = getCoverageDisplayLabel(node, level);
    const width = labelWidth(label, count);
    const height = 52;
    const previewHtml = createCoveragePreviewHtml(node, level);

    return L.divIcon({
      className: "",
      html: `
        <div class="coverage-label ${nodeClass(level)}" style="--label-width:${width}px">
          <small>${esc(label)}</small>
          <b>${numberText(count)}</b>
          ${previewHtml}
        </div>
      `,
      iconSize: [width, height],
      iconAnchor: [width / 2, height / 2]
    });
  }

  function maxNodesForLevel(level) {
    if (level === "region_group") return 10;
    if (level === "area_group") return 28;
    if (level === "sigungu_cluster") return 40;
    if (level === "sigungu") return 56;
    if (level === "eupmyeondong") return 72;
    return 40;
  }

  function minGapForLevel(level) {
    if (level === "region_group") return 92;
    if (level === "area_group") return 84;
    if (level === "sigungu_cluster") return 78;
    if (level === "sigungu") return 68;
    if (level === "eupmyeondong") return 56;
    return 70;
  }

  function getCoverageNodeLatLng(node, level) {
    const label = clean(node.label_for_map || node.display_label || node.name || node.area_group);

    if (level === "area_group") {
      const fixed = {
        // 수도권 소권역 라벨은 실제 행정 중심보다 화면 식별성을 우선한다.
        // 서울권은 오른쪽/상단으로, 인천권은 왼쪽/하단으로 분리해 겹침을 줄인다.
        "서울권": [37.6150, 127.0800],
        "경기권": [37.2550, 127.1650],
        "인천권": [37.3350, 126.4550]
      };

      if (fixed[label]) return fixed[label];
    }

    return [Number(node.lat), Number(node.lng)];
  }

  function declutterNodes(nodes, level) {
    if (level === "region_group" || level === "area_group") return nodes;

    const selected = [];
    const max = maxNodesForLevel(level);
    const minGap = minGapForLevel(level);

    const candidates = nodes.slice().sort((a, b) => getNodeCount(b) - getNodeCount(a));

    for (const node of candidates) {
      if (selected.length >= max) break;

      const point = state.map.latLngToContainerPoint(getCoverageNodeLatLng(node, level));
      const overlap = selected.some((picked) => {
        const dx = point.x - picked.__point.x;
        const dy = point.y - picked.__point.y;
        return Math.sqrt(dx * dx + dy * dy) < minGap;
      });

      if (overlap) continue;

      selected.push({ ...node, __point: point });
    }

    return selected.map((node) => {
      const copy = { ...node };
      delete copy.__point;
      return copy;
    });
  }

  function boundsFromNode(node) {
    const b = node?.bounds;
    if (!b) return null;

    const south = Number(b.south);
    const west = Number(b.west);
    const north = Number(b.north);
    const east = Number(b.east);

    if (![south, west, north, east].every(Number.isFinite)) return null;

    if (Math.abs(north - south) < 0.0001 && Math.abs(east - west) < 0.0001) {
      return null;
    }

    return L.latLngBounds([south, west], [north, east]);
  }

  function nextZoomForLevel(level) {
    if (level === "region_group") return 8;
    if (level === "area_group") return 10;
    if (level === "sigungu_cluster") return 12;
    if (level === "sigungu") return 14;
    if (level === "eupmyeondong") return DETAIL_AUTO_ZOOM;
    return Math.min(state.map.getZoom() + 2, DETAIL_AUTO_ZOOM);
  }

  function flyToNextStage(center, targetZoom) {
    const currentZoom = state.map.getZoom();
    const safeZoom = Math.min(Math.max(targetZoom, currentZoom + 1), DETAIL_AUTO_ZOOM);

    state.map.flyTo(center, safeZoom, {
      animate: true,
      duration: 0.45,
      easeLinearity: 0.25
    });
  }

  function normalizeNodeLabelForMatch(value) {
    return clean(value)
      .replace(/^인천\s+/, "")
      .replace(/^서울\s+/, "")
      .replace(/^경기\s+/, "")
      .replace(/\s+/g, "")
      .replace(/[()]/g, "");
  }

  function getNodeCandidateLabels(node) {
    return [
      node.label_for_map,
      node.display_label,
      node.name,
      node.region_group,
      node.area_group,
      node.sigungu,
      node.detail_sigungu,
      node.map_sigungu,
      node.eupmyeondong,
      node.detail_eupmyeondong,
      node.map_eupmyeondong
    ]
      .map(normalizeNodeLabelForMatch)
      .filter(Boolean);
  }

  function getItemAreaTextForFallback(item) {
    return normalizeNodeLabelForMatch([
      item.normalized_sido,
      item.sido,
      item.normalized_sigungu,
      item.sigungu,
      item.normalized_eupmyeondong,
      item.eupmyeondong,
      item.display_address,
      item.address
    ].filter(Boolean).join(" "));
  }

  function getFallbackItemsForNode(node, level) {
    const labels = getNodeCandidateLabels(node);
    const filtered = getFilteredItems();

    let matched = [];

    if (labels.length) {
      matched = filtered.filter((item) => {
        const areaText = getItemAreaTextForFallback(item);
        return labels.some((label) => label && areaText.includes(label));
      });
    }

    if (matched.length) return matched;

    const lat = Number(node.lat);
    const lng = Number(node.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

    const radiusKm =
      level === "sigungu" ? 35 :
      level === "eupmyeondong" ? 8 :
      level === "sigungu_cluster" ? 55 :
      80;

    return filtered.filter((item) => {
      const itemLat = Number(item.lat);
      const itemLng = Number(item.lng);
      if (!Number.isFinite(itemLat) || !Number.isFinite(itemLng)) return false;

      const dx = (itemLat - lat) * 111;
      const dy = (itemLng - lng) * 88;
      const distanceKm = Math.sqrt(dx * dx + dy * dy);

      return distanceKm <= radiusKm;
    });
  }

  function getItemsForNodeSafe(node, level) {
    const directItems = getItemsForNode(node, level);

    if (directItems.length) return directItems;

    const fallbackItems = getFallbackItemsForNode(node, level);

    if (fallbackItems.length) {
      console.warn("[FRONTIER MAP] node fallback used", {
        level,
        label: node.label_for_map || node.display_label || node.name,
        count: getNodeCount(node),
        fallbackCount: fallbackItems.length
      });
    }

    return fallbackItems;
  }

  function medianNumber(values) {
    const nums = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!nums.length) return NaN;
    return nums[Math.floor(nums.length / 2)];
  }

  function getDenseCoreItems(items) {
    const source = Array.isArray(items) ? items : [];

    if (source.length <= 25) return source;

    const points = source
      .map((item) => ({
        item,
        lat: Number(item.lat),
        lng: Number(item.lng)
      }))
      .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng));

    if (points.length <= 25) return source;

    const centerLat = medianNumber(points.map((x) => x.lat));
    const centerLng = medianNumber(points.map((x) => x.lng));

    if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) return source;

    const keepCount = Math.max(25, Math.ceil(points.length * 0.88));

    return points
      .map((x) => ({
        ...x,
        distance: Math.sqrt(
          Math.pow((x.lat - centerLat) * 111, 2) +
          Math.pow((x.lng - centerLng) * 88, 2)
        )
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, keepCount)
      .map((x) => x.item);
  }

  function getCoreItemsForNodeView(node, level, items) {
    const source = Array.isArray(items) ? items : [];

    if (source.length < 2) return source;

    if (level === "sigungu_cluster" && Array.isArray(node?.members) && node.members.length >= 3) {
      const members = node.members
        .slice()
        .sort((a, b) => Number(b.count || 0) - Number(a.count || 0));

      const total = members.reduce((sum, member) => sum + Number(member.count || 0), 0);
      const picked = [];
      let pickedCount = 0;

      for (const member of members) {
        if (picked.length < 4 || pickedCount < total * 0.9) {
          picked.push(clean(member.sigungu));
          pickedCount += Number(member.count || 0);
        }
      }

      const pickedSet = new Set(picked.filter(Boolean));
      const core = source.filter((item) => pickedSet.has(getItemMapSigungu(item)));

      if (core.length >= 2) return getDenseCoreItems(core);
    }

    return getDenseCoreItems(source);
  }

  function fitToNode(node, level) {
    const currentZoom = state.map.getZoom();
    const targetZoom = nextZoomForLevel(level);
    const scopedItems = getScopedItemsForNode(node, level);

    if (level === "eupmyeondong" && scopedItems.length) {
      const validItems = scopedItems
        .map((item) => ({
          lat: Number(item.lat),
          lng: Number(item.lng)
        }))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));

      if (validItems.length) {
        const sortedLat = validItems.map((point) => point.lat).sort((a, b) => a - b);
        const sortedLng = validItems.map((point) => point.lng).sort((a, b) => a - b);
        const medianLat = sortedLat[Math.floor(sortedLat.length / 2)];
        const medianLng = sortedLng[Math.floor(sortedLng.length / 2)];

        flyToNextStage([medianLat, medianLng], targetZoom);
        return;
      }
    }

    const focusItems = getCoreItemsForNodeView(node, level, scopedItems);

    if (focusItems.length >= 2) {
      const itemBounds = L.latLngBounds(focusItems.map((item) => [Number(item.lat), Number(item.lng)]));
      const fitZoom = state.map.getBoundsZoom(itemBounds.pad(0.18), false);

      if (Number.isFinite(fitZoom) && fitZoom >= targetZoom) {
        state.map.fitBounds(itemBounds.pad(0.18), {
          maxZoom: targetZoom,
          animate: true,
          duration: 0.45,
          easeLinearity: 0.25
        });
        return;
      }

      flyToNextStage(itemBounds.getCenter(), targetZoom);
      return;
    }

    if (focusItems.length === 1) {
      const only = focusItems[0];
      flyToNextStage([Number(only.lat), Number(only.lng)], targetZoom);
      return;
    }

    const nodeBounds = boundsFromNode(node);

    if (nodeBounds) {
      const center = nodeBounds.getCenter();
      const fitZoom = state.map.getBoundsZoom(nodeBounds.pad(0.20), false);

      if (Number.isFinite(fitZoom) && fitZoom >= targetZoom) {
        state.map.fitBounds(nodeBounds.pad(0.20), {
          maxZoom: targetZoom,
          animate: true,
          duration: 0.45,
          easeLinearity: 0.25
        });
        return;
      }

      flyToNextStage(center, targetZoom);
      return;
    }

    const items = getItemsForNodeSafe(node, level);

    if (items.length >= 2) {
      const itemBounds = L.latLngBounds(items.map((item) => [Number(item.lat), Number(item.lng)]));
      const center = itemBounds.getCenter();
      const fitZoom = state.map.getBoundsZoom(itemBounds.pad(0.20), false);

      if (Number.isFinite(fitZoom) && fitZoom >= targetZoom) {
        state.map.fitBounds(itemBounds.pad(0.20), {
          maxZoom: targetZoom,
          animate: true,
          duration: 0.45,
          easeLinearity: 0.25
        });
        return;
      }

      flyToNextStage(center, targetZoom);
      return;
    }

    flyToNextStage([Number(node.lat), Number(node.lng)], targetZoom);
  }

  function clearMarkers() {
    if (state.markers) state.markers.clearLayers();
    clearOffscreenCoverageIndicators();
  }

  function ensureOffscreenCoverageIndicatorStyle() {
    if (document.getElementById("frontier-v2-offscreen-coverage-style")) return;

    const style = document.createElement("style");
    style.id = "frontier-v2-offscreen-coverage-style";
    style.textContent = `
      .frontier-offscreen-coverage {
        position: absolute;
        inset: 0;
        z-index: 850;
        pointer-events: none;
      }

      .frontier-offscreen-coverage-btn {
        position: absolute;
        min-width: 88px;
        height: 30px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px dashed rgba(162, 222, 204, .72);
        background: rgba(8, 19, 17, .70);
        color: rgba(234, 255, 248, .92);
        font-size: 10.5px;
        font-weight: 900;
        letter-spacing: -.02em;
        box-shadow:
          0 8px 20px rgba(0, 0, 0, .22),
          0 0 0 1px rgba(255, 255, 255, .045) inset,
          0 0 14px rgba(162, 222, 204, .16);
        backdrop-filter: blur(10px);
        cursor: pointer;
        pointer-events: auto;
        white-space: nowrap;
        transition: transform .12s ease, border-color .12s ease, background .12s ease, box-shadow .12s ease;
      }

      .frontier-offscreen-coverage-btn:hover {
        border-color: rgba(210, 255, 242, .96);
        background: rgba(16, 36, 31, .82);
        box-shadow:
          0 12px 26px rgba(0, 0, 0, .30),
          0 0 0 1px rgba(255, 255, 255, .075) inset,
          0 0 22px rgba(162, 222, 204, .28);
      }

      .frontier-offscreen-coverage-btn[data-dir="left"] {
        left: 14px;
        top: 50%;
        transform: translateY(-50%);
      }

      .frontier-offscreen-coverage-btn[data-dir="right"] {
        right: 14px;
        top: 50%;
        transform: translateY(-50%);
      }

      .frontier-offscreen-coverage-btn[data-dir="top"] {
        left: 50%;
        top: 90px;
        transform: translateX(-50%);
      }

      .frontier-offscreen-coverage-btn[data-dir="bottom"] {
        left: 50%;
        bottom: 14px;
        transform: translateX(-50%);
      }

      .frontier-offscreen-coverage-btn[data-dir="left"]:hover {
        transform: translateY(-50%) scale(1.045);
      }

      .frontier-offscreen-coverage-btn[data-dir="right"]:hover {
        transform: translateY(-50%) scale(1.045);
      }

      .frontier-offscreen-coverage-btn[data-dir="top"]:hover,
      .frontier-offscreen-coverage-btn[data-dir="bottom"]:hover {
        transform: translateX(-50%) scale(1.045);
      }

      .frontier-offscreen-coverage-btn small {
        display: inline-block;
        margin-left: 4px;
        color: rgba(210, 255, 242, .95);
        font-size: 10px;
        font-weight: 900;
      }
    `;

    document.head.appendChild(style);
  }

  function clearOffscreenCoverageIndicators() {
    if (state.offscreenCoverageIndicatorEl) {
      state.offscreenCoverageIndicatorEl.remove();
      state.offscreenCoverageIndicatorEl = null;
    }
  }

  function getOffscreenCoverageDirection(point, width, height) {
    const outsideLeft = point.x < 0;
    const outsideRight = point.x > width;
    const outsideTop = point.y < 0;
    const outsideBottom = point.y > height;

    if (!outsideLeft && !outsideRight && !outsideTop && !outsideBottom) return "";

    const distances = [
      { dir: "left", value: outsideLeft ? Math.abs(point.x) : 0 },
      { dir: "right", value: outsideRight ? Math.abs(point.x - width) : 0 },
      { dir: "top", value: outsideTop ? Math.abs(point.y) : 0 },
      { dir: "bottom", value: outsideBottom ? Math.abs(point.y - height) : 0 }
    ].sort((a, b) => b.value - a.value);

    return distances[0]?.value > 0 ? distances[0].dir : "";
  }

  function getOffscreenDirectionLabel(dir) {
    if (dir === "left") return "←";
    if (dir === "right") return "→";
    if (dir === "top") return "↑";
    if (dir === "bottom") return "↓";
    return "•";
  }

  function updateOffscreenCoverageIndicators(nodes, level) {
    clearOffscreenCoverageIndicators();

    if (!state.map || state.hasSearched) return;
    if (!Array.isArray(nodes) || !nodes.length) return;

    const container = state.map.getContainer?.();
    if (!container) return;

    const width = container.clientWidth || 0;
    const height = container.clientHeight || 0;
    if (width <= 0 || height <= 0) return;

    const groups = {
      left: { count: 0, lat: 0, lng: 0, labels: [] },
      right: { count: 0, lat: 0, lng: 0, labels: [] },
      top: { count: 0, lat: 0, lng: 0, labels: [] },
      bottom: { count: 0, lat: 0, lng: 0, labels: [] }
    };

    for (const node of nodes) {
      const [lat, lng] = getCoverageNodeLatLng(node, level);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const point = state.map.latLngToContainerPoint([lat, lng]);
      const dir = getOffscreenCoverageDirection(point, width, height);
      if (!dir || !groups[dir]) continue;

      groups[dir].count += 1;
      groups[dir].lat += lat;
      groups[dir].lng += lng;

      if (groups[dir].labels.length < 4) {
        groups[dir].labels.push(getCoverageDisplayLabel(node, level));
      }
    }

    const activeGroups = Object.entries(groups).filter(([, value]) => value.count > 0);
    if (!activeGroups.length) return;

    ensureOffscreenCoverageIndicatorStyle();

    const overlay = document.createElement("div");
    overlay.className = "frontier-offscreen-coverage";
    overlay.setAttribute("aria-label", "화면 밖 커버리지 안내");

    for (const [dir, value] of activeGroups) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "frontier-offscreen-coverage-btn";
      btn.dataset.dir = dir;

      const labelText = value.labels.filter(Boolean).join(", ");
      btn.title = labelText
        ? `화면 ${dir} 방향에 ${value.count}개 카드가 있습니다: ${labelText}`
        : `화면 ${dir} 방향에 ${value.count}개 카드가 있습니다.`;

      btn.innerHTML = `${getOffscreenDirectionLabel(dir)} <small>화면 밖 ${numberText(value.count)}곳</small>`;

      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const targetLat = value.lat / value.count;
        const targetLng = value.lng / value.count;

        if (Number.isFinite(targetLat) && Number.isFinite(targetLng)) {
          state.map.panTo([targetLat, targetLng], {
            animate: true,
            duration: 0.34,
            easeLinearity: 0.25
          });
        }
      });

      overlay.appendChild(btn);
    }

    container.appendChild(overlay);
    state.offscreenCoverageIndicatorEl = overlay;
  }
  function updateOffscreenDetailPinIndicators(items) {
    clearOffscreenCoverageIndicators();

    if (!state.map) return;
    if (!Array.isArray(items) || !items.length) return;

    const container = state.map.getContainer?.();
    if (!container) return;

    const width = container.clientWidth || 0;
    const height = container.clientHeight || 0;
    if (width <= 0 || height <= 0) return;

    const groups = {
      left: { count: 0, lat: 0, lng: 0, labels: [] },
      right: { count: 0, lat: 0, lng: 0, labels: [] },
      top: { count: 0, lat: 0, lng: 0, labels: [] },
      bottom: { count: 0, lat: 0, lng: 0, labels: [] }
    };

    for (const item of items) {
      const lat = Number(item?.lat);
      const lng = Number(item?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const point = state.map.latLngToContainerPoint([lat, lng]);
      const dir = getOffscreenCoverageDirection(point, width, height);
      if (!dir || !groups[dir]) continue;

      groups[dir].count += 1;
      groups[dir].lat += lat;
      groups[dir].lng += lng;

      if (groups[dir].labels.length < 4) {
        groups[dir].labels.push(getItemTitle(item));
      }
    }

    const activeGroups = Object.entries(groups).filter(([, value]) => value.count > 0);
    if (!activeGroups.length) return;

    ensureOffscreenCoverageIndicatorStyle();

    const overlay = document.createElement("div");
    overlay.className = "frontier-offscreen-coverage";
    overlay.setAttribute("aria-label", "화면 밖 상세 매체 안내");

    for (const [dir, value] of activeGroups) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "frontier-offscreen-coverage-btn";
      btn.dataset.dir = dir;

      const labelText = value.labels.filter(Boolean).join(", ");
      btn.title = labelText
        ? `화면 ${dir} 방향에 상세 매체 ${value.count}개가 있습니다: ${labelText}`
        : `화면 ${dir} 방향에 상세 매체 ${value.count}개가 있습니다.`;

      btn.innerHTML = `${getOffscreenDirectionLabel(dir)} <small>화면 밖 매체 ${numberText(value.count)}곳</small>`;

      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const targetLat = value.lat / value.count;
        const targetLng = value.lng / value.count;

        if (Number.isFinite(targetLat) && Number.isFinite(targetLng)) {
          state.map.panTo([targetLat, targetLng], {
            animate: true,
            duration: 0.34,
            easeLinearity: 0.25
          });
        }
      });

      overlay.appendChild(btn);
    }

    container.appendChild(overlay);
    state.offscreenCoverageIndicatorEl = overlay;
  }
  function clearCoverage() {
    if (state.coverageLayer) state.coverageLayer.clearLayers();
    clearOffscreenCoverageIndicators();
  }

  function updateStats(total, shown) {
    $("statTotal").textContent = numberText(total);
    $("statShown").textContent = numberText(shown);
    $("resultCount").textContent = `${numberText(shown)}개`;
  }

  function enterCoverageMode(message) {
    state.hasSearched = false;
    state.activeItems = [];
    state.movedAfterSearch = false;

    clearMarkers();
    closeModal();

    const list = $("resultList");
    if (list) list.innerHTML = "";

    updateStats(getFilteredItems().length, nodes.length);
    if (message) setNotice(message);
    renderCoverage();
  }

  function shouldHideCoverageNode(node, level, count) {
    const label = clean(node.label_for_map || node.display_label || node.name);

    if (!label || label === "미분류") return true;

    // 옹진군은 백령도/영흥도 등 소수·원거리 섬 매체가 섞여 있어
    // 현재 계층 탐색에서는 클릭 시 바다/빈 화면 오류를 유발한다.
    // 데이터는 유지하되, 지도 탐색 라벨에서는 숨긴다.
    if (label.includes("옹진군")) return true;

    const widePollutionNames = [
      "서울시", "서울특별시",
      "부산시", "부산광역시",
      "대구시", "대구광역시",
      "인천시", "인천광역시",
      "광주시", "광주광역시",
      "대전시", "대전광역시",
      "울산시", "울산광역시",
      "세종시", "세종특별자치시",
      "경기도",
      "강원도", "강원특별자치도",
      "충청북도", "충청남도",
      "전라북도", "전라남도",
      "경상북도", "경상남도",
      "제주도", "제주특별자치도"
    ];

    if (widePollutionNames.includes(label)) return true;

    // 시군구/읍면동 단계에서 1개짜리 단독 라벨은 혼란을 주므로 숨긴다.
    // 데이터 삭제가 아니라 상위 묶음 count에는 포함되고, 상세 핀 단계에서 확인 가능하다.
    if (level === "sigungu" && Number(count || 0) <= 1) {
      return true;
    }

    if (level === "eupmyeondong") {
      if (/[()]/.test(label)) return true;
      if (/^[0-9]/.test(label)) return true;
      if (/번길|대로|층|B\d|F\d*|빌딩|상가|센터|타워|본관|별관/i.test(label)) return true;
      if (/\d+\s*호/.test(label)) return true;
      if (/\d+.*(길|로)/.test(label)) return true;
    }

    return false;
  }

  function isSparseLowValueCluster(node, level) {
    if (level !== "sigungu_cluster") return false;

    const count = getNodeCount(node);
    const label = getCoverageDisplayLabel(node, level);
    const memberCount = Number(node?.member_count || (Array.isArray(node?.members) ? node.members.length : 0));

    if (count <= 10 && memberCount >= 3 && /외\s*\d+곳/.test(label)) return true;

    return false;
  }

  function shouldBypassDeclutterForSeoul(level) {
    if (!state.nodeScope) return false;

    const scopeLevel = clean(state.nodeScope.level);
    const scopeLabel = clean(state.nodeScope.label);
    const scopeAreaGroup = normalizeSeoulAreaGroupName(state.nodeScope.node?.area_group);

    if (level === "sigungu_cluster" && scopeLevel === "area_group" && scopeLabel === "서울권") return true;
    if (level === "sigungu" && scopeLevel === "sigungu_cluster" && scopeAreaGroup.startsWith("서울 ")) return true;

    return false;
  }

  function mergeUniqueItemIdsFromNodes(nodes) {
    const seen = new Set();
    const out = [];

    for (const node of nodes || []) {
      for (const id of node.item_ids || []) {
        const cleanId = clean(id);
        if (!cleanId || seen.has(cleanId)) continue;
        seen.add(cleanId);
        out.push(cleanId);
      }
    }

    return out;
  }

  function normalizeSeoulAreaGroupName(areaGroup) {
    const cleanArea = clean(areaGroup);
    if (cleanArea === "서울 강북권") return "서울 강북권";
    return cleanArea;
  }

  function buildSeoulAreaClusterNodes(rawNodes, level) {
    if (level !== "sigungu_cluster") return rawNodes;
    if (!state.nodeScope) return rawNodes;
    if (clean(state.nodeScope.level) !== "area_group") return rawNodes;
    if (clean(state.nodeScope.label) !== "서울권") return rawNodes;

    const fixed = {
      "서울 서북권": [37.6100, 126.8750],
      "서울 강북권": [37.5600, 127.0000],
      "서울 동북권": [37.6100, 127.1300],
      "서울 서남권": [37.4850, 126.8850],
      "서울 강남권": [37.4700, 127.0800]
    };

    const groups = new Map();

    for (const node of rawNodes || []) {
      const areaGroup = normalizeSeoulAreaGroupName(node.area_group);
      if (!areaGroup.startsWith("서울 ")) continue;

      if (!groups.has(areaGroup)) groups.set(areaGroup, []);
      groups.get(areaGroup).push(node);
    }

    if (!groups.size) return rawNodes;

    return Array.from(groups.entries())
      .map(([areaGroup, nodes]) => {
        const count = nodes.reduce((sum, node) => sum + getNodeCount(node), 0);
        const itemIds = mergeUniqueItemIdsFromNodes(nodes);
        const members = nodes.flatMap((node) => Array.isArray(node.members) ? node.members : []);
        const memberNames = [];

        for (const member of members) {
          const name = clean(member.sigungu_detail || member.sigungu || member.name);
          if (name && !memberNames.includes(name)) memberNames.push(name);
        }

        const pos = fixed[areaGroup] || [Number(nodes[0]?.lat || 37.5665), Number(nodes[0]?.lng || 126.9780)];

        return {
          ...nodes[0],
          id: `seoul_area_cluster:${areaGroup}`,
          level: "sigungu_cluster",
          name: areaGroup,
          display_label: areaGroup,
          label_for_map: areaGroup,
          area_group: areaGroup,
          count,
          display_count: count,
          item_ids: itemIds,
          item_count: itemIds.length || count,
          member_count: memberNames.length || members.length,
          member_names: memberNames,
          members,
          lat: pos[0],
          lng: pos[1]
        };
      })
      .sort((a, b) => {
        const order = ["서울 서북권", "서울 강북권", "서울 동북권", "서울 서남권", "서울 강남권"];
        return order.indexOf(a.area_group) - order.indexOf(b.area_group);
      });
  }

  function getDeclutteredCoverageNodes(rawNodes, level) {
    const mergedNodes = buildSeoulAreaClusterNodes(Array.isArray(rawNodes) ? rawNodes : [], level);
    const source = mergedNodes.filter((node) => !isSparseLowValueCluster(node, level));

    const scopedLevel = clean(state.nodeScope?.level);
    const isScopedChildLevel = state.nodeScope && coverageLevelRank(level) > coverageLevelRank(scopedLevel);

    if (shouldBypassDeclutterForSeoul(level)) return source;

    // 특정 범위 안으로 진입한 뒤 읍면동 단계에서는 1개짜리 하위 카드도 숨기지 않는다.
    // 예: 제주시 > 이호동, 중구 > 명동처럼 작은 노드가 declutter에 밀려 사라지는 것을 방지한다.
    if (isScopedChildLevel && level === "eupmyeondong") return source;

    return declutterNodes(source, level);
  }


  function getJejuSkipTargetLevel(node, level) {
    const label = getNodeLabel(node, level);
    const regionGroup = clean(node?.region_group);
    const areaGroup = clean(node?.area_group);
    const sido = clean(node?.sido);

    // 제주권 첫 클릭에서 같은 이름의 area_group '제주권'을 건너뛰고
    // 바로 제주시/서귀포시 카드(sigungu_cluster)로 보낸다.
    if (level === "region_group" && label === "제주권") {
      return "area_group";
    }

    // 제주 제주시/서귀포시 sigungu_cluster 클릭 시
    // 동일한 이름의 sigungu 단계를 건너뛰고 바로 읍면동으로 보낸다.
    if (
      level === "sigungu_cluster" &&
      regionGroup === "제주권" &&
      areaGroup === "제주권" &&
      sido === "제주" &&
      (label === "제주시" || label === "서귀포시")
    ) {
      return "sigungu";
    }

    return level;
  }

  function fitToNodeForCoverageClick(node, level) {
    const targetLevel = getJejuSkipTargetLevel(node, level);

    if (targetLevel === level) {
      fitToNode(node, level);
      return;
    }

    const center = getCoverageNodeLatLng(node, level);
    const targetZoom = nextZoomForLevel(targetLevel);

    if (Array.isArray(center) && center.every((v) => Number.isFinite(Number(v)))) {
      flyToNextStage(center, targetZoom);
      return;
    }

    fitToNode(node, level);
  }

  function removeNativeCoverageTitle(marker) {
    if (!marker) return;

    marker.on("add", () => {
      const el = marker.getElement && marker.getElement();
      if (el) el.removeAttribute("title");
    });
  }

  function renderCoverage() {
    if (!state.coverageLayer || !state.hierarchyData) return;

    updateZoomStatus();
    clearCoverage();

    if (state.hasSearched) return;

    const currentHierarchy = getCurrentHierarchySet();
    const level = currentHierarchy.level;
    const items = getScopedHierarchyItems(level, currentHierarchy.items);

    if (!level || !items.length) {
      if (state.nodeScope && enterNodeScopeDetail()) return;
      autoEnterDetailMode();
      return;
    }

    clearMarkers();

    const bounds = getStableMapBounds().pad(0.12);
    const rawNodes = items.filter((node) => {
      const [lat, lng] = getCoverageNodeLatLng(node, level);
      const count = getNodeCount(node);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
      if (count <= 0) return false;
      if (shouldHideCoverageNode(node, level, count)) return false;
      const shouldApplyViewportBounds = !state.nodeScope && level !== "region_group";
      if (shouldApplyViewportBounds && !bounds.contains([lat, lng])) return false;

      return true;
    });

    const nodes = getDeclutteredCoverageNodes(rawNodes, level);

    if (state.nodeScope && !nodes.length && coverageLevelRank(level) > coverageLevelRank(state.nodeScope.level)) {
      enterNodeScopeDetail();
      setNotice(`${state.nodeScope.label || "선택 범위"}는 하위 카드가 부족해 상세 매체로 바로 표시했습니다. 주변 매체까지 보려면 ‘현재 화면에서 검색’을 누르십시오.`);
      return;
    }

    const layers = [];

    for (const node of nodes) {
      const [lat, lng] = getCoverageNodeLatLng(node, level);
      const count = getNodeCount(node);
      const label = getCoverageDisplayLabel(node, level);

      const marker = L.marker([lat, lng], {
        icon: createCoverageIcon(node, count, level),
        keyboard: false,
        title: `${label} ${numberText(count)}개`,
        zIndexOffset: level === "area_group" && label === "서울권" ? 2000 : 0
      });

      const baseCoverageZIndex = level === "area_group" && label === "서울권" ? 2000 : 0;

      removeNativeCoverageTitle(marker);

      marker.on("mouseover", () => {
        marker.setZIndexOffset(1200000);
        const el = marker.getElement && marker.getElement();
        if (el) {
          el.classList.add("frontier-coverage-hovering");
          el.style.zIndex = "1000000";
        }
        showFloatingCoveragePreview(node, level, marker);
      });

      marker.on("mouseout", () => {
        marker.setZIndexOffset(baseCoverageZIndex);
        const el = marker.getElement && marker.getElement();
        if (el) {
          el.classList.remove("frontier-coverage-hovering");
          el.style.zIndex = "";
        }
      });


      marker.on("click", () => {
        pushViewHistory(`card:${label}`);
        const scope = setNodeScope(node, level);

        state.hasSearched = false;
        state.activeItems = [];
        clearMarkers();
        clearCoverage();

        fitToNodeForCoverageClick(node, level);

        if (level === "eupmyeondong") {
          window.setTimeout(() => {
            if (state.nodeScope && state.nodeScope.scopeId === scope.scopeId) {
              enterNodeScopeDetail();
            }
          }, 520);
        }

        setNotice(`${label} ${numberText(count)}개 커버리지를 선택 범위 안에서 다음 단계로 펼칩니다. 주변 매체까지 보려면 ‘현재 화면에서 검색’을 누르십시오.`);
      });

      layers.push(marker);
    }

    state.coverageLayer.addLayer(L.layerGroup(layers));
    updateOffscreenCoverageIndicators(nodes, level);

    const totalCoverage = state.hierarchyData.total_coverage_count || state.publicItems.length;
    const visibleCoverage = state.hierarchyData.visible_coverage_count || totalCoverage;
    const hiddenLabels = Math.max(0, rawNodes.length - nodes.length);

    setNotice(
      `Z${state.map.getZoom()} · ${hierarchyLabel(level)} 단계입니다. ` +
      `${numberText(nodes.length)}개 라벨을 표시 중입니다. ` +
      (hiddenLabels > 0 ? `겹침 방지를 위해 ${numberText(hiddenLabels)}개 라벨은 더 확대하면 표시됩니다. ` : "") +
      `전국 광고 접점은 ${numberText(totalCoverage)}개이며, 지도 표시 기준은 ${numberText(visibleCoverage)}개입니다.`
    );

    updateStats(getFilteredItems().length, nodes.length);
  }

  function createPinIcon(item) {
    const cls = item?.internal_render_type === "network_fixed_pin" ? "frontier-pin" : "frontier-pin";

    return L.divIcon({
      className: "",
      html: `<div class="${cls}"></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28]
    });
  }

  function getItemTitle(item) {
    return item?.title || "매체명 없음";
  }

  function getIndoorLocation(item = {}, detail = {}) {
    return (
      item.indoor_location_detail ||
      detail.indoor_location_detail ||
      ""
    ).toString().trim();
  }

  function getDisplayAddressLine(item = {}, detail = {}) {
    const address = (
      item.display_address ||
      detail.display_address ||
      item.address ||
      detail.address ||
      ""
    ).toString().trim();

    const indoor = getIndoorLocation(item, detail);

    if (address && indoor) return `${address} · ${indoor}`;
    return address;
  }

  function getItemMeta(item) {
    return [
      item.public_major_category,
      displayMiddleCategory(item),
      item.public_format_name,
      item.normalized_sido || item.sido,
      getItemDisplaySigungu(item)
    ].filter(Boolean).join(" · ");
  }

  function renderMarkers(items) {
    clearCoverage();
    clearMarkers();

    const limited = items.filter(isPublicVisibleItem).slice(0, MAX_RENDER_MARKERS);
    const markerLayers = [];

    for (const item of limited) {
      const marker = L.marker([Number(item.lat), Number(item.lng)], {
        icon: createPinIcon(item),
        keyboard: false,
        title: getItemTitle(item)
      });

      bindPinHoverPreview(marker, item);
      marker.on("click", () => openModal(item.id));
      markerLayers.push(marker);
    }

    state.markers.addLayers(markerLayers);
    updateOffscreenDetailPinIndicators(limited);
  }

  function renderList(items) {
    const list = $("resultList");
    const limited = items.slice(0, MAX_LIST_ITEMS);

    if (!limited.length) {
      list.innerHTML = `
        <div class="card">
          <div class="card-title">현재 화면에 표시할 매체가 없습니다.</div>
          <div class="card-meta">지도를 이동하거나 검색어/카테고리를 조정한 뒤 다시 검색하십시오.</div>
        </div>
      `;
      return;
    }

    list.innerHTML = limited.map((item) => {
      const detail = state.detailsById[item.id] || {};
      const meta = getItemMeta(item);
      const address = getDisplayAddressLine(item, detail) || (
        item.internal_render_type === "network_fixed_pin"
          ? "생활밀착형 네트워크 매체 · 정확한 집행 조건은 상담 필요"
          : "주소 정보 확인 필요"
      );

      return `
        <article class="card" data-id="${esc(item.id)}">
          <div class="card-title">${esc(getItemTitle(item))}</div>
          <div class="card-meta">${esc(meta || "분류 정보 없음")}</div>
          <div class="card-meta">${esc(address)}</div>
        </article>
      `;
    }).join("");

    list.querySelectorAll(".card[data-id]").forEach((el) => {
      el.addEventListener("click", () => focusItem(el.getAttribute("data-id")));
    });
  }

  function ensurePinHoverPreviewStyle() {
    if (document.getElementById("frontier-v2-pin-hover-style")) return;

    const style = document.createElement("style");
    style.id = "frontier-v2-pin-hover-style";
    style.textContent = `
      .leaflet-tooltip.frontier-pin-hover-tooltip {
        padding: 0;
        border: 0;
        background: transparent;
        box-shadow: none;
      }

      .leaflet-tooltip.frontier-pin-hover-tooltip::before {
        display: none;
      }

      .frontier-pin-hover-card {
        min-width: 178px;
        max-width: 230px;
        padding: 10px 11px 11px;
        border-radius: 13px;
        border: 1px solid rgba(162,222,204,.58);
        background: rgba(5,13,12,.96);
        color: rgba(234,255,248,.94);
        box-shadow: 0 18px 44px rgba(0,0,0,.38);
        backdrop-filter: blur(10px);
        box-sizing: border-box;
      }

      .frontier-pin-hover-title {
        margin-bottom: 5px;
        font-size: 12px;
        line-height: 1.25;
        font-weight: 950;
        letter-spacing: -.045em;
        color: #f3fffb;
      }

      .frontier-pin-hover-meta {
        margin-bottom: 5px;
        font-size: 10px;
        line-height: 1.35;
        font-weight: 800;
        color: rgba(162,222,204,.92);
      }

      .frontier-pin-hover-addr {
        font-size: 10px;
        line-height: 1.35;
        color: rgba(234,255,248,.70);
      }
    `;
    document.head.appendChild(style);
  }

  function createPinHoverPreviewHtml(item) {
    const title = clean(
      item.title ||
      item.name ||
      item.media_name ||
      item.place_name ||
      item.display_name ||
      "매체 정보"
    );

    const meta = [
      item.major || item.major_category || item.by_major,
      item.middle || item.middle_category || item.by_middle,
      item.format || item.media_format || item.by_format
    ].map(clean).filter(Boolean).slice(0, 3).join(" · ");

    const address = clean(
      item.display_address ||
      item.address ||
      [item.sido, item.sigungu, item.eupmyeondong].map(clean).filter(Boolean).join(" ")
    );

    return `
      <div class="frontier-pin-hover-card">
        <div class="frontier-pin-hover-title">${esc(title)}</div>
        ${meta ? `<div class="frontier-pin-hover-meta">${esc(meta)}</div>` : ""}
        ${address ? `<div class="frontier-pin-hover-addr">${esc(address)}</div>` : ""}
      </div>
    `;
  }

  function bindPinHoverPreview(marker, item) {
    if (!marker || !item || typeof marker.bindTooltip !== "function") return;

    ensurePinHoverPreviewStyle();

    marker.bindTooltip(createPinHoverPreviewHtml(item), {
      direction: "top",
      offset: [0, -12],
      opacity: 1,
      sticky: true,
      className: "frontier-pin-hover-tooltip"
    });
  }

  function enterDetailMode(items, options = {}) {
    const label = options.label || "현재 화면";
    const totalCandidates = options.totalCandidates ?? getFilteredItems().length;
    const shown = Math.min(items.length, MAX_RENDER_MARKERS);

    state.hasSearched = true;
    state.activeItems = items;
    state.movedAfterSearch = false;

    renderMarkers(items);
    renderList(items);
    updateStats(totalCandidates, shown);
    updateZoomStatus();

    if (items.length > MAX_RENDER_MARKERS) {
      setNotice(`${label}: 후보 ${numberText(items.length)}개 중 화면 안정성을 위해 ${numberText(MAX_RENDER_MARKERS)}개만 표시합니다. 더 확대하거나 검색 조건을 좁히십시오.`);
    } else {
      setNotice(`${label}: 상세 매체 ${numberText(items.length)}개를 표시했습니다.`);
    }
  }

  function autoEnterDetailMode() {
    if (state.hasSearched) return;
    if (state.map.getZoom() < DETAIL_AUTO_ZOOM) return;

    const inBounds = getItemsInCurrentBounds();

    if (!inBounds.length) {
      clearMarkers();
      const list = $("resultList");
      if (list) list.innerHTML = "";
      updateStats(getFilteredItems().length, 0);
      setNotice(`Z${state.map.getZoom()} · 상세 진입 단계입니다. 현재 화면 안에 표시할 매체가 없습니다.`);
      updateZoomStatus();
      return;
    }

    enterDetailMode(inBounds, {
      label: "현재 확대 화면",
      totalCandidates: getFilteredItems().length
    });
  }

  const KEYWORD_FULL_RENDER_LIMIT = 1000;

  function compactSearchText(value) {
    return clean(value)
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[·ㆍ,./()\[\]{}_-]/g, "");
  }

  function collectSearchText(value, depth = 0) {
    if (value == null || depth > 2) return "";

    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }

    if (Array.isArray(value)) {
      return value.map((entry) => collectSearchText(entry, depth + 1)).join(" ");
    }

    if (typeof value === "object") {
      return Object.values(value).map((entry) => collectSearchText(entry, depth + 1)).join(" ");
    }

    return "";
  }

  function getDetailForSearch(item) {
    try {
      if (typeof getItemDetail === "function") return getItemDetail(item) || {};
    } catch (e) {}

    return {};
  }

  function getSearchHaystack(item) {
    const detail = getDetailForSearch(item);

    return compactSearchText([
      collectSearchText(item),
      collectSearchText(detail)
    ].join(" "));
  }

  function isIncheonAirportKeyword(keyword) {
    const k = compactSearchText(keyword);
    return k.includes("인천공항") || k.includes("인천국제공항") || k === "icn";
  }

  function isLikelyIncheonAirportItem(item) {
    const text = getSearchHaystack(item);
    const sido = clean(item.normalized_sido || item.sido);
    const sigungu = clean(item.normalized_sigungu || item.sigungu);
    const address = clean(item.display_address || item.address);

    const incheonArea =
      sido === "인천" ||
      address.includes("인천") ||
      text.includes("인천중구");

    const directAirportSignal = [
      "인천공항",
      "인천국제공항",
      "공항로271",
      "공항로272",
      "제1터미널",
      "제2터미널",
      "제1여객터미널",
      "제2여객터미널",
      "인천공항1터미널",
      "인천공항2터미널",
      "인천공항t1",
      "인천공항t2",
      "공항문화로",
      "인천공항교통센터",
      "인천공항제1터미널",
      "인천공항제2터미널"
    ].some((token) => text.includes(compactSearchText(token)));

    const weakAirportSignal =
      (text.includes("t1") || text.includes("t2") || text.includes("터미널")) &&
      (text.includes("인천공항") || text.includes("인천국제공항") || text.includes("공항로"));

    const airportCategorySignal =
      incheonArea &&
      text.includes("공항") &&
      (
        text.includes("공항매체") ||
        text.includes("공항광고") ||
        text.includes("공항미디어") ||
        text.includes("교통매체공항")
      );

    const wrongAirport = [
      "김포공항",
      "김포국제공항",
      "공항철도홍대입구",
      "홍대입구역",
      "서울강서구공항대로",
      "고속터미널",
      "남부터미널",
      "동서울터미널"
    ].some((token) => text.includes(compactSearchText(token)));

    return incheonArea && !wrongAirport && (directAirportSignal || weakAirportSignal || airportCategorySignal);
  }

  function isKeywordMatch(item, keyword) {
    const rawKeyword = clean(keyword);
    const keywordCompact = compactSearchText(rawKeyword);

    if (!keywordCompact) return false;

    if (isIncheonAirportKeyword(rawKeyword)) {
      return isLikelyIncheonAirportItem(item);
    }

    const haystack = getSearchHaystack(item);
    const tokens = rawKeyword
      .split(/\s+/)
      .map((token) => compactSearchText(token))
      .filter(Boolean);

    if (!tokens.length) return false;

    return tokens.every((token) => haystack.includes(token));
  }

  function isCoordinateReviewRequired(item, keyword) {
    if (!isIncheonAirportKeyword(keyword)) return false;

    const lat = Number(item.lat);
    const lng = Number(item.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true;

    const haystack = getSearchHaystack(item);
    const sido = clean(item.normalized_sido || item.sido);
    const sigungu = clean(item.normalized_sigungu || item.sigungu);
    const address = clean(item.display_address || item.address);

    const saysIncheonAirport =
      sido === "인천" ||
      sigungu.includes("중구") ||
      address.includes("인천") ||
      haystack.includes("인천공항") ||
      haystack.includes("인천국제공항") ||
      haystack.includes("영종") ||
      haystack.includes("운서");

    if (!saysIncheonAirport) return true;

    // 인천공항/영종권 지도 표시 허용 범위.
    // 이 범위를 벗어난 항목은 검색 결과로는 잡되, 지도 핀 표시를 보류한다.
    const inAirportMapBounds =
      lat >= 37.32 &&
      lat <= 37.56 &&
      lng >= 126.30 &&
      lng <= 126.66;

    return !inAirportMapBounds;
  }

  function getKeywordSearchBaseItems() {
    return state.publicItems.filter((item) => {
      if (!isValidItem(item)) return false;
      if (!isPublicVisibleItem(item)) return false;

      if (state.selectedMajor && item.public_major_category !== state.selectedMajor) return false;
      if (state.selectedMiddle && item.public_middle_category !== state.selectedMiddle) return false;
      if (state.selectedFormat && item.public_format_name !== state.selectedFormat) return false;

      return true;
    });
  }

  function getKeywordSearchResults(keyword) {
    const all = getKeywordSearchBaseItems();
    const matches = all.filter((item) => isKeywordMatch(item, keyword));

    const mapItems = [];
    const reviewItems = [];

    matches.forEach((item) => {
      if (isCoordinateReviewRequired(item, keyword)) {
        reviewItems.push(item);
      } else {
        mapItems.push(item);
      }
    });

    return { matches, mapItems, reviewItems };
  }

  function searchKeywordResults() {
    const keyword = clean(state.keyword);

    if (!keyword) return false;

    const { matches, mapItems, reviewItems } = getKeywordSearchResults(keyword);
    const renderItems = mapItems.length <= KEYWORD_FULL_RENDER_LIMIT
      ? mapItems
      : mapItems.slice(0, KEYWORD_FULL_RENDER_LIMIT);

    state.hasSearched = true;
    state.activeItems = renderItems;
    state.movedAfterSearch = false;

    clearCoverage();
    clearMarkers();
    closeModal();

    renderMarkers(renderItems);
    renderList(renderItems);
    updateStats(matches.length, renderItems.length);

    if (renderItems.length >= 2) {
      const bounds = L.latLngBounds(renderItems.map((item) => [Number(item.lat), Number(item.lng)]));
      state.map.fitBounds(bounds.pad(0.18), {
        maxZoom: 16,
        animate: true,
        duration: 0.45,
        easeLinearity: 0.25
      });
    } else if (renderItems.length === 1) {
      const only = renderItems[0];
      state.map.flyTo([Number(only.lat), Number(only.lng)], Math.max(16, state.map.getZoom()), {
        animate: true,
        duration: 0.45,
        easeLinearity: 0.25
      });
    }

    const contactText = " 자세한 매체 정보는 프론티어에 문의 바랍니다.";

    if (!matches.length) {
      setNotice(`검색어 “${keyword}”에 해당하는 매체를 찾지 못했습니다.`, "danger");
      return true;
    }

    if (!renderItems.length && reviewItems.length) {
      setNotice(`검색어 “${keyword}” 기준 ${numberText(matches.length)}개 매체를 찾았지만, 좌표 검토가 필요해 지도에 표시 가능한 항목이 없습니다.${contactText}`, "danger");
      return true;
    }

    if (mapItems.length > KEYWORD_FULL_RENDER_LIMIT) {
      setNotice(`검색어 “${keyword}” 기준 ${numberText(matches.length)}개 매체를 찾았습니다. 지도에는 성능 보호를 위해 ${numberText(KEYWORD_FULL_RENDER_LIMIT)}개를 우선 표시했습니다. 좌표 검토 보류 ${numberText(reviewItems.length)}개가 있습니다.${contactText}`);
      return true;
    }

    if (reviewItems.length) {
      setNotice(`검색어 “${keyword}” 기준 ${numberText(matches.length)}개 매체를 찾았습니다. 지도에는 좌표가 확인된 ${numberText(renderItems.length)}개를 표시했고, 좌표 검토 보류 ${numberText(reviewItems.length)}개는 지도 핀 표시에서 제외했습니다.${contactText}`);
      return true;
    }

    setNotice(`검색어 “${keyword}” 기준 ${numberText(matches.length)}개 매체를 찾았습니다. 지도에 ${numberText(renderItems.length)}개를 모두 표시했습니다.${contactText}`);
    return true;
  }

  function updateSearchButtonLabel() {
    const keyword = clean(state.keyword);
    const buttons = Array.from(document.querySelectorAll("button"));
    const searchButton = buttons.find((button) => {
      const text = clean(button.textContent);
      return text.includes("현재 화면에서 검색") || text.includes("키워드 전체 검색");
    });

    if (!searchButton) return;

    searchButton.textContent = keyword ? "키워드 전체 검색" : "현재 화면에서 검색";
  }

  function searchCurrentView() {
    pushViewHistory("search-current-view");
    clearNodeScope();
    const keywordEl = $("keywordInput");
    if (keywordEl) state.keyword = keywordEl.value || "";

    updateSearchButtonLabel();

    if (searchKeywordResults()) return;

    const zoom = state.map.getZoom();

    if (zoom < DETAIL_AUTO_ZOOM) {
      state.hasSearched = false;
      state.activeItems = [];
      state.movedAfterSearch = false;

      closeModal();
      clearMarkers();
      clearCoverage();

      renderCoverage();
      setNotice(`현재 화면 기준으로 ${hierarchyLabel(getCurrentHierarchySet().level)} 단계 카드를 다시 표시했습니다. 핀은 Z${DETAIL_AUTO_ZOOM} 이상에서 표시됩니다.`);
      return;
    }

    const inBounds = getItemsInCurrentBounds();

    enterDetailMode(inBounds, {
      label: "현재 화면",
      totalCandidates: getFilteredItems().length
    });
  }

  function findActiveItem(id) {
    return state.activeItems.find((x) => x.id === id && isPublicVisibleItem(x))
      || state.publicItems.find((x) => x.id === id && isPublicVisibleItem(x));
  }

  function focusItem(id) {
    const item = findActiveItem(id);
    if (!item) return;

    openModal(id);

    state.map.flyTo([Number(item.lat), Number(item.lng)], Math.max(state.map.getZoom(), 16), {
      animate: true,
      duration: 0.55,
      easeLinearity: 0.25
    });
  }

  function makeMapLinks(item) {
    const lat = item.lat;
    const lng = item.lng;
    const title = item.title || "FRONTIER MAP 매체";
    const encodedTitle = encodeURIComponent(title);

    return {
      kakao: `https://map.kakao.com/link/map/${encodedTitle},${lat},${lng}`,
      google: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    };
  }

  function openModal(id) {
    const item = findActiveItem(id);
    const detail = state.detailsById[id];

    if (!item && !detail) {
      setNotice("상세 정보를 찾을 수 없습니다.", "danger");
      return;
    }

    const source = {
      ...(item || {}),
      ...(detail || {})
    };

    if (isPublicHiddenItem(source)) {
      setNotice("출처 확인 전까지 공개 지도에서 제외된 매체입니다.", "danger");
      return;
    }

    $("modalTitle").textContent = source.title || "매체명 없음";

    $("modalCategory").textContent = [
      item?.public_major_category,
      item ? displayMiddleCategory(item) : "",
      item?.public_format_name
    ].filter(Boolean).join(" · ") || "-";

    const modalAddress = getDisplayAddressLine(source, detail);

    $("modalAddress").textContent = modalAddress || (
      item?.internal_render_type === "network_fixed_pin"
        ? "생활밀착형 네트워크 매체입니다. 정확한 위치, 집행 가능 여부, 패키지 조건은 프론티어 상담을 통해 확인하실 수 있습니다."
        : "정확한 위치와 집행 조건은 프론티어 상담을 통해 확인하실 수 있습니다."
    );

    $("modalPrice").textContent = source.price || "문의";

    const links = makeMapLinks(source);
    $("kakaoLink").href = links.kakao;
    $("googleLink").href = links.google;

    $("cartBtn").onclick = () => {
      setNotice("담아두기 기능은 v2 프로토타입 다음 단계에서 연결합니다.");
    };

    $("modalBackdrop").classList.add("show");
  }

  function closeModal() {
    $("modalBackdrop").classList.remove("show");
  }

  function resetView() {
    pushViewHistory("reset-view");
    clearNodeScope();
    state.selectedMajor = "";
    state.selectedMiddle = "";
    state.selectedFormat = "";
    state.keyword = "";
    state.hasSearched = false;
    state.activeItems = [];
    state.movedAfterSearch = false;

    $("groupSelect").value = "";
    $("subgroupSelect").value = "";
    $("familySelect").value = "";
    $("keywordInput").value = "";
    updateSearchButtonLabel();

    closeModal();
    populateMiddleSelect();
    populateFormatSelect();

    clearMarkers();
    clearCoverage();
    $("resultList").innerHTML = "";

    state.map.setView(HOME_CENTER, HOME_ZOOM);
    updateStats(state.publicItems.length, 0);
    setNotice("초기화했습니다. 전국 광고 접점 커버리지를 다시 표시합니다.");
    window.setTimeout(renderCoverage, 120);
  }

  function initMap() {
    state.map = L.map("map", {
      zoomControl: true,
      preferCanvas: true,
      doubleClickZoom: false,
      minZoom: 6,
      maxZoom: 18
    }).setView(HOME_CENTER, HOME_ZOOM);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(state.map);

    state.markers = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true,
      chunkedLoading: true,
      chunkInterval: 80,
      chunkDelay: 20,
      maxClusterRadius: (zoom) => {
        if (zoom <= 8) return 82;
        if (zoom <= 11) return 62;
        return 42;
      }
    });

    state.coverageLayer = L.layerGroup();

    state.map.addLayer(state.coverageLayer);
    state.map.addLayer(state.markers);

    const zoomControl = L.control({ position: "topleft" });
    zoomControl.onAdd = () => {
      const div = L.DomUtil.create("div", "frontier-zoom-status");
      div.textContent = `${PROTOTYPE_VERSION} · Z- · 준비`;
      L.DomEvent.disableClickPropagation(div);
      state.zoomStatusEl = div;
      return div;
    };
    zoomControl.addTo(state.map);

    const backControl = L.control({ position: "topleft" });
    backControl.onAdd = () => {
      const btn = L.DomUtil.create("button", "frontier-back-control");
      btn.type = "button";
      btn.textContent = "← 뒤로";
      btn.style.cssText = [
        "margin-top:8px",
        "padding:8px 11px",
        "border-radius:999px",
        "border:1px solid rgba(162,222,204,.55)",
        "background:rgba(7,16,14,.88)",
        "color:#eafff8",
        "font-size:11px",
        "font-weight:900",
        "letter-spacing:-.02em",
        "box-shadow:0 10px 28px rgba(0,0,0,.24)",
        "backdrop-filter:blur(8px)"
      ].join(";");
      L.DomEvent.disableClickPropagation(btn);
      L.DomEvent.on(btn, "click", (event) => {
        L.DomEvent.preventDefault(event);
        goBackView();
      });
      state.backControlEl = btn;
      refreshBackButton();
      return btn;
    };
    backControl.addTo(state.map);

    try {
      window.history.replaceState({ frontierMapRoot: true }, "", window.location.href);
    } catch (e) {}

    state.map.on("movestart zoomstart", () => {
      state.movedAfterSearch = true;
    });

    state.map.on("moveend zoomend", () => {
      const zoom = state.map.getZoom();
      updateZoomStatus();

      if (state.isRestoringHistory) return;

      if (state.hasSearched) {
        const hasKeyword = clean(state.keyword).length > 0;

        // 키워드 검색 모드는 줌아웃해도 검색 결과를 유지한다.
        if (hasKeyword) return;

        // 카드 선택 scope가 살아있는 동안에는 지도 이동/확대 후에도 주변 매체를 자동 혼입하지 않는다.
        // 주변 매체까지 보려면 사용자가 직접 '현재 화면에서 검색'을 눌러 scope를 해제해야 한다.
        if (state.nodeScope) {
          const scopedItems = getScopedItemsForNode(state.nodeScope.node, state.nodeScope.level);

          if (zoom < DETAIL_AUTO_ZOOM) {
            state.hasSearched = false;
            state.activeItems = [];
            clearMarkers();
            closeModal();
            renderCoverage();
            setNotice(`Z${zoom} · 선택 범위 ${state.nodeScope.label} 안에서 ${getStageLabel()} 단계로 표시합니다. 주변 매체까지 보려면 ‘현재 화면에서 검색’을 누르십시오.`);
            return;
          }

          enterDetailMode(scopedItems, {
            label: `선택 범위 · ${state.nodeScope.label}`,
            totalCandidates: state.nodeScope.count || scopedItems.length
          });
          return;
        }

        // 검색어 없는 현재 화면 검색만 Z15 이하에서 탐색 모드로 복귀한다.
        if (zoom < DETAIL_AUTO_ZOOM) {
          state.hasSearched = false;
          state.activeItems = [];
          clearMarkers();
          closeModal();
          renderCoverage();
          setNotice(`Z${zoom} · ${getStageLabel()} 단계로 돌아왔습니다.`);
          return;
        }

        const inBounds = getItemsInCurrentBounds();
        enterDetailMode(inBounds, {
          label: "현재 확대 화면",
          totalCandidates: getFilteredItems().length
        });
        return;
      }

      renderCoverage();
    });
  }

  function bindEvents() {
    $("searchHereBtn").addEventListener("click", searchCurrentView);
    $("floatingSearchBtn").addEventListener("click", searchCurrentView);
    $("resetBtn").addEventListener("click", resetView);

    $("groupSelect").addEventListener("change", (event) => {
      pushViewHistory("filter-major");
      clearNodeScope();
      state.selectedMajor = event.target.value;
      state.selectedMiddle = "";
      state.selectedFormat = "";
      state.hasSearched = false;
      state.activeItems = [];

      populateMiddleSelect();
      populateFormatSelect();

      $("subgroupSelect").value = "";
      $("familySelect").value = "";

      closeModal();
      clearMarkers();
      clearCoverage();
      $("resultList").innerHTML = "";
      updateStats(getFilteredItems().length, 0);
      renderCoverage();
    });

    $("subgroupSelect").addEventListener("change", (event) => {
      pushViewHistory("filter-middle");
      clearNodeScope();
      state.selectedMiddle = event.target.value;
      state.selectedFormat = "";
      state.hasSearched = false;
      state.activeItems = [];

      populateFormatSelect();
      $("familySelect").value = "";

      closeModal();
      clearMarkers();
      clearCoverage();
      $("resultList").innerHTML = "";
      updateStats(getFilteredItems().length, 0);
      renderCoverage();
    });

    $("familySelect").addEventListener("change", (event) => {
      pushViewHistory("filter-format");
      clearNodeScope();
      state.selectedFormat = event.target.value;
      state.hasSearched = false;
      state.activeItems = [];

      closeModal();
      clearMarkers();
      clearCoverage();
      $("resultList").innerHTML = "";
      updateStats(getFilteredItems().length, 0);
      renderCoverage();
    });

    document.addEventListener("keydown", (event) => {
      const target = event.target;
      const tagName = (target?.tagName || "").toLowerCase();
      const isTyping =
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target?.isContentEditable;

      if (isTyping) return;

      if (event.key === "Backspace" || (event.altKey && event.key === "ArrowLeft")) {
        if (goBackView()) {
          event.preventDefault();
          event.stopPropagation();
        }
      }
    });

    window.addEventListener("popstate", () => {
      goBackView();
    });

    $("keywordInput").addEventListener("input", (event) => {
      // 입력 중에는 지도 렌더링 금지.
      // Enter 또는 버튼 클릭 시에만 키워드 전체 검색을 실행한다.
      state.keyword = event.target.value || "";
      updateSearchButtonLabel();
    });

    $("keywordInput").addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        state.keyword = event.target.value || "";
        updateSearchButtonLabel();
        searchCurrentView();
      }
    });

    $("modalClose").addEventListener("click", closeModal);

    $("modalBackdrop").addEventListener("click", (event) => {
      if (event.target === $("modalBackdrop")) closeModal();
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModal();
    });
  }

  async function loadData() {
    setNotice("FRONTIER MAP v2 계층형 커버리지 데이터를 불러오는 중입니다.");

    const [publicRes, detailsRes, hierarchyRes] = await Promise.all([
      fetch(PUBLIC_LITE_URL, { cache: "no-store" }),
      fetch(DETAILS_URL, { cache: "no-store" }),
      fetch(COVERAGE_HIERARCHY_URL, { cache: "no-store" })
    ]);

    if (!publicRes.ok) throw new Error(`공개 카테고리 데이터 로드 실패: ${publicRes.status}`);
    if (!hierarchyRes.ok) throw new Error(`계층형 커버리지 데이터 로드 실패: ${hierarchyRes.status}`);

    const publicLite = await publicRes.json();

    let details = {};
    if (detailsRes.ok) details = await detailsRes.json();

    const hierarchy = await hierarchyRes.json();

    state.publicItems = Array.isArray(publicLite)
      ? publicLite
        .filter(isValidItem)
        .map((item, index) => ({
          ...item,
          __frontier_item_id: `row_${String(index + 1).padStart(6, "0")}`
        }))
      : [];
    state.itemsByFrontierRowId = new Map(state.publicItems.map((item) => [item.__frontier_item_id, item]));
    state.detailsById = details && typeof details === "object" ? details : {};
    state.hierarchyData = hierarchy;

    populateMajorSelect();
    updateStats(state.publicItems.length, 0);
    updateZoomStatus();
    renderCoverage();

    const totalCoverage = state.hierarchyData?.total_coverage_count || state.publicItems.length;
    const visibleCoverage = state.hierarchyData?.visible_coverage_count || totalCoverage;

    setNotice(
      `전국 광고 접점 ${numberText(totalCoverage)}개를 준비했습니다. 지도에는 정규화된 ${numberText(visibleCoverage)}개 접점을 권역→소권역→지역 묶음→시군구→읍면동→상세 핀 순서로 표시합니다.`
    );
  }

  async function boot() {
    try {
      injectStyle();
      initMap();
      bindEvents();
      await loadData();
    } catch (error) {
      console.error(error);
      setNotice(`v2 프로토타입 초기화 실패: ${error.message}`, "danger");
    }
  }

  boot();
})();



















