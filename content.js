(() => {
  const TEXT_CLAMP = 8_000;
  const KEYWORD_LIMIT = 12;
  const HIDDEN = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS', 'META', 'LINK']);

  let lastPayload = null;
  let contentVersion = 0;
  let pending = null;
  let lastHash = '';

  const debounceSend = () => {
    if (pending) return;
    pending = setTimeout(async () => {
      pending = null;
      const payload = await buildPagePayload();
      if (!payload) return;
      const textHash = hashText(payload.textSnippet);
      const majorChange = textHash && textHash !== lastHash;
      if (majorChange) {
        contentVersion += 1;
      }
      payload.majorChange = majorChange;
      payload.textHash = textHash;
      payload.contentVersion = contentVersion;
      if (JSON.stringify(lastPayload) === JSON.stringify(payload)) return;
      lastPayload = { ...payload };
      lastHash = textHash;
      chrome.runtime.sendMessage({ type: 'PAGE_INFO', data: payload }).catch(() => {});
    }, 400);
  };

  document.addEventListener('DOMContentLoaded', debounceSend, { once: true });
  window.addEventListener('load', debounceSend, { once: true });

  const observer = new MutationObserver(() => debounceSend());
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message) return;
    if (message.type === 'REQUEST_PAGE_INFO') {
      (async () => {
        const payload = await buildPagePayload();
        sendResponse(payload);
      })();
      return true;
    }
  });

  const sendVisibility = () => {
    chrome.runtime.sendMessage({ type: 'VISIBILITY', visible: !document.hidden }).catch(() => {});
  };

  document.addEventListener('visibilitychange', sendVisibility);
  sendVisibility();

  async function buildPagePayload() {
    try {
      const title = document.title || '';
      const url = location.href;
      const description = getMeta('meta[name="description"]') || getMeta('meta[property="og:description"]');
      const text = extractVisibleText();
      const keywords = extractKeywords(text, KEYWORD_LIMIT);
      const products = extractProducts();
      const price = products[0]?.price || null;
      const rating = products[0]?.rating || null;

      const language = document.documentElement.getAttribute('lang') || navigator.language || 'en';
      return {
        title,
        url,
        description,
        textSnippet: (text || '').slice(0, TEXT_CLAMP),
        keywords,
        products,
        price,
        rating,
        language,
        timestamp: Date.now()
      };
    } catch (err) {
      console.warn('ActionSense content script error', err);
      return null;
    }
  }

  function getMeta(selector) {
    return document.querySelector(selector)?.getAttribute('content') || '';
  }

  function extractVisibleText() {
    const main = pickMainContainer();
    const parts = [];
    for (const { text, parent } of walkTextNodes(main)) {
      if (!parent || !isVisible(parent)) continue;
      const normalized = text.replace(/\s+/g, ' ').trim();
      if (normalized) parts.push(normalized);
    }
    return parts.join(' ');
  }

  function* walkTextNodes(root) {
    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      if (!node) continue;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.nodeValue || '';
        if (text.trim()) {
          yield { text, parent: node.parentElement };
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node;
        if (HIDDEN.has(el.tagName) || !isVisible(el)) continue;
        for (let i = el.childNodes.length - 1; i >= 0; i -= 1) {
          stack.push(el.childNodes[i]);
        }
        if (el.shadowRoot) stack.push(el.shadowRoot);
      } else if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        for (let i = node.childNodes.length - 1; i >= 0; i -= 1) {
          stack.push(node.childNodes[i]);
        }
      }
    }
  }

  function pickMainContainer() {
    const preferred = document.querySelector('article, main, [role="main"]');
    if (preferred) return preferred;
    let best = document.body;
    let bestLen = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const el = walker.currentNode;
      if (!(el instanceof Element) || HIDDEN.has(el.tagName) || !isVisible(el)) continue;
      const length = (el.innerText || '').length;
      if (length > bestLen) {
        best = el;
        bestLen = length;
      }
    }
    return best;
  }

  function isVisible(el) {
    if (!el) return false;
    if (!(el instanceof Element)) return true;
    const style = window.getComputedStyle(el);
    return style && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
  }

  function extractKeywords(text, limit) {
    if (!text) return [];
    const counts = new Map();
    const tokens = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length >= 4 && !STOPWORDS.has(token));
    for (const token of tokens) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([word]) => word);
  }

  function extractProducts() {
    const jsonld = parseJSONLDProducts();
    const cards = scrapeProductCards();
    const combined = [...jsonld, ...cards];
    const seen = new Set();
    const deduped = [];
    for (const product of combined) {
      const key = `${product.title}|${product.price}|${product.link}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(product);
    }
    return deduped.slice(0, 50);
  }

  function isSignificantTextChange(prev = '', next = '') {
    const before = (prev || '').trim();
    const after = (next || '').trim();
    if (!before) return false;
    if (!after) return before.length > 200;
    if (before === after) return false;

    const lenA = before.length;
    const lenB = after.length;
    const lenDiff = Math.abs(lenA - lenB);
    const relative = lenA ? lenDiff / lenA : lenDiff > 200;
    if (lenDiff > 250 && relative > 0.25) return true;

    const sampleA = before.slice(0, 200).toLowerCase();
    const sampleB = after.slice(0, 200).toLowerCase();
    if (!after.toLowerCase().includes(sampleA) && !before.toLowerCase().includes(sampleB)) {
      const wordsA = new Set(before.split(/\s+/).slice(0, 60));
      const wordsB = new Set(after.split(/\s+/).slice(0, 60));
      let overlap = 0;
      wordsA.forEach(word => {
        if (wordsB.has(word)) overlap += 1;
      });
      const union = wordsA.size + wordsB.size - overlap;
      const similarity = union ? overlap / union : 0;
      if (similarity < 0.45) return true;
    }

    return false;
  }

  function hashText(text = '') {
    try {
      const clean = (text || '').slice(0, 10000);
      if (!clean) return '';
      const encoder = new TextEncoder();
      const data = encoder.encode(clean);
      let hash = 0;
      for (let i = 0; i < data.length; i += 1) {
        hash = (hash * 31 + data[i]) >>> 0;
      }
      return hash.toString(16);
    } catch (err) {
      console.warn('hashText error', err);
      return '';
    }
  }

  function parseJSONLDProducts() {
    const list = [];
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      let payload;
      try {
        payload = JSON.parse(script.textContent || '');
      } catch (err) {
        continue;
      }
      const nodes = Array.isArray(payload) ? payload : [payload];
      for (const node of nodes) {
        if (!node) continue;
        const graph = Array.isArray(node['@graph']) ? node['@graph'] : [node];
        for (const item of graph) {
          if (!item) continue;
          if (matchesType(item['@type'], 'Product')) {
            const offers = normalizeArray(item.offers);
            if (offers.length) {
              for (const offer of offers) {
                list.push(toProduct(item, offer));
              }
            } else {
              list.push(toProduct(item));
            }
          }
          if (matchesType(item['@type'], 'ItemList') && Array.isArray(item.itemListElement)) {
            for (const entry of item.itemListElement) {
              const product = entry?.item || entry;
              if (product) {
                list.push(toProduct(product, product.offers));
              }
            }
          }
        }
      }
    }
    return list;
  }

  function matchesType(type, expected) {
    if (!type) return false;
    if (typeof type === 'string') return type.toLowerCase() === expected.toLowerCase();
    if (Array.isArray(type)) return type.some(t => String(t).toLowerCase() === expected.toLowerCase());
    return false;
  }

  function normalizeArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  function toProduct(product, offer) {
    const offerObj = Array.isArray(offer) ? offer[0] : offer;
    return {
      title: product?.name || '',
      price: offerObj?.price || offerObj?.priceSpecification?.price || '',
      currency: offerObj?.priceCurrency || offerObj?.priceSpecification?.priceCurrency || '',
      rating: product?.aggregateRating?.ratingValue || '',
      link: absoluteUrl(product?.url || offerObj?.url || location.href)
    };
  }

  function scrapeProductCards() {
    const selectors = [
      '.s-result-item',
      'li.s-result-item',
      '[data-asin]',
      '[data-itemid]',
      '[data-component-type*="s-search-result"]',
      '[data-sku-id]',
      '.product-card',
      '.product',
      '.listing',
      '.search-result'
    ];
    const cards = document.querySelectorAll(selectors.join(','));
    const items = [];
    cards.forEach(card => {
      if (!(card instanceof Element) || !isVisible(card)) return;
      const titleEl = card.querySelector('h2 a span, h2, h3, a[aria-label], a[title], a[href]');
      const priceEl = card.querySelector('[class*="price"], .a-price .a-offscreen, .a-price-whole, .money, [aria-label*="$"], [aria-label*="₹"], [aria-label*="€"]');
      const ratingEl = card.querySelector('.a-icon-alt, [class*="rating"], [aria-label*="out of 5"]');
      const linkEl = titleEl?.closest('a');
      const title = (titleEl?.getAttribute('aria-label') || titleEl?.getAttribute('title') || titleEl?.textContent || '').trim();
      if (!title) return;
      items.push({
        title,
        price: (priceEl?.textContent || '').trim(),
        currency: '',
        rating: (ratingEl?.textContent || '').trim(),
        link: absoluteUrl(linkEl?.href || '')
      });
    });
    return items;
  }

  function absoluteUrl(href = '') {
    try {
      return new URL(href, location.href).toString();
    } catch (err) {
      return href || '';
    }
  }

  const STOPWORDS = new Set([
    'with','your','from','this','that','have','what','when','where','they','them','then','will','into','about','which','there','their','been','also','more','than','best','most','some','many','such','only','other','after','before','into','over','under','while','using','each','just','very','here','home','page','https','http','www'
  ]);
})();
