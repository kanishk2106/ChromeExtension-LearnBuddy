import { categoryLabel, normalizeCategory } from '../utils/categorize.js';
import { getActionPoints } from '../utils/action_points.js';
import { summarizeWithAI, classifyWithAI, generateActionsWithAI, analyzeProductValue, polishProductAdvice, debugAIAvailability, generateOneLiner } from '../utils/ai.js';
import { compareProducts } from '../utils/product_compare.js';

const feedbackEl = document.getElementById('feedback');
const categoryEl = document.getElementById('current-category');
const reasonEl = document.getElementById('category-reason');
const titleEl = document.getElementById('current-title');
const summaryEl = document.getElementById('tab-summary');
const aiStatusEl = document.getElementById('ai-status');
const aiDemoEl = document.getElementById('ai-demo');
const aiRunBtn = document.getElementById('ai-run');
const aiOutputEl = document.getElementById('ai-output');
const actionsList = document.getElementById('actions');
const analyticsList = document.getElementById('analytics-list');
const historySection = document.getElementById('history');
const historyList = document.getElementById('history-list');
const bestDealEl = document.getElementById('best-deal');
const productInsightsEl = document.getElementById('product-insights');
const productAdviceEl = document.getElementById('product-advice');
const actionsSectionEl = document.getElementById('actions-section');
const productsSectionEl = document.getElementById('products-section');
const refreshBtn = document.getElementById('refresh');
const dashboardBtn = document.getElementById('open-dashboard');
const enhanceAllBtn = document.getElementById('enhance-all');
const refreshAiBtn = document.getElementById('refresh-ai');

let currentTabId = null;
let aiInFlight = false;
let skipNextUpdate = false;
let batchInFlight = false;
let latestSnapshot = null;
let baselineAiStatus = null;

const AI_PROXY_URL = 'https://your-proxy.example.com/ai';

const REFRESH_BUTTON_LABEL = 'Page changed — Refresh Chrome AI?';

function applyBaselineAiStatus() {
  if (!aiStatusEl) return;
  if (!baselineAiStatus) {
    aiStatusEl.hidden = true;
    aiStatusEl.textContent = '';
    aiStatusEl.classList.remove('done');
    aiStatusEl.style.removeProperty('color');
    return;
  }
  aiStatusEl.hidden = false;
  aiStatusEl.textContent = baselineAiStatus.message;
  aiStatusEl.classList.remove('done');
  if (baselineAiStatus.color) {
    aiStatusEl.style.color = baselineAiStatus.color;
  } else {
    aiStatusEl.style.removeProperty('color');
  }
}

function updateBaselineAiStatus(message, color) {
  baselineAiStatus = message ? { message, color } : null;
  applyBaselineAiStatus();
}

function toggleAiDemo(shouldShow) {
  if (!aiDemoEl) return;
  aiDemoEl.hidden = !shouldShow;
  if (!shouldShow) {
    resetAiDemoOutput();
  }
}

function setDemoOutput(message) {
  if (!aiOutputEl) return;
  if (!message) {
    aiOutputEl.hidden = true;
    aiOutputEl.textContent = '';
    return;
  }
  aiOutputEl.hidden = false;
  aiOutputEl.textContent = message;
}

function resetAiDemoOutput() {
  if (aiOutputEl) {
    aiOutputEl.hidden = true;
    aiOutputEl.textContent = '';
  }
  if (aiRunBtn) {
    aiRunBtn.disabled = false;
    aiRunBtn.textContent = 'Try Chrome AI now';
  }
}

async function getPromptApiCapabilities() {
  try {
    // Use the correct API: LanguageModel (global)
    if (typeof LanguageModel === 'undefined') return null;
    return await LanguageModel.availability();
  } catch (error) {
    console.error('[ActionSense] LanguageModel availability check failed', error);
    return null;
  }
}

