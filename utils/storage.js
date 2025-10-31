const PAGE_DATA_KEY = 'pageDataByTab';
const ANALYTICS_KEY = 'categoryAnalytics';
const ACTION_HISTORY_KEY = 'actionHistory';
const PRODUCT_CACHE_KEY = 'productData';
const FOCUS_EVENTS_KEY = 'focusEvents';
const FOCUS_LAST_STREAK_KEY = 'focusLastStreakCache';

function tabKey(tabId) {
  return typeof tabId === 'number' ? String(tabId) : (tabId || 'unknown');
}

export async function getLocal(keys) {
  const result = await chrome.storage.local.get(keys);
  return result || {};
}

export async function setLocal(data) {
  await chrome.storage.local.set(data);
}

export async function savePageSnapshot(tabId, snapshot) {
  if (!snapshot) return;
  const key = tabKey(tabId);
  const { textSnippet, keywords, products, ...light } = snapshot;
  const existing = await getLocal([PAGE_DATA_KEY]);
  const map = existing[PAGE_DATA_KEY] || {};
  map[key] = { ...light, tabId };
  await setLocal({ [PAGE_DATA_KEY]: map });

  const sessionStore = await chrome.storage.session.get(PAGE_DATA_KEY);
  const sessionMap = sessionStore[PAGE_DATA_KEY] || {};
  sessionMap[key] = { textSnippet, keywords, products };
  await chrome.storage.session.set({ [PAGE_DATA_KEY]: sessionMap });
}

export async function getPageSnapshot(tabId) {
  const key = tabKey(tabId);
  const existing = await getLocal([PAGE_DATA_KEY]);
  const light = (existing[PAGE_DATA_KEY] || {})[key];
  if (!light) return null;
  const sessionStore = await chrome.storage.session.get(PAGE_DATA_KEY);
  const sessionMap = sessionStore[PAGE_DATA_KEY] || {};
  return { ...sessionMap[key], ...light };
}

export async function getAllPageSnapshots() {
  const existing = await getLocal([PAGE_DATA_KEY]);
  const map = existing[PAGE_DATA_KEY] || {};
  const sessionStore = await chrome.storage.session.get(PAGE_DATA_KEY);
  const sessionMap = sessionStore[PAGE_DATA_KEY] || {};
  return Object.entries(map).map(([key, value]) => ({ ...sessionMap[key], ...value }));
}

export async function clearPageSnapshot(tabId) {
  const key = tabKey(tabId);
  const existing = await getLocal([PAGE_DATA_KEY]);
  const map = existing[PAGE_DATA_KEY] || {};
  if (key in map) {
    delete map[key];
    await setLocal({ [PAGE_DATA_KEY]: map });
  }
  const sessionStore = await chrome.storage.session.get(PAGE_DATA_KEY);
  const sessionMap = sessionStore[PAGE_DATA_KEY] || {};
  if (key in sessionMap) {
    delete sessionMap[key];
    await chrome.storage.session.set({ [PAGE_DATA_KEY]: sessionMap });
  }
}

export async function updateCategoryAnalytics(previousCategory, nextCategory) {
  const existing = await getLocal([ANALYTICS_KEY]);
  const analytics = existing[ANALYTICS_KEY] || {};

  if (previousCategory && analytics[previousCategory]) {
    const nextValue = Math.max(0, (analytics[previousCategory] || 0) - 1);
    if (nextValue === 0) {
      delete analytics[previousCategory];
    } else {
      analytics[previousCategory] = nextValue;
    }
  }

  if (nextCategory) {
    analytics[nextCategory] = (analytics[nextCategory] || 0) + 1;
  }

  await setLocal({ [ANALYTICS_KEY]: analytics });
  return analytics;
}

export async function getCategoryAnalytics() {
  const existing = await getLocal([ANALYTICS_KEY]);
  return existing[ANALYTICS_KEY] || {};
}

export async function cacheProductsForTab(tabId, products) {
  const key = tabKey(tabId);
  const existing = await getLocal([PRODUCT_CACHE_KEY]);
  const map = existing[PRODUCT_CACHE_KEY] || {};
  map[key] = Array.isArray(products) ? products : [];
  await setLocal({ [PRODUCT_CACHE_KEY]: map });
}

