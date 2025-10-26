import { categorize, categoryLabel, normalizeCategory } from './utils/categorize.js';
import { getActionPoints } from './utils/action_points.js';
import { compareProducts, summarizeBestDeal } from './utils/product_compare.js';
import {
  savePageSnapshot,
  getPageSnapshot,
  clearPageSnapshot,
  updateCategoryAnalytics,
  getCategoryAnalytics,
  cacheProductsForTab,
  getCachedProducts,
  getDashboardData,
  recordActionHistory,
  recordFocusEvent,
  cleanupSnapshots,
  markAllSnapshotsForRefresh,
  getStoredModelVersion,
  setModelVersion
} from './utils/storage.js';
import { getCurrentModelVersion } from './utils/ai.js';

const TEXT_CLAMP = 2_000;
const CLEANUP_ALARM = 'ACTION_SENSE_CLEANUP';
const CLEANUP_MAX_AGE = 7 * 24 * 60 * 60 * 1_000;
const CLEANUP_MAX_BYTES = 5 * 1024 * 1024;

const focusSessions = new Map();
let maintenanceInitialized = false;

chrome.action.setBadgeBackgroundColor({ color: '#4C6EF5' }).catch(() => {});

initializeMaintenance();

chrome.runtime.onInstalled.addListener(() => initializeMaintenance());
chrome.runtime.onStartup?.addListener?.(() => initializeMaintenance());