async function detectAIStatus() {
  if (!aiStatusEl) return 'missing-element';
  updateBaselineAiStatus('Checking Chrome AI availability…', '#888');
  toggleAiDemo(false);

  // Run debug logging
  await debugAIAvailability();

  try {
    const availability = await getPromptApiCapabilities();
    // Handle both 'readily' and 'available' (Chrome 143 returns 'available')
    if (availability === 'readily' || availability === 'available') {
      updateBaselineAiStatus('🟢 Chrome AI active — on-device Gemini Nano', 'limegreen');
      toggleAiDemo(Boolean(aiRunBtn));
      return 'prompt-ready';
    }
    if (availability === 'after-download') {
      updateBaselineAiStatus('🟡 Ready to download on first use — click "Try Chrome AI now"', 'goldenrod');
      toggleAiDemo(Boolean(aiRunBtn));
      return 'prompt-after-download';
    }
    if (availability === 'downloading') {
      updateBaselineAiStatus('🟡 Downloading on-device model…', 'goldenrod');
      toggleAiDemo(Boolean(aiRunBtn));
      return 'prompt-downloading';
    }

    if (chrome.ai?.languageModel?.capabilities) {
      const caps = await chrome.ai.languageModel.capabilities();
      if (caps?.available === 'after-download') {
        updateBaselineAiStatus('🟡 Chrome AI (extension API) ready to download — click "Try Chrome AI now"', 'goldenrod');
        toggleAiDemo(Boolean(aiRunBtn));
        return 'chrome.ai-after-download';
      }
      if (caps?.available && caps.available !== 'no') {
        updateBaselineAiStatus('🟢 Chrome AI active — extension API', 'limegreen');
        toggleAiDemo(Boolean(aiRunBtn));
        return 'chrome.ai';
      }
    } else if (chrome.ai?.languageModel) {
      updateBaselineAiStatus('🟢 Chrome AI active — extension API', 'limegreen');
      toggleAiDemo(Boolean(aiRunBtn));
      return 'chrome.ai';
    }

    updateBaselineAiStatus('🟡 Cloud AI fallback ready — built-in model not yet available', '#5a5');
    toggleAiDemo(Boolean(aiRunBtn));
    return 'cloud';
  } catch (error) {
    console.error('[ActionSense] AI availability check failed', error);
    updateBaselineAiStatus('⚠️ AI capability check failed — fallback ready', 'orange');
    toggleAiDemo(Boolean(aiRunBtn));
    return 'error';
  }
}


function setAiStatus(message, { done = false } = {}) {
  if (!aiStatusEl) return;
  if (!message) {
    clearAiStatus();
    return;
  }
  aiStatusEl.hidden = false;
  aiStatusEl.textContent = message;
  aiStatusEl.classList.toggle('done', done);
  aiStatusEl.style.removeProperty('color');
}

function clearAiStatus() {
  if (!aiStatusEl) return;
  if (baselineAiStatus) {
    applyBaselineAiStatus();
    return;
  }
  aiStatusEl.hidden = true;
  aiStatusEl.textContent = '';
  aiStatusEl.classList.remove('done');
  aiStatusEl.style.removeProperty('color');
}

function showAiToast(message, duration = 3600) {
  if (!message) return;
  const toast = document.createElement('div');
  toast.className = 'ai-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 420);
  }, duration);
}

async function runManualAiDemo() {
  if (!aiRunBtn) return;
  const prompt = buildManualPrompt(latestSnapshot);
  resetAiDemoOutput();
  aiRunBtn.disabled = true;
  aiRunBtn.textContent = 'Running…';
  setDemoOutput('Preparing AI request…');
  try {
    const result = await smartAi(prompt);
    const modeLabel = result?.mode ? `✅ AI mode: ${result.mode}` : '✅ AI response ready';
    updateBaselineAiStatus(modeLabel, 'limegreen');
    setDemoOutput((result?.output || '').trim() || 'AI returned no output.');
  } catch (error) {
    console.error('[ActionSense] Manual AI demo failed', error);
    updateBaselineAiStatus('⚠️ AI request failed — using fallback heuristics', 'orange');
    setDemoOutput(`AI request failed: ${error.message || error}`);
  } finally {
    aiRunBtn.disabled = false;
    aiRunBtn.textContent = 'Try Chrome AI now';
    void detectAIStatus();
  }
}

async function createPromptSession({ monitorLabel = 'Downloading…' } = {}) {
  if (typeof LanguageModel === 'undefined') return null;

  return await LanguageModel.create({
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
    monitor(monitor) {
      monitor?.addEventListener?.('downloadprogress', (event) => {
        const progress = typeof event?.progress === 'number'
          ? event.progress
          : (typeof event?.loaded === 'number' ? event.loaded : 0);
        const pct = Math.round(Math.min(Math.max(progress, 0), 1) * 100);
        setDemoOutput(`${monitorLabel} ${pct}%`);
        updateBaselineAiStatus(`${monitorLabel} ${pct}%`, 'goldenrod');
      });
    }
  });
}

async function tryPromptApi(promptText) {
  if (typeof LanguageModel === 'undefined') return null;
  const availability = await LanguageModel.availability();
  // Accept both 'readily' and 'available'
  if (availability !== 'readily' && availability !== 'available' && availability !== 'after-download') return null;
  updateBaselineAiStatus(
    (availability === 'readily' || availability === 'available')
      ? '🟢 Chrome AI active — on-device Gemini Nano'
      : '🟡 Ready to download on first use — click "Try Chrome AI now"',
    (availability === 'readily' || availability === 'available') ? 'limegreen' : 'goldenrod'
  );
  const session = await createPromptSession({ monitorLabel: '🟡 Downloading on-device model…' });
  if (!session) return null;
  const response = await session.prompt(promptText);
  session.destroy?.();
  return { mode: 'on-device', output: response || '' };
}