export async function getCachedProducts(tabId) {
  const key = tabKey(tabId);
  const existing = await getLocal([PRODUCT_CACHE_KEY]);
  const map = existing[PRODUCT_CACHE_KEY] || {};
  return map[key] || [];
}

export async function recordActionHistory(entry) {
  const existing = await getLocal([ACTION_HISTORY_KEY]);
  const history = existing[ACTION_HISTORY_KEY] || [];
  const next = [{ ...entry, timestamp: Date.now() }, ...history].slice(0, 50);
  await setLocal({ [ACTION_HISTORY_KEY]: next });
  return next;
}

export async function getActionHistory() {
  const existing = await getLocal([ACTION_HISTORY_KEY]);
  return existing[ACTION_HISTORY_KEY] || [];
}

export async function getDashboardData() {
  const [analytics, history, pages, focusStats] = await Promise.all([
    getCategoryAnalytics(),
    getActionHistory(),
    getAllPageSnapshots(),
    getFocusStats()
  ]);

  // Build browsing history with one-liners and signals for productivity coaching
  const browsingHistory = Object.values(pages || {})
    .filter(page => page.category) // Only pages with categories
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)) // Most recent first
    .slice(0, 10) // Last 10 activities
    .map(page => ({
      activity: page.oneLiner || page.title || 'Unknown activity',
      category: page.category,
      url: page.url,
      timestamp: page.updatedAt,
      signals: page.signals || null  // Include extracted signals (action items, due dates, etc.)
    }));

  return {
    analytics,
    history,
    pages,
    focusStats,
    browsingHistory
  };
}

export async function recordFocusEvent(category, durationMs = 60000) {
  if (!category) return;
  const duration = Math.max(0, durationMs);
  const existing = await getLocal([FOCUS_EVENTS_KEY]);
  const events = existing[FOCUS_EVENTS_KEY] || [];
  events.unshift({ category, duration, timestamp: Date.now() });
  const trimmed = events.slice(0, 500);
  await setLocal({ [FOCUS_EVENTS_KEY]: trimmed });
}

export async function getFocusStats() {
  const existing = await getLocal([FOCUS_EVENTS_KEY, FOCUS_LAST_STREAK_KEY]);
  const events = existing[FOCUS_EVENTS_KEY] || [];
  const now = new Date();
  const currentWeekKey = isoWeekKey(now);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  const previousWeekKey = isoWeekKey(weekStart);

  const dailyMap = new Map();
  const weekTotals = new Map();
  const productiveSet = new Set(['learning', 'productivity', 'dev', 'research', 'docs', 'finance']);
  const distractionSet = new Set(['shopping', 'entertainment', 'social']);

  for (const ev of events) {
    if (!ev?.category || !ev?.timestamp) continue;
    const duration = Number(ev.duration) || 0;
    if (duration <= 0) continue;
    const date = new Date(ev.timestamp);
    const dayKey = date.toISOString().slice(0, 10);
    const weekKey = isoWeekKey(date);
    const dayStats = dailyMap.get(dayKey) || { productive: 0, distraction: 0, total: 0 };
    if (productiveSet.has(ev.category)) dayStats.productive += duration;
    else if (distractionSet.has(ev.category)) dayStats.distraction += duration;
    dayStats.total += duration;
    dailyMap.set(dayKey, dayStats);

    const weekStats = weekTotals.get(weekKey) || { productive: 0, distraction: 0, total: 0 };
    if (productiveSet.has(ev.category)) weekStats.productive += duration;
    else if (distractionSet.has(ev.category)) weekStats.distraction += duration;
    weekStats.total += duration;
    weekTotals.set(weekKey, weekStats);
  }

  const currentWeekStats = weekTotals.get(currentWeekKey) || { productive: 0, distraction: 0, total: 0 };
  const previousWeekStats = weekTotals.get(previousWeekKey) || { productive: 0, distraction: 0, total: 0 };

  const focusPct = percentage(currentWeekStats.productive, currentWeekStats.total);
  const prevFocusPct = percentage(previousWeekStats.productive, previousWeekStats.total);
  const trendDelta = focusPct - prevFocusPct;

  const streakInfo = calculateStreak(dailyMap, productiveSet, distractionSet);

  return {
    currentWeek: currentWeekStats,
    previousWeek: previousWeekStats,
    focusPct,
    prevFocusPct,
    trendDelta,
    streak: streakInfo,
    dailyBreakdown: Array.from(dailyMap.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-7)
      .map(([day, stats]) => ({ day, ...stats })),
    lastStreakCached: existing[FOCUS_LAST_STREAK_KEY] || 0
  };
}

