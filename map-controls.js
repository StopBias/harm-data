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
    return { sync: sync };
  }

  window.HarmMapControls = { attach: attach };
})();