async function tryChromeAiExtension(promptText) {
  // This is now the same as tryPromptApi - LanguageModel is the correct API
  return null;
}

async function callCloudFallback(promptText) {
  try {
    const response = await fetch(AI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: promptText })
    });
    if (!response.ok) {
      throw new Error(`Cloud proxy responded with ${response.status}`);
    }
    const data = await response.json();
    return { mode: 'cloud', output: data?.output || '' };
  } catch (error) {
    console.error('[ActionSense] Cloud fallback failed', error);
    throw error;
  }
}

async function smartAi(promptText) {
  try {
    const onDevice = await tryPromptApi(promptText);
    if (onDevice) return onDevice;
  } catch (error) {
    console.warn('[ActionSense] Prompt API path failed', error);
  }

  // If on-device AI fails, throw an error instead of calling fake cloud fallback
  throw new Error('Chrome AI not available. Please enable Chrome flags and restart browser.');
}

function buildManualPrompt(snapshot) {
  const safe = snapshot || {};
  const lines = [];
  if (safe.title) lines.push(`Title: ${safe.title}`);
  if (safe.description) lines.push(`Description: ${safe.description}`);
  if (Array.isArray(safe.keywords) && safe.keywords.length) {
    lines.push(`Keywords: ${safe.keywords.slice(0, 8).join(', ')}`);
  }
  const snippet = typeof safe.textSnippet === 'string' ? safe.textSnippet.slice(0, 2000) : '';
  if (snippet) {
    lines.push(`CONTENT SNIPPET:
${snippet}`);
  }
  lines.push('Summarize the page in two short bullet points and suggest one next action.');
  return lines.filter(Boolean).join('');
}

function reflectSnapshotStatus(snapshot) {
  if (!snapshot) {
    clearAiStatus();
    updateRefreshButton(null);
    return;
  }
  if (snapshot.needsAiRefresh) {
    setAiStatus('⚠️ Page changed — Chrome AI summary may be outdated.');
  } else if (snapshot.categorySource === 'ai') {
    setAiStatus('✨ Enhanced with Chrome AI', { done: true });
  } else if (!aiInFlight) {
    clearAiStatus();
  }
  updateRefreshButton(snapshot);
}

function setupCollapsibles() {
  document.querySelectorAll('.section-toggle').forEach((button) => {
    const targetId = button.dataset.target;
    const section = document.getElementById(targetId);
    if (!section) return;
    section.classList.remove('expanded');
    section.style.maxHeight = '0px';
    button.setAttribute('aria-expanded', 'false');
    section.setAttribute('aria-hidden', 'true');
    button.addEventListener('click', () => toggleSection(button, section));
  });
}

function toggleSection(button, section) {
  const expanded = button.getAttribute('aria-expanded') === 'true';
  const next = !expanded;
  button.setAttribute('aria-expanded', String(next));
  section.setAttribute('aria-hidden', String(!next));
  if (next) {
    section.classList.add('expanded');
    section.style.maxHeight = `${section.scrollHeight}px`;
  } else {
    section.classList.remove('expanded');
    section.style.maxHeight = '0px';
  }
}

function refreshCollapsible(section) {
  if (!section) return;
  if (section.classList.contains('expanded')) {
    section.style.maxHeight = `${section.scrollHeight}px`;
  }
}

function needsAiEnrichment(snapshot) {
  if (!snapshot) return false;
  if (snapshot.needsAiRefresh) return true;
  const textLen = snapshot.textSnippet?.length || snapshot.description?.length || 0;
  if (textLen < 120) return false;
  const needsSummary = !snapshot.aiSummary && textLen > 180;
  const needsCategory = snapshot.categorySource !== 'ai';
  const needsActions = !Array.isArray(snapshot.aiActions) || snapshot.aiActions.length === 0;
  return needsSummary || needsCategory || needsActions;
}

function updateRefreshButton(snapshot) {
  if (!refreshAiBtn) return;
  const shouldShow = Boolean(snapshot?.needsAiRefresh);
  if (!shouldShow) {
    refreshAiBtn.hidden = true;
    refreshAiBtn.disabled = false;
    refreshAiBtn.textContent = REFRESH_BUTTON_LABEL;
    return;
  }
  refreshAiBtn.hidden = false;
  refreshAiBtn.disabled = aiInFlight || batchInFlight;
  refreshAiBtn.textContent = refreshAiBtn.disabled ? 'Refreshing…' : REFRESH_BUTTON_LABEL;
}

