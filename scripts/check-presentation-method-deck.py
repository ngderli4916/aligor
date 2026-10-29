#!/usr/bin/env python3
from pathlib import Path
import re

page = Path(__file__).resolve().parents[1] / "presentation-method" / "index.html"
html = page.read_text(encoding="utf-8")

assert '<main class="deck"' in html, "presentation method must use a deck root"
slides = re.findall(r'<section\b[^>]*class="[^"]*\bslide\b[^"]*"', html)
assert len(slides) >= 16, f"expected at least 16 presentation slides, found {len(slides)}"
assert 'aspect-ratio: 16 / 9' in html or 'aspect-ratio:16/9' in html, "desktop slides must be 16:9"
assert 'scroll-snap-type' in html, "mobile/scroll mode must snap slide by slide"
assert 'class="deck-progress"' in html, "deck needs visible progress"
assert 'class="deck-counter"' in html, "deck needs a slide counter"
assert 'requestFullscreen' in html, "deck needs fullscreen support"
for key in ('ArrowRight', 'ArrowLeft', 'Enter'):
    assert key in html, f"deck keyboard control missing {key}"
assert 'data-copy' in html, "copyable prompts must remain available"
assert 'WhatsApp' in html and 'RM 3,999' in html and '8 段 Prompt' in html, "interactive teaching examples and prompts must remain"
assert 'presentation-method' in html and '/register?utm_source=site' in html, "canonical route and CTA must remain"

print(f"presentation-method deck checks passed: {len(slides)} slides")
