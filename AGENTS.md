# Aligor Project Instructions for Codex and Other Agents

This is the shared operating record for every AI coding agent working in the Aligor repository.

## Source of truth

- Repository: `ngderli4916/aligor`
- Production: `https://aligor.aligor.workers.dev/`
- Main branch: `main`
- Static HTML/CSS/JS site using the existing Cloudflare deployment.

## Mandatory page-index rule

Whenever an agent creates, renames, moves, or removes a public HTML page, it MUST update `list/index.html` in the same commit.

`https://aligor.aligor.workers.dev/list/` is Adrian's master directory for every Aligor page. A page task is not complete until the directory contains a clear title, one-sentence description, exact production path, and correct category.

Before committing, run `python3 scripts/check-page-list.py`. The check must pass. Never leave a public page unlisted.

## Current page groups

- Main/campaign: `/`, `/ai-agent-training/`, `/whatsapp-automated-webminar/`, `/whatsapp-automated-webminar-2/`
- Teaching guides: `/whatsapp-agent-flow/`, `/hotmail-ai-agent/`, `/facebook-ai-agent/`
- Tools/resources: `/image-prompt-copy/`, `/typelessforyou/`
- Internal utilities: `/google-link-homestore-process/`, `/list/`
- Article system: `/article.html` and article URLs using `?slug=...`

## Content direction

- Educational pages teach the complete process before any course or registration CTA.
- Do not hide essential instructions behind WhatsApp contact or lead capture.
- Free AI Preview and homepage links are optional next steps at the end of educational pages.
- Keep pages responsive on desktop and mobile.
- Never commit API keys, access tokens, passwords, WhatsApp session files, or connection strings.

## Verification before push

- Run `git diff --check`.
- Run `python3 scripts/check-page-list.py`.
- Test changed pages through a local HTTP server.
- Check desktop and mobile rendering for overflow.
- Validate JavaScript syntax when scripts change.
- Commit and push only after checks pass.
