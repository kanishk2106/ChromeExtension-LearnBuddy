import { categoryLabel, normalizeCategory } from '../utils/categorize.js';
import { generateFocusCoachSummary } from '../utils/ai.js';
import { cacheStreakValue } from '../utils/storage.js';

const PRODUCTIVE = new Set(['learning', 'productivity', 'research', 'finance']);
const DISTRACTION = new Set(['entertainment', 'shopping', 'social']);

let cachedAnalytics = {};
let cachedFocusStats = {};
let cachedBrowsingHistory = [];

document.addEventListener('DOMContentLoaded', async () => {
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

    const summary = await generateFocusCoachSummary(cachedAnalytics, context);
    summaryEl.textContent = summary || 'Keep up the momentum 💪';
    coachBtn.textContent = '✨ Refresh AI Summary';
  } catch (err) {
    console.warn('Focus coach AI error', err);
    summaryEl.textContent = err?.message === 'User activation required'
      ? 'Click the button to generate AI summary (user interaction required)'
      : 'Could not generate AI summary. Keep up the momentum 💪';
    coachBtn.textContent = '✨ Get AI Coach Summary';
  } finally {
    coachBtn.disabled = false;
  }
}

function animatePulse(el) {
  if (!el) return;
  el.classList.add('pulse');
  setTimeout(() => el.classList.remove('pulse'), 1200);
}
