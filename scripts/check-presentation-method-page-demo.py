#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
GUIDE = ROOT / "presentation-method" / "index.html"
DEMO = ROOT / "presentation-method" / "demo" / "index.html"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


guide = GUIDE.read_text(encoding="utf-8")
require('<main class="deck"' not in guide, "teaching route must remain a normal web guide, not the full deck")
require('id="steps"' in guide, "teaching guide must preserve the six-step section")
require('id="prompts"' in guide, "teaching guide must preserve the prompt section")
require('/presentation-method/demo/' in guide, "teaching guide must link to the short PPT demo")

require(DEMO.exists(), "short PPT demo page is missing")
demo = DEMO.read_text(encoding="utf-8")
slides = len(re.findall(r'<section\s+class="[^"]*\bslide\b', demo))
require(6 <= slides <= 10, f"demo must contain 6 to 10 slides, found {slides}")
require('<main class="deck"' in demo, "demo must use the slide deck structure")
require('--u:min(1vw,1.7778svh)' in demo, "demo must use a full-screen 16:9-scaled stage")
require('ArrowRight' in demo and 'ArrowLeft' in demo and 'Enter' in demo, "demo must support keyboard navigation")
require('requestFullscreen' in demo, "demo must support fullscreen")
require('class="deck-progress"' in demo and 'class="deck-counter"' in demo, "demo must show progress and slide count")
require('href="/presentation-method/"' in demo, "final demo slide must link back to the teaching guide")
require('教你怎样做' in demo or '教你怎么做' in demo, "final demo slide must clearly return to the teaching method")
print(f"presentation guide + short demo checks passed: {slides} demo slides")
