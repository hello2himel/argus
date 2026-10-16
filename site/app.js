/* Argus static quick-viewer: reads ./data/snapshot.json only. No backend. */
(function () {
  const COLORS = { RED: "#c0392b", AMBER: "#d48806", GREEN: "#1e7e34", GRAY: "#6c757d" };
  const list = document.getElementById("list");
  const cards = document.getElementById("cards");
  const gen = document.getElementById("gen");
  const prov = document.getElementById("prov");
  const notice = document.getElementById("notice");
  const filter = document.getElementById("filter");
  let SNAP = null;

  const map = L.map("map").setView([23.9, 90.4], 7);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 19,
  }).addTo(map);
  const layer = L.geoJSON(null, {
    style: (f) => ({ color: COLORS[f.properties.level] || "#666", weight: 2, fillOpacity: 0.18 }),
    onEachFeature: (f, l) => l.bindPopup("<b>" + esc(f.properties.name) + "</b><br>" + esc(f.properties.level) + " · " + esc(String(f.properties.total_ha)) + " ha"),
  }).addTo(map);

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function render() {
    const f = filter.value;
    const alerts = SNAP.alerts.filter((a) => !f || a.level === f);
    const by = { RED: 0, AMBER: 0, GREEN: 0, GRAY: 0 };
    SNAP.alerts.forEach((a) => { by[a.level] = (by[a.level] || 0) + 1; });
    cards.innerHTML =
      card("Sites", SNAP.sites.length) + card("Alerts", SNAP.alerts.length) +
      card("RED", by.RED || 0) + card("AMBER", by.AMBER || 0) +
      card("GREEN", by.GREEN || 0) + card("GRAY", by.GRAY || 0);
    list.innerHTML = alerts.length ? alerts.map(alertHTML).join("") : "<p>No alerts for this filter.</p>";

    const feats = SNAP.sites
      .filter((s) => !f || levelOf(s.id) === f)
      .map((s) => ({ type: "Feature", properties: { name: s.name, level: levelOf(s.id), total_ha: haOf(s.id) }, geometry: s.geometry }));
    layer.clearLayers();
    layer.addData({ type: "FeatureCollection", features: feats });
    if (feats.length) { try { map.fitBounds(layer.getBounds(), { padding: [20, 20] }); } catch (e) {} }
  }

  function card(k, v) { return '<div class="card"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>'; }
  function levelOf(siteId) { const a = SNAP.alerts.find((x) => x.site_id === siteId); return a ? a.level : "GRAY"; }
  function haOf(siteId) { const a = SNAP.alerts.find((x) => x.site_id === siteId); return a && a.total_ha != null ? Number(a.total_ha).toFixed(2) : "—"; }
  function siteOf(id) { return SNAP.sites.find((s) => s.id === id) || {}; }

  function alertHTML(a) {
    const s = siteOf(a.site_id);
    const an = (SNAP.analyses || []).find((x) => x.id === a.analysis_id);
    const sig = an && an.result && an.result.signals ? an.result.signals : {};
    return '<div class="alert ' + esc(a.level) + '">' +
      "<div><span class='badge " + esc(a.level) + "'>" + esc(a.level) + "</span>" +
      "<span class='badge syn'>synthetic demo</span>" +
      "<b>" + esc(s.name || a.site_id) + "</b></div>" +
      "<div>" + esc(a.explanation || "") + "</div>" +
      "<div class='meta'>" + esc(haOf(a.site_id)) + " ha · " + esc(a.provider || "") +
      " · veg_loss_px " + esc(sig.veg_loss_px != null ? sig.veg_loss_px : "—") +
      " · mean ΔNDVI " + esc(sig.mean_d_ndvi != null ? Number(sig.mean_d_ndvi).toFixed(3) : "—") + "</div>" +
      "<div class='meta'>" + esc(s.category || "") + " · " + esc(s.boundary_source || "") + "</div>" +
      "</div>";
  }

  filter.addEventListener("change", render);

  fetch("./data/snapshot.json", { cache: "no-store" })
    .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then((j) => {
      SNAP = j;
      gen.textContent = "snapshot " + (j.generated_at || "?") + " · " + j.algo + " · synthetic";
      prov.textContent = JSON.stringify({ generated_at: j.generated_at, algo: j.algo, baseline: j.baseline, recent: j.recent, note: j.note }, null, 2);
      if (j.synthetic) { notice.hidden = false; notice.textContent = "Demo snapshot — synthetic math, not satellite truth. For live analysis use the full stack."; }
      render();
    })
    .catch((e) => {
      gen.textContent = "snapshot failed to load";
      notice.hidden = false;
      notice.textContent = "Could not load ./data/snapshot.json (" + e.message + "). Serve via http (python3 -m http.server) and run python3 scripts/export_static.py first.";
    });
})();
