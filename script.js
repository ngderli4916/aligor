// aligor — landing page article loader

(function () {
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const listEl = document.getElementById('article-list');
  if (!listEl) return;

  fetch('articles.json', { cache: 'no-store' })
    .then((r) => {
      if (!r.ok) throw new Error('Could not load articles.json');
      return r.json();
    })
    .then((articles) => {
      if (!Array.isArray(articles) || articles.length === 0) {
        listEl.innerHTML = `
          <div class="empty">
            <span class="emoji" data-i18n="empty.noPosts">No posts</span>
            <span data-i18n-html="empty.noPostsBody">No articles yet. Drop a markdown file into <code>/articles/</code> and add it to <code>articles.json</code>.</span>
          </div>`;
        if (window.aligorApplyLanguage) window.aligorApplyLanguage();
        return;
      }

      // newest first
      articles.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      listEl.innerHTML = articles.map((a) => {
        const date = a.date
          ? new Date(a.date).toLocaleDateString(undefined, {
              year: 'numeric', month: 'short', day: 'numeric'
            })
          : '';
        const tag = a.tag || 'article';
        return `
          <a class="card" href="article.html?slug=${encodeURIComponent(a.slug)}">
            <span class="tag">${escapeHtml(tag)}</span>
            <h3>${escapeHtml(a.title)}</h3>
            <p class="summary">${escapeHtml(a.summary || '')}</p>
            <div class="meta">
              <span>${escapeHtml(date)}</span>
              <span class="read-more"><span data-i18n="card.read">Read</span> →</span>
            </div>
          </a>`;
      }).join('');
      if (window.aligorApplyLanguage) window.aligorApplyLanguage();
    })
    .catch((err) => {
      console.error(err);
      listEl.innerHTML = `
        <div class="empty">
          <span class="emoji" data-i18n="empty.error">Error</span>
          <span data-i18n-html="empty.errorBody">Could not load articles. Check that <code>articles.json</code> is valid.</span>
        </div>`;
      if (window.aligorApplyLanguage) window.aligorApplyLanguage();
    });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
