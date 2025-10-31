import { CATEGORIES, categoryLabel, normalizeCategory } from './categorize.js';
import { enqueue, aiWithTimeout } from './ai_queue.js';
import {
  buildSummaryPreface,
  classificationSystemPrompt,
  actionsSystemPrompt,
  productAdvisorPrompt,
  focusCoachPrompt,
  studyCoachPrompt,
  oneLinerPrompt,
  PERSONA_STRICT
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

// Compute top N sites from browsingHistory
export function topSitesFromHistory(browsingHistory = [], n = 3) {
  const counts = new Map();
  for (const p of browsingHistory || []) {
    try {
      const host = new URL(p.url).hostname.replace(/^www\./, '');
      counts.set(host, (counts.get(host) || 0) + 1);
    } catch {}
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([h]) => h);
}

// Sanitize activities string
function cleanActivitiesString(s = '') {
  return String(s).replace(/\.+/g, '.').trim();
}

// Build study user prompt from activities + top sites
export function buildStudyUserPrompt({ formattedActivities = '', topSites = [] } = {}) {
  const top = (topSites && topSites.length) ? topSites.join(', ') : 'unknown, unknown, unknown';
  return [
    `Activities: ${cleanActivitiesString(formattedActivities)}`,
    `TopSites: ${top}`,
    '',
    'Render EXACTLY in the specified format (one heading + exactly 6 bullets). No preface.'
  ].join('\n');
}

// Fallback builder to produce formattedActivities (same style used elsewhere)
function buildFormattedActivitiesFromHistory(browsingHistory = []) {
  const activities = [];
  for (const page of (browsingHistory || []).slice(0, 6)) {
    if (page?.activity) activities.push(page.activity);
  }
  if (!activities.length) return '**No recent activity.**';
  return activities.map(a => `**${String(a).replace(/\s+$/, '')}.**`).join('; ');
}

export async function generateStudySummary(context = {}) {
  if (typeof LanguageModel === 'undefined') {
    throw new Error('Chrome AI (LanguageModel API) is not available. Please use Chrome 127+ or enable chrome://flags/#prompt-api-for-gemini-nano');
  }
  const topSites = topSitesFromHistory(context?.browsingHistory || [], 3);
  const formattedActivities = context?.formattedActivities || buildFormattedActivitiesFromHistory(context?.browsingHistory || []);
  const userPrompt = buildStudyUserPrompt({ formattedActivities, topSites });

  const session = await LanguageModel.create({
    systemPrompt: `${PERSONA_STRICT}\n\n${studyCoachPrompt()}`,
    temperature: 0.1,
    topK: 1,
    maxOutputTokens: 400,
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }]
  });
  try {
    const out = await session.prompt(userPrompt);
    return (out || '').trim();
  } finally {
    try { session.destroy?.(); } catch {}
  }
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

