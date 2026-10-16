/* Argus static dashboard mirror — read-only. Reads ./data/snapshot.json only.
   Same views and drawer as the full-stack frontend, minus every input:
   no manual inspection, no role switch, no review/audit writes, no threshold edits. */
(function () {
  "use strict";
  var COLORS = { RED: "#c0392b", AMBER: "#d48806", GREEN: "#1e7e34", GRAY: "#6c757d" };
  var VIEWS = [["overview", "Overview"], ["protected-areas", "Protected Areas"], ["alerts", "Alerts"], ["history", "Analysis History"], ["data-sources", "Data Sources"], ["settings", "Settings"]];
  var THRESHOLDS = [
    ["Forest and national park", "−0.20", "0.5", "2", "20"],
    ["Wetland and haor", "−0.15", "1.0", "2", "25"],
    ["River protection zone", "−0.15", "0.3", "2", "25"],
  ];
  var view = document.getElementById("view");
  var nav = document.getElementById("nav");
  var overlay = document.getElementById("overlay");
  var toastEl = document.getElementById("toast");
  var SNAP = null;
  var F = { pri: "all", site: "all", rev: "all" };
  /* external map providers (local preference only — no account, no tracking) */
  var MAPS = {
    osm: ["OpenStreetMap", function (la, lo, z) { return "https://www.openstreetmap.org/?mlat=" + la + "&mlon=" + lo + "#map=" + z + "/" + la + "/" + lo; }],
    google: ["Google Maps", function (la, lo) { return "https://www.google.com/maps/search/?api=1&query=" + la + "," + lo; }],
    apple: ["Apple Maps", function (la, lo, z) { return "https://maps.apple.com/?q=" + la + "," + lo + "&z=" + z; }],
    bing: ["Bing Maps", function (la, lo, z) { return "https://www.bing.com/maps?cp=" + la + "~" + lo + "&lvl=" + z; }],
    esri: ["Esri / ArcGIS", function (la, lo, z) { return "https://www.arcgis.com/home/webmap/viewer.html?center=" + lo + "," + la + "&level=" + z; }],
    geohack: ["GeoHack", function (la, lo) { return "https://geohack.toolforge.org/geohack.php?params=" + la + "_N_" + lo + "_E"; }],
  };
  function mapPref() { try { var p = localStorage.getItem("argus-maps-provider"); return MAPS[p] ? p : "osm"; } catch (e) { return "osm"; } }
  function mapsLink(lat, lon) {
    var id = mapPref();
    return '<a class="btn ghost" style="font-size:12px;padding:4px 10px" href="' + MAPS[id][1](lat.toFixed(5), lon.toFixed(5), 14) + '" target="_blank" rel="noopener">Open in Maps (' + MAPS[id][0] + ")</a>";
  }
  function siteCenter(g) {
    if (!g || !g.coordinates) return null;
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    (function walk(c) { if (typeof c[0] === "number") { x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]); x1 = Math.max(x1, c[0]); y1 = Math.max(y1, c[1]); } else c.forEach(walk); })(g.coordinates);
    return x0 > x1 ? null : { lon: (x0 + x1) / 2, lat: (y0 + y1) / 2 };
  }
  var layers = { bounds: true, alerts: true };
  var map = null, layer = null, selSite = null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function toast(m) { toastEl.textContent = m; toastEl.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.hidden = true; }, 2600); }
  function pill(l) { return '<span class="badge ' + esc(l) + '">' + esc(l) + "</span>"; }
  function siteOf(id) { return SNAP.sites.find(function (s) { return s.id === id; }) || {}; }
  function analysisOf(a) { return (SNAP.analyses || []).find(function (x) { return x.id === a.analysis_id; }) || {}; }
  function openCount() { return SNAP.alerts.filter(function (a) { return ["UNVERIFIED", "UNDER_REVIEW", "REQUIRES_FIELD_INSPECTION"].indexOf(a.review_status || "UNVERIFIED") > -1; }).length; }

  /* ---------- theme (local preference only) ---------- */
  var themeSel = document.getElementById("theme");
  function applyTheme(t) { var r = document.documentElement; if (t === "system") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", t); try { localStorage.setItem("argus-theme", t); } catch (e) {} }
  try { themeSel.value = localStorage.getItem("argus-theme") || "system"; } catch (e) {}
  applyTheme(themeSel.value);
  themeSel.addEventListener("change", function () { applyTheme(themeSel.value); });

  /* ---------- nav + router ---------- */
  function route() { return (location.hash || "#/overview").replace("#/", ""); }
  function renderNav() {
    nav.innerHTML = VIEWS.map(function (v) {
      return '<a href="#/' + v[0] + '"' + (route() === v[0] ? ' aria-current="page"' : "") + ">" + esc(v[1]) +
        (v[0] === "alerts" ? '<span class="count">' + openCount() + "</span>" : "") + "</a>";
    }).join("");
  }
  window.addEventListener("hashchange", render);

  /* ---------- map (overview only) ---------- */
  function ensureMap() {
    if (map && !map.getContainer().isConnected) { try { map.remove(); } catch (e) {} map = null; layer = null; }
    if (map) { setTimeout(function () { map.invalidateSize(); }, 50); paintPolys(true); return; }
    map = L.map("map").setView([23.9, 90.4], 7);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics", maxZoom: 19,
    }).addTo(map);
    layer = L.geoJSON(null, {
      style: function (f) { var c = layers.alerts ? (COLORS[f.properties.level] || "#666") : "#047857"; return { color: c, weight: f.properties.sel ? 4 : 2, fillOpacity: f.properties.sel ? 0.35 : 0.15 }; },
      onEachFeature: function (f, l) {
        l.bindPopup("<b>" + esc(f.properties.name) + "</b><br>" + esc(f.properties.level) + " · " + esc(f.properties.ha) + " ha");
        l.on("click", function () { selSite = f.properties.site_id; paintPolys(); openAlert(f.properties.alert_id); });
      },
    }).addTo(map);
    paintPolys(true);
  }
  function paintPolys(fit) {
    if (!layer) return;
    var feats = SNAP.sites.map(function (s) {
      var a = SNAP.alerts.find(function (x) { return x.site_id === s.id; });
      return { type: "Feature", properties: { name: s.name, level: a ? a.level : "GRAY", ha: a && a.total_ha != null ? Number(a.total_ha).toFixed(1) : "—", site_id: s.id, alert_id: a ? a.id : "", sel: s.id === selSite }, geometry: s.geometry };
    }).filter(function (f) { return layers.bounds || f.properties.sel; });
    layer.clearLayers();
    layer.addData({ type: "FeatureCollection", features: feats });
    if (fit && feats.length) { try { map.fitBounds(layer.getBounds(), { padding: [20, 20] }); } catch (e) {} }
  }
  function centerOf(g) {
    if (!g || !g.coordinates) return null;
    var xs = [], ys = [];
    (function walk(c) { if (typeof c[0] === "number") { xs.push(c[0]); ys.push(c[1]); } else c.forEach(walk); })(g.coordinates);
    if (!xs.length) return null;
    return [(Math.min.apply(0, xs) + Math.max.apply(0, xs)) / 2, (Math.min.apply(0, ys) + Math.max.apply(0, ys)) / 2];
  }
  function zoomTo(siteId) {
    var s = siteOf(siteId);
    if (!s.geometry || !map) return;
    selSite = siteId; paintPolys(false);
    try { map.fitBounds(L.geoJSON(s.geometry).getBounds().pad(0.6), { animate: true }); } catch (e) {}
  }

  /* ---------- views ---------- */
  function vOverview() {
    var open = SNAP.alerts.filter(function (a) { return ["UNVERIFIED", "UNDER_REVIEW", "REQUIRES_FIELD_INSPECTION"].indexOf(a.review_status || "UNVERIFIED") > -1; });
    var red = open.filter(function (a) { return a.level === "RED"; }).length;
    var gray = SNAP.alerts.filter(function (a) { return a.level === "GRAY"; }).length;
    var by = { RED: 0, AMBER: 0, GREEN: 0, GRAY: 0 };
    SNAP.alerts.forEach(function (a) { by[a.level] = (by[a.level] || 0) + 1; });
    var tot = Math.max(1, SNAP.alerts.length);
    var seg = function (k, c) { return by[k] ? '<span class="' + c + '" style="width:' + (by[k] / tot * 100) + '%"></span>' : ""; };
    var needs = open.slice().sort(function (a, b) { return (a.level === "RED" ? 0 : 1) - (b.level === "RED" ? 0 : 1); }).slice(0, 6);
    var needHTML = needs.length ? needs.map(function (a) {
      var c = siteCenter(siteOf(a.site_id).geometry);
      return '<button class="linklike" data-open="' + a.id + '"><div style="display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid #eee">' + pill(a.level) +
        '<span style="flex:1"><b>' + esc(siteOf(a.site_id).name || a.site_id) + '</b><br><span class="meta">' + a.id + ' · ' + (a.total_ha != null ? Number(a.total_ha).toFixed(1) + " ha" : "—") + "</span></span></div></button>" +
        (c ? '<div style="padding:2px 0 6px">' + mapsLink(c.lat, c.lon) + "</div>" : "");
    }).join("") : '<p class="meta">Nothing pending.</p>';
    var h = '<div class="row"><div><h2 class="page">Overview</h2><p class="sub">Counts are calculated from the snapshot records below. Snapshot ' + esc((SNAP.generated_at || "").slice(0, 10)) + '.</p></div></div>';
    h += '<div class="notice">' + esc(SNAP.note || "") + "</div>";
    h += '<div class="cards"><div class="card"><div class="k">Registered sites</div><div class="v">' + SNAP.sites.length + '</div></div>' +
      '<div class="card"><div class="k">Analyses in snapshot</div><div class="v">' + SNAP.analyses.length + '</div></div>' +
      '<div class="card"><div class="k">Pending alerts</div><div class="v">' + open.length + '</div></div>' +
      '<div class="card"><div class="k">High-priority, open</div><div class="v red">' + red + '</div></div>' +
      '<div class="card"><div class="k">Insufficient imagery</div><div class="v gray">' + gray + '</div></div></div>';
    h += '<div class="grid-2"><div class="card"><h3>Monitoring map</h3>' +
      '<div class="maptools"><label><input type="checkbox" id="l-b" ' + (layers.bounds ? "checked" : "") + '> Boundaries</label>' +
      '<label><input type="checkbox" id="l-a" ' + (layers.alerts ? "checked" : "") + '> Alerts</label></div>' +
      '<div id="map"></div><div class="legend"><span><i style="background:#c0392b"></i>High priority</span><span><i style="background:#d48806"></i>Possible disturbance</span><span><i style="background:#1e7e34"></i>No change</span><span><i style="background:#6c757d"></i>Insufficient</span></div></div>';
    h += '<div><div class="card"><h3>Needs attention</h3>' + needHTML + "</div>";
    h += '<div class="card" style="margin-top:12px"><h3>Alert distribution</h3><div class="distbar">' + seg("RED", "r") + seg("AMBER", "a") + seg("GREEN", "g") + seg("GRAY", "z") + "</div>" +
      '<p class="meta" style="margin-top:6px">Green does not certify compliance. Gray means the site could not be assessed.</p></div></div></div>';
    h += '<div class="card"><h3>Recent analysis activity</h3><table><tbody>' + SNAP.analyses.slice(0, 6).map(function (r) {
      var res = r.result || {};
      return "<tr><td><b>" + esc(siteOf(r.site_id).name || r.site_id || "manual") + "</b><br><span class='meta'>" + esc(r.id) + " · " + esc(res.provider || "") + "</span></td>" +
        "<td class='mono'>" + (res.n_baseline_scenes != null ? res.n_baseline_scenes + " / " + res.n_recent_scenes : "—") + "</td><td>" + pill(res.level || "GRAY") + "</td></tr>";
    }).join("") + "</tbody></table></div>";
    return h;
  }

  function vAreas() {
    var h = '<div class="row"><div><h2 class="page">Protected Areas</h2><p class="sub">Registered monitoring sites with boundary source and verification status.</p></div></div>';
    h += '<div class="card"><table><thead><tr><th>Site</th><th>Boundary</th><th>Status</th><th>Last analysis</th></tr></thead><tbody>' +
      SNAP.sites.map(function (s) {
        var a = SNAP.alerts.find(function (x) { return x.site_id === s.id; });
        var an = a ? analysisOf(a) : {};
        return '<tr class="clickable" data-site="' + s.id + '"><td><b>' + esc(s.name) + '</b><br><span class="meta">' + esc(s.id) + " · " + esc(s.category || "") + "</span></td>" +
          "<td>" + esc(s.verification || "") + '<br><span class="meta">' + esc(s.boundary_source || "") + "</span></td>" +
          "<td>" + (a ? pill(a.level) : '<span class="meta">no analysis</span>') + "</td>" +
          "<td class='meta'>" + esc((SNAP.generated_at || "").slice(0, 10)) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    h += '<div class="card" id="site-detail"><p class="meta">Select a site row to see its details. Boundary registration is disabled in this read-only mirror.</p></div>';
    return h;
  }
  function siteDetail(s) {
    var a = SNAP.alerts.find(function (x) { return x.site_id === s.id; });
    var an = a ? analysisOf(a) : {}; var r = an.result || {};
    return '<h3>' + esc(s.name) + '</h3><p class="meta">' + esc(s.id) + " · " + esc(s.category || "") + "</p>" +
      (a ? pill(a.level) : "") +
      '<dl style="display:grid;grid-template-columns:auto 1fr;gap:6px 16px;font-size:13px;margin:10px 0">' +
      "<dt class='meta'>Region</dt><dd>" + esc(s.region || "—") + "</dd>" +
      "<dt class='meta'>Gazette area</dt><dd>" + esc(s.area_ha_wiki != null ? Number(s.area_ha_wiki).toLocaleString() + " ha" : "—") + "</dd>" +
      "<dt class='meta'>Boundary source</dt><dd>" + esc(s.boundary_source || "") + "</dd>" +
      "<dt class='meta'>Verification</dt><dd>" + esc(s.verification || "") + "</dd>" +
      "<dt class='meta'>Legal reference</dt><dd>" + esc(s.legal_reference || "—") + "</dd></dl>" +
      (s.verification !== "OSM-REFERENCE" && s.verification ? '<div class="notebox">This boundary is not verified. Results are shown for review only.</div>' : "") +
      (a ? '<button class="btn" data-open="' + a.id + '" style="margin-top:8px">Open alert evidence</button>' : '<p class="meta">No analysis for this site in the snapshot.</p>');
  }

  function vAlerts() {
    var list = SNAP.alerts.filter(function (a) {
      return (F.pri === "all" || a.level === F.pri) && (F.site === "all" || a.site_id === F.site) && (F.rev === "all" || (a.review_status || "UNVERIFIED") === F.rev);
    });
    var h = '<div class="row"><div><h2 class="page">Alerts</h2><p class="sub">Algorithm priority and human review status are separate. Nothing here names anyone as unlawful. Read-only mirror — reviews change in the full app.</p></div></div>';
    h += '<div class="card"><div class="filters">' +
      '<label>Priority<select id="f-pri"><option value="all">All priorities</option><option>RED</option><option>AMBER</option><option>GREEN</option><option>GRAY</option></select></label>' +
      '<label>Site<select id="f-site"><option value="all">All sites</option>' + SNAP.sites.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + "</option>"; }).join("") + "</select></label>" +
      '<label>Review status<select id="f-rev"><option value="all">All statuses</option><option>UNVERIFIED</option><option>UNDER_REVIEW</option><option>CONFIRMED_DISTURBANCE</option><option>DISMISSED</option><option>REQUIRES_FIELD_INSPECTION</option></select></label></div>';
    h += (list.length ? list.map(function (a) {
      var c = siteCenter(siteOf(a.site_id).geometry);
      return '<button class="linklike" data-open="' + a.id + '"><div class="alrow"><span>' + pill(a.level) + "</span>" +
        "<span><b>" + esc(siteOf(a.site_id).name || a.site_id) + "</b><br><span class='meta mono'>" + a.id + (a.synthetic ? " · synthetic" : " · real") + "</span></span>" +
        "<span class='mono'>" + (a.total_ha != null ? Number(a.total_ha).toFixed(1) + " ha" : "—") + "</span>" +
        '<span><span class="tag">' + esc(a.review_status || "UNVERIFIED") + "</span></span>" +
        '<span class="meta hide-sm">' + esc((a.created_at || "").slice(0, 10)) + "</span></div></button>" +
        (c ? '<div style="padding:0 8px 8px">' + mapsLink(c.lat, c.lon) + "</div>" : "");
    }).join("") : '<div class="empty"><b>No alerts match these filters</b>Clear a filter to see more.</div>') + "</div>";
    return h;
  }

  function vHistory() {
    return '<div class="row"><div><h2 class="page">Analysis History</h2><p class="sub">Every snapshot run with provider, scene counts and outcome.</p></div></div>' +
      '<div class="card"><table><thead><tr><th>Run</th><th>Location</th><th>Provider</th><th>Scenes b/r</th><th>Outcome</th></tr></thead><tbody>' +
      SNAP.analyses.map(function (r) {
        var res = r.result || {};
        return "<tr><td class='mono'>" + esc(r.id) + "</td><td><b>" + esc(siteOf(r.site_id).name || r.site_id) + "</b></td>" +
          "<td>" + esc(res.provider || "—") + (res.synthetic ? ' <span class="badge syn">synthetic</span>' : ' <span class="badge real">real</span>') + "</td>" +
          "<td class='mono'>" + (res.n_baseline_scenes != null ? res.n_baseline_scenes + " / " + res.n_recent_scenes : "—") + "</td>" +
          "<td>" + pill(res.level || "GRAY") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function vSources() {
    return '<div class="row"><div><h2 class="page">Data Sources</h2><p class="sub">Imagery providers and boundary sources, with limits (snapshot-time status).</p></div></div>' +
      '<div class="grid-2">' +
      '<div class="card"><div class="row"><div><h3>Microsoft Planetary Computer (STAC)</h3><p class="meta">Primary catalog and Sentinel-2 L2A access</p></div><span class="badge GREEN">Reachable</span></div><p class="meta">Anonymous reads may be throttled. Asset signing handled by the backend adapter.</p><p style="font-size:13px">Native resolution <b class="mono">10 m / 20 m</b></p></div>' +
      '<div class="card"><div class="row"><div><h3>Copernicus Data Space Ecosystem</h3><p class="meta">Alternative provider adapter</p></div><span class="badge GRAY">Not enabled</span></div><p style="font-size:13px">Native resolution <b class="mono">10 m / 20 m</b></p></div></div>' +
      '<div class="card"><h3>Boundary and licence register</h3><table><thead><tr><th>Source</th><th>Used for</th><th>Limitation</th><th>Role</th></tr></thead><tbody>' +
      [["Bangladesh Forest Dept", "Parks, sanctuaries, reserves", "Manual import of official files; confirm gazette", "Preferred"], ["Water Development Board", "River corridors, demarcation", "A visible river edge is not a legal boundary", "Preferred for rivers"], ["Protected Planet", "Reference boundaries", "Non-commercial; check release date/coverage", "Reference only"], ["OpenStreetMap", "Site polygons in this snapshot", "Not a legal cadastre (ODbL)", "Reference only"], ["Copernicus Sentinel data", "Optical imagery", "Free/open; revisit ≠ cloud-free scene", "Imagery"]].map(function (r) {
        return "<tr><td><b>" + r[0] + "</b></td><td>" + r[1] + "</td><td>" + r[2] + '</td><td><span class="tag">' + r[3] + "</span></td></tr>";
      }).join("") + "</tbody></table></div>" +
      '<div class="card"><h3>What 10 m pixels can and cannot show</h3><p style="font-size:13px;max-width:75ch">One Sentinel-2 pixel covers about 100 m². Clearings, land preparation and larger structures can appear. Single houses, individual trees and narrow strips often will not. Argus reports the scale of every change and does not claim to find every violation. Revisit time of about five days does not guarantee a cloud-free scene.</p></div>';
  }

  function vSettings() {
    var pref = mapPref();
    var radios = Object.keys(MAPS).map(function (id) {
      return '<label style="display:flex;gap:8px;align-items:center;font-size:13px;padding:4px 0"><input type="radio" name="maps" value="' + id + '"' + (pref === id ? " checked" : "") + "> <b>" + MAPS[id][0] + "</b> " +
        '<a href="' + MAPS[id][1](23.83, 90.345, 14) + '" target="_blank" rel="noopener" style="font-size:12px">try Dhaka</a></label>';
    }).join("");
    return '<div class="row"><div><h2 class="page">Settings</h2><p class="sub">Detection thresholds by site type — starting values (read-only here). Algo vrx1-1.0.0.</p></div></div>' +
      '<div class="card"><h3>Map provider — “Open in Maps” links</h3><p class="meta">Every alert links its site center to one of these. Stored only in this browser.</p><div id="map-prefs">' + radios + "</div></div>" +
      '<div class="card"><h3>Detection thresholds</h3><table><thead><tr><th>Site type</th><th>NDVI drop</th><th>Min patch (ha)</th><th>Min scenes</th><th>Max cloud %</th></tr></thead><tbody>' +
      THRESHOLDS.map(function (r) { return "<tr><td>" + r[0] + "</td><td class='mono'>" + r[1] + "</td><td class='mono'>" + r[2] + "</td><td class='mono'>" + r[3] + "</td><td class='mono'>" + r[4] + "</td></tr>"; }).join("") +
      "</tbody></table></div>" +
      '<div class="card"><h3>Roles (full app)</h3><table><tbody>' +
      [["View sites, alerts and evidence", "Yes", "Yes", "Yes"], ["Run manual inspections", "Yes", "Yes", "Yes"], ["Change review status + notes", "No", "Yes", "Yes"], ["Register/edit boundaries", "No", "No", "Yes"], ["Change thresholds", "No", "No", "Yes"]].map(function (r) {
        return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td><td>" + r[3] + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      '<div class="card"><h3>Safeguards</h3><p style="font-size:13px">Priority labels are rule-based — no illegality probability is calculated. Review states are stored apart from algorithm output. This mirror accepts no input at all.</p></div>';
  }

  /* ---------- read-only evidence drawer ---------- */
  function openAlert(id) {
    var a = SNAP.alerts.find(function (x) { return x.id === id; });
    if (!a) return;
    var s = siteOf(a.site_id), an = analysisOf(a), r = an.result || {};
    var sig = r.signals || {}, used = r.scenes_used || [];
    var base = ((used.find(function (x) { return x.epoch === "baseline"; }) || {}).acquired || "").slice(0, 10);
    var recent = ((used.find(function (x) { return x.epoch === "recent"; }) || {}).acquired || "").slice(0, 10);
    var pv = an.preview;
    var viewer = pv
      ? '<h4>Before / after — real pixels</h4><div class="viewer"><img src="./data/' + pv.dir + "/" + pv.before + '" alt="Baseline">' +
        '<img id="v-a" src="./data/' + pv.dir + "/" + pv.after + '" alt="Recent" style="clip-path:inset(0 0 0 50%)">' +
        '<img id="v-o" src="./data/' + pv.dir + "/" + pv.overlay + '" alt="Marked changes" style="clip-path:inset(0 0 0 50%)">' +
        '<div class="viewer-divider" id="v-d" style="left:50%"></div>' +
        '<span class="viewer-cap-l">BEFORE · ' + esc(base) + "</span>" +
        '<span class="viewer-cap-r">AFTER · ' + esc(recent) + "</span></div>" +
        '<input id="v-s" class="slider" type="range" min="0" max="100" value="50" aria-label="Comparison position">' +
        '<p class="meta"><label><input id="v-m" type="checkbox" checked> marked changes (' + Number(pv.changed_px || 0).toLocaleString() + " px)</label> · true colour · 10 m native · red = vegetation-loss pixels</p>"
      : '<p class="meta">No satellite preview in snapshot. Written data below is the full record.</p>';
    var hist = (SNAP.reviews || []).filter(function (e) { return e.alert_id === id; });
    overlay.innerHTML = '<div class="scrim" id="scrim"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="Alert ' + esc(id) + '">' +
      '<div class="drawer-h"><div><p class="meta mono">' + esc(a.id) + " · " + esc((a.created_at || "").slice(0, 10)) + "</p><h2 class='page' style='font-size:17px'>" + esc(s.name || a.site_id) + "</h2>" +
      '<p style="margin-top:6px">' + pill(a.level) + '<span class="tag">' + esc(a.review_status || "UNVERIFIED") + "</span>" + (a.synthetic ? ' <span class="badge syn">synthetic</span>' : ' <span class="badge real">real pixels</span>') + "</p>" +
      (function () { var cc = siteCenter(s.geometry); return cc ? '<p style="margin-top:6px">' + mapsLink(cc.lat, cc.lon) + "</p>" : ""; })() + "</div>" +
      '<div><button class="btn ghost" id="d-close">Close</button></div></div>' +
      '<div class="drawer-b"><div>' + viewer + "</div>" +
      "<div><h4>Measurements</h4><div class='metrics'>" +
      "<div><div class='l'>Change</div><div class='v'>" + (a.total_ha != null ? Number(a.total_ha).toFixed(1) + " ha" : "—") + "</div></div>" +
      "<div><div class='l'>Events</div><div class='v'>" + (r.n_events != null ? r.n_events : "—") + "</div></div>" +
      "<div><div class='l'>Valid pixels</div><div class='v'>" + (r.valid_fraction != null ? Math.round(r.valid_fraction * 100) + "%" : "—") + "</div></div>" +
      "<div><div class='l'>Mean ΔNDVI</div><div class='v'>" + (sig.mean_d_ndvi != null ? Number(sig.mean_d_ndvi).toFixed(3) : "—") + "</div></div>" +
      "<div><div class='l'>Veg-loss px</div><div class='v'>" + (sig.veg_loss_px != null ? Number(sig.veg_loss_px).toLocaleString() : "—") + "</div></div>" +
      "<div><div class='l'>Scenes b/r</div><div class='v'>" + (r.n_baseline_scenes != null ? r.n_baseline_scenes + " / " + r.n_recent_scenes : "—") + "</div></div></div>" +
      "<p class='meta' style='margin-top:6px'>" + esc(r.explanation || a.explanation || "") + "</p></div>" +
      "<div><h4>Signals</h4><div class='sig'>" + Object.keys(sig).filter(function (k) { return k !== "grid_shape"; }).map(function (k) {
        var v = sig[k];
        return "<div><span>" + esc(k) + "</span><b class='mono'>" + esc(typeof v === "number" ? (Math.abs(v) < 10 ? v.toFixed(3) : v.toLocaleString()) : String(v == null ? "—" : v)) + "</b></div>";
      }).join("") + "</div></div>" +
      "<div><h4>Why this priority</h4><div class='notebox'>" + esc(r.explanation || a.explanation || "") + " No illegality probability is calculated.</div></div>" +
      "<div><h4>Source scenes (" + used.length + ")</h4>" + (used.map(function (sc) {
        return "<div class='meta mono'>" + esc(sc.epoch || "") + " · " + esc(String(sc.acquired).slice(0, 10)) + " · " + esc(sc.product_id) + " · cloud " + esc(sc.cloud_cover) + "</div>";
      }).join("") || "<p class='meta'>No scene list.</p>") +
      "<p class='meta'>Provider: " + esc(r.provider || a.provider || "") + " · Sentinel-2 L2A · 10 m native.</p></div>" +
      "<div><h4>Audit history (" + hist.length + ") — read-only</h4>" + (hist.length ? '<div class="timeline">' + hist.slice().reverse().map(function (e) {
        return "<div><b>" + esc(e.status) + "</b> <span class='meta'>· " + esc((e.at || "").slice(0, 10)) + "</span><div>" + esc(e.note || "") + "</div></div>";
      }).join("") + "</div>" : "<p class='meta'>No review events in snapshot. Reviews change in the full app.</p>") +
      '<p style="margin-top:8px"><button class="btn ghost" id="d-copy">Copy evidence summary</button></p></div>' +
      "</div></aside>";
    document.body.style.overflow = "hidden";
    document.getElementById("d-close").addEventListener("click", closeAlert);
    document.getElementById("scrim").addEventListener("click", closeAlert);
    var sl = document.getElementById("v-s");
    if (sl) sl.addEventListener("input", function () {
      var v = sl.value + "%";
      document.getElementById("v-a").style.clipPath = "inset(0 0 0 " + v + ")";
      document.getElementById("v-o").style.clipPath = "inset(0 0 0 " + v + ")";
      document.getElementById("v-d").style.left = v;
    });
    var mk = document.getElementById("v-m");
    if (mk) mk.addEventListener("change", function () { document.getElementById("v-o").style.display = mk.checked ? "" : "none"; });
    document.getElementById("d-copy").addEventListener("click", function () {
      var txt = ["Argus alert " + a.id, s.name, "Priority: " + a.level + " · Review: " + (a.review_status || "UNVERIFIED"),
        a.total_ha != null ? "Change: " + Number(a.total_ha).toFixed(1) + " ha" : "No assessable change",
        "Scenes: " + used.map(function (x) { return x.product_id; }).join(", "),
        "Provider: " + (r.provider || a.provider || "") + " · synthetic=" + a.synthetic,
        "Spectral change is not proof of unlawful activity."].join("\n");
      try { navigator.clipboard.writeText(txt).then(function () { toast("Evidence summary copied"); }); } catch (e) { toast("Copy blocked by browser"); }
    });
  }
  function closeAlert() { overlay.innerHTML = ""; document.body.style.overflow = ""; }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAlert(); });

  /* ---------- render ---------- */
  function render() {
    if (!SNAP) return;
    renderNav();
    var r = route();
    var mapfn = { overview: vOverview, "protected-areas": vAreas, alerts: vAlerts, history: vHistory, "data-sources": vSources, settings: vSettings };
    view.innerHTML = (mapfn[r] || vOverview)();
    if (r === "overview") {
      ensureMap();
      document.getElementById("l-b").addEventListener("change", function (e) { layers.bounds = e.target.checked; paintPolys(false); });
      document.getElementById("l-a").addEventListener("change", function (e) { layers.alerts = e.target.checked; paintPolys(true); });
    }
    if (r === "alerts") {
      ["pri", "site", "rev"].forEach(function (k) {
        var el = document.getElementById("f-" + k);
        el.value = F[k];
        el.addEventListener("change", function () { F[k] = el.value; render(); });
      });
    }
    if (r === "settings") {
      document.querySelectorAll('#map-prefs input[name="maps"]').forEach(function (el) {
        el.addEventListener("change", function () {
          try { localStorage.setItem("argus-maps-provider", el.value); } catch (e) {}
          toast("Map provider: " + MAPS[el.value][0]);
        });
      });
    }
    view.querySelectorAll("[data-open]").forEach(function (b) { b.addEventListener("click", function () { openAlert(b.dataset.open); }); });
    view.querySelectorAll("[data-site]").forEach(function (tr) {
      tr.addEventListener("click", function () {
        var d = document.getElementById("site-detail");
        if (d) { d.innerHTML = siteDetail(siteOf(tr.dataset.site)); bindOpens(d); d.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
      });
    });
    window.scrollTo(0, 0);
  }
  function bindOpens(root) { root.querySelectorAll("[data-open]").forEach(function (b) { b.addEventListener("click", function () { openAlert(b.dataset.open); }); }); }

  fetch("./data/snapshot.json", { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (j) { SNAP = j; render(); })
    .catch(function (e) { view.innerHTML = '<div class="notice">Could not load ./data/snapshot.json (' + esc(e.message) + "). Serve over http.</div>"; });
})();
