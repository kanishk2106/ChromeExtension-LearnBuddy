/**
 * Signal Extraction Utilities
 * Extracts structured, meaningful data from web pages:
 * - Product details (price, title, availability, etc.)
 * - Action items (buttons, forms, CTAs)
 * - Due dates and deadlines
 * - Search intent
 * - Assignment/task page indicators
 */

// Action verbs that indicate actionable items
const ACTION_VERBS = [
  'buy', 'add', 'cart', 'checkout', 'purchase', 'order',
  'enroll', 'register', 'signup', 'sign up', 'join',
  'submit', 'send', 'post', 'publish', 'save',
  'download', 'install', 'get', 'claim',
  'apply', 'request', 'book', 'reserve', 'schedule',
  'pay', 'donate', 'contribute',
  'start', 'begin', 'continue', 'resume', 'complete',
  'subscribe', 'follow', 'watch', 'learn',
  'create', 'build', 'make',
  'login', 'log in', 'sign in', 'signin'
];

// Due date keywords
const DUE_DATE_KEYWORDS = [
  'due', 'deadline', 'submit by', 'due by', 'due date',
  'closes', 'expires', 'expiration', 'ends',
  'available until', 'must be submitted',
  'final date', 'last day', 'cutoff'
];

// Assignment/task platform indicators
const TASK_PLATFORM_INDICATORS = {
  canvas: ['instructure.com', 'canvas', 'course', 'assignment', 'grade'],
  blackboard: ['blackboard.com', 'bb-', 'webapps/blackboard'],
  gradescope: ['gradescope.com', 'autograder', 'submission'],
  github: ['github.com', 'issues', 'pull request', 'milestone'],
  jira: ['atlassian.net', 'jira', 'ticket', 'sprint', 'story'],
  notion: ['notion.so', 'notion.site', 'database', 'task'],
  asana: ['asana.com', 'task', 'project'],
  trello: ['trello.com', 'board', 'card'],
  todoist: ['todoist.com', 'task', 'todo'],
  moodle: ['moodle', 'mod_assign', 'submission']
};

// Search URL parameters
const SEARCH_PARAMS = ['q', 'query', 'search', 'k', 's', 'keyword', 'term'];

// Date patterns (flexible matching)
const DATE_PATTERNS = [
  // Jan 15, 2024 or January 15, 2024
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/gi,
  // 01/15/2024 or 1-15-2024 or 01.15.2024
  /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g,
  // 2024-01-15 (ISO format)
  /\b\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}\b/g,
  // "tomorrow", "next week", etc. (relative dates)
  /\b(?:today|tomorrow|tonight|next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/gi
];

/**
 * Extract product details from page
 * Sources: JSON-LD, microdata, OpenGraph, visible DOM patterns
 */
export function extractProductDetails() {
  const products = [];

  // 1. Extract from JSON-LD structured data
  const jsonldProducts = extractFromJSONLD();
  products.push(...jsonldProducts);

  // 2. Extract from OpenGraph/meta tags (single product pages)
  const ogProduct = extractFromOpenGraph();
  if (ogProduct) products.push(ogProduct);

  // 3. Extract from microdata
  const microdataProducts = extractFromMicrodata();
  products.push(...microdataProducts);

  // 4. Extract from visible DOM (fallback)
  if (products.length === 0) {
    const domProduct = extractFromVisibleDOM();
    if (domProduct) products.push(domProduct);
  }

  // Deduplicate and return
  return deduplicateProducts(products);
}

function extractFromJSONLD() {
  const products = [];
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');

  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        if (item['@type'] === 'Product' || item['@type']?.includes('Product')) {
          products.push({
            title: item.name || '',
            price: extractPrice(item.offers?.price || item.price),
            currency: item.offers?.priceCurrency || 'USD',
            availability: item.offers?.availability || '',
            productId: item.sku || item.gtin || item.mpn || '',
            brand: item.brand?.name || item.brand || '',
            rating: item.aggregateRating?.ratingValue || null,
            reviewCount: item.aggregateRating?.reviewCount || null,
            image: item.image?.[0] || item.image || '',
            source: 'jsonld'
          });
        }
      }
    } catch (e) {
      // Skip invalid JSON-LD
    }
  }

  return products;
}

