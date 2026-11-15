"""Run with python3 -m nyc_reference."""

import argparse
import sys
from pathlib import Path
from urllib.error import URLError

from .pipeline import (create_manifest, fetch_osm, merge_reviews, read_json,
                       render_brief, validate_manifest, write_json)
from .report import render_report


def main(argv=None):
    parser = argparse.ArgumentParser(description="Create an NYC Street View scouting notebook.")
    commands = parser.add_subparsers(dest="command", required=True)
    plan = commands.add_parser("plan", help="sample OSM roads and create viewer links")
    plan.add_argument("--config", type=Path, default=Path("config/soho.json"))
    plan.add_argument("--osm", type=Path, help="use a saved Overpass JSON file; otherwise fetch public OSM data")
    plan.add_argument("--output", type=Path, default=Path("output/soho"))
    plan.add_argument("--reviews", type=Path, help="preserve reviews from an exported notebook for unchanged viewpoints")
    plan.add_argument("--force", action="store_true", help="replace an existing output directory's generated files")
    report = commands.add_parser("report", help="create an HTML notebook from exported JSON")
    report.add_argument("manifest", type=Path)
    report.add_argument("--output", type=Path, required=True)
    brief = commands.add_parser("brief", help="export checked observations for the city build")
    brief.add_argument("manifest", type=Path)
    brief.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "plan":
            targets = [args.output / name for name in ("manifest.json", "index.html", "scouting-notes.md", "osm.json")]
            if not args.force and any(path.exists() for path in targets):
                raise ValueError("output already exists; use a new directory or --force (export your edited notebook first)")
            config = read_json(args.config)
            osm = read_json(args.osm) if args.osm else fetch_osm(config)
            manifest = create_manifest(config, osm)
            if args.reviews:
                manifest = merge_reviews(manifest, read_json(args.reviews))
            html = render_report(manifest)
            notes = render_brief(manifest)
            args.output.mkdir(parents=True, exist_ok=True)
            write_json(targets[0], manifest)
            targets[1].write_text(html, encoding="utf-8")
            targets[2].write_text(notes, encoding="utf-8")
            write_json(targets[3], osm)
            print(f"Created {len(manifest['stops'])} stops with four Street View directions each.")
            print(f"Open {targets[1].resolve()}")
            print("Coverage has not been checked. Export notebook JSON after editing notes.")
        else:
            if args.output.resolve() == args.manifest.resolve():
                raise ValueError("output must differ from the input notebook JSON")
            manifest = validate_manifest(read_json(args.manifest))
            content = render_report(manifest) if args.command == "report" else render_brief(manifest)
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(content, encoding="utf-8")
            print(f"Wrote {args.output.resolve()}")
        return 0
    except (OSError, ValueError, URLError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
