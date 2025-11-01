import { categoryLabel, normalizeCategory } from '../utils/categorize.js';
import { initLiveWallpaper } from '../utils/wallpaper.js';
import { generateFocusCoachSummary, generateStudySummary } from '../utils/ai.js';
import { cacheStreakValue } from '../utils/storage.js';

const PRODUCTIVE = new Set(['learning', 'productivity', 'research', 'finance']);
const DISTRACTION = new Set(['entertainment', 'shopping', 'social']);

let cachedAnalytics = {};
let cachedFocusStats = {};
let cachedBrowsingHistory = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize live wallpaper (UI only)
  initLiveWallpaper({
    nodes: 90,                  // more points on screen
    maxDist: 150,
    speed: 0.65,               // significantly faster motion
    dotColor: 'rgba(255, 110, 24, 0.8)',   // fire/ember color for points
    lineColor: 'rgba(255, 110, 24, 0.25)', // warm connective glow
    gridColor: 'rgba(255, 160, 64, 0.06)'  // subtle warm grid
  });
  const data = await chrome.runtime.sendMessage({ type: 'GET_DASHBOARD_DATA' }).catch(() => null);
  if (!data) return;
  cachedAnalytics = data.analytics || {};
  cachedFocusStats = data.focusStats || {};
  cachedBrowsingHistory = data.browsingHistory || [];
  renderCategories(cachedAnalytics);
  renderFocusCoach(cachedAnalytics, cachedFocusStats);
  renderHistory(data.history || []);
  renderPages(data.pages || []);

  // Add button click handler for AI coach summary
  const coachBtn = document.getElementById('coach-ai-btn');
  if (coachBtn) {
    coachBtn.addEventListener('click', async () => {
      await generateAICoachSummary();
    });
  }
});

