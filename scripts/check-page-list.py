#!/usr/bin/env python3
"""Fail when an Aligor HTML page is missing from /list/."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
LIST_FILE = ROOT / "list" / "index.html"
EXCLUDED_DIRS = {".git", "node_modules", "test-results"}


def public_path(path: Path) -> str:
    rel = path.relative_to(ROOT).as_posix()
    if rel == "index.html":
        return "/"
    if rel.endswith("/index.html"):
        return "/" + rel[:-len("index.html")]
    return "/" + rel


html_files = []
for path in ROOT.rglob("*.html"):
    parts = path.relative_to(ROOT).parts
    if any(part in EXCLUDED_DIRS or part.startswith(".") for part in parts):
        continue
    html_files.append(path)

list_html = LIST_FILE.read_text(encoding="utf-8")
hrefs = set(re.findall(r"href=['\"]([^'\"]+)['\"]", list_html))
expected = {public_path(path) for path in html_files}
missing = sorted(path for path in expected if path not in hrefs)

if missing:
    print("ERROR: These HTML pages are missing from list/index.html:")
    for path in missing:
        print(f"  - {path}")
    sys.exit(1)

print(f"PASS: list/index.html includes all {len(expected)} HTML page routes.")