export async function cacheStreakValue(value) {
  await setLocal({ [FOCUS_LAST_STREAK_KEY]: value });
}

export async function cleanupSnapshots({ maxAgeMs, maxBytes }) {
  const existing = await getLocal([PAGE_DATA_KEY]);
  const map = existing[PAGE_DATA_KEY] || {};
  const now = Date.now();
  const removal = [];
  if (maxAgeMs) {
    for (const [key, snapshot] of Object.entries(map)) {
      if (snapshot.updatedAt && now - snapshot.updatedAt > maxAgeMs) {
        removal.push(key);
      }
    }
  }
  if (removal.length) {
    await removeSnapshotKeys(removal);
  }
  if (maxBytes) {
    const bytes = await new Promise(resolve => chrome.storage.local.getBytesInUse(null, resolve));
    if (bytes > maxBytes) {
      const ordered = Object.entries(map)
        .sort((a, b) => (a[1].updatedAt || 0) - (b[1].updatedAt || 0));
      const extra = [];
      let remaining = bytes;
      for (const [key, snapshot] of ordered) {
        if (remaining <= maxBytes) break;
        extra.push(key);
        remaining -= JSON.stringify(snapshot).length;
      }
      if (extra.length) {
        await removeSnapshotKeys(extra);
      }
    }
  }
}

export async function markAllSnapshotsForRefresh() {
  const existing = await getLocal([PAGE_DATA_KEY]);
  const map = existing[PAGE_DATA_KEY] || {};
  const next = {};
  for (const [key, snapshot] of Object.entries(map)) {
    next[key] = { ...snapshot, needsAiRefresh: true };
  }
  await setLocal({ [PAGE_DATA_KEY]: next });
}

export async function setModelVersion(version) {
  await setLocal({ modelVersion: version });
}

export async function getStoredModelVersion() {
  const stored = await getLocal(['modelVersion']);
  return stored.modelVersion || 'unknown';
}

async function removeSnapshotKeys(keys) {
  if (!keys.length) return;
  const existing = await getLocal([PAGE_DATA_KEY]);
  const map = existing[PAGE_DATA_KEY] || {};
  let changed = false;
  for (const key of keys) {
    if (map[key]) {
      delete map[key];
      changed = true;
    }
  }
  if (changed) {
    await setLocal({ [PAGE_DATA_KEY]: map });
  }
  const sessionStore = await chrome.storage.session.get(PAGE_DATA_KEY);
  const sessionMap = sessionStore[PAGE_DATA_KEY] || {};
  let sessionChanged = false;
  for (const key of keys) {
    if (sessionMap[key]) {
      delete sessionMap[key];
      sessionChanged = true;
    }
  }
  if (sessionChanged) {
    await chrome.storage.session.set({ [PAGE_DATA_KEY]: sessionMap });
  }
}

function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function percentage(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function calculateStreak(dailyMap) {
  const entries = Array.from(dailyMap.entries())
    .map(([day, stats]) => ({ day, stats }))
    .sort((a, b) => (a.day < b.day ? 1 : -1));

  let streak = 0;
  let lastDate = null;

  for (const { day, stats } of entries) {
    const date = new Date(day);
    if (lastDate) {
      const diff = (lastDate - date) / 86400000;
      if (diff > 1) break;
    }
    lastDate = date;
    if (stats.total <= 0) break;
    if (stats.productive >= stats.distraction) {
      streak += 1;
    } else {
      break;
    }
  }

  return { days: streak, category: streak > 0 ? 'productive' : null };
}
