"""Render an offline scouting notebook without fetching or embedding imagery."""

import json


def render_report(manifest: dict) -> str:
    """Return a self-contained HTML notebook for a generated route manifest.

    Escape HTML-significant characters in JSON as well as Unicode line breaks.
    JSON encoding alone does not prevent a ``</script>`` sequence from ending
    an HTML script element, even when its type is application/json.
    """
    payload = json.dumps(manifest, ensure_ascii=False, allow_nan=False)
    for character, replacement in (
        ("&", "\\u0026"),
        ("<", "\\u003c"),
        (">", "\\u003e"),
        ("\u2028", "\\u2028"),
        ("\u2029", "\\u2029"),
    ):
        payload = payload.replace(character, replacement)
    return _HTML.replace("__MANIFEST_JSON__", payload)


_HTML = r'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>Street View scouting notebook</title>
  <style>
    :root { color-scheme: dark; --bg:#0c1621; --panel:#142332; --line:#31414e; --paper:#f2eee4; --muted:#a4b1bb; --gold:#f2bf68; --green:#98d7b8; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--paper); font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    button,input,select,textarea { font:inherit; }
    button,a,input,select,textarea { -webkit-tap-highlight-color:transparent; }
    button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible { outline:3px solid var(--gold); outline-offset:3px; }
    button { cursor:pointer; }
    a { color:var(--gold); text-underline-offset:3px; }
    .shell { max-width:1240px; margin:0 auto; padding:44px 32px 28px; }
    .masthead { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; border-top:3px solid var(--gold); padding-top:24px; }
    .eyebrow { color:var(--gold); font-size:11px; font-weight:700; letter-spacing:.18em; text-transform:uppercase; }
    h1 { max-width:660px; font:500 clamp(30px,4vw,48px)/1.12 Georgia,serif; letter-spacing:-.03em; margin:12px 0; }
    h2 { margin:0; font:500 28px/1.25 Georgia,serif; overflow-wrap:anywhere; }
    p { margin:8px 0; }
    .subtitle,.hint { color:var(--muted); }
    .hint { font-size:12px; }
    .actions { display:flex; gap:8px; flex-wrap:wrap; padding-top:4px; }
    .button { display:inline-flex; align-items:center; justify-content:center; border:1px solid var(--line); border-radius:5px; background:var(--panel); padding:9px 13px; color:var(--paper); text-decoration:none; font-weight:600; font-size:13px; }
    .button:hover { border-color:var(--gold); }
    .button.primary { background:var(--gold); border-color:var(--gold); color:var(--bg); }
    .button:disabled { cursor:default; opacity:.4; }
    .summary { display:flex; align-items:center; flex-wrap:wrap; gap:12px 26px; margin:28px 0 22px; padding:14px 0; border-top:1px solid var(--line); border-bottom:1px solid var(--line); }
    .summary strong { font-size:20px; font-weight:500; margin-right:6px; }
    .summary span { color:var(--muted); font-size:12px; }
    .summary .session { margin-left:auto; color:var(--green); }
    .workspace { display:grid; grid-template-columns:280px minmax(0,1fr); gap:24px; }
    .sidebar { min-width:0; }
    label,.field-label { display:block; color:var(--muted); font-size:12px; font-weight:600; margin-bottom:7px; }
    select,input,textarea { width:100%; border:1px solid var(--line); border-radius:5px; padding:10px 12px; background:var(--bg); color:var(--paper); }
    textarea { resize:vertical; min-height:158px; line-height:1.6; }
    .route-label { display:flex; justify-content:space-between; margin:24px 0 10px; }
    .stop-list { display:flex; flex-direction:column; gap:6px; max-height:610px; overflow-y:auto; padding:3px; margin:-3px; }
    .stop { width:100%; border:1px solid transparent; border-radius:5px; background:transparent; color:var(--paper); text-align:left; padding:12px; }
    .stop:hover { background:var(--panel); }
    .stop[aria-current="true"] { background:var(--panel); border-color:var(--gold); }
    .stop-top { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:13px; }
    .stop-street { margin-top:3px; display:block; font-size:12px; color:var(--muted); overflow-wrap:anywhere; }
    .status-dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--muted); flex-shrink:0; }
    .status-dot.checked { background:var(--green); }
    .status-dot.unavailable { background:var(--gold); }
    .detail { min-width:0; background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:28px; }
    .detail-top { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:22px; }
    .detail-top .eyebrow { margin-bottom:8px; }
    .badge { flex-shrink:0; border:1px solid var(--line); border-radius:20px; padding:3px 10px; font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.07em; }
    .coordinates { margin-top:10px; font:12px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace; color:var(--muted); }
    .section-title { margin:0 0 10px; color:var(--paper); font-size:13px; font-weight:600; }
    .directions { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }
    .direction { display:flex; flex-direction:column; gap:9px; align-items:flex-start; padding:15px 12px; border:1px solid var(--line); border-radius:5px; color:var(--paper); text-decoration:none; font-size:13px; }
    .direction:hover { background:var(--bg); border-color:var(--gold); }
    .direction .arrow { color:var(--gold); font-size:24px; line-height:1; }
    .direction small { font-size:11px; color:var(--muted); }
    .direction[aria-disabled="true"] { opacity:.4; cursor:default; }
    .reference-note { margin-top:12px; }
    .review { border-top:1px solid var(--line); margin-top:24px; padding-top:24px; }
    .review-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
    .field { margin-bottom:17px; }
    .save-state { color:var(--green); margin:0; }
    .navigation { display:flex; justify-content:space-between; gap:12px; margin-top:24px; padding-top:18px; border-top:1px solid var(--line); }
    .empty { padding:36px 0; color:var(--muted); }
    .notice { border-left:3px solid var(--gold); background:var(--panel); padding:10px 14px; margin:16px 0; color:var(--paper); }
    footer { display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px 30px; margin-top:32px; padding-top:18px; border-top:1px solid var(--line); color:var(--muted); font-size:12px; }
    footer p { margin:0; }
    [hidden] { display:none !important; }
    @media(max-width:850px) { .masthead { flex-direction:column; gap:12px; } .workspace { grid-template-columns:220px minmax(0,1fr); gap:16px; } .detail { padding:20px; } .directions { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    @media(max-width:620px) { .shell { padding:22px 16px; } .workspace { grid-template-columns:1fr; } .stop-list { max-height:190px; } .summary .session { margin-left:0; width:100%; } .review-grid { grid-template-columns:1fr; gap:0; } .detail-top { flex-wrap:wrap; } .detail { padding:18px; } }
  </style>
</head>
<body>
<main class="shell">
  <header class="masthead">
    <div>
      <div class="eyebrow">NYC / Field research</div>
      <h1>Street View scouting notebook</h1>
      <p class="subtitle" id="project-label"></p>
    </div>
    <div class="actions">
      <button class="button" id="import-button" type="button">Import notes</button>
      <button class="button primary" id="export-button" type="button">Export notebook JSON ↓</button>
      <input type="file" id="import-file" accept=".json,application/json" hidden>
    </div>
  </header>
  <noscript><p class="notice">Enable JavaScript to use this offline notebook.</p></noscript>
  <p id="notice" class="notice" role="status" hidden></p>
  <div class="summary" aria-label="Review progress">
    <div><strong id="total-count">0</strong><span>locations</span></div>
    <div><strong id="checked-count">0</strong><span>checked</span></div>
    <div><strong id="pending-count">0</strong><span>pending</span></div>
    <div><strong id="unavailable-count">0</strong><span>unavailable</span></div>
    <span class="session" id="session-state" role="status">Notes stay in this browser tab until exported.</span>
  </div>
  <div class="workspace">
    <aside class="sidebar" aria-label="Scouting locations">
      <label for="street-filter">Filter by street</label>
      <select id="street-filter"><option value="">All streets</option></select>
      <div class="route-label"><span class="field-label">LOCATIONS</span><span class="hint" id="visible-count"></span></div>
      <div class="stop-list" id="stop-list"></div>
      <p class="hint">Open each view, observe the street, then record what you find.</p>
    </aside>
    <section class="detail" id="detail" aria-label="Selected location">
      <div class="detail-top">
        <div><div class="eyebrow" id="stop-id"></div><h2 id="stop-street"></h2><div class="coordinates" id="coordinates"></div></div>
        <span class="badge" id="status-badge"></span>
      </div>
      <p class="section-title">Explore the surroundings</p>
      <div class="directions" id="directions">
        <a class="direction" id="view-forward" target="_blank" rel="noopener noreferrer"><span class="arrow" aria-hidden="true">↑</span><span>Forward ↗</span><small></small></a>
        <a class="direction" id="view-left" target="_blank" rel="noopener noreferrer"><span class="arrow" aria-hidden="true">←</span><span>Left ↗</span><small></small></a>
        <a class="direction" id="view-right" target="_blank" rel="noopener noreferrer"><span class="arrow" aria-hidden="true">→</span><span>Right ↗</span><small></small></a>
        <a class="direction" id="view-back" target="_blank" rel="noopener noreferrer"><span class="arrow" aria-hidden="true">↓</span><span>Back ↗</span><small></small></a>
      </div>
      <p class="hint reference-note">Links open Google Maps. Coverage and imagery dates must be checked in the viewer.</p>
      <form class="review" id="review-form">
        <p class="section-title">Field notes</p>
        <div class="review-grid">
          <div class="field"><label for="review-status">Review status</label><select id="review-status"><option value="pending">Pending</option><option value="checked">Checked</option><option value="unavailable">Imagery unavailable</option></select></div>
          <div class="field"><label for="imagery-date">Imagery date shown in viewer</label><input id="imagery-date" type="text" placeholder="e.g. June 2025" maxlength="100"></div>
        </div>
        <div class="field"><label for="review-notes">Observations</label><textarea id="review-notes" placeholder="Building materials, street width, paving, signs, landmarks, and details worth revisiting…" maxlength="100000"></textarea></div>
        <div class="field"><label for="source-url">Viewer link for this observation (optional)</label><input id="source-url" type="text" inputmode="url" placeholder="Paste the Google Maps viewer URL" maxlength="10000"></div>
        <p class="hint" id="checked-at"></p>
        <p class="hint save-state" id="save-state" role="status">Export notebook JSON to keep your notes on disk.</p>
        <p class="hint">Notes are held in memory. Closing or refreshing this tab discards changes that have not been exported.</p>
      </form>
      <div class="navigation"><button class="button" type="button" id="previous">← Previous</button><button class="button" type="button" id="next">Next location →</button></div>
    </section>
    <p class="empty" id="empty-state" hidden>No locations in this notebook.</p>
  </div>
  <footer>
    <p>Locations from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> · <span id="attribution"></span></p>
    <p>Offline notes · External viewers open in a new tab</p>
  </footer>
</main>
<script type="application/json" id="notebook-data">__MANIFEST_JSON__</script>
<script>
"use strict";
(() => {
  const byId = (id) => document.getElementById(id);
  const manifest = JSON.parse(byId("notebook-data").textContent);
  const statuses = new Set(["pending", "checked", "unavailable"]);
  const stops = manifest.stops;
  const baselineById = new Map(stops.map((stop) => [stop.id, stop]));
  let currentId = stops.length ? stops[0].id : null;
  let dirty = false;
  let savedInSession = false;

  function viewerUrl(value, allowShare = false) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
      const isMaps = url.hostname === "maps.google.com" ||
        (url.hostname === "www.google.com" && (url.pathname === "/maps" || url.pathname.startsWith("/maps/")));
      if (!isMaps && !(allowShare && url.hostname === "maps.app.goo.gl")) return null;
      return url.href;
    } catch (_) { return null; }
  }

  function filteredStops() {
    const street = byId("street-filter").value;
    return street ? stops.filter((stop) => stop.street === street) : stops;
  }

  function currentStop() { return baselineById.get(currentId); }

  function announce(message) {
    byId("notice").textContent = message;
    byId("notice").hidden = false;
  }

  function renderProgress() {
    byId("total-count").textContent = String(stops.length);
    for (const status of statuses) {
      byId(status + "-count").textContent = String(stops.filter((stop) => stop.review.status === status).length);
    }
    byId("session-state").textContent = dirty ? "Saved in this session · Export to keep on disk" :
      savedInSession ? "Export requested · Keep the downloaded JSON" : "Notes stay in this browser tab until exported.";
  }

  function renderList() {
    const visible = filteredStops();
    byId("visible-count").textContent = String(visible.length);
    const list = byId("stop-list");
    list.replaceChildren();
    visible.forEach((stop) => {
      const button = document.createElement("button");
      button.className = "stop";
      button.type = "button";
      button.setAttribute("aria-current", String(stop.id === currentId));
      button.setAttribute("aria-label", stop.id + ", " + stop.street + ", " + stop.review.status);
      const top = document.createElement("span");
      top.className = "stop-top";
      const name = document.createElement("span");
      name.textContent = stop.id;
      const dot = document.createElement("span");
      dot.className = "status-dot " + (statuses.has(stop.review.status) ? stop.review.status : "pending");
      dot.setAttribute("aria-hidden", "true");
      top.append(name, dot);
      const street = document.createElement("span");
      street.className = "stop-street";
      street.textContent = stop.street;
      button.append(top, street);
      button.addEventListener("click", () => { currentId = stop.id; renderSelection(); });
      list.append(button);
    });
  }

  function renderSelection() {
    renderList();
    const stop = currentStop();
    byId("detail").hidden = !stop;
    byId("empty-state").hidden = Boolean(stop);
    if (!stop) return;
    byId("stop-id").textContent = stop.id;
    byId("stop-street").textContent = stop.street;
    byId("coordinates").textContent = Number(stop.lat).toFixed(6) + ", " + Number(stop.lon).toFixed(6) + " · OSM way " + stop.osm_way_id;
    const offsets = {forward:0, left:270, right:90, back:180};
    for (const [direction, offset] of Object.entries(offsets)) {
      const anchor = byId("view-" + direction);
      const href = viewerUrl(stop.views[direction]);
      if (href) {
        anchor.href = href;
        anchor.removeAttribute("aria-disabled");
        anchor.removeAttribute("tabindex");
      } else {
        anchor.removeAttribute("href");
        anchor.setAttribute("aria-disabled", "true");
        anchor.setAttribute("tabindex", "-1");
      }
      anchor.querySelector("small").textContent = String(Math.round((stop.heading + offset) % 360)) + "° heading";
    }
    byId("review-status").value = stop.review.status;
    byId("imagery-date").value = stop.review.imagery_date;
    byId("review-notes").value = stop.review.notes;
    byId("source-url").value = stop.review.source_url;
    renderReviewState();
    const visible = filteredStops();
    const index = visible.findIndex((item) => item.id === currentId);
    byId("previous").disabled = index <= 0;
    byId("next").disabled = index < 0 || index >= visible.length - 1;
  }

  function renderReviewState() {
    const stop = currentStop();
    if (!stop) return;
    byId("status-badge").textContent = stop.review.status;
    byId("checked-at").textContent = stop.review.checked_at ? "Review recorded: " + stop.review.checked_at : "Review not yet recorded.";
  }

  function updateReview() {
    const stop = currentStop();
    if (!stop) return;
    const status = byId("review-status").value;
    // Following a viewer link is not evidence of a review. Only an explicit
    // status choice records that the imagery has been checked or unavailable.
    const previousStatus = stop.review.status;
    stop.review.status = status;
    stop.review.notes = byId("review-notes").value;
    stop.review.imagery_date = byId("imagery-date").value;
    stop.review.source_url = byId("source-url").value;
    if (status === "pending") stop.review.checked_at = "";
    else if (status !== previousStatus || !stop.review.checked_at) stop.review.checked_at = new Date().toISOString();
    dirty = true;
    savedInSession = true;
    byId("save-state").textContent = "Saved in this session. Export notebook JSON to keep your notes on disk.";
    renderProgress();
    renderList();
    renderReviewState();
  }

  byId("project-label").textContent = manifest.project + " · " + manifest.area.name;
  byId("attribution").textContent = manifest.source.attribution;
  [...new Set(stops.map((stop) => stop.street))].sort().forEach((street) => {
    const option = document.createElement("option");
    option.value = street;
    option.textContent = street;
    byId("street-filter").append(option);
  });
  byId("street-filter").addEventListener("change", () => {
    const visible = filteredStops();
    if (!visible.some((stop) => stop.id === currentId)) currentId = visible.length ? visible[0].id : null;
    renderSelection();
  });
  byId("review-form").addEventListener("submit", (event) => event.preventDefault());
  byId("review-status").addEventListener("change", updateReview);
  ["imagery-date", "review-notes", "source-url"].forEach((id) => byId(id).addEventListener("input", updateReview));
  for (const [id, offset] of [["previous", -1], ["next", 1]]) {
    byId(id).addEventListener("click", () => {
      const visible = filteredStops();
      const index = visible.findIndex((stop) => stop.id === currentId);
      if (visible[index + offset]) { currentId = visible[index + offset].id; renderSelection(); }
    });
  }

  byId("export-button").addEventListener("click", () => {
    const invalid = stops.find((stop) => stop.review.source_url && !viewerUrl(stop.review.source_url, true));
    if (invalid) {
      announce("Export failed: " + invalid.id + " has an invalid viewer link. Use an HTTPS Google Maps or maps.app.goo.gl link, or clear the field. Your notes remain saved in this session.");
      return;
    }
    const slug = String(manifest.project).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0,80) || "nyc";
    const blob = new Blob([JSON.stringify(manifest, null, 2) + "\n"], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = slug + "-notebook.json";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    // Keep the object URL alive briefly so a browser can start its download.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    dirty = false;
    savedInSession = true;
    byId("save-state").textContent = "Export requested. Keep the downloaded JSON to restore your notes later.";
    renderProgress();
  });

  function importedReviews(value) {
    if (!value || value.schema_version !== 1 || !Array.isArray(value.stops) || value.stops.length !== stops.length) {
      throw new Error("Choose a schema version 1 notebook with the same locations.");
    }
    const reviews = new Map();
    for (const stop of value.stops) {
      if (!stop || typeof stop.id !== "string" || !baselineById.has(stop.id) || reviews.has(stop.id)) {
        throw new Error("The notebook has missing, duplicate, or unknown location IDs.");
      }
      const original = baselineById.get(stop.id);
      // IDs can repeat between routes. Check coordinates before attaching notes
      // to a location, and keep this notebook's original links and metadata.
      if (stop.lat !== original.lat || stop.lon !== original.lon || stop.heading !== original.heading || stop.osm_way_id !== original.osm_way_id) {
        throw new Error("The notebook locations do not match this route.");
      }
      const review = stop.review;
      if (!review || !statuses.has(review.status)) throw new Error("A review has an invalid status.");
      const clean = {status:review.status};
      for (const [field, limit] of [["notes",100000], ["imagery_date",100], ["checked_at",100], ["source_url",10000]]) {
        if (typeof review[field] !== "string" || review[field].length > limit) throw new Error("A review has an invalid " + field + " field.");
        clean[field] = review[field];
      }
      if (clean.source_url && !viewerUrl(clean.source_url, true)) {
        throw new Error("A viewer link is invalid. Use an HTTPS Google Maps or maps.app.goo.gl link, or leave it empty.");
      }
      reviews.set(stop.id, clean);
    }
    return reviews;
  }

  byId("import-button").addEventListener("click", () => byId("import-file").click());
  byId("import-file").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error("The notebook must be smaller than 25 MB.");
      const reviews = importedReviews(JSON.parse(await file.text()));
      // Validate the whole import before changing any existing notes.
      for (const stop of stops) stop.review = reviews.get(stop.id);
      dirty = true;
      savedInSession = true;
      renderSelection();
      renderProgress();
      byId("save-state").textContent = "Imported notes saved in this session. Export notebook JSON after further edits.";
      announce("Imported review notes for " + stops.length + " locations.");
    } catch (error) {
      announce("Import failed: " + error.message);
    } finally {
      event.target.value = "";
    }
  });
  window.addEventListener("beforeunload", (event) => {
    if (dirty) { event.preventDefault(); event.returnValue = ""; }
  });
  renderProgress();
  renderSelection();
})();
</script>
</body>
</html>
'''
