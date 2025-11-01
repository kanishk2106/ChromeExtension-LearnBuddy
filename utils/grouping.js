import { normalizeCategory } from './categorize.js';

const TITLE_STOPWORDS = new Set([
  'amazon', 'com', 'nike', 'www', 'http', 'https', 'official', 'store',
  'mens', 'men', 'womens', 'women', 'kids', 'kid', 'unisex', 'size', 'sizes'
]);

export function groupSignatureFor(snapshot = {}) {
  const category = normalizeCategory(snapshot.category || 'other');
  const titleKey = simpleTitleKey(snapshot.title);
  return `${category}|${titleKey}`;
}

function simpleTitleKey(title = '') {
  const tokens = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && token.length > 2 && !TITLE_STOPWORDS.has(token));
  const key = tokens.slice(0, 3).join('-');
  return key || 'untitled';
}