chrome.tabs.onRemoved.addListener(async (tabId) => {
  finalizeFocus(tabId, true);
  await clearPageSnapshot(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;

  if (message.type === 'PAGE_INFO') {
    (async () => {
      await handlePageInfo(message.data || {}, sender?.tab);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === 'GET_POPUP_DATA') {
    (async () => {
      const tabId = message.tabId || sender?.tab?.id;
      const payload = await buildPopupPayload(tabId);
      sendResponse(payload);
    })();
    return true;
  }

  if (message.type === 'GET_DASHBOARD_DATA') {
    (async () => {
      const data = await getDashboardData();
      sendResponse(data);
    })();
    return true;
  }

  if (message.type === 'REQUEST_PRODUCT_COMPARE') {
    (async () => {
      const tabId = message.tabId || sender?.tab?.id;
      const products = await getCachedProducts(tabId);
      const insights = compareProducts(products);
      sendResponse({ insights, summary: summarizeBestDeal(insights) });
    })();
    return true;
  }

  if (message.type === 'APPLY_AI_ENRICHMENT') {
    (async () => {
      const tabId = message.tabId || sender?.tab?.id;
      const payload = await applyAIEnrichment(tabId, message.ai || {});
      sendResponse(payload);
    })();
    return true;
  }

  if (message.type === 'FLASH_BADGE') {
    (async () => {
      const tabId = message.tabId || sender?.tab?.id;
      if (!tabId) {
        sendResponse({ ok: false, error: 'NO_TAB' });
        return;
      }
      const fallbackSnapshot = await getPageSnapshot(tabId);
      const fallbackCategory = normalizeCategory(message.category || fallbackSnapshot?.category || 'other');
      try {
        await chrome.action.setBadgeText({ tabId, text: 'AI' });
        await chrome.action.setBadgeBackgroundColor({ tabId, color: '#7B61FF' });
      } catch (err) {
        console.warn('badge flash error', err);
      }

      setTimeout(async () => {
        try {
          const latest = await getPageSnapshot(tabId);
          const resolved = normalizeCategory(latest?.category || fallbackCategory || 'other');
          const letter = categoryLabel(resolved).charAt(0).toUpperCase();
          await chrome.action.setBadgeText({ tabId, text: letter });
          await chrome.action.setBadgeBackgroundColor({ tabId, color: '#4C6EF5' });
        } catch (err) {
          console.warn('badge reset error', err);
        }
      }, 2200);

      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === 'VISIBILITY') {
    const tabId = sender?.tab?.id;
    handleVisibilityChange(tabId, Boolean(message.visible));
  }
});

const hasAlarms = Boolean(chrome.alarms);

if (hasAlarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === CLEANUP_ALARM) {
      runCleanup();
    }
  });
} else {
  console.warn('[ActionSense] chrome.alarms API not available.');
}

async function handlePageInfo(data = {}, tab = null) {
  const tabId = tab?.id ?? data.tabId;
  if (!tabId) return;

  const snapshot = await getPageSnapshot(tabId);
  const normalized = normalizePageData(data, tab);
  const heuristicCategory = categorize(normalized);
  const previousContentVersion = snapshot?.contentVersion ?? 0;
  let contentVersion = typeof normalized.contentVersion === 'number'
    ? normalized.contentVersion
    : previousContentVersion;
  if (normalized.majorChange && contentVersion <= previousContentVersion) {
    contentVersion = previousContentVersion + 1;
  }
  const products = Array.isArray(normalized.products) ? normalized.products : [];

  if (products.length) {
    await cacheProductsForTab(tabId, products);
  }
  const productInsights = compareProducts(products);
  const bestDeal = summarizeBestDeal(productInsights);

  const previousCategory = snapshot?.category || null;
  const previousSource = snapshot?.categorySource || null;

  let categoryToStore = snapshot?.category;
  let categorySource = previousSource || 'heuristic';

  if (!snapshot || previousSource !== 'ai') {
    categoryToStore = heuristicCategory;
    categorySource = 'heuristic';
  }

  const focusState = ensureFocusState(tabId);
  if (focusState) {
    focusState.category = categoryToStore;
    if (focusState.visible && !focusState.start) {
      focusState.start = Date.now();
    }
  }

  const textChanged = normalized.textHash && normalized.textHash !== snapshot?.textHash;
  let needsAiRefresh = snapshot?.needsAiRefresh || false;
  if (textChanged && contentVersion > previousContentVersion) {
    needsAiRefresh = Boolean(snapshot?.categorySource === 'ai' || snapshot?.aiSummary);
  }

  if (previousCategory !== categoryToStore) {
    await updateCategoryAnalytics(previousCategory, categoryToStore);
  }

  if (bestDeal && bestDeal !== snapshot?.bestDeal) {
    await recordActionHistory({ category: categoryToStore, action: bestDeal, tabId, url: normalized.url });
  }

  const merged = {
    ...snapshot,
    ...normalized,
    heuristicCategory,
    category: categoryToStore,
    categorySource,
    categoryLabel: categoryLabel(categoryToStore),
    aiReason: categorySource === 'ai' ? (snapshot?.aiReason || null) : null,
  actions: categorySource === 'ai' && Array.isArray(snapshot?.aiActions) && snapshot.aiActions.length
    ? snapshot.aiActions
    : getActionPoints(categoryToStore),
    productInsights,
    bestDeal,
    contentVersion,
    needsAiRefresh,
    majorChange: Boolean(textChanged),
    productAdvice: snapshot?.productAdvice || null,
    productAdviceAt: snapshot?.productAdviceAt || null,
    textHash: normalized.textHash || snapshot?.textHash || null,
    lastAiAt: snapshot?.lastAiAt || null,
    updatedAt: Date.now()
  };

  await savePageSnapshot(tabId, merged);

  await updateBadge(tabId, merged.categoryLabel);

  chrome.runtime.sendMessage({ type: 'PAGE_INFO_UPDATED', tabId, category: merged.category }).catch(() => {});
}

async function applyAIEnrichment(tabId, ai = {}) {
  if (!tabId) return { ok: false, error: 'NO_TAB' };

  const snapshot = await getPageSnapshot(tabId);
  if (!snapshot) return { ok: false, error: 'NO_SNAPSHOT' };

  const normalizedCategory = ai.category ? normalizeCategory(ai.category) : null;
  const summary = typeof ai.summary === 'string' ? ai.summary.trim() : null;
  const actions = Array.isArray(ai.actions) ? ai.actions.filter(Boolean) : null;
  const confidence = typeof ai.confidence === 'number' ? ai.confidence : null;
  const notes = typeof ai.notes === 'string' ? ai.notes.trim() : null;
  const reason = typeof ai.reason === 'string' ? ai.reason.trim() : null;
  const oneLiner = typeof ai.oneLiner === 'string' ? ai.oneLiner.trim() : null;
  const productAdvice = ai.productAdvice && typeof ai.productAdvice === 'object'
    ? {
        bestTitle: typeof ai.productAdvice.bestTitle === 'string' ? ai.productAdvice.bestTitle : null,
        reason: typeof ai.productAdvice.reason === 'string' ? ai.productAdvice.reason : null
      }
    : null;

  const previousCategory = snapshot.category || null;
  let nextCategory = previousCategory;
  let categorySource = snapshot.categorySource || 'heuristic';

  if (normalizedCategory) {
    nextCategory = normalizedCategory;
    categorySource = 'ai';
  }

  if (previousCategory !== nextCategory) {
    await updateCategoryAnalytics(previousCategory, nextCategory);
  }

  const resolvedActions = actions && actions.length ? actions : getActionPoints(nextCategory);

  const updated = {
    ...snapshot,
    category: nextCategory,
    categorySource,
    categoryLabel: categoryLabel(nextCategory),
    aiCategory: normalizedCategory || snapshot.aiCategory || null,
    aiSummary: summary || snapshot.aiSummary || null,
    aiActions: resolvedActions,
    aiConfidence: confidence ?? snapshot.aiConfidence,
    aiNotes: notes || snapshot.aiNotes,
    aiReason: reason || notes || snapshot.aiReason || null,
    oneLiner: oneLiner || snapshot.oneLiner || null,
    actions: resolvedActions,
    needsAiRefresh: false,
    majorChange: false,
    aiUpdatedAt: Date.now(),
    lastAiAt: Date.now()
  };

  if (ai.bestDealNote) {
    updated.bestDeal = ai.bestDealNote;
  }

  if (productAdvice && (productAdvice.reason || productAdvice.bestTitle)) {
    updated.productAdvice = {
      ...productAdvice,
      generatedAt: Date.now()
    };
    updated.productAdviceAt = Date.now();
  }

  await savePageSnapshot(tabId, updated);

  await updateBadge(tabId, updated.categoryLabel);

  chrome.runtime.sendMessage({ type: 'PAGE_INFO_UPDATED', tabId, category: updated.category }).catch(() => {});

  const analytics = await getCategoryAnalytics();
  return { ok: true, snapshot: updated, analytics };
}

function ensureFocusState(tabId) {
  if (tabId == null) return null;
  let state = focusSessions.get(tabId);
  if (!state) {
    state = { visible: false, start: null, category: null };
    focusSessions.set(tabId, state);
  }
  return state;
}

function handleVisibilityChange(tabId, visible) {
  if (tabId == null) return;
  const state = ensureFocusState(tabId);
  if (!state) return;
  if (visible) {
    state.visible = true;
    state.start = Date.now();
  } else {
    finalizeFocus(tabId);
  }
}

function finalizeFocus(tabId, remove = false) {
  const state = focusSessions.get(tabId);
  if (!state) return;
  if (state.visible && state.start && state.category) {
    const now = Date.now();
    let duration = now - state.start;
    duration = Math.min(duration, 30 * 60 * 1000);
    if (duration > 5000) {
      void recordFocusEvent(state.category, duration).catch(() => {});
    }
  }
  state.visible = false;
  state.start = null;
  if (remove) {
    focusSessions.delete(tabId);
  }
}

function normalizePageData(data = {}, tab = null) {
  const textSnippet = ((data?.textSnippet ?? data?.text ?? '') + '').slice(0, TEXT_CLAMP);
  const title = data?.title ?? tab?.title ?? '';
  const url = data?.url ?? tab?.url ?? '';
  const description = data?.description ?? '';
  const keywords = Array.isArray(data?.keywords) ? data.keywords : [];

  return {
    tabId: tab?.id ?? data?.tabId,
    windowId: tab?.windowId ?? data?.windowId,
    title,
    url,
    description,
    textSnippet,
    keywords,
    price: data?.price ?? null,
    rating: data?.rating ?? null,
    products: Array.isArray(data?.products) ? data.products : [],
    images: Array.isArray(data?.images) ? data.images : [],
    language: data?.language || navigator.language || 'en',
    timestamp: Number.isFinite(data?.timestamp) ? data.timestamp : Date.now(),
    majorChange: Boolean(data?.majorChange),
    contentVersion: typeof data?.contentVersion === 'number' ? data.contentVersion : undefined,
    textHash: typeof data?.textHash === 'string' ? data.textHash : undefined
  };
}

async function buildPopupPayload(tabId) {
  const analytics = await getCategoryAnalytics();
  const emptyPayload = { analytics, snapshot: null, actions: [], bestDeal: null, productInsights: [] };

  if (!tabId) {
    return emptyPayload;
  }

  const snapshot = await getPageSnapshot(tabId);
  if (!snapshot) {
    return emptyPayload;
  }

  const actions = Array.isArray(snapshot.actions) && snapshot.actions.length
    ? snapshot.actions
    : (getActionPoints(snapshot.category) || []);

  return {
    analytics,
    snapshot,
    actions,
    bestDeal: snapshot.bestDeal ?? null,
    productInsights: snapshot.productInsights || []
  };
}

async function updateBadge(tabId, label) {
  if (!tabId || !label) return;
  try {
    const letter = String(label).charAt(0).toUpperCase();
    await chrome.action.setBadgeText({ tabId, text: letter });
  } catch (err) {
    // ignore on purpose
  }
}

async function initializeMaintenance() {
  if (maintenanceInitialized) return;
  maintenanceInitialized = true;

  try {
    await ensureModelVersion();
  } catch (error) {
    console.error('AI failure ensureModelVersion', error);
  }

  if (hasAlarms) {
    chrome.alarms.create(CLEANUP_ALARM, { periodInMinutes: 60 * 24 });
    console.log('[ActionSense] Cleanup alarm registered');
  }

  await runCleanup();
}

async function ensureModelVersion() {
  try {
    const current = await getCurrentModelVersion();
    if (!current || current === 'unknown') return;
    const stored = await getStoredModelVersion();
    if (stored !== current) {
      await markAllSnapshotsForRefresh();
      await setModelVersion(current);
    }
  } catch (error) {
    console.error('AI failure ensureModelVersion inner', error);
  }
}

async function runCleanup() {
  try {
    await cleanupSnapshots({ maxAgeMs: CLEANUP_MAX_AGE, maxBytes: CLEANUP_MAX_BYTES });
  } catch (error) {
    console.error('Cleanup failure', error);
  }
}
