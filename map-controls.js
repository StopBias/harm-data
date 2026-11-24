// Shared zoom controls for every MapLibre map on the site.
// Plus and minus come from MapLibre's NavigationControl. Reset fits the whole world.
(function () {
  "use strict";

  function label(key, fallback) {
    if (!window.t) return fallback;
    const s = window.t(key);
    return s && s !== key ? s : fallback;
  }

  const RESET_ICON = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><rect x="2.5" y="5" width="15" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2.5 10h15M10 5v10" fill="none" stroke="currentColor" stroke-width="1" opacity="0.75"/></svg>';

  function attach(map, opts) {
    if (!map || typeof maplibregl === "undefined") return { sync: function () {} };
    const onReset = opts && opts.onReset;
    const position = (opts && opts.position) || "top-right";
    map.addControl(new maplibregl.NavigationControl({
      showCompass: false,
      showZoom: true,
      visualizePitch: false
    }), position);

    const zoomIn = map.getContainer().querySelector(".maplibregl-ctrl-zoom-in");
    const group = zoomIn && zoomIn.parentElement;
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "harm-map-reset-btn";
    resetBtn.innerHTML = RESET_ICON;
    if (group) group.appendChild(resetBtn);
    resetBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (onReset) onReset();
    });

    function sync() {
      const zin = label("map.zoom_in", "Zoom in");
      const zout = label("map.zoom_out", "Zoom out");
      const reset = label("map.reset_world", "Reset to whole world");
      const container = map.getContainer();
      const zoomInBtn = container.querySelector(".maplibregl-ctrl-zoom-in");
      const zoomOutBtn = container.querySelector(".maplibregl-ctrl-zoom-out");
      if (zoomInBtn) {
        zoomInBtn.setAttribute("aria-label", zin);
        zoomInBtn.title = zin;
        zoomInBtn.disabled = map.getZoom() >= map.getMaxZoom() - 1e-6;
      }
      if (zoomOutBtn) {
        zoomOutBtn.setAttribute("aria-label", zout);
        zoomOutBtn.title = zout;
        zoomOutBtn.disabled = map.getZoom() <= map.getMinZoom() + 1e-6;
      }
      resetBtn.setAttribute("aria-label", reset);
      resetBtn.title = reset;
    }
    map.on("zoom", sync);
    map.on("zoomend", sync);
    sync();
    try { map.getContainer().__harmMap = map; } catch (e) {}
    return { sync: sync };
  }

  function mercX(lng) { return (lng + 180) / 360; }
  function mercY(lat) {
    const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
    const s = Math.sin(clamped * Math.PI / 180);
    return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  }
  function unY(y) {
    return 360 / Math.PI * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - 90;
  }
  function wrapLng(lng) {
    let x = lng;
    while (x > 180) x -= 360;
    while (x < -180) x += 360;
    return x;
  }

  function walkCoords(coords, fn) {
    if (!coords) return;
    if (typeof coords[0] === "number") { fn(coords[0], coords[1]); return; }
    for (let i = 0; i < coords.length; i++) walkCoords(coords[i], fn);
  }

  // Longitude span is the whole world: Russia, Alaska, New Zealand and Fiji
  // all touch the antimeridian, and Kiribati sits in the mid-Pacific.
  // Latitude comes from every drawn country (Antarctica is not on the map).
  function boundsFromCountries(geojson) {
    let south = 90;
    let north = -90;
    const features = geojson && geojson.features;
    if (features) {
      for (let i = 0; i < features.length; i++) {
        const f = features[i];
        const iso = f.properties && (f.properties.iso_a3 || f.properties.ISO_A3 || "");
        if (iso === "ATA" || !f.geometry) continue;
        walkCoords(f.geometry.coordinates, function (x, y) {
          if (y < south) south = y;
          if (y > north) north = y;
        });
      }
    }
    if (!(south < north)) { south = -56; north = 84; }
    return {
      west: -180,
      south: Math.max(-85, south - 0.4),
      east: 180,
      north: Math.min(85, north + 0.4)
    };
  }

  // Insets that keep country geometry off legends, view buttons and zoom controls.
  // A wide bar insets only its edge. A small corner control insets both edges.
  function overlayPadding(container, extras) {
    const mapRect = container.getBoundingClientRect();
    const pad = { top: 8, right: 8, bottom: 8, left: 8 };
    const els = [];
    [".maplibregl-ctrl-top-right", ".maplibregl-ctrl-bottom-right", ".maplibregl-ctrl-bottom-left", ".maplibregl-ctrl-top-left"].forEach(function (sel) {
      const el = container.querySelector(sel);
      if (el) els.push(el);
    });
    (extras || []).forEach(function (el) { if (el) els.push(el); });
    els.forEach(function (el) {
      if (el.hidden) return;
      const cs = window.getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return;
      const r = el.getBoundingClientRect();
      const ix = Math.min(r.right, mapRect.right) - Math.max(r.left, mapRect.left);
      const iy = Math.min(r.bottom, mapRect.bottom) - Math.max(r.top, mapRect.top);
      if (ix < 4 || iy < 4) return;
      const fromTop = Math.min(r.bottom, mapRect.bottom) - mapRect.top;
      const fromBottom = mapRect.bottom - Math.max(r.top, mapRect.top);
      const fromLeft = Math.min(r.right, mapRect.right) - mapRect.left;
      const fromRight = mapRect.right - Math.max(r.left, mapRect.left);
      const inTop = fromTop < mapRect.height * 0.45 && r.top < mapRect.top + mapRect.height * 0.35;
      const inBottom = fromBottom < mapRect.height * 0.55 && r.bottom > mapRect.bottom - mapRect.height * 0.55;
      // Wide bars and top notes clear one edge. A bottom-corner credit line
      // only adds bottom padding. Zoom buttons clear only their side.
      if (r.width > mapRect.width * 0.22 || (inTop && r.width > 140)) {
        if (fromTop <= fromBottom) pad.top = Math.max(pad.top, fromTop + 8);
        else pad.bottom = Math.max(pad.bottom, fromBottom + 8);
      } else if (inBottom) {
        pad.bottom = Math.max(pad.bottom, fromBottom + 8);
      } else if (fromRight <= fromLeft) {
        pad.right = Math.max(pad.right, fromRight + 8);
      } else {
        pad.left = Math.max(pad.left, fromLeft + 8);
      }
    });
    const maxX = Math.max(12, mapRect.width * 0.46);
    const maxY = Math.max(12, mapRect.height * 0.46);
    pad.left = Math.min(pad.left, maxX);
    pad.right = Math.min(pad.right, maxX);
    pad.top = Math.min(pad.top, maxY);
    pad.bottom = Math.min(pad.bottom, maxY);
    return pad;
  }

  // Fit a Web Mercator camera to a lng/lat extent, including a full -180..180 span.
  // Padding is the clear area inside the canvas, so geometry is not under the chrome.
  function fitExtent(map, bounds, padding) {
    if (!map || !bounds) return;
    const canvas = map.getCanvas();
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    if (W < 8 || H < 8) return;
    const pad = padding || { top: 8, right: 8, bottom: 8, left: 8 };
    const sw = Math.max(32, W - pad.left - pad.right);
    const sh = Math.max(32, H - pad.top - pad.bottom);
    const yN = mercY(bounds.north);
    const yS = mercY(bounds.south);
    const xSpan = Math.max(1e-6, (bounds.east - bounds.west) / 360);
    const ySpan = Math.max(1e-6, yS - yN);
    // MapLibre rejects a min zoom below -2.
    let z = Math.log2(Math.min(sw / xSpan, sh / ySpan) / 512);
    if (z < -2) z = -2;
    const scale = 512 * Math.pow(2, z);
    const dxPx = (pad.left + sw / 2) - W / 2;
    const dyPx = (pad.top + sh / 2) - H / 2;
    const cx = (mercX(bounds.west) + mercX(bounds.east)) / 2 - dxPx / scale;
    const cy = (yN + yS) / 2 - dyPx / scale;
    map.setMaxZoom(22);
    map.setMinZoom(-2);
    map.jumpTo({ center: [wrapLng(cx * 360 - 180), unY(cy)], zoom: z });
    const actual = map.getZoom();
    map.setMinZoom(Math.max(-2, Math.min(actual, z)));
    map.setMaxZoom(Math.min(22, actual + 4));
  }

  window.HarmMapControls = {
    attach: attach,
    boundsFromCountries: boundsFromCountries,
    overlayPadding: overlayPadding,
    fitExtent: fitExtent
  };
})();