function extractFromOpenGraph() {
  const title = getMeta('og:title') || getMeta('og:product:title');
  const price = getMeta('og:price:amount') || getMeta('product:price:amount');
  const currency = getMeta('og:price:currency') || getMeta('product:price:currency');
  const availability = getMeta('og:availability') || getMeta('product:availability');
  const brand = getMeta('og:brand') || getMeta('product:brand');

  if (!title && !price) return null;

  return {
    title: title || document.title,
    price: extractPrice(price),
    currency: currency || 'USD',
    availability,
    brand,
    source: 'opengraph'
  };
}

function extractFromMicrodata() {
  const products = [];
  const items = document.querySelectorAll('[itemtype*="Product"]');

  for (const item of items) {
    const product = {
      title: item.querySelector('[itemprop="name"]')?.textContent?.trim() || '',
      price: extractPrice(item.querySelector('[itemprop="price"]')?.textContent),
      currency: item.querySelector('[itemprop="priceCurrency"]')?.content || 'USD',
      availability: item.querySelector('[itemprop="availability"]')?.textContent?.trim() || '',
      brand: item.querySelector('[itemprop="brand"]')?.textContent?.trim() || '',
      source: 'microdata'
    };

    if (product.title || product.price) {
      products.push(product);
    }
  }

  return products;
}

function extractFromVisibleDOM() {
  // Look for common price patterns in visible text
  const priceElements = document.querySelectorAll('[class*="price"], [id*="price"], [data-price]');
  let bestPrice = null;
  let priceText = '';

  for (const el of priceElements) {
    if (!isVisible(el)) continue;
    const text = el.textContent || el.getAttribute('data-price') || '';
    const price = extractPrice(text);
    if (price && (!bestPrice || price < bestPrice)) {
      bestPrice = price;
      priceText = text;
    }
  }

  if (!bestPrice) return null;

  // Try to find product title (h1 or main heading)
  const titleEl = document.querySelector('h1, [class*="product-title"], [id*="product-name"]');
  const title = titleEl?.textContent?.trim() || document.title;

  return {
    title,
    price: bestPrice,
    currency: extractCurrency(priceText),
    source: 'dom'
  };
}

function getMeta(property) {
  return document.querySelector(`meta[property="${property}"], meta[name="${property}"]`)?.content || '';
}

function extractPrice(text) {
  if (!text) return null;
  const str = String(text);
  // Match price patterns: $99.99, 99.99, $99, etc.
  const match = str.match(/[\$\€\£\¥]?\s*(\d+(?:[,\.]\d{2,3})*(?:[,\.]\d{2})?)/);
  if (match) {
    return parseFloat(match[1].replace(/,/g, ''));
  }
  return null;
}

function extractCurrency(text) {
  if (!text) return 'USD';
  if (text.includes('$')) return 'USD';
  if (text.includes('€')) return 'EUR';
  if (text.includes('£')) return 'GBP';
  if (text.includes('¥')) return 'JPY';
  return 'USD';
}

function deduplicateProducts(products) {
  const seen = new Map();
  for (const product of products) {
    const key = `${product.title}|${product.price}`;
    if (!seen.has(key)) {
      seen.set(key, product);
    }
  }
  return Array.from(seen.values()).slice(0, 10); // Top 10 products
}

/**
 * Extract action items from page
 * Returns buttons, links, and forms that suggest user actions
 */
export function extractActionItems() {
  const actions = [];
  const seen = new Set();

  // 1. Buttons with action verbs
  const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]');
  for (const btn of buttons) {
    if (!isVisible(btn)) continue;
    const text = (btn.textContent || btn.value || btn.getAttribute('aria-label') || '').trim().toLowerCase();
    if (!text) continue;

    for (const verb of ACTION_VERBS) {
      if (text.includes(verb)) {
        const actionText = (btn.textContent || btn.value || btn.getAttribute('aria-label')).trim();
        if (actionText && !seen.has(actionText)) {
          actions.push({
            type: 'button',
            text: actionText.slice(0, 100), // Limit length
            verb: verb,
            element: btn.tagName.toLowerCase()
          });
          seen.add(actionText);
        }
        break;
      }
    }
  }

  // 2. Links with action verbs (CTAs)
  const links = document.querySelectorAll('a[href]');
  for (const link of links) {
    if (!isVisible(link)) continue;
    const text = link.textContent.trim().toLowerCase();
    if (!text || text.length > 100) continue;

    for (const verb of ACTION_VERBS) {
      if (text.includes(verb)) {
        const actionText = link.textContent.trim();
        if (actionText && !seen.has(actionText)) {
          actions.push({
            type: 'link',
            text: actionText.slice(0, 100),
            verb: verb,
            href: link.href,
            element: 'a'
          });
          seen.add(actionText);
        }
        break;
      }
    }
  }

  // 3. Forms (implicit actions)
  const forms = document.querySelectorAll('form');
  for (const form of forms) {
    if (!isVisible(form)) continue;
    const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
    const submitText = submitBtn?.textContent || submitBtn?.value || 'Submit form';
    const formId = form.id || form.name || '';
    const key = `form_${formId}_${submitText}`;

    if (!seen.has(key)) {
      actions.push({
        type: 'form',
        text: submitText.trim(),
        verb: 'submit',
        element: 'form',
        formId
      });
      seen.add(key);
    }
  }

  return actions.slice(0, 20); // Top 20 actions
}

