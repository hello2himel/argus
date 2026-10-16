/* Argus static quick-viewer: reads ./data/snapshot.json only. No backend. */
(function () {
  const COLORS = { RED: "#c0392b", AMBER: "#d48806", GREEN: "#1e7e34", GRAY: "#6c757d" };
  const list = document.getElementById("list");
  const cards = document.getElementById("cards");
  const gen = document.getElementById("gen");
  const prov = document.getElementById("prov");
  const notice = document.getElementById("notice");
  const filter = document.getElementById("filter");
  const detail = document.getElementById("detail");
  let SNAP = null;

  const map = L.map("map").setView([23.9, 90.4], 7);
  // Esri World Imagery: free, keyless, needs attribution. CARTO dropped
  // keyless use, so it renders "API KEY REQUIRED" watermarks — unusable.
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
  }).addTo(map);
  const layer = L.geoJSON(null, {
    style: (f) => ({ color: COLORS[f.properties.level] || "#666", weight: 2, fillOpacity: 0.18 }),
    onEachFeature: (f, l) => {
      l.bindPopup("<b>" + esc(f.properties.name) + "</b><br>" + esc(f.properties.level) + " · " + esc(String(f.properties.total_ha)) + " ha");
      l.on("click", () => showDetail(f.properties.alert_id));
    },
  }).addTo(map);

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function render() {
    const f = filter.value;
    const alerts = SNAP.alerts.filter((a) => !f || a.level === f);
    const by = { RED: 0, AMBER: 0, GREEN: 0, GRAY: 0 };
    SNAP.alerts.forEach((a) => { by[a.level] = (by[a.level] || 0) + 1; });
    const tot = Math.max(1, SNAP.alerts.length);
    const seg = (k, cls) => by[k] ? `<span class="${cls}" style="width:${(by[k] / tot) * 100}%"></span>` : "";
    cards.innerHTML =
      card("Sites", SNAP.sites.length) + card("Alerts", SNAP.alerts.length) +
      card("RED open", by.RED || 0) + card("AMBER open", by.AMBER || 0) +
      card("GRAY (blind)", by.GRAY || 0) +
      `<div class="card wide"><div class="k">Distribution — green ≠ clearance, gray = blind</div>` +
      `<div class="distbar">${seg("RED", "r")}${seg("AMBER", "a")}${seg("GREEN", "g")}${seg("GRAY", "z")}</div></div>`;
    list.innerHTML = alerts.length ? alerts.map(alertHTML).join("") : "<p>No alerts for this filter.</p>";
    document.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => showDetail(b.dataset.open)));

    const feats = SNAP.sites
      .filter((s) => !f || levelOf(s.id) === f)
      .map((s) => ({ type: "Feature", properties: { name: s.name, level: levelOf(s.id), total_ha: haOf(s.id), alert_id: alertIdOf(s.id) }, geometry: s.geometry }));
    layer.clearLayers();
    layer.addData({ type: "FeatureCollection", features: feats });
    if (feats.length) { try { map.fitBounds(layer.getBounds(), { padding: [20, 20] }); } catch (e) {} }
  }

  function card(k, v) { return '<div class="card"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>'; }
  function alertOf(id) { return SNAP.alerts.find((x) => x.id === id); }
  function levelOf(siteId) { const a = SNAP.alerts.find((x) => x.site_id === siteId); return a ? a.level : "GRAY"; }
  function haOf(siteId) { const a = SNAP.alerts.find((x) => x.site_id === siteId); return a && a.total_ha != null ? Number(a.total_ha).toFixed(1) : "—"; }
  function alertIdOf(siteId) { const a = SNAP.alerts.find((x) => x.site_id === siteId); return a ? a.id : ""; }
  function siteOf(id) { return SNAP.sites.find((s) => s.id === id) || {}; }
  function analysisOf(a) { return (SNAP.analyses || []).find((x) => x.id === a.analysis_id) || {}; }

  function alertHTML(a) {
    const s = siteOf(a.site_id);
    return '<div class="alert ' + esc(a.level) + '">' +
      "<div><span class='badge " + esc(a.level) + "'>" + esc(a.level) + "</span>" +
      (a.synthetic ? "<span class='badge syn'>synthetic demo</span>" : "<span class='badge real'>real pixels</span>") +
      "<b>" + esc(s.name || a.site_id) + "</b></div>" +
      "<div>" + esc(a.explanation || "") + "</div>" +
      "<div class='meta'>" + esc(haOf(a.site_id)) + " ha · " + esc(a.provider || "") + "</div>" +
      "<button data-open='" + esc(a.id) + "'>Open evidence ↓</button></div>";
  }

  function showDetail(alertId) {
    const a = alertOf(alertId);
    if (!a) return;
    // zoom to the site + highlight it so the map is actually usable
    try {
      const s0 = siteOf(a.site_id);
      if (s0.geometry) {
        map.fitBounds(L.geoJSON(s0.geometry).getBounds().pad(0.6), { animate: true });
        layer.eachLayer((l) => {
          const on = l.feature && l.feature.properties.alert_id === alertId;
          l.setStyle({ weight: on ? 4 : 2, fillOpacity: on ? 0.35 : 0.12 });
        });
      }
    } catch (e) {}
    const s = siteOf(a.site_id);
    const an = analysisOf(a);
    const r = an.result || {};
    const sig = r.signals || {};
    const used = r.scenes_used || [];
    const pv = an.preview;
    const base = (used.find((x) => x.epoch === "baseline") || {}).acquired || "";
    const recent = (used.find((x) => x.epoch === "recent") || {}).acquired || "";
    const viewer = pv
      ? `<h3>Before / after — real pixels</h3><div class="viewer"><img id="v-b" src="./data/${pv.dir}/before.png" alt="Baseline true colour">` +
        `<img id="v-a" src="./data/${pv.dir}/after.png" alt="Recent true colour" style="clip-path:inset(0 0 0 50%)">` +
        `<img id="v-o" src="./data/${pv.dir}/overlay.png" alt="Marked change pixels" style="clip-path:inset(0 0 0 50%)">` +
        `<div class="viewer-divider" id="v-d" style="left:50%"></div>` +
        `<span class="viewer-cap-l">BEFORE · ${esc(String(base).slice(0, 10))}</span>` +
        `<span class="viewer-cap-r">AFTER · ${esc(String(recent).slice(0, 10))}</span></div>` +
        `<input id="v-s" type="range" min="0" max="100" value="50" style="width:100%" aria-label="Comparison position">` +
        `<div class="meta"><label><input id="v-m" type="checkbox" checked> marked changes (${Number(pv.changed_px || 0).toLocaleString()} px)</label>` +
        ` · true colour · 10 m native · red = vegetation-loss pixels</div>`
      : `<p class="meta">No satellite preview (synthetic demo). Written data below is the full record.</p>`;
    const sigRows = Object.entries(sig).filter(([k]) => k !== "grid_shape")
      .map(([k, v]) => `<div><span>${esc(k)}</span><b class="mono">${esc(typeof v === "number" ? (Math.abs(v) < 10 ? v.toFixed(3) : v.toLocaleString()) : String(v ?? "—"))}</b></div>`).join("");
    detail.innerHTML =
      `<div class="alert ${esc(a.level)}"><div><span class="badge ${esc(a.level)}">${esc(a.level)}</span> <b>${esc(s.name || "")}</b> ` +
      `<span class="meta">${esc(a.id)} · ${esc(s.category || "")} · ${esc(s.boundary_source || "")}</span></div>` +
      viewer + `<div class="metrics">` +
      `<div><div class="l">Change</div><div class="v">${esc(haOf(a.site_id))} ha</div></div>` +
      `<div><div class="l">Events</div><div class="v">${esc(r.n_events ?? "—")}</div></div>` +
      `<div><div class="l">Valid pixels</div><div class="v">${r.valid_fraction != null ? Math.round(r.valid_fraction * 100) + "%" : "—"}</div></div>` +
      `</div><div class="sig">${sigRows}</div>` +
      `<h3>Why this priority</h3><p>${esc(r.explanation || a.explanation || "")} No illegality probability is calculated.</p>` +
      `<h3>Source scenes (${used.length})</h3>` +
      (used.map((sc) => `<div class="meta mono">${esc(sc.epoch || "")} · ${esc(String(sc.acquired).slice(0, 10))} · ${esc(sc.product_id)} · cloud ${esc(sc.cloud_cover)}</div>`).join("") || "<p class='meta'>No scene list.</p>") +
      `<div><button id="copybtn">Copy evidence summary</button> <button id="closebtn">Close</button></div></div>`;
    const sl = document.getElementById("v-s");
    if (sl) sl.addEventListener("input", () => {
      const v = sl.value + "%";
      document.getElementById("v-a").style.clipPath = "inset(0 0 0 " + v + ")";
      document.getElementById("v-o").style.clipPath = "inset(0 0 0 " + v + ")";
      document.getElementById("v-d").style.left = v;
    });
    const mk = document.getElementById("v-m");
    if (mk) mk.addEventListener("change", () => {
      document.getElementById("v-o").style.display = mk.checked ? "" : "none";
    });
    document.getElementById("closebtn").addEventListener("click", () => { detail.innerHTML = ""; });
    document.getElementById("copybtn").addEventListener("click", async () => {
      const txt = [`Argus alert ${a.id}`, s.name, `Priority: ${a.level}`, `Change: ${haOf(a.site_id)} ha`,
        `Scenes: ${used.map((x) => x.product_id).join(", ")}`, `Provider: ${a.provider} · synthetic=${a.synthetic}`,
        "Spectral change is not proof of unlawful activity."].join("\n");
      try { await navigator.clipboard.writeText(txt); } catch (e) {}
    });
    detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  filter.addEventListener("change", render);

  fetch("./data/snapshot.json", { cache: "no-store" })
    .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then((j) => {
      SNAP = j;
      gen.textContent = "snapshot " + (j.generated_at || "?") + " · " + j.algo + (j.synthetic ? " · synthetic" : " · REAL pixels");
      prov.textContent = JSON.stringify({ generated_at: j.generated_at, algo: j.algo, baseline: j.baseline, recent: j.recent, note: j.note }, null, 2);
      notice.hidden = false;
      notice.textContent = j.synthetic
        ? "Demo snapshot — synthetic math, not satellite truth. For live analysis use the full stack."
        : "REAL Sentinel-2 results (single scene per epoch; seasonality can mimic clearing). Spectral change ≠ illegality.";
      render();
    })
    .catch((e) => {
      gen.textContent = "snapshot failed to load";
      notice.hidden = false;
      notice.textContent = "Could not load ./data/snapshot.json (" + e.message + "). Serve via http (python3 -m http.server) and run python3 scripts/export_static.py first.";
    });
})();