function announceAiComplete(message = 'Chrome AI finished analyzing this page.') {
  if (!chrome.tts?.speak) return;
  try {
    chrome.tts.stop?.();
    chrome.tts.speak(message, { enqueue: false, rate: 1.0 });
  } catch (err) {
    console.warn('tts error', err);
  }
}

function isRestrictedUrl(url = '') {
  return url.startsWith('chrome://') ||
         url.startsWith('edge://') ||
         url.startsWith('about:') ||
         url.startsWith('view-source:') ||
         url.startsWith('https://chrome.google.com/');
}

document.addEventListener('DOMContentLoaded', async () => {
  void detectAIStatus();
  aiRunBtn?.addEventListener('click', async () => {
    if (currentTabId && latestSnapshot) {
      await maybeEnhanceWithAI(currentTabId, latestSnapshot, { force: true });
    }
  });
  refreshBtn.addEventListener('click', refreshPageInfo);
  dashboardBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
  enhanceAllBtn?.addEventListener('click', () => {
    if (!batchInFlight && !aiInFlight) {
      void enhanceRecentTabs();
    }
  });
  refreshAiBtn?.addEventListener('click', async () => {
    if (!currentTabId || !latestSnapshot || aiInFlight || batchInFlight) return;
    refreshAiBtn.disabled = true;
    refreshAiBtn.textContent = 'Refreshing…';
    try {
      await maybeEnhanceWithAI(currentTabId, latestSnapshot, { force: true, reason: 'manual-refresh' });
    } finally {
      updateRefreshButton(latestSnapshot);
    }
  });

  const tab = await getActiveTab();
  if (!tab) {
    showFeedback('No active tab detected.');
    return;
  }
  currentTabId = tab.id;
  await loadDataForTab(currentTabId);

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'PAGE_INFO_UPDATED' && message.tabId === currentTabId) {
      if (skipNextUpdate) {
        skipNextUpdate = false;
        return;
      }
      loadDataForTab(currentTabId);
    }
  });
});

async function refreshPageInfo() {
  if (!currentTabId) return;
  showFeedback('Refreshing…');
  try {
    await chrome.tabs.sendMessage(currentTabId, { type: 'REQUEST_PAGE_INFO' });
  } catch (err) {
    showFeedback('Unable to refresh this page (restricted).');
  }
}

async function loadDataForTab(tabId) {
  showFeedback('Loading…');
  try {
    const payload = await chrome.runtime.sendMessage({ type: 'GET_POPUP_DATA', tabId });
    if (!payload?.snapshot) {
      latestSnapshot = null;
      showFeedback('Gathering page context…');
      updateRefreshButton(null);
      await chrome.tabs.sendMessage(tabId, { type: 'REQUEST_PAGE_INFO' }).catch(() => {});
      return;
    }
    latestSnapshot = payload.snapshot;
    renderSnapshot(payload.snapshot);
    const actionsToRender = Array.isArray(payload.snapshot?.aiActions) && payload.snapshot.aiActions.length
      ? payload.snapshot.aiActions
      : (payload.actions || []);
    renderActions(actionsToRender);
    renderAnalytics(payload.analytics || {});
    renderProductInsights(payload);
    renderProductAdvice(payload.snapshot?.productAdvice || null);
    await renderHistory();
    reflectSnapshotStatus(payload.snapshot);
    const shouldAutoEnhance = !payload.snapshot.needsAiRefresh && needsAiEnrichment(payload.snapshot);
    if (shouldAutoEnhance) {
      const aiRan = await maybeEnhanceWithAI(tabId, payload.snapshot);
      if (!aiRan) hideFeedback();
    } else {
      hideFeedback();
    }
    await maybeAdviseProducts(tabId, payload.snapshot, { force: payload.snapshot.needsAiRefresh });
  } catch (err) {
    showFeedback(`Error: ${err.message || err}`);
  }
}

async function renderHistory() {
  const data = await chrome.runtime.sendMessage({ type: 'GET_DASHBOARD_DATA' }).catch(() => null);
  const history = data?.history || [];
  if (!history.length) {
    historySection.hidden = true;
    return;
  }
  historySection.hidden = false;
  historyList.innerHTML = '';
  for (const entry of history.slice(0, 5)) {
    const li = document.createElement('li');
    const date = new Date(entry.timestamp).toLocaleTimeString();
    li.textContent = `${entry.action} — ${date}`;
    historyList.appendChild(li);
  }
}

