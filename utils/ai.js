import { CATEGORIES, categoryLabel, normalizeCategory } from './categorize.js';
import { enqueue, aiWithTimeout } from './ai_queue.js';
import {
  buildSummaryPreface,
  classificationSystemPrompt,
  actionsSystemPrompt,
  productAdvisorPrompt,
  focusCoachPrompt,
  oneLinerPrompt
} from './ai_prompts.js';

let summarizerSession = null;
let batteryPromise = null;

export async function shouldRunAI() {
  try {
    if (!navigator.getBattery) return true;
    batteryPromise = batteryPromise || navigator.getBattery();
    const battery = await batteryPromise;
    if (!battery) return true;
    return battery.charging || battery.level >= 0.25;
  } catch (error) {
    console.error('AI failure shouldRunAI', error);
    return true;
  }
}

async function runQueued(label, fn, context = {}) {
  if (!(await shouldRunAI())) {
    throw new Error('AI_BATTERY_LOW');
  }
  return enqueue(() => aiWithTimeout(fn, label, context.tabId));
}

export function resetAISessions() {
  summarizerSession?.destroy?.();
  summarizerSession = null;
}

export async function summarizeWithAI(text, {
  onStatus,
  title = '',
  description = '',
  keywords = [],
  products = [],
  language = 'en',
  tabId
} = {}) {
  const safeText = (text || '').trim();
  if (!safeText) return '';
  try {
    return await runQueued('summarizeWithAI', async () => {
      const session = await ensureSummarizer(onStatus);
      if (!session) return fallbackSummary(safeText);
      const preface = buildSummaryPreface({ title, description, keywords, products, language });
      const chunked = chunkText(safeText, 11_500);
      if (chunked.length === 1) {
        const result = await session.summarize(preface + chunked[0]);
        const formatted = formatOptimisticSummary(sanitizeSummary(result || ''), safeText);
        return formatted || fallbackSummary(safeText);
      }
      const partials = [];
      for (const part of chunked) {
        const res = await session.summarize(preface + part);
        partials.push(res || '');
      }
      const joined = partials.filter(Boolean).join('\n');
      const final = await session.summarize(
        `${preface}Summarize these notes in 2 upbeat sentences highlighting key benefits and recommended next step:\n${joined}`
      );
      const formatted = formatOptimisticSummary(sanitizeSummary(final || ''), safeText);
      return formatted || fallbackSummary(safeText);
    }, { tabId });
  } catch (err) {
    console.error('AI failure summarizeWithAI', err, { tabId });
    return fallbackSummary(safeText);
  }
}

export async function classifyWithAI({ text, title = '', url = '', categories = CATEGORIES, onStatus, tabId } = {}) {
  const safeText = (text || '').trim();

  // Check if LanguageModel API is available
  if (typeof LanguageModel === 'undefined') {
    console.log('[AI Debug] LanguageModel API not available');
    return null;
  }

  try {
    return await runQueued('classifyWithAI', async () => {
      const availability = await LanguageModel.availability({
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }]
      });
      console.log('[AI Debug] classifyWithAI availability:', availability);

      // Check for 'no' or any falsy value
      if (availability === 'no' || !availability) {
        console.log('[AI Debug] Model not available');
        return null;
      }
      if (availability === 'after-download' && typeof onStatus === 'function') {
        onStatus('Downloading language model…');
        console.log('[AI Debug] Model needs download, notifying user');
      }

      // User activation checked at entry point (button click), safe to create session in queue
      const session = await LanguageModel.create({
        systemPrompt: classificationSystemPrompt(categories),
        temperature: 0,
        topK: 1,
        maxOutputTokens: 80,
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }]
      });
      const prompt = [
        `URL: ${url}`,
        `TITLE: ${title}`,
        'CONTENT SNIPPET:',
        safeText.slice(0, 2_000),
        '',
        'Respond now.'
      ].join('\n');
      const raw = (await session.prompt(prompt))?.trim();
      session.destroy?.();
      if (!raw) return null;
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        const lower = raw.toLowerCase();
        const match = categories.find(cat => lower.includes(`"${cat}"`) || lower.includes(`:${cat}`) || lower.includes(cat));
        if (match) {
          return { category: match, reason: null };
        }
        return null;
      }
      if (!parsed || typeof parsed !== 'object') return null;
      const cat = typeof parsed.category === 'string' ? parsed.category.toLowerCase().trim() : null;
      const match = cat && categories.find(c => c === cat);
      if (!match) return null;
      const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : null;
      return { category: match, reason: reason && reason.length ? reason : null };
    }, { tabId });
  } catch (err) {
    console.error('AI failure classifyWithAI', err, { tabId });
    return null;
  }
}

