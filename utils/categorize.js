const DOMAIN_CATEGORY_MAP = [
  { pattern: /(amazon|temu|ebay|walmart|bestbuy|flipkart|aliexpress|etsy|shopify|target|costco)\./i, category: 'shopping' },
  { pattern: /(udemy|coursera|edx|khanacademy|medium\.com|notion|docs\.google|learn|tutorial)/i, category: 'learning' },
  { pattern: /(bankofamerica|chase|wellsfargo|bloomberg|coinbase|robinhood|finance|moneycontrol|mint|stripe|quickbooks)/i, category: 'finance' },
  { pattern: /(facebook|instagram|twitter|x\.com|linkedin|reddit|discord|slack|whatsapp|telegram|threads\.net)/i, category: 'social' },
  { pattern: /(gmail|outlook|mail\.|calendar|notion|asana|trello|jira|slack|microsoft365|office|docs|drive\.google)/i, category: 'productivity' },
  { pattern: /(arxiv|researchgate|ieee|acm|nature\.com|sciencedirect|doi\.org|springer|plos)/i, category: 'research' },
  { pattern: /(netflix|youtube|spotify|disney|hulu|hbo|max\.com|peacock|primevideo|twitch|imdb|rottentomatoes|espn|bleacherreport)/i, category: 'entertainment' },
  { pattern: /(cnn|bbc|nytimes|reuters|apnews|theguardian|news)/i, category: 'news' }
];

const CATEGORY_KEYWORDS = {
  shopping: ['cart', 'checkout', 'discount', 'coupon', 'price', 'deal', 'buy', 'seller', 'shipping', 'review'],
  learning: ['course', 'lesson', 'tutorial', 'syllabus', 'exercise', 'lecture', 'notebook', 'study', 'learn', 'quiz'],
  finance: ['portfolio', 'stock', 'market', 'payment', 'invoice', 'bank', 'interest', 'crypto', 'budget', 'expense'],
  social: ['timeline', 'followers', 'comment', 'like', 'share', 'thread', 'community', 'chat', 'message'],
  productivity: ['task', 'project', 'deadline', 'notes', 'document', 'spreadsheet', 'collaborate', 'kanban', 'meeting', 'agenda'],
  research: ['abstract', 'citation', 'dataset', 'methodology', 'experiments', 'paper', 'journal', 'conference'],
  entertainment: ['movie', 'series', 'episode', 'album', 'music', 'stream', 'match', 'highlights', 'trailer', 'ticket'],
  news: ['breaking', 'headline', 'report', 'analysis', 'exclusive', 'journalism', 'press'],
  productivity_focus: ['focus', 'productivity', 'workflow', 'optimize', 'efficiency']
};

export const CATEGORIES = [
  'shopping',
  'learning',
  'finance',
  'social',
  'productivity',
  'research',
  'entertainment',
  'news',
  'other'
];

export function normalizeCategory(category) {
  const lower = (category || '').toLowerCase();
  return CATEGORIES.includes(lower) ? lower : 'other';
}

export function classifyByUrl(url = '') {
  if (!url) return null;
  for (const { pattern, category } of DOMAIN_CATEGORY_MAP) {
    if (pattern.test(url)) return category;
  }
  return null;
}

function scoreKeywords(text = '', keywords = []) {
  if (!text || !keywords.length) return 0;
  let score = 0;
  for (const word of keywords) {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'gi');
    const matches = text.match(re);
    if (matches) score += matches.length;
  }
  return score;
}

function classifyByContent(text = '', extraKeywords = []) {
  const combined = `${text || ''} ${extraKeywords.join(' ')}`.toLowerCase();
  if (!combined.trim()) return null;

  const scores = new Map();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = scoreKeywords(combined, keywords);
    if (score > 0) scores.set(category, score);
  }

  if (scores.size === 0) return null;
  let bestCategory = 'other';
  let bestScore = 0;
  for (const [category, score] of scores.entries()) {
    if (score > bestScore) {
      bestCategory = category === 'productivity_focus' ? 'productivity' : category;
      bestScore = score;
    }
  }

  return bestCategory;
}

export function categorize(page = {}) {
  const { url = '', title = '', description = '', textSnippet = '', keywords = [] } = page;
  const urlLower = url.toLowerCase();

  let category = classifyByUrl(urlLower);
  if (category) return normalizeCategory(category);

  const combinedText = [title, description, textSnippet].filter(Boolean).join(' ').toLowerCase();
  category = classifyByContent(combinedText, keywords.map(k => k.toLowerCase()));
  if (category) return normalizeCategory(category);

  return 'other';
}

export function extractKeywordsFromText(text = '', max = 10) {
  const counts = new Map();
  const words = (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w));
  for (const w of words) {
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([word]) => word);
}

const STOP_WORDS = new Set([
  'with','your','from','this','that','have','what','when','where','they','them','then','will','into','about','which','there','their','been','also','more','than','best','most','some','many','such','only','other','after','before','into','over','under','while','using','each','just','very','here','home','page','https','http','www'
]);

export function categoryLabel(category) {
  const normalized = normalizeCategory(category);
  switch (normalized) {
    case 'shopping': return 'Shopping';
    case 'learning': return 'Learning';
    case 'finance': return 'Finance';
    case 'social': return 'Social & Community';
    case 'productivity': return 'Productivity';
    case 'research': return 'Research';
    case 'entertainment': return 'Entertainment';
    case 'news': return 'News & Updates';
    default: return 'Other';
  }
}
