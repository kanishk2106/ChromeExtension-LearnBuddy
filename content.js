(() => {
  const TEXT_CLAMP = 8_000;
  const KEYWORD_LIMIT = 12;
  const HIDDEN = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS', 'META', 'LINK']);

  let lastPayload = null;
  let contentVersion = 0;
  let pending = null;
  let lastHash = '';

  // Track user clicks on interactive elements
  let clickedElements = new Set();
  let clickedActionItems = [];

  // Safe message sender that guards against extension context invalidation
  const safeSendMessage = (message) => {
    if (!chrome.runtime?.id) return Promise.resolve();
    return chrome.runtime.sendMessage(message).catch((err) => {
      // Suppress expected "Extension context invalidated" errors
      if (err?.message?.includes('Extension context invalidated')) return;
      console.warn('sendMessage error:', err);
    });
  };

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

      safeSendMessage({ type: 'PAGE_INFO', data: payload });
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
    safeSendMessage({ type: 'VISIBILITY', visible: !document.hidden });
  };

  document.addEventListener('visibilitychange', sendVisibility);
  sendVisibility();

  // Track clicks on interactive elements
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!target) return;

    // Find the closest interactive element
    const interactive = target.closest('button, a[href], input[type="button"], input[type="submit"], [role="button"]');
    if (!interactive) return;

    // Get text content
    const text = (interactive.textContent || interactive.value || interactive.getAttribute('aria-label') || '').trim();
    if (!text || text.length > 200) return;

    // Check if this is an action item
    const ACTION_VERBS = ['buy', 'add', 'cart', 'checkout', 'purchase', 'order', 'enroll', 'register', 'signup', 'sign up', 'join', 'submit', 'send', 'post', 'download', 'install', 'get', 'apply', 'book', 'schedule', 'pay', 'start', 'continue', 'subscribe', 'login', 'log in', 'sign in'];
    const lowerText = text.toLowerCase();
    const matchedVerb = ACTION_VERBS.find(verb => lowerText.includes(verb));

    if (matchedVerb) {
      // Store clicked action item
      clickedActionItems.push({
        text: text.slice(0, 100),
        verb: matchedVerb,
        timestamp: Date.now(),
        url: location.href
      });

      // Keep only last 20 clicked items
      if (clickedActionItems.length > 20) {
        clickedActionItems = clickedActionItems.slice(-20);
      }

      // Debounce sending update
      debounceSend();
    }
  }, { passive: true });

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

      // Extract structured signals
      const signals = extractAllSignals();

      const language = document.documentElement.getAttribute('lang') || navigator.language || 'en';

      // Build structured payload with enhanced data
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
        // New structured signals
        signals: {
          products: signals.products || [],
          actionItems: signals.actionItems || [],
          dueDates: signals.dueDates || [],
          searchIntent: signals.searchIntent || null,
          taskPlatform: signals.taskPlatform || null,
          // Add clicked action items
          clickedActionItems: clickedActionItems.slice()
        },
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
      reviewCount: product?.aggregateRating?.reviewCount || product?.aggregateRating?.ratingCount || '',
      availability: offerObj?.availability || '',
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
      const reviewCountEl = card.querySelector('[class*="review"], [aria-label*="rating"], span[aria-label*="stars"]');
      const linkEl = titleEl?.closest('a');
      const title = (titleEl?.getAttribute('aria-label') || titleEl?.getAttribute('title') || titleEl?.textContent || '').trim();
      if (!title) return;

      // Extract review count from text like "1,234 ratings" or "45 reviews"
      const reviewText = reviewCountEl?.textContent || reviewCountEl?.getAttribute('aria-label') || '';
      const reviewMatch = reviewText.match(/(\d+(?:,\d+)*)\s*(?:rating|review|star)/i);
      const reviewCount = reviewMatch ? reviewMatch[1].replace(/,/g, '') : '';

      items.push({
        title,
        price: (priceEl?.textContent || '').trim(),
        currency: '',
        rating: (ratingEl?.textContent || '').trim(),
        reviewCount: reviewCount,
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

  // ========== STRUCTURED SIGNAL EXTRACTION ==========

  const ACTION_VERBS = ['buy', 'add', 'cart', 'checkout', 'purchase', 'order', 'enroll', 'register', 'signup', 'sign up', 'join', 'submit', 'send', 'post', 'download', 'install', 'get', 'apply', 'book', 'schedule', 'pay', 'start', 'continue', 'subscribe', 'login', 'log in', 'sign in'];
  const DUE_DATE_KEYWORDS = ['due', 'deadline', 'submit by', 'closes', 'expires', 'available until'];
  const TASK_PLATFORMS = { canvas: ['instructure.com', 'canvas'], gradescope: ['gradescope.com'], github: ['github.com', 'issues'], jira: ['atlassian.net', 'jira'] };
  const SEARCH_PARAMS = ['q', 'query', 'search', 'k', 's'];

  function extractAllSignals() {
    return {
      actionItems: extractActionItems(),
      dueDates: extractDueDates(),
      searchIntent: extractSearchIntent(),
      taskPlatform: detectTaskPlatform()
    };
  }

  function extractActionItems() {
    const actions = [];
    const seen = new Set();
    const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"], a[href]');

    for (const btn of buttons) {
      if (!isVisible(btn)) continue;
      const text = (btn.textContent || btn.value || btn.getAttribute('aria-label') || '').trim().toLowerCase();
      if (!text || text.length > 100) continue;

      for (const verb of ACTION_VERBS) {
        if (text.includes(verb)) {
          const actionText = (btn.textContent || btn.value || btn.getAttribute('aria-label') || '').trim();
          if (actionText && !seen.has(actionText)) {
            actions.push({ text: actionText.slice(0, 80), verb });
            seen.add(actionText);
            break;
          }
        }
      }
      if (actions.length >= 15) break;
    }
    return actions;
  }

  function extractDueDates() {
    const dueDates = [];
    const seen = new Set();
    const datePatterns = [
      /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2},?\s+\d{4}\b/gi,
      /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g,
      /\b(?:today|tomorrow|next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday))\b/gi
    ];

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement;
      if (!parent || !isVisible(parent) || HIDDEN.has(parent.tagName)) continue;

      const text = walker.currentNode.textContent;
      if (!text || text.length < 5) continue;

      const lowerText = text.toLowerCase();
      let hasDueKeyword = false;
      for (const keyword of DUE_DATE_KEYWORDS) {
        if (lowerText.includes(keyword)) {
          hasDueKeyword = true;
          break;
        }
      }
      if (!hasDueKeyword) continue;

      for (const pattern of datePatterns) {
        const matches = [...text.matchAll(pattern)];
        for (const match of matches) {
          const date = match[0];
          if (!seen.has(date)) {
            const context = text.slice(Math.max(0, match.index - 40), Math.min(text.length, match.index + date.length + 40)).trim();
            dueDates.push({ date, context });
            seen.add(date);
          }
        }
      }
      if (dueDates.length >= 10) break;
    }
    return dueDates;
  }

  function extractSearchIntent() {
    const url = new URL(window.location.href);
    for (const param of SEARCH_PARAMS) {
      const value = url.searchParams.get(param);
      if (value) return { query: decodeURIComponent(value), source: 'url' };
    }

    const searchBox = document.querySelector('input[type="search"], input[name="q"]');
    if (searchBox?.value) return { query: searchBox.value, source: 'input' };

    return null;
  }

  function detectTaskPlatform() {
    const url = window.location.href.toLowerCase();
    const title = document.title.toLowerCase();

    for (const [platform, indicators] of Object.entries(TASK_PLATFORMS)) {
      let matches = 0;
      for (const indicator of indicators) {
        if (url.includes(indicator) || title.includes(indicator)) matches++;
      }
      if (matches >= 1) return { platform, confidence: matches / indicators.length };
    }
    return null;
  }

})();