function renderCategories(analytics) {
  const tbody = document.querySelector('#category-table tbody');
  if (!tbody) return; // Category table removed from dashboard
  tbody.innerHTML = '';
  const entries = Object.entries(analytics);
  if (!entries.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 3;
    cell.textContent = 'No activity yet.';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }
  const totals = { productive: 0, distraction: 0 };
  for (const [category, value] of entries) {
    const normalized = normalizeCategory(category);
    if (PRODUCTIVE.has(normalized)) totals.productive += value;
    if (DISTRACTION.has(normalized)) totals.distraction += value;

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${categoryLabel(category)}</td>
      <td>${value}</td>
      <td><span class="pill">${focusBadge(normalized)}</span></td>
    `;
    tbody.appendChild(row);
  }
  const focus = totals.productive + totals.distraction === 0
    ? 'N/A'
    : Math.round((totals.productive / (totals.productive + totals.distraction)) * 100) + '%';
  const summaryRow = document.createElement('tr');
  summaryRow.innerHTML = `
    <td><strong>Focus Score</strong></td>
    <td colspan="2"><strong>${focus}</strong></td>
  `;
  tbody.appendChild(summaryRow);
}

function focusBadge(category) {
  if (PRODUCTIVE.has(category)) return 'Productive';
  if (DISTRACTION.has(category)) return 'Distraction';
  return 'Neutral';
}

function renderHistory(history) {
  const list = document.getElementById('history');
  if (!list) return; // Gracefully handle pages lacking a history section
  list.innerHTML = '';
  if (!history.length) {
    const li = document.createElement('li');
    li.textContent = 'No highlights yet.';
    list.appendChild(li);
    return;
  }
  for (const entry of history.slice(0, 10)) {
    const li = document.createElement('li');
    const date = new Date(entry.timestamp).toLocaleString();
    li.textContent = `${entry.action} — ${date}`;
    list.appendChild(li);
  }
}

function renderPages(pages) {
  const list = document.getElementById('pages');
  if (!list) return; // Gracefully handle pages lacking a pages section
  list.innerHTML = '';
  if (!pages.length) {
    const li = document.createElement('li');
    li.textContent = 'No captured pages yet.';
    list.appendChild(li);
    return;
  }
  for (const page of pages.slice(0, 10)) {
    const li = document.createElement('li');
    const label = categoryLabel(page.category);
    li.textContent = `${label}: ${page.title || page.url}`;
    list.appendChild(li);
  }
}

async function renderFocusCoach(analytics, focusStats) {
  const summaryEl = document.getElementById('focus-summary');
  if (!summaryEl) return;

  const barEl = document.getElementById('focus-bar');
  const breakdownEl = document.getElementById('focus-breakdown');
  const trendEl = document.getElementById('focus-trend');
  const streakEl = document.getElementById('focus-streak');

  const focusPct = focusStats.focusPct ?? 0;
  const distractionPct = Math.max(0, 100 - focusPct);
  if (barEl) {
    barEl.style.width = `${Math.min(100, Math.max(0, focusPct))}%`;
  }
  if (breakdownEl) {
    breakdownEl.textContent = `🧠 Focus ${focusPct}% | 🎮 Distraction ${distractionPct}%`;
  }
  if (trendEl) {
    const delta = focusStats.trendDelta ?? 0;
    const arrow = delta > 0 ? '🚀' : delta < 0 ? '🪂' : '➡️';
    trendEl.textContent = `${arrow} Week-over-week change: ${delta > 0 ? '+' : ''}${delta}%`;
  }
  if (streakEl) {
    const streakDays = focusStats.streak?.days || 0;
    streakEl.textContent = streakDays > 0
      ? `🔥 ${streakDays}-day focus streak — keep it up!`
      : 'Let’s start a fresh focus streak today!';
  }

  if (focusStats.streak?.days > (focusStats.lastStreakCached || 0)) {
    chrome.tts?.speak?.('Great job! Your focus streak just increased.');
    cacheStreakValue(focusStats.streak.days).catch(() => {});
    animatePulse(barEl?.parentElement);
  }

  // AI summary is now triggered by button click, not automatic
}

function enforceFormat(text) {
  if (!text) return text;
  // Remove leading "Here are X factual statements…" lines
  let cleaned = text.replace(/^Here are.*?:\s*/i, '').trim();
  // Remove numbered list formatting if present (1. 2. 3.)
  cleaned = cleaned.replace(/^\d+\.\s*\*\*?/gm, '• ');
  // Remove bold markers
  cleaned = cleaned.replace(/\*\*/g, '');

  // Add line breaks before each * and convert * to •
  cleaned = cleaned.replace(/\s*\*\s*/g, '\n• ');  // New line + convert * to •

  // Add line breaks before Pros:/Cons:
  cleaned = cleaned.replace(/\s+(Pros:|Cons:)/g, '\n$1');

  // Add line break before "Cheaper item:"
  cleaned = cleaned.replace(/\s+(Cheaper item:)/g, '\n$1');

  // If it still doesn't start with a heading like "Shopping – ..."
  if (!/^[A-Za-z][A-Za-z ]+ ?– /.test(cleaned)) {
    // Try to extract just the content without preface
    cleaned = cleaned.replace(/^.*?(\w+ ?– )/s, '$1').trim();
  }

  // Ensure "Cheaper item:" line (if present) is always the last line
  try {
    const lines = cleaned.split(/\n+/);
    if (lines.length > 1) {
      const header = lines[0];
      const body = lines.slice(1);
      const cheaper = [];
      const rest = [];
      for (const ln of body) {
        const t = ln.trim();
        if (/^•?\s*Cheaper item:/i.test(t)) cheaper.push(ln);
        else rest.push(ln);
      }
      if (cheaper.length) {
        cleaned = [header, ...rest, ...cheaper].filter(Boolean).join('\n');
      }
    }
  } catch (_) {
    // no-op if formatting fails
  }

  return cleaned;
}

async function generateAICoachSummary() {
  const summaryEl = document.getElementById('focus-summary');
  const coachBtn = document.getElementById('coach-ai-btn');

  if (!summaryEl || !coachBtn) return;

  try {
    coachBtn.disabled = true;
    coachBtn.textContent = '🤖 Generating AI summary...';
    summaryEl.textContent = 'Analyzing your focus patterns with Chrome AI...';

    // Pass browsing history with one-liners to AI for context-aware coaching
    const context = {
      focusStats: cachedFocusStats,
      browsingHistory: cachedBrowsingHistory
    };

    // If analytics indicate Learning, switch to strict study mode; otherwise keep coach
    const studyCats = new Set(['learning', 'study', 'education']);
    const hasStudy = Object.keys(cachedAnalytics || {}).some(cat => studyCats.has(normalizeCategory(cat)));
    const summary = hasStudy
      ? (await generateStudySummary(context))
      : (await generateFocusCoachSummary(cachedAnalytics, context));

    if (summary) {
      summaryEl.textContent = enforceFormat(summary);
      coachBtn.textContent = '✨ Refresh AI Summary';
    } else {
      throw new Error('AI returned empty response');
    }
  } catch (err) {
    console.error('Focus coach AI error:', err);

    // Show clear error message with actionable steps
    let errorMsg = '❌ AI Error: ';

    if (err?.message?.includes('not available')) {
      errorMsg += 'Chrome AI is not available. Enable it at chrome://flags/#prompt-api-for-gemini-nano';
    } else if (err?.message?.includes('downloading')) {
      errorMsg += 'AI model is downloading. Check progress at chrome://components (Optimization Guide). Try again in 5 minutes.';
    } else if (err?.message?.includes('Session creation timeout')) {
      errorMsg += 'AI is initializing. Wait 30 seconds and try again. This is normal on first use.';
    } else if (err?.message?.includes('response timeout')) {
      errorMsg += 'AI is too busy. Close some tabs and try again.';
    } else if (err?.message?.includes('AI_TIMEOUT')) {
      errorMsg += 'AI timed out. This may be your first use (slow). Try again - should be faster.';
    } else if (err?.message?.includes('User activation required')) {
      errorMsg += 'Click the button again (Chrome security requires user interaction).';
    } else if (err?.message?.includes('AI_BATTERY_LOW')) {
      errorMsg += 'Battery is low. Plug in your device or charge above 25%.';
    } else {
      errorMsg += err.message || 'Unknown error. Check console for details.';
    }

    summaryEl.textContent = errorMsg;
    summaryEl.style.color = '#ff6b6b';
    summaryEl.style.fontSize = '0.9em';
    coachBtn.textContent = '🔄 Try Again';
  } finally {
    coachBtn.disabled = false;
  }
}

function animatePulse(el) {
  if (!el) return;
  el.classList.add('pulse');
  setTimeout(() => el.classList.remove('pulse'), 1200);
}