function renderSnapshot(snapshot) {
  latestSnapshot = snapshot;
  const label = snapshot.categoryLabel || categoryLabel(snapshot.category);
  categoryEl.textContent = `Category: ${label}`;
  const reason = snapshot.aiReason || snapshot.heuristicReason || null;
  if (reason && reason.trim()) {
    reasonEl.hidden = false;
    reasonEl.textContent = `Why: ${reason.trim()}`;
  } else {
    reasonEl.hidden = true;
    reasonEl.textContent = '';
  }
  titleEl.textContent = snapshot.title || '(untitled)';
  const summary = snapshot.aiSummary || snapshot.summary || '';
  if (summary && summary.trim()) {
    summaryEl.hidden = false;
    summaryEl.textContent = summary.trim();
  } else {
    summaryEl.hidden = true;
    summaryEl.textContent = '';
  }
}

function renderActions(actions) {
  const items = actions.length ? actions : getActionPoints('other');
  actionsList.innerHTML = '';
  for (const action of items) {
    const li = document.createElement('li');
    li.textContent = action;
    actionsList.appendChild(li);
  }
  refreshCollapsible(actionsSectionEl);
}

function renderAnalytics(analytics) {
  analyticsList.innerHTML = '';
  const entries = Object.entries(analytics);
  if (!entries.length) {
    const li = document.createElement('li');
    li.dataset.empty = 'true';
    analyticsList.appendChild(li);
    return;
  }
  const total = entries.reduce((sum, [, value]) => sum + value, 0) || 1;
  for (const [category, value] of entries) {
    const li = document.createElement('li');
    const label = categoryLabel(category);
    const pct = Math.round((value / total) * 100);
    li.textContent = `${label}: ${value} (${pct}% of visits)`;
    analyticsList.appendChild(li);
  }
}

function renderProductInsights(payload) {
  const bestDeal = payload.bestDeal ?? payload.snapshot?.bestDeal;
  const insights = payload.productInsights || payload.snapshot?.productInsights || [];
  if (bestDeal) {
    bestDealEl.hidden = false;
    bestDealEl.textContent = bestDeal;
  } else {
    bestDealEl.hidden = true;
  }

  if (insights.length) {
    productInsightsEl.hidden = false;
    productInsightsEl.innerHTML = '';
    for (const insight of insights.slice(0, 3)) {
      const li = document.createElement('li');
      const price = Number.isFinite(insight.bestPrice) ? insight.bestPrice.toFixed(2) : insight.bestPrice;
      li.textContent = `${insight.title} → ${insight.bestSite} • ${insight.currency}${price}`;
      productInsightsEl.appendChild(li);
    }
  } else {
    productInsightsEl.hidden = true;
  }
  refreshCollapsible(productsSectionEl);
}

function renderProductAdvice(advice) {
  if (!productAdviceEl) return;
  if (!advice || !advice.reason) {
    productAdviceEl.hidden = true;
    productAdviceEl.textContent = '';
    refreshCollapsible(productsSectionEl);
    return;
  }
  const title = advice.bestTitle ? `⭐ ${advice.bestTitle}: ` : '⭐ Recommendation: ';
  let text = `${title}${advice.reason}`;
  const generatedAt = advice.generatedAt || 0;
  if (generatedAt && Date.now() - generatedAt > 86_400_000) {
    text += ' ⏰ Check if still available.';
  }
  productAdviceEl.hidden = false;
  productAdviceEl.textContent = text;
  refreshCollapsible(productsSectionEl);
}

function showFeedback(message) {
  feedbackEl.hidden = false;
  feedbackEl.textContent = message;
}