export async function generateActionsWithAI({ category, summary = '', url = '', fallback = [], tabId } = {}) {
  if (!category) return fallback;
  if (typeof LanguageModel === 'undefined') return fallback;
  try {
    return await runQueued('generateActionsWithAI', async () => {
      const availability = await LanguageModel.availability({
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }]
      });
      if (availability === 'no') return fallback;
      // User activation checked at entry point (button click), safe to create session in queue
      const session = await LanguageModel.create({
        systemPrompt: actionsSystemPrompt(),
        temperature: 0.2,
        topK: 3,
        maxOutputTokens: 80,
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }]
      });
      const prompt = [
        `Category: ${categoryLabel(category)}`,
        url ? `URL: ${url}` : '',
        summary ? `Summary: ${summary}` : '',
        '',
        'Actions:'
      ].filter(Boolean).join('\n');
      const output = (await session.prompt(prompt)) || '';
      session.destroy?.();
      const parsed = output
        .split('\n')
        .map(line => line.replace(/^[-•*\d.\s]+/, '').trim())
        .filter(Boolean);
      return parsed.length ? parsed.slice(0, 3) : fallback;
    }, { tabId });
  } catch (err) {
    console.error('AI failure generateActionsWithAI', err, { tabId });
    return fallback;
  }
}

export function fallbackSummary(text) {
  const sanitized = (text || '').trim();
  if (!sanitized) return '';
  const sentences = sanitized.split(/(?<=[.!?])\s+/).slice(0, 3);
  return sentences.join(' ');
}

export function chunkText(text, max = 14_000) {
  const output = [];
  for (let i = 0; i < text.length; i += max) output.push(text.slice(i, i + max));
  return output;
}

async function ensureSummarizer(onStatus) {
  if (typeof Summarizer === 'undefined') {
    console.log('[AI Debug] Summarizer API not available');
    return null;
  }
  if (summarizerSession) return summarizerSession;
  try {
    const availability = await Summarizer.availability({
      type: 'key-points',
      format: 'plain-text',
      length: 'medium'
    });
    console.log('[AI Debug] Summarizer availability:', availability);

    if (availability === 'no') {
      console.log('[AI Debug] Summarizer not available');
      return null;
    }

    // User activation checked at entry point (button click), safe to create session in queue
    summarizerSession = await Summarizer.create({
      type: 'key-points',
      format: 'plain-text',
      length: 'medium',
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', (event) => {
          if (typeof onStatus === 'function') {
            const pct = Math.round(Math.min(Math.max(event.loaded ?? 0, 0), 1) * 100);
            onStatus(`Downloading summarizer… ${pct}%`);
          }
        });
      }
    });
    return summarizerSession;
  } catch (err) {
    console.warn('ensureSummarizer error', err);
    return null;
  }
}

export function normalizeAiCategory(value) {
  if (!value) return null;
  return normalizeCategory(value);
}