/**
 * Extract due dates and deadlines from page
 */
export function extractDueDates() {
  const dueDates = [];
  const seen = new Set();

  // Walk through all visible text nodes
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent || !isVisible(parent)) return NodeFilter.FILTER_REJECT;
        if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  while (walker.nextNode()) {
    const text = walker.currentNode.textContent;
    if (!text || text.length < 5) continue;

    const lowerText = text.toLowerCase();

    // Check if text contains due date keywords
    let hasDueKeyword = false;
    for (const keyword of DUE_DATE_KEYWORDS) {
      if (lowerText.includes(keyword)) {
        hasDueKeyword = true;
        break;
      }
    }

    if (!hasDueKeyword) continue;

    // Extract dates near due date keywords
    for (const pattern of DATE_PATTERNS) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const date = match[0];
        const context = text.slice(Math.max(0, match.index - 50), Math.min(text.length, match.index + date.length + 50));
        const key = `${date}_${context}`;

        if (!seen.has(key)) {
          dueDates.push({
            date,
            context: context.trim(),
            extracted: new Date().toISOString()
          });
          seen.add(key);
        }
      }
    }
  }

  return dueDates.slice(0, 10); // Top 10 due dates
}

/**
 * Extract search intent from URL and page
 */
export function extractSearchIntent() {
  // 1. Check URL parameters
  const url = new URL(window.location.href);
  for (const param of SEARCH_PARAMS) {
    const value = url.searchParams.get(param);
    if (value) {
      return {
        query: decodeURIComponent(value),
        source: 'url_param',
        param
      };
    }
  }

  // 2. Check search box value
  const searchBox = document.querySelector('input[type="search"], input[name="q"], input[name="query"], input[name="search"]');
  if (searchBox && searchBox.value) {
    return {
      query: searchBox.value,
      source: 'search_box'
    };
  }

  // 3. Check for "Results for ..." pattern in headings
  const headings = document.querySelectorAll('h1, h2, h3');
  for (const heading of headings) {
    const text = heading.textContent;
    const match = text.match(/(?:results? for|searching for|search results?)[:\s]+["']?([^"']+)["']?/i);
    if (match) {
      return {
        query: match[1].trim(),
        source: 'heading'
      };
    }
  }

  return null;
}

/**
 * Detect if page is an assignment/task management platform
 */
export function detectTaskPlatform() {
  const url = window.location.href.toLowerCase();
  const bodyText = document.body.textContent.toLowerCase();
  const title = document.title.toLowerCase();

  for (const [platform, indicators] of Object.entries(TASK_PLATFORM_INDICATORS)) {
    let matches = 0;
    for (const indicator of indicators) {
      if (url.includes(indicator) || bodyText.includes(indicator) || title.includes(indicator)) {
        matches++;
      }
    }

    // Require at least 2 indicators to confirm
    if (matches >= 2) {
      return {
        platform,
        confidence: Math.min(matches / indicators.length, 1.0),
        reason: `Detected ${matches} indicators for ${platform}`
      };
    }
  }

  return null;
}

/**
 * Extract all signals from current page
 */
export function extractAllSignals() {
  return {
    products: extractProductDetails(),
    actionItems: extractActionItems(),
    dueDates: extractDueDates(),
    searchIntent: extractSearchIntent(),
    taskPlatform: detectTaskPlatform(),
    timestamp: Date.now()
  };
}

// Helper: check if element is visible
function isVisible(el) {
  if (!el || !(el instanceof Element)) return false;
  const style = window.getComputedStyle(el);
  return style &&
         style.display !== 'none' &&
         style.visibility !== 'hidden' &&
         Number(style.opacity) !== 0;
}