function hideFeedback() {
  feedbackEl.hidden = true;
  feedbackEl.textContent = '';
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function maybeAdviseProducts(tabId, snapshot, { force = false } = {}) {
  if (!tabId || !snapshot) return;
  const products = snapshot.products || [];
  if (!products.length) {
    renderProductAdvice(null);
    return;
  }
  const adviceFresh = snapshot.productAdviceAt && Date.now() - snapshot.productAdviceAt < 20000;
  if (!force && adviceFresh) {
    renderProductAdvice(snapshot.productAdvice);
    return;
  }
  if (!force && snapshot.productAdvice && snapshot.productAdvice.reason) {
    renderProductAdvice(snapshot.productAdvice);
    return;
  }
  if (typeof LanguageModel === 'undefined') return;

  try {
    const insights = (snapshot.productInsights && snapshot.productInsights.length)
      ? snapshot.productInsights
      : compareProducts(products);
    const bestInsight = insights[0];
    const topCandidates = bestInsight?.scoredItems?.slice(0, 3) || [];
    if (!topCandidates.length) {
      renderProductAdvice(null);
      return;
    }

    setAiStatus('🤖 Evaluating best product value…');
    const context = {
      savings: bestInsight?.comparison || '',
      bestPrice: bestInsight?.bestPrice,
      currency: bestInsight?.currency
    };
    const adviceRaw = await analyzeProductValue(topCandidates, context, { tabId });
    const leading = topCandidates[0];
    const fallbackReason = leading ? `Great value with ${leading.rating || 'solid'} rating and ${context.currency || '$'}${Number.isFinite(leading.priceValue) ? leading.priceValue.toFixed(0) : ''} price point.` : '';
    const advice = polishProductAdvice(adviceRaw, {
      defaultTitle: bestInsight?.title,
      savings: context.savings,
      fallbackReason
    });
    if (!advice) {
      renderProductAdvice(null);
      return;
    }
    const storedAdvice = {
      ...advice,
      generatedAt: Date.now(),
      context
    };
    renderProductAdvice(storedAdvice);
    skipNextUpdate = true;
    const response = await chrome.runtime.sendMessage({
      type: 'APPLY_AI_ENRICHMENT',
      tabId,
      ai: {
        productAdvice: storedAdvice
      }
    }).catch(() => null);
    if (response?.snapshot) {
      latestSnapshot = response.snapshot;
      renderProductAdvice(response.snapshot.productAdvice);
    }
  } catch (err) {
    console.error('maybeAdviseProducts error', err);
    if (err?.message === 'AI_BATTERY_LOW') {
      setAiStatus('🔋 Battery save mode — product advisor paused.', { done: true });
    }
  } finally {
    skipNextUpdate = false;
  }
}

async function enhanceRecentTabs() {
  if (batchInFlight || aiInFlight) return;
  batchInFlight = true;
  const originalLabel = enhanceAllBtn?.textContent;
  if (enhanceAllBtn) {
    enhanceAllBtn.disabled = true;
    enhanceAllBtn.textContent = 'Gathering…';
  }
  const previousAiState = aiInFlight;
  aiInFlight = true;
  try {
    setAiStatus('🤖 Gathering recent tabs to enhance…');
    updateRefreshButton(latestSnapshot);
    const [dashboardData, openTabs] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_DASHBOARD_DATA' }).catch(() => null),
      chrome.tabs.query({})
    ]);

    const openTabIds = new Set(
      openTabs
        .filter(tab => tab.id != null && !tab.pinned && !isRestrictedUrl(tab.url || ''))
        .map(tab => tab.id)
    );

    const pages = (dashboardData?.pages || []).filter(page => openTabIds.has(page.tabId));
    const candidates = pages
      .filter(needsAiEnrichment)
      .sort((a, b) => (b.updatedAt || b.timestamp || 0) - (a.updatedAt || a.timestamp || 0))
      .slice(0, 20);

    if (!candidates.length) {
      setAiStatus('No recent tabs need Chrome AI enhancement.', { done: true });
      showAiToast('All recent tabs already have Chrome AI insights.');
      hideFeedback();
      return;
    }

    let enhancedCount = 0;
    let latestAnalytics = null;

    for (let i = 0; i < candidates.length; i += 1) {
      const target = candidates[i];
      const tabId = target.tabId;
      if (!tabId) continue;

      setAiStatus(`🤖 Enhancing tab ${i + 1} of ${candidates.length}…`);
      if (enhanceAllBtn) enhanceAllBtn.textContent = `Enhancing ${i + 1}/${candidates.length}`;

      let snapshot;
      try {
        const payload = await chrome.runtime.sendMessage({ type: 'GET_POPUP_DATA', tabId });
        snapshot = payload?.snapshot || target;
      } catch {
        snapshot = target;
      }

      if (!needsAiEnrichment(snapshot)) continue;
      const textSource = snapshot.textSnippet || snapshot.description || '';
      if (!textSource || !textSource.trim()) continue;
      const lastAiAt = snapshot.lastAiAt || 0;
      if (!snapshot.needsAiRefresh && Date.now() - lastAiAt < 20000) {
        continue;
      }

      const summaryNeeded = !snapshot.aiSummary && (snapshot.textSnippet?.length || 0) > 180;
      const categoryNeeded = snapshot.categorySource !== 'ai';
      const actionsNeeded = !Array.isArray(snapshot.aiActions) || snapshot.aiActions.length === 0;

      let summary = snapshot.aiSummary || snapshot.summary || '';
      if (summaryNeeded) {
        summary = await summarizeWithAI(textSource, {
          onStatus: (msg) => setAiStatus(msg),
          title: snapshot.title,
          description: snapshot.description,
          keywords: snapshot.keywords,
          products: snapshot.products,
          language: snapshot.language || navigator.language || 'en',
          tabId
        });
        setAiStatus(`🤖 Enhancing tab ${i + 1} of ${candidates.length}…`);
      }
      if (!summary || !summary.trim()) {
        summary = snapshot.summary || textSource.slice(0, 400);
      }

      let classification = null;
      if (categoryNeeded) {
        classification = await classifyWithAI({
          text: textSource,
          title: snapshot.title,
          url: snapshot.url,
          onStatus: (msg) => setAiStatus(msg),
          tabId
        });
        setAiStatus(`🤖 Enhancing tab ${i + 1} of ${candidates.length}…`);
      }

      const finalCategory = normalizeCategory(
        (typeof classification === 'object' ? classification.category : classification) || snapshot.category || 'other'
      );
      const reason = typeof classification === 'object' ? classification.reason : null;

      const fallbackActions = getActionPoints(finalCategory || 'other');
      let actions = Array.isArray(snapshot.aiActions) && snapshot.aiActions.length ? snapshot.aiActions : fallbackActions;
      if (actionsNeeded) {
        const generated = await generateActionsWithAI({
          category: finalCategory,
          summary,
          url: snapshot.url,
          fallback: fallbackActions,
          tabId
        });
        if (generated && generated.length) actions = generated;
      }
      if (!actions || !actions.length) actions = fallbackActions;

      if (tabId === currentTabId) skipNextUpdate = true;
      const response = await chrome.runtime.sendMessage({
        type: 'APPLY_AI_ENRICHMENT',
        tabId,
        ai: {
          category: finalCategory,
          summary,
          actions,
          reason: reason || undefined
        }
      }).catch(() => null);

      if (tabId === currentTabId && !response?.snapshot) {
        skipNextUpdate = false;
      }

      if (response?.ok === false) continue;
      enhancedCount += 1;
      latestAnalytics = response?.analytics || latestAnalytics;

      chrome.runtime.sendMessage({ type: 'FLASH_BADGE', tabId, category: finalCategory }).catch(() => {});

      if (tabId === currentTabId && response?.snapshot) {
        renderSnapshot(response.snapshot);
        renderActions(response.snapshot.aiActions || response.snapshot.actions || []);
        renderAnalytics(response.analytics || {});
        renderProductInsights({ snapshot: response.snapshot });
        reflectSnapshotStatus(response.snapshot);
        skipNextUpdate = false;
      }
    }

    if (enhancedCount) {
      setAiStatus(`✨ Chrome AI enhanced ${enhancedCount} recent tab${enhancedCount === 1 ? '' : 's'}`, { done: true });
      showAiToast(`✨ Chrome AI enhanced ${enhancedCount} recent tab${enhancedCount === 1 ? '' : 's'}`);
      announceAiComplete(`Chrome AI enhanced ${enhancedCount} recent tab${enhancedCount === 1 ? '' : 's'}.`);
      if (latestAnalytics && currentTabId != null) {
        renderAnalytics(latestAnalytics);
      }
    } else {
      setAiStatus('No recent tabs needed Chrome AI updates.', { done: true });
      showAiToast('All recent tabs already have Chrome AI insights.');
    }
    hideFeedback();
  } catch (err) {
    console.error('enhanceRecentTabs error', err);
    setAiStatus('Chrome AI batch enhancement failed.', { done: true });
    showFeedback(`Batch AI error: ${err.message || err}`);
  } finally {
    batchInFlight = false;
    aiInFlight = previousAiState;
    if (enhanceAllBtn) {
      enhanceAllBtn.disabled = false;
      enhanceAllBtn.textContent = originalLabel || 'Enhance Last 20';
    }
    updateRefreshButton(latestSnapshot);
  }
}