function sanitizeSummary(input) {
  return (input || '')
    .replace(/^(?:as an ai|as (?:an )?assistant).*$/gim, '')
    .replace(/\b(?:as an ai|as (?:an )?assistant)[^.]*\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function analyzeProductValue(candidates = [], context = {}, { tabId } = {}) {
  if (!candidates?.length || typeof LanguageModel === 'undefined') return null;
  try {
    return await runQueued('analyzeProductValue', async () => {
      const availability = await LanguageModel.availability({
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }]
      });
      if (availability === 'no') return null;
      // User activation checked at entry point (button click), safe to create session in queue
      const session = await LanguageModel.create({
        systemPrompt: productAdvisorPrompt(),
        temperature: 0.2,
        topK: 3,
        maxOutputTokens: 80,
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }]
      });
      const prompt = [
        'Product listings (top candidates with scores):',
        JSON.stringify(candidates.slice(0, 3), null, 2),
        'Price context:',
        JSON.stringify(context || {}, null, 2),
        '',
        'Respond now with JSON only.'
      ].join('\n');
      const raw = (await session.prompt(prompt))?.trim();
      session.destroy?.();
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        const bestTitle = typeof parsed.bestTitle === 'string' ? parsed.bestTitle.trim() : null;
        const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : null;
        if (!bestTitle && !reason) return null;
        return {
          bestTitle: bestTitle || null,
          reason: reason || null
        };
      } catch (error) {
        console.error('AI failure analyzeProductValue parse', error, { tabId, raw });
        return null;
      }
    }, { tabId });
  } catch (err) {
    console.error('AI failure analyzeProductValue', err, { tabId });
    return null;
  }
}

export async function generateOneLiner({ title = '', text = '', category = 'other', tabId } = {}) {
  if (typeof LanguageModel === 'undefined') return null;
  if (!text || !text.trim()) return null;

  try {
    return await runQueued('generateOneLiner', async () => {
      const availability = await LanguageModel.availability({
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }]
      });
      if (availability === 'no') return null;
      // User activation checked at entry point (button click), safe to create session in queue
      const session = await LanguageModel.create({
        systemPrompt: oneLinerPrompt(),
        temperature: 0.3,
        topK: 2,
        maxOutputTokens: 20,
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }]
      });
      const prompt = [
        title ? `Page: ${title}` : '',
        `Category: ${categoryLabel(category)}`,
        'Content snippet:',
        text.slice(0, 500),
        '',
        'One-liner:'
      ].filter(Boolean).join('\n');
      const result = (await session.prompt(prompt))?.trim();
      session.destroy?.();
      // Clean up quotes if AI adds them
      return result ? result.replace(/^["']|["']$/g, '') : null;
    }, { tabId });
  } catch (err) {
    console.error('AI failure generateOneLiner', err, { tabId });
    return null;
  }
}

export async function generateFocusCoachSummary(analytics = {}, context = {}, { tabId } = {}) {
  if (typeof LanguageModel === 'undefined') return null;
  try {
    return await runQueued('generateFocusCoachSummary', async () => {
      const availability = await LanguageModel.availability({
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }]
      });
      if (availability === 'no') return null;
      // User activation checked at entry point (button click), safe to create session in queue
      const session = await LanguageModel.create({
        systemPrompt: focusCoachPrompt(),
        temperature: 0.6,
        topK: 5,
        maxOutputTokens: 300,
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }]
      });
      const prompt = [
        'Browsing analytics (category -> visit count):',
        JSON.stringify(analytics, null, 2),
        '',
        'Recent browsing history with activities:',
        JSON.stringify(context.browsingHistory || [], null, 2),
        '',
        'Weekly focus metrics:',
        JSON.stringify(context.focusStats || {}, null, 2),
        '',
        'Provide coaching summary:'
      ].join('\n');
      const result = (await session.prompt(prompt))?.trim();
      session.destroy?.();
      return result || null;
    }, { tabId });
  } catch (err) {
    console.error('AI failure generateFocusCoachSummary', err, { tabId });
    return null;
  }
}

function formatOptimisticSummary(summary, sourceText) {
  const existing = (summary || '').trim();
  if (existing && existing.toLowerCase().startsWith('✨ chrome ai says')) {
    return existing;
  }

  const cleanedLines = (existing || '')
    .split('\n')
    .map(stripBullet)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (!cleanedLines.length) {
    const fallback = fallbackSummary(sourceText).split('\n')
      .map(stripBullet)
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    cleanedLines.push(...fallback);
  }

  if (!cleanedLines.length) return '';

  const primary = capitalizeSentence(cleanedLines[0]);
  const extras = cleanedLines.slice(1, 3).map(capitalizeSentence);
  let message = primary;
  if (extras.length) {
    message += ` ${extras.join(' ')}`;
  }
  message = ensureTrailingPunctuation(message);
  const trimmed = message.length > 260 ? `${message.slice(0, 257).trim()}…` : message;
  return `✨ Chrome AI says: ${trimmed}`;
}

