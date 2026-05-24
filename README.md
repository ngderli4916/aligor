# aligor

A colorful little blog for sharing my AI journey. Static HTML + CSS + a tiny bit of JS — no build step, no framework. Markdown files become articles.

---

## File layout

```
aligor/
├── index.html         ← landing page (hero + article list)
├── article.html       ← article viewer (loads ?slug=… from /articles/)
├── styles.css         ← colorful playful theme
├── script.js          ← loads articles.json on the landing page
├── articles.json      ← manifest of every article (title, summary, date, tag, slug)
├── articles/
│   └── welcome-to-aligor.md   ← one markdown file per article
└── README.md
```

---

## Deploy to Cloudflare Pages via GitHub

### 1. Push this folder to GitHub

```bash
cd aligor
git init
git add .
git commit -m "Initial aligor site"
git branch -M main
# create a new empty repo on github.com first, then:
git remote add origin https://github.com/<your-username>/aligor.git
git push -u origin main
```

### 2. Connect the repo to Cloudflare Pages

1. Log into the [Cloudflare dashboard](https://dash.cloudflare.com).
2. Go to **Workers & Pages → Create → Pages → Connect to Git**.
3. Authorize GitHub and pick your `aligor` repo.
4. On the build settings page, use:
   - **Framework preset:** `None`
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/` (or leave blank — it defaults to the repo root)
5. Click **Save and Deploy**.

Cloudflare will give you a free URL like `aligor.pages.dev`. Every time you push to `main`, the site re-deploys automatically.

### 3. (Optional) Add a custom domain

In the Pages project → **Custom domains → Set up a domain** → enter `aligor.com` (or whatever you own). Cloudflare walks you through the DNS step.

---

## How to add a new article

1. **Write the article** as a markdown file in `articles/`. Name it `your-slug.md` (no spaces — use dashes). Example: `articles/my-first-ai-agent.md`.
2. **Add an entry** to `articles.json`:

   ```json
   {
     "slug": "my-first-ai-agent",
     "title": "Building my first AI agent",
     "summary": "What I learned in week one of building agents from scratch.",
     "tag": "experiment",
     "date": "2026-06-01"
   }
   ```

3. **Commit and push** to GitHub. Cloudflare Pages re-deploys in ~30 seconds.

That's it. The landing page will pick up the new card automatically, and `article.html?slug=my-first-ai-agent` will render it.

### Markdown features supported

Standard markdown via [marked](https://marked.js.org/): headings, lists, links, **bold**, *italic*, `inline code`, fenced code blocks, blockquotes, images, horizontal rules, and tables.

---

## Local preview

You need any tiny static server (because the page uses `fetch()` for the markdown). Easiest:

```bash
cd aligor
python3 -m http.server 8000
# open http://localhost:8000
```

Or with Node:

```bash
npx serve .
```

---

## Customizing

- **Colors / look:** edit the CSS variables at the top of `styles.css` (`--pink`, `--violet`, etc.).
- **Logo / site name:** change the `<a class="logo">` text in both `index.html` and `article.html`.
- **Hero copy:** edit the `<header class="hero">` block in `index.html`.
- **About section:** edit the "About aligor" card near the bottom of `index.html`.

Have fun. 🎈