export async function generateOneLiner({ title = '', text = '', category = 'other', signals = {}, tabId } = {}) {
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

      // Build structured context from signals
      const contextParts = [
        title ? `Page: ${title}` : '',
        `Category: ${categoryLabel(category)}`
      ];

      // Add structured signals
      if (signals) {
        if (signals.searchIntent) {
          contextParts.push(`Search: "${signals.searchIntent.query}"`);
        }
        if (signals.actionItems?.length > 0) {
          const topActions = signals.actionItems.slice(0, 5).map(a => a.text).join(', ');
          contextParts.push(`Actions: ${topActions}`);
        }
        if (signals.dueDates?.length > 0) {
          const firstDue = signals.dueDates[0];
          contextParts.push(`Due: ${firstDue.date} (${firstDue.context.slice(0, 50)})`);
        }
        if (signals.taskPlatform) {
          contextParts.push(`Platform: ${signals.taskPlatform.platform}`);
        }
        if (signals.products?.length > 0) {
          const product = signals.products[0];
          contextParts.push(`Product: ${product.title?.slice(0, 50)} ${product.price ? `$${product.price}` : ''}`);
        }
      }

      // Fallback to text snippet if no signals
      if (!signals || Object.keys(signals).length === 0) {
        contextParts.push('Content snippet:', text.slice(0, 500));
      } else {
        // Include minimal text for context
        contextParts.push('Context:', text.slice(0, 200));
      }

      contextParts.push('', 'One-liner:');

      const prompt = contextParts.filter(Boolean).join('\n');
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
  if (typeof LanguageModel === 'undefined') {
    throw new Error('Chrome AI (LanguageModel API) is not available. Please use Chrome 127+ or enable chrome://flags/#prompt-api-for-gemini-nano');
  }

  const startTime = Date.now();
  return await runQueued('generateFocusCoachSummary', async () => {
    console.log('[AI] Starting at', Date.now() - startTime, 'ms');
    console.log('[AI] Checking availability...');

    // Check availability with timeout (specify language to avoid warning)
    const availability = await Promise.race([
      LanguageModel.availability({
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }]
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Availability check timeout')), 5000))
    ]);

    console.log('[AI] Availability status:', availability, 'at', Date.now() - startTime, 'ms');

    if (availability === 'no') {
      throw new Error('Chrome AI is not available on this device. Make sure you have Chrome 127+ and sufficient RAM (8GB+).');
    }

    if (availability === 'after-download') {
      throw new Error('Chrome AI model is downloading. Please wait a few minutes and try again. Check chrome://components');
    }

    console.log('[AI] Creating session...');

    // Choose study-focused prompt if analytics indicate learning category is active
    const topCatsPre = Object.entries(analytics || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const isStudyMode = topCatsPre.some(([cat]) => normalizeCategory(cat) === 'learning');
    const system = [PERSONA_STRICT, isStudyMode ? studyCoachPrompt() : focusCoachPrompt()].join('\n\n');

    // Create session with timeout - this is where it often hangs
    const sessionPromise = LanguageModel.create({
      systemPrompt: system,
      temperature: 0.1,  // Very low temperature for consistent format following
      topK: 1,           // Greedy sampling for deterministic output
      maxOutputTokens: 512,  // Allow longer, detailed responses
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }]  // Fix warning: specify output language
    });

    const session = await Promise.race([
      sessionPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Session creation timeout - AI model may be initializing. Try again in 30 seconds.')), 15000))
    ]);

    console.log('[AI] Session created ✓');

    try {
      // Build action-oriented prompt with browsing signals
      const topCategories = Object.entries(analytics || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      const focusStats = context.focusStats || {};
      const focusPct = Math.round(focusStats.focusPct || 0);

      // Check if we have enough data
      const hasData = topCategories.length > 0 || (context.browsingHistory || []).length > 0;

      if (!hasData) {
        // No browsing data yet - return a helpful message
        console.log('[AI] No browsing data available yet');
        return 'Start browsing to get personalized action items! Open some tabs, visit sites related to your work or studies, and check back here for AI-powered recommendations.';
      }

      // Extract actionable signals from browsing history
      const recentPages = (context.browsingHistory || []).slice(0, 5);
      const actionItems = [];
      const clickedItems = [];
      const dueDates = [];
      const activities = [];
      const products = [];

      // Collect signals and activities
      for (const page of recentPages) {
        // Add activity description
        if (page.activity) {
          activities.push(page.activity);
        }

        if (page.signals) {
          // PRIORITIZE: Add clicked action items (user actually interacted with these)
          if (page.signals.clickedActionItems && page.signals.clickedActionItems.length > 0) {
            clickedItems.push(...page.signals.clickedActionItems.slice(0, 3).map(a => ({
              text: a.text,
              url: page.url || a.url,
              timestamp: a.timestamp
            })));
          }
          // Add action items (only if no clicked items)
          else if (page.signals.actionItems && page.signals.actionItems.length > 0) {
            actionItems.push(...page.signals.actionItems.slice(0, 2).map(a => a.text));
          }
          // Add due dates
          if (page.signals.dueDates && page.signals.dueDates.length > 0) {
            dueDates.push(...page.signals.dueDates.slice(0, 1).map(d => `${d.date}: ${d.context.slice(0, 40)}`));
          }
          // Add product data for comparison
          if (page.signals.products && page.signals.products.length > 0) {
            products.push(...page.signals.products.slice(0, 3).map(p => ({
              title: p.title,
              price: p.price,
              currency: p.currency,
              originalPrice: p.originalPrice ?? p.listPrice ?? null,
              promoEnds: p.promoEnds ?? p.saleEnds ?? null,
              shipping: p.shipping ?? (p.freeShipping ? 'free shipping' : null),
              membership: p.membership ?? null,
              financing: p.financing ?? p.apr ?? null,
              rating: p.rating,
              reviewCount: p.reviewCount,
              availability: p.availability,
              source: new URL(page.url).hostname
            })));
          }
        }
      }

      // Build activities in the format: Activities: **<activity 1>**; **<activity 2>**; ...
      const activitiesList = [];

      // Add product comparison data as activities
      if (products.length > 0) {
        products.forEach(p => {
          const parts = [];

          // Build activity string
          parts.push(p.title || 'Product');
          parts.push(`at ${p.source}`);

          // Price with original price if available
          if (p.price) {
            parts.push(`priced at ${p.currency || '$'}${p.price}`);
            if (p.originalPrice && p.price < p.originalPrice) {
              parts.push(`(was ${p.currency || '$'}${p.originalPrice})`);
            }
          }

          // Shipping
          if (p.shipping) {
            parts.push(p.shipping);
          }

          // Membership
          if (p.membership) {
            parts.push(`for ${p.membership} members`);
          }

          // Promo end date
          if (p.promoEnds) {
            parts.push(`sale ends ${p.promoEnds}`);
          }

          // Financing
          if (p.financing) {
            parts.push(`${p.financing}`);
          }

          // Condition
          if (p.availability && (p.availability.toLowerCase().includes('refurbished') || p.availability.toLowerCase().includes('renewed'))) {
            parts.push('(refurbished)');
          } else if (p.title && (p.title.toLowerCase().includes('refurbished') || p.title.toLowerCase().includes('renewed'))) {
            parts.push('(refurbished)');
          }

          // Extract and add specs
          const title = p.title || '';
          const storageMatch = title.match(/(\d+\s*GB|\d+\s*TB)/i);
          if (storageMatch) {
            parts.push(`${storageMatch[1].replace(/\s+/g, '')} storage`);
          }

          const screenMatch = title.match(/(\d+\.?\d*[\s-]?inch)/i);
          if (screenMatch) {
            parts.push(`${screenMatch[1]} screen`);
          }

          // Reviews/ratings
          if (p.reviewCount) {
            parts.push(`${p.reviewCount} reviews`);
          } else if (p.rating) {
            parts.push(`${p.rating}★ rating`);
          }

          activitiesList.push(parts.join(' '));
        });
      }

      // Add clicked items as activities
      if (clickedItems.length > 0) {
        clickedItems.slice(0, 3).forEach(item => {
          activitiesList.push(`User clicked: ${item.text}`);
        });
      }

      // Add general activities if no products
      if (activities.length > 0 && products.length === 0) {
        activitiesList.push(...activities.slice(0, 3));
      }

      // Build the prompt in the expected format
      let prompt = '';
      if (activitiesList.length > 0) {
        // Format: Activities: **<activity 1>**; **<activity 2>**; ...
        const formattedActivities = activitiesList.map(a => `**${a}.**`).join('; ');
        // If in study mode, rely on system prompt for the format without adding conflicting specifics
        if (isStudyMode) {
          prompt = `Activities: ${formattedActivities} | Render EXACTLY in the specified format.`;
        } else {
          prompt = `Activities: ${formattedActivities} | Render EXACTLY in the specified format: start with a single heading per category (e.g., "Shopping – <items>"), then 2–3 bullet facts, then Pros/Cons, and Cheaper item if 2+ priced items. No preface, no numbering, no bold, plain text only.`;
        }
      } else {
        // Fallback
        prompt = 'Activities: **No recent activity.** | Render in the specified format.';
      }

      console.log('[AI] Prompting (length:', prompt.length, ')...');
      console.log('[AI] Full prompt:', prompt);
      console.log('[AI] Prompt preview:', prompt.slice(0, 150) + '...');

      // Execute prompt with timeout
      const startPrompt = Date.now();
      const resultPromise = session.prompt(prompt);
      const result = await Promise.race([
        resultPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('AI response timeout - model is busy. Try closing other tabs.')), 20000))
      ]);
      const promptElapsed = Date.now() - startPrompt;

      console.log('[AI] Response received ✓ (length:', result?.length, 'time:', promptElapsed, 'ms)');

      // Return full response - no truncation
      return result?.trim() || null;

    } finally {
      // Always destroy session (don't await, it can hang)
      const destroyStart = Date.now();
      try {
        // Don't await destroy - just fire and forget
        if (session && typeof session.destroy === 'function') {
          Promise.resolve(session.destroy()).then(() => {
            console.log('[AI] Session destroyed ✓ (took', Date.now() - destroyStart, 'ms)');
          }).catch(e => {
            console.warn('[AI] Session cleanup failed:', e);
          });
        }
      } catch (e) {
        console.warn('[AI] Session cleanup exception:', e);
      }
      console.log('[AI] Exiting finally block at', Date.now() - startTime, 'ms');
    }
  }, { tabId }).then(result => {
    console.log('[AI] runQueued resolved at', Date.now() - startTime, 'ms, returning result');
    return result;
  }).catch(err => {
    console.error('[AI] runQueued rejected at', Date.now() - startTime, 'ms:', err.message);
    throw err;
  });
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
