(function () {
  const STORAGE_KEY = 'aligor-language';

  const translations = {
    en: {
      'nav.home': 'Home',
      'nav.articles': 'Articles',
      'nav.typeless': 'Typeless',
      'nav.about': 'About',
      'nav.downloads': 'Downloads',
      'nav.notes': 'Notes',
      'home.eyebrow': 'Personal sharing blog',
      'home.title': 'Notes from my <span class="gradient">AI journey</span>',
      'home.intro': 'I share the tools I try, the ideas I am learning, and the small experiments that help me build better with AI.',
      'home.cta.read': 'Read latest notes',
      'home.cta.typeless': 'Typeless for you',
      'home.profile.title': 'Hi, I am Derli.',
      'home.profile.body': 'This is my personal corner for AI learning, useful apps, and honest notes from building things online.',
      'home.latest.title': 'Latest articles',
      'home.latest.label': 'Journal notes',
      'home.loading.label': 'Loading',
      'home.loading.body': 'Loading articles...',
      'home.about.title': 'About aligor',
      'home.about.label': 'Profile and links',
      'home.about.cardTitle': 'Open notebook',
      'home.about.cardBody': '<strong>aligor</strong> is where I collect what I am learning about AI, tools, and online building. I keep it practical, personal, and easy to revisit.',
      'home.tool.typeless': 'Typeless for You',
      'home.tool.typelessMeta': 'Download guide',
      'home.tool.articles': 'Latest articles',
      'home.tool.articlesMeta': 'Read notes',
      'card.read': 'Read',
      'empty.noPosts': 'No posts',
      'empty.noPostsBody': 'No articles yet. Drop a markdown file into <code>/articles/</code> and add it to <code>articles.json</code>.',
      'empty.error': 'Error',
      'empty.errorBody': 'Could not load articles. Check that <code>articles.json</code> is valid.',
      'article.back': 'Back to all articles',
      'article.loading': 'Loading article...',
      'footer.made': 'Made with',
      'typeless.eyebrow': 'Typeless for you',
      'typeless.title': 'Pick your <span class="gradient">download</span>',
      'typeless.intro': 'Smart voice dictation that turns speech into clear, polished writing on desktop and mobile.',
      'typeless.desktop.title': 'Desktop',
      'typeless.desktop.desc': 'Use Typeless on your computer for writing, replies, documents, and daily work.',
      'typeless.download.macos': 'Download for macOS',
      'typeless.download.windows': 'Download for Windows',
      'typeless.mobile.title': 'Mobile',
      'typeless.mobile.desc': 'Scan the QR code or use the store buttons to install Typeless on your phone.',
      'typeless.appstore.kicker': 'Download on the',
      'typeless.appstore.title': 'App Store',
      'typeless.google.kicker': 'GET IT ON',
      'typeless.google.title': 'Google Play',
      'typeless.tip.label': 'Important tip',
      'typeless.tip.title': 'Use different emails on phone and computer',
      'typeless.tip.body': 'Typeless has a free weekly allowance. You can use up to <strong>8,000 words per week</strong>, and the allowance resets every Monday. If you install Typeless on both mobile and computer and want separate weekly word limits, do not use the same email on both devices.',
      'typeless.follow.label': 'Follow aligor',
      'typeless.follow.title': 'Follow me for more tech learning content',
      'typeless.follow.body': 'I regularly share analysis and practical content to help everyone improve their technology awareness and understand useful AI tools.',
      'typeless.follow.instagram': 'Instagram',
      'typeless.follow.facebook': 'Facebook',
      'typeless.follow.threads': 'Threads'
    },
    zh: {
      'nav.home': '首页',
      'nav.articles': '文章',
      'nav.typeless': 'Typeless',
      'nav.about': '关于',
      'nav.downloads': '下载',
      'nav.notes': '提示',
      'home.eyebrow': '个人分享博客',
      'home.title': '我的 <span class="gradient">AI 学习笔记</span>',
      'home.intro': '我会分享我正在使用的工具、正在学习的想法，还有帮助我用 AI 做事的小实验。',
      'home.cta.read': '阅读最新笔记',
      'home.cta.typeless': 'Typeless 下载',
      'home.profile.title': 'Hi，我是 Derli。',
      'home.profile.body': '这里是我分享 AI 学习、实用工具和线上创作经验的个人空间。',
      'home.latest.title': '最新文章',
      'home.latest.label': '个人笔记',
      'home.loading.label': '载入中',
      'home.loading.body': '正在载入文章...',
      'home.about.title': '关于 aligor',
      'home.about.label': '个人介绍与链接',
      'home.about.cardTitle': '公开笔记本',
      'home.about.cardBody': '<strong>aligor</strong> 是我整理 AI、工具和线上创作学习内容的地方。我会尽量保持实用、个人化，也方便以后回顾。',
      'home.tool.typeless': 'Typeless 下载页',
      'home.tool.typelessMeta': '下载指南',
      'home.tool.articles': '最新文章',
      'home.tool.articlesMeta': '阅读笔记',
      'card.read': '阅读',
      'empty.noPosts': '暂无文章',
      'empty.noPostsBody': '还没有文章。把 markdown 文件放进 <code>/articles/</code>，再加入 <code>articles.json</code>。',
      'empty.error': '错误',
      'empty.errorBody': '文章载入失败。请检查 <code>articles.json</code> 是否正确。',
      'article.back': '回到全部文章',
      'article.loading': '正在载入文章...',
      'footer.made': '制作',
      'typeless.eyebrow': 'Typeless 下载',
      'typeless.title': '选择你的 <span class="gradient">下载版本</span>',
      'typeless.intro': 'Typeless 是智能语音输入工具，可以把你说的话变成更清楚、更顺的文字，手机和电脑都可以使用。',
      'typeless.desktop.title': '电脑版本',
      'typeless.desktop.desc': '在电脑上使用 Typeless，适合写文章、回复信息、整理文件和日常工作。',
      'typeless.download.macos': '下载 macOS 版本',
      'typeless.download.windows': '下载 Windows 版本',
      'typeless.mobile.title': '手机版本',
      'typeless.mobile.desc': '扫描 QR code，或点击 App Store / Google Play 按钮安装 Typeless。',
      'typeless.appstore.kicker': 'Download on the',
      'typeless.appstore.title': 'App Store',
      'typeless.google.kicker': 'GET IT ON',
      'typeless.google.title': 'Google Play',
      'typeless.tip.label': '重要小贴士',
      'typeless.tip.title': '手机和电脑请使用不同邮箱',
      'typeless.tip.body': 'Typeless 有免费的每周字数额度。你每个星期可以免费使用 <strong>8,000 字</strong>，额度会在每个星期一重置。如果你同时在手机和电脑安装 Typeless，想要分开计算每周字数额度，就不要在两个设备使用同一个邮箱。手机用一个邮箱，电脑用另一个邮箱。',
      'typeless.follow.label': 'Follow aligor',
      'typeless.follow.title': '追踪我，学习更多科技认知内容',
      'typeless.follow.body': '我会定期分析和分享帮助大家提升科技认知的内容，也会介绍实用 AI 工具和使用方法。',
      'typeless.follow.instagram': 'Instagram',
      'typeless.follow.facebook': 'Facebook',
      'typeless.follow.threads': 'Threads'
    }
  };

  function getLanguage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'zh' ? 'zh' : 'en';
  }

  function translateElement(el, lang) {
    const dictionary = translations[lang] || translations.en;
    const textKey = el.getAttribute('data-i18n');
    const htmlKey = el.getAttribute('data-i18n-html');

    if (htmlKey && dictionary[htmlKey]) {
      el.innerHTML = dictionary[htmlKey];
    } else if (textKey && dictionary[textKey]) {
      el.textContent = dictionary[textKey];
    }
  }

  function applyLanguage(lang) {
    const nextLang = lang === 'zh' ? 'zh' : 'en';
    document.documentElement.lang = nextLang === 'zh' ? 'zh-Hans' : 'en';
    document.querySelectorAll('[data-i18n], [data-i18n-html]').forEach((el) => translateElement(el, nextLang));
    document.querySelectorAll('[data-lang-option]').forEach((button) => {
      const active = button.getAttribute('data-lang-option') === nextLang;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  window.aligorGetLang = getLanguage;
  window.aligorApplyLanguage = function () {
    applyLanguage(getLanguage());
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-lang-option]');
    if (!button) return;
    const lang = button.getAttribute('data-lang-option') === 'zh' ? 'zh' : 'en';
    localStorage.setItem(STORAGE_KEY, lang);
    applyLanguage(lang);
    window.dispatchEvent(new CustomEvent('aligor:languagechange', { detail: { lang } }));
  });

  document.addEventListener('DOMContentLoaded', () => applyLanguage(getLanguage()));
})();
