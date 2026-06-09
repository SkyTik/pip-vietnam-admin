/**
 * PIP Vietnam Admin — Main Application
 *
 * Vanilla JS, no modules. Depends on:
 *  - Leaflet (global L)
 *  - window.PIP_CONFIG.API_BASE_URL from config.js
 */
(function () {
  "use strict";

  var API_BASE_URL = (window.PIP_CONFIG && window.PIP_CONFIG.API_BASE_URL) || "http://localhost:8090";

  // ── Friendly labels for stats props ──────────────────────────────
  var PROP_LABELS = {
    dan_so: "Population",
    dtich_km2: "Area (km²)",
    matdo_km2: "Density (/km²)",
    sap_nhap: "Merger lineage"
  };

  // ── Level labels for admin hierarchy ─────────────────────────────
  var LEVEL_LABELS = {
    province: "Province",
    district: "District",
    ward: "Ward"
  };

  // ── SVG icon fragments (no emoji) ────────────────────────────────
  var ICONS = {
    province: '<svg class="w-4 h-4 text-indigo-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
    district: '<svg class="w-4 h-4 text-sky-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18"/></svg>',
    ward: '<svg class="w-4 h-4 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    info: '<svg class="w-4 h-4 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>'
  };

  // ── DOM references ───────────────────────────────────────────────
  var statusArea = document.getElementById("status-area");
  var statusLoading = document.getElementById("status-loading");
  var statusError = document.getElementById("status-error");
  var statusErrorMsg = document.getElementById("status-error-msg");
  var statusOob = document.getElementById("status-oob");
  var promptArea = document.getElementById("prompt-area");
  var resultArea = document.getElementById("result-area");
  var contentNew = document.getElementById("content-new");
  var contentOld = document.getElementById("content-old");
  var contentStats = document.getElementById("content-stats");

  // ── Map init ─────────────────────────────────────────────────────
  var VN_CENTER = [16.0, 107.8];
  var VN_ZOOM = 6;
  var VN_BOUNDS = L.latLngBounds([7.5, 101.5], [24.0, 110.5]);

  var map = L.map("map", {
    center: VN_CENTER,
    zoom: VN_ZOOM,
    minZoom: 5,
    maxBounds: VN_BOUNDS,
    maxBoundsViscosity: 0.8
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  // ── Mutable state ────────────────────────────────────────────────
  var marker = null;
  var geometryLayer = null;

  // ── Tab switching ────────────────────────────────────────────────
  var tabButtons = document.querySelectorAll(".tab-btn");
  var tabPanels = document.querySelectorAll(".tab-panel");

  function switchTab(tabName) {
    for (var i = 0; i < tabButtons.length; i++) {
      var btn = tabButtons[i];
      var isActive = btn.getAttribute("data-tab") === tabName;
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
      // Toggle exact tokens via classList — order-independent, no silent
      // failure if the initial class string changes.
      btn.classList.toggle("border-indigo-500", isActive);
      btn.classList.toggle("text-indigo-600", isActive);
      btn.classList.toggle("border-transparent", !isActive);
      btn.classList.toggle("text-slate-500", !isActive);
    }
    for (var j = 0; j < tabPanels.length; j++) {
      var panel = tabPanels[j];
      if (panel.id === "tab-" + tabName) {
        panel.classList.remove("hidden");
      } else {
        panel.classList.add("hidden");
      }
    }
  }

  for (var i = 0; i < tabButtons.length; i++) {
    tabButtons[i].addEventListener("click", (function (btn) {
      return function () { switchTab(btn.getAttribute("data-tab")); };
    })(tabButtons[i]));
  }

  // ── State helpers ────────────────────────────────────────────────
  function hideAllStatus() {
    statusArea.classList.add("hidden");
    statusLoading.classList.add("hidden");
    statusError.classList.add("hidden");
    statusOob.classList.add("hidden");
  }

  // showStatus reveals the status area with exactly one child message,
  // hiding the prompt and result regions. Each setter wraps it.
  function showStatus(child) {
    hideAllStatus();
    statusArea.classList.remove("hidden");
    child.classList.remove("hidden");
    promptArea.classList.add("hidden");
    resultArea.classList.add("hidden");
  }

  function setLoading() {
    showStatus(statusLoading);
  }

  function setError(msg) {
    showStatus(statusError);
    statusErrorMsg.textContent = msg;
  }

  function setOutOfBounds() {
    showStatus(statusOob);
    clearGeometry();
  }

  function setResult() {
    hideAllStatus();
    promptArea.classList.add("hidden");
    resultArea.classList.remove("hidden");
  }

  // ── Geometry layer management ────────────────────────────────────
  function clearGeometry() {
    if (geometryLayer) {
      map.removeLayer(geometryLayer);
      geometryLayer = null;
    }
  }

  // ── Marker management ───────────────────────────────────────────
  function placeMarker(lat, lng) {
    if (marker) {
      marker.setLatLng([lat, lng]);
    } else {
      marker = L.marker([lat, lng]).addTo(map);
    }
  }

  // ── Shared HTML fragments ─────────────────────────────────────────
  var ARROW_DIVIDER = '<div class="flex justify-center text-slate-300">' +
    '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>' +
  '</div>';

  // ── Build an admin-unit row ──────────────────────────────────────
  function unitRowHTML(unit, levelHint) {
    var level = (unit.level || levelHint || "").toLowerCase();
    var icon = ICONS[level] || ICONS.info;
    var label = LEVEL_LABELS[level] || level || "Unit";
    return '<div class="flex items-start gap-2 p-2 bg-slate-50 rounded-md">' +
      icon +
      '<div class="min-w-0">' +
        '<p class="text-sm font-medium text-slate-900 break-words">' + escapeHTML(unit.name) + '</p>' +
        '<p class="text-xs text-slate-500">' + escapeHTML(label) + ' &middot; ' + escapeHTML(unit.code) + '</p>' +
      '</div>' +
    '</div>';
  }

  // pathListHTML joins admin-unit rows for a path with arrow dividers.
  function pathListHTML(units) {
    var html = "";
    for (var i = 0; i < units.length; i++) {
      html += unitRowHTML(units[i]);
      if (i < units.length - 1) html += ARROW_DIVIDER;
    }
    return html;
  }

  // ── Render panel content ─────────────────────────────────────────
  function renderPanel(result) {
    // New (2026) tab — Province → Ward path
    contentNew.innerHTML = (result.new && result.new.length > 0)
      ? pathListHTML(result.new)
      : '<p class="text-sm text-slate-500 italic">No new administrative unit found.</p>';

    // Old tab — old_exact (Province→District→Ward) or old_candidates
    var oldHTML = "";
    if (result.old_exact && result.old_exact.length > 0) {
      oldHTML = pathListHTML(result.old_exact);
    } else if (result.old_candidates && result.old_candidates.length > 0) {
      oldHTML += '<div class="p-2 bg-amber-50 rounded-md border border-amber-200 mb-2">' +
        '<p class="text-xs text-amber-700 flex items-start gap-1">' +
          ICONS.info +
          '<span>Exact unit could not be resolved. These are candidate codes (exact match needs pre-2025 polygons).</span>' +
        '</p>' +
      '</div>';
      for (var k = 0; k < result.old_candidates.length; k++) {
        oldHTML += '<div class="flex items-center gap-2 p-2 bg-slate-50 rounded-md">' +
          ICONS.info +
          '<span class="text-sm text-slate-700 font-mono">' + escapeHTML(result.old_candidates[k]) + '</span>' +
        '</div>';
      }
    } else {
      oldHTML = '<p class="text-sm text-slate-500 italic">No old administrative unit data available.</p>';
    }
    contentOld.innerHTML = oldHTML;

    // Stats tab — from leaf unit props (last item in new array)
    var statsHTML = "";
    var leafUnit = (result.new && result.new.length > 0) ? result.new[result.new.length - 1] : null;
    var props = (leafUnit && leafUnit.props && typeof leafUnit.props === "object") ? leafUnit.props : null;
    if (props) {
      var keys = Object.keys(props);
      for (var m = 0; m < keys.length; m++) {
        var key = keys[m];
        var value = props[key];
        if (value === null || value === undefined || value === "") continue;
        var propLabel = PROP_LABELS[key] || key;
        statsHTML += '<div class="flex items-center justify-between p-2 bg-slate-50 rounded-md">' +
          '<span class="text-sm text-slate-600">' + escapeHTML(propLabel) + '</span>' +
          '<span class="text-sm font-medium text-slate-900">' + escapeHTML(String(value)) + '</span>' +
        '</div>';
      }
    }
    if (!statsHTML) {
      statsHTML = '<p class="text-sm text-slate-500 italic">No statistics available for this unit.</p>';
    }
    contentStats.innerHTML = statsHTML;

    setResult();
    switchTab("new");
  }

  // ── Highlight geometry ───────────────────────────────────────────
  function highlight(code) {
    clearGeometry();
    fetch(API_BASE_URL + "/geometry/" + encodeURIComponent(code))
      .then(function (res) {
        if (!res.ok) {
          throw new Error("Geometry request failed (HTTP " + res.status + ")");
        }
        return res.json();
      })
      .then(function (json) {
        if (!json || !json.geometry) return;
        geometryLayer = L.geoJSON(json.geometry, {
          style: {
            fillColor: "#6366f1",
            fillOpacity: 0.25,
            color: "#4338ca",
            weight: 2
          }
        }).addTo(map);
        // Empty/degenerate geometry yields invalid bounds; fitBounds would throw.
        var bounds = geometryLayer.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [30, 30] });
        }
      })
      .catch(function (err) {
        // Geometry is supplemental — log but don't override the panel result
        console.warn("Failed to load geometry for code " + code + ":", err.message);
      });
  }

  // ── Lookup ───────────────────────────────────────────────────────
  function lookup(lon, lat) {
    setLoading();
    // Drop any prior highlight immediately so a stale polygon never lingers
    // under a loading/error/out-of-bounds state for the new click.
    clearGeometry();

    fetch(API_BASE_URL + "/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lon: lon, lat: lat })
    })
      .then(function (res) {
        if (!res.ok) {
          throw new Error("Lookup failed (HTTP " + res.status + ")");
        }
        return res.json();
      })
      .then(function (result) {
        // Out-of-bounds or empty new array
        if (result.out_of_bounds === true || !result.new || result.new.length === 0) {
          setOutOfBounds();
          return;
        }

        renderPanel(result);

        // Highlight the leaf (ward) polygon from the new path
        var leafCode = result.new[result.new.length - 1].code;
        if (leafCode) {
          highlight(leafCode);
        }
      })
      .catch(function (err) {
        console.error("Lookup error:", err);
        setError("Could not reach " + API_BASE_URL + "/lookup — check API_BASE_URL in config.js and CORS on the backend");
      });
  }

  // ── Map click handler ────────────────────────────────────────────
  map.on("click", function (e) {
    var lat = e.latlng.lat;
    var lng = e.latlng.lng;

    placeMarker(lat, lng);
    lookup(lng, lat); // API wants {lon: lng, lat: lat}
  });

  // ── Utility ──────────────────────────────────────────────────────
  function escapeHTML(str) {
    // Coerce first: a null/undefined/number field from the API would otherwise
    // render as the literal text "null"/"undefined".
    if (str === null || str === undefined) return "";
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

})();