export function polishProductAdvice(advice = {}, context = {}) {
  if (!advice) return null;
  const bestTitle = advice.bestTitle?.trim() || context.defaultTitle || null;
  let reason = sanitizeSummary(advice.reason || '') || context.fallbackReason || '';
  if (reason) {
    reason = reason.charAt(0).toUpperCase() + reason.slice(1);
  }
  if (context.savings && reason && !reason.toLowerCase().includes('save')) {
    reason += ` Save ${context.savings}.`;
  }
  if (reason && !reason.startsWith('💡')) {
    reason = `💡 ${reason}`;
  }
  return {
    bestTitle,
    reason: reason || '💡 Worth checking this listing again for the best value.'
  };
}

export async function getCurrentModelVersion() {
  try {
    if (typeof LanguageModel !== 'undefined') {
      const availability = await LanguageModel.availability();
      // LanguageModel.availability() returns a string, not an object with modelVersion
      // We'll need to create a session to get capabilities if available
      if (availability === 'readily') {
        return 'gemini-nano';
      }
    }
    if (typeof Summarizer !== 'undefined') {
      const availability = await Summarizer.availability();
      if (availability === 'readily') {
        return 'gemini-nano';
      }
    }
  } catch (error) {
    console.error('AI failure getCurrentModelVersion', error);
  }
  return 'unknown';
}

export async function debugAIAvailability() {
  console.log('=== Chrome AI Availability Debug ===');
  console.log('Chrome version:', navigator.userAgent);

  // Check for the CORRECT APIs (LanguageModel and Summarizer globals)
  console.log('\n🔍 Checking Global APIs:');
  console.log('LanguageModel exists:', typeof LanguageModel !== 'undefined');
  console.log('Summarizer exists:', typeof Summarizer !== 'undefined');

  // Check old APIs (for reference)
  // Legacy APIs (self.ai, window.ai) are deprecated and no longer checked

  // Test LanguageModel availability
  if (typeof LanguageModel !== 'undefined') {
    try {
      const availability = await LanguageModel.availability();
      console.log('\n✅ LanguageModel.availability():', availability);

      if (availability === 'readily' || availability === 'available') {
        console.log('🟢 Model is ready to use!');
      } else if (availability === 'after-download') {
        console.log('🟡 Model needs to be downloaded (click a button to trigger)');
      } else if (availability === 'no') {
        console.log('🔴 Model not available (check system requirements)');
      } else {
        console.log('⚠️ Unknown availability status:', availability);
      }
    } catch (err) {
      console.error('❌ Error checking LanguageModel availability:', err);
    }
  } else {
    console.log('❌ LanguageModel API not found');
    console.log('   → Make sure Chrome flags are enabled!');
  }

  // Test Summarizer availability
  if (typeof Summarizer !== 'undefined') {
    try {
      const availability = await Summarizer.availability();
      console.log('\n✅ Summarizer.availability():', availability);
    } catch (err) {
      console.error('❌ Error checking Summarizer availability:', err);
    }
  } else {
    console.log('❌ Summarizer API not found');
  }

  const userActivation = navigator.userActivation ? {
    isActive: navigator.userActivation.isActive,
    hasBeenActive: navigator.userActivation.hasBeenActive
  } : 'not supported';
  console.log('\n👆 User activation:', userActivation);

  // Check flags that should be enabled
  console.log('\n📋 Required Chrome Flags:');
  console.log('1. chrome://flags/#optimization-guide-on-device-model');
  console.log('   → Set to "Enabled BypassPerfRequirement"');
  console.log('2. chrome://flags/#prompt-api-for-gemini-nano');
  console.log('   → Set to "Enabled"');
  console.log('3. Restart Chrome COMPLETELY (Quit and reopen)');
  console.log('\n🔍 Check model download status: chrome://on-device-internals');

  console.log('\n=== End Debug ===');
}

function stripBullet(line = '') {
  return line.replace(/^[-•*\d.\s]+/, '').trim();
}

function capitalizeSentence(sentence = '') {
  const trimmed = sentence.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function ensureTrailingPunctuation(sentence = '') {
  if (!sentence) return '';
  const trimmed = sentence.trim();
  if (/[.!?]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}