async function maybeEnhanceWithAI(tabId, snapshot, options = {}) {
  const { force = false } = options;
  if (!tabId || !snapshot) return false;
  const hasAI = typeof LanguageModel !== 'undefined' || typeof Summarizer !== 'undefined';
  const baseNeedsSummary = !snapshot.aiSummary && (snapshot.textSnippet?.length || 0) > 180;
  const baseNeedsCategory = snapshot.categorySource !== 'ai';
  const baseNeedsActions = !Array.isArray(snapshot.aiActions) || snapshot.aiActions.length === 0;
  const summaryNeeded = force || baseNeedsSummary;
  const categoryNeeded = force || baseNeedsCategory;
  const actionsNeeded = force || baseNeedsActions;

  const now = Date.now();
  const lastAiAt = snapshot.lastAiAt || 0;
  if (!force && now - lastAiAt < 20000) {
    reflectSnapshotStatus(snapshot);
    return false;
  }
  if (!force && !(baseNeedsSummary || baseNeedsCategory || baseNeedsActions)) {
    reflectSnapshotStatus(snapshot);
    return false;
  }
  if (!hasAI) {
    setAiStatus('Chrome AI unavailable — using heuristic suggestions.', { done: true });
    showFeedback('Chrome AI model unavailable — using heuristic suggestions.');
    return false;
  }
  if (aiInFlight) return true;

  aiInFlight = true;
  try {
    showFeedback('Analyzing with Chrome AI…');
    setAiStatus(force ? '🤖 Refreshing Chrome AI summary…' : '🤖 Analyzing with Chrome AI…');
    if (refreshAiBtn) {
      refreshAiBtn.disabled = true;
      updateRefreshButton(snapshot);
    }

    const textSource = snapshot.textSnippet || snapshot.description || '';
    if (!textSource || !textSource.trim()) {
      setAiStatus('Not enough visible text to analyze.', { done: true });
      return false;
    }

    let summary = summaryNeeded
      ? await summarizeWithAI(textSource, {
          onStatus: (msg) => setAiStatus(msg),
          title: snapshot.title,
          description: snapshot.description,
          keywords: snapshot.keywords,
          products: snapshot.products,
          language: snapshot.language || navigator.language || 'en',
          tabId
        })
      : (snapshot.aiSummary || snapshot.summary || '');
    if (!summary || !summary.trim()) {
      summary = snapshot.summary || textSource.slice(0, 320);
    }

    const classification = categoryNeeded
      ? await classifyWithAI({
          text: textSource,
          title: snapshot.title,
          url: snapshot.url,
          onStatus: (msg) => setAiStatus(msg),
          tabId
        })
      : null;

    const finalCategory = normalizeCategory(
      (typeof classification === 'object' ? classification?.category : classification) || snapshot.category || 'other'
    );
    const reason = classification?.reason || null;

    const fallbackActions = getActionPoints(finalCategory || 'other');
    let actions = actionsNeeded
      ? await generateActionsWithAI({
          category: finalCategory,
          summary,
          url: snapshot.url,
          fallback: fallbackActions,
          tabId
        })
      : snapshot.aiActions;
    if (!actions || !actions.length) {
      actions = fallbackActions;
    }

    // Generate one-liner for productivity tracking
    let oneLiner = snapshot.oneLiner || null;
    if (force || !oneLiner) {
      oneLiner = await generateOneLiner({
        title: snapshot.title,
        text: textSource,
        category: finalCategory,
        tabId
      });
    }

    skipNextUpdate = true;
    const response = await chrome.runtime.sendMessage({
      type: 'APPLY_AI_ENRICHMENT',
      tabId,
      ai: {
        category: finalCategory,
        summary,
        actions,
        reason: reason || undefined,
        oneLiner: oneLiner || undefined
      }
    });

    if (response?.ok === false) {
      skipNextUpdate = false;
      showFeedback('AI enrichment unavailable right now.');
      setAiStatus('Chrome AI could not analyze this page.', { done: true });
      return true;
    }

    if (response?.snapshot) {
      renderSnapshot(response.snapshot);
      renderActions(response.snapshot.aiActions || response.snapshot.actions || []);
      renderAnalytics(response.analytics || {});
      renderProductInsights({ snapshot: response.snapshot });
      reflectSnapshotStatus(response.snapshot);
      setAiStatus('✨ Enhanced with Chrome AI', { done: true });
      showAiToast(`✨ Chrome AI analyzed this page — ${categoryLabel(response.snapshot.category)} insights ready`);
      chrome.runtime.sendMessage({
        type: 'FLASH_BADGE',
        tabId,
        category: response.snapshot.category
      }).catch(() => {});
      announceAiComplete('Chrome AI finished analyzing this page.');
      hideFeedback();
      await maybeAdviseProducts(tabId, response.snapshot, { force: true });
    }
    return true;
  } catch (err) {
    console.error('maybeEnhanceWithAI error', err);
    if (err?.message === 'AI_BATTERY_LOW') {
      setAiStatus('🔋 Battery save mode — using cached summary.', { done: true });
      showFeedback('Battery saver active — using cached insights.');
    } else {
      showFeedback(`AI error: ${err.message || err}`);
      setAiStatus('Chrome AI ran into an error. Using heuristics for now.', { done: true });
    }
    skipNextUpdate = false;
    return true;
  } finally {
    if (!aiInFlight) {
      skipNextUpdate = false;
    }
    aiInFlight = false;
    updateRefreshButton(latestSnapshot);
  }
}
