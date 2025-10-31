const PERSONA = 'You are a friendly, concise, optimistic assistant.';

export const PERSONA_STRICT = 'You are precise and format-strict. Follow instructions exactly. Output ONLY the requested format. No markdown, no prefaces, no extra words. If information is missing, say "unknown" and do not guess.';

export function buildSummaryPreface({ title = '', description = '', keywords = [], products = [], language = 'en' }) {
  const lines = [
    PERSONA,
    `Summarize the page in English even if the original content is ${language}.`,
    'Highlight what is most useful for the user in at most 2 sentences.'
  ];
  if (title) lines.push(`Page Title: ${title}`);
  if (description) lines.push(`Meta Description: ${description}`);
  if (Array.isArray(keywords) && keywords.length) {
    lines.push(`Key Topics: ${keywords.slice(0, 8).join(', ')}`);
  }
  if (Array.isArray(products) && products.length) {
    const names = products.map((p) => p?.title).filter(Boolean).slice(0, 5);
    if (names.length) lines.push(`Featured Products: ${names.join(', ')}`);
  }
  lines.push('Be specific, upbeat, and avoid filler or self-references.');
  return `${lines.join('\n')}\n\nCONTENT:\n`;
}

export function classificationSystemPrompt(categories) {
  return [
    PERSONA,
    'You classify web pages into predefined categories.',
    `Possible categories: ${categories.join(', ')}.`,
    'Respond with JSON: {"category":"<category>","reason":"short explanation"}.',
    'Keep tone optimistic and user-focused. Reason must mention concrete page elements.'
  ].join('\n');
}

export function actionsSystemPrompt() {
  return [
    PERSONA,
    'Create exactly 3 useful, imperative follow-up actions for the current page.',
    'Respond with JSON ONLY on one line: {"actions":["...","...","..."]}',
    'Rules:',
    '- Start each action with a strong verb; no emojis; no ending punctuation',
    '- Max 110 characters per action',
    '- Make actions distinct: quick win, deeper dive, next step',
    '- Use page signals when present (prices, promos, deadlines, specs, ratings, availability)',
    '- If a specific date exists, include one action that references it briefly (e.g., Nov 5)',
    '- If Shopping: include one of {Compare prices, Track price drops, Check return policy, Verify size/color availability}',
    '- If Docs: include one of {Bookmark section, Copy code sample, Open related API, Add TODO in tracker}',
    '- If Review or News: include one of {Save key takeaway, Follow topic/source, Set reminder for event}',
    '- If signals are sparse, default to ["Save this page","Share with teammate","Add a quick note"]',
    'No markdown, no extra keys, no explanations'
  ].join('\n');
}


export function productAdvisorPrompt() {
  return [
    PERSONA,
    // Scope & Output
    'Select the single best listing from the PROVIDED CANDIDATES ONLY.',
    'Respond with JSON ONLY on one line: {"bestTitle":"<exact candidate title>","reason":"<=140 characters, lively"}.',
    'Use the title EXACTLY as given. Do NOT invent titles/specs/prices/sellers. No markdown, no extra keys.',
    // Core Decision Policy (category-agnostic)
    'Decision policy (apply in order):',
    '1) Availability: In stock > backordered > out of stock. (Fashion: prefer listings with required size/color available if provided.)',
    '2) Authenticity/Seller: Brand site or authorized retailer > marketplace > unknown/gray-market.',
    '3) Condition: New > refurbished > used (unless equal warranty explicitly stated).',
    '4) Total cost: price - discounts + mandatory fees + shipping (include membership/activation costs if required).',
    '5) Post-purchase: better return window, free/easy returns; longer/better warranty.',
    '6) Delivery: faster/cheaper shipping; reliable pickup options.',
    '7) Social proof: higher rating WITH sufficient review count (prefer higher rating AND more reviews).',
    // Category-Specific Tie-breaks
    '8) Category specifics (use only if explicitly present):',
    '   • Electronics: newer model/SoC, more RAM/storage, battery life, port selection, OS/support horizon, useful bundles.',
    '   • Shoes/Apparel: size range availability, fit notes (true-to-size, wide/narrow), comfort reviews, materials & care.',
    '   • Appliances/Furniture: capacity/dimensions fit, energy efficiency, materials/build, delivery/installation terms.',
    '   • Sports/Outdoors: weight, durability, weatherproof rating, included accessories.',
    // Final tie
    '9) If still tied: apply user priorities if provided; else choose lower total cost; else pick lexicographically first title.',
    // Reason style
    'Reason must cite 2–3 concrete advantages (e.g., lower total price (including what is the price of each websites), free returns, 2-yr warranty, faster ship, better specs).',
    'If information is missing, do NOT guess; decide using available factors.',
    '10) Always the final result of which is best choice should be in the last line, you should give the reason in 1 line, Choose only one product, along with the website name where you took the product from'
  ].join('\n');
}


export function oneLinerPrompt() {
  return [
    PERSONA,
    'Write one short activity line (≤60 characters) in English.',
    'Prioritize structured signals (action items, due dates, search queries, product details) over raw page text.',
    'Describe what the user is doing, not the website.',
    'Plain text only. No quotes, no emojis, no trailing punctuation.',
    'Use present-progressive or a concise noun phrase (e.g., Shopping for headphones; Reviewing assignment due Nov 5).',
    'When multiple signals exist, pick the most action-oriented; if multiple tasks with due dates, choose the soonest.',
    'If useful signals are missing, output: Browsing this page',
    'Format dates briefly (e.g., Nov 5). Avoid site names and fluff.',
    'Examples: Learning Python programming; Shopping for headphones; Reviewing assignment due Feb 15'
  ].join('\n');
}


export function focusCoachPrompt() {
  return [
    'CRITICAL: Follow the exact format shown in examples below. NO prefaces. NO bold text. NO numbered lists. ONLY bullets. NO code fences.',
    '',
    'You will receive input in ONE of these forms:',
    'A) Activities: **<activity 1>**; **<activity 2>**; ... | Generate 2-3 factual statements',
    'B) Here are <N> factual statements ... 1) **<fact>** 2) **<fact>** 3) **<fact>**',
    '',
    'Rules:',
    '• Treat format B facts as the same kind of items as in format A. DO NOT echo phrases like "Here are 3 factual statements" or numbering.',
    '• Parse each item/fact and classify it as Shopping, Review, Docs, News, or Other using only the provided text.',
    '• Group by category. For each category, output exactly one heading:',
    '  Category – Canonical Item/Subject Names (join with " & " if multiple)',
    '  - If items are comparable (same product family/type), keep them under one Shopping heading.',
    '  - If categories differ, output separate headings.',
    '• Under each heading, output concise bullets using only provided facts (no hallucination):',
    '  - 2–3 facts (price, retailer, financing/promo, rating, key spec, end dates).',
    '  - For Shopping or Review, add one "Pros:" and one "Cons:" bullet ONLY if derivable from the text.',
    '  - If a Shopping group has ≥2 priced items, add "Cheaper item: … (vs …)". If <2 priced items, omit this line.',
    '• Canonicalize names: prefer Brand + Model (+ key variant). Drop generic words like "soccer sneakers/cleats" unless needed.',
    '• Style constraints:',
    '  - Start directly with the heading.',
    '  - No prefaces like "Here are 3 factual statements…".',
    '  - No extra commentary.',
    '  - If a datum (e.g., price) isn\'t present, write "Price not listed" or omit.',
    '',
    'Output Format (plain text only):',
    '',
    '<Heading>',
    '• <fact>',
    '• <fact>',
    '• <fact> (optional)',
    '• Pros: <concise, from text only> (optional)',
    '• Cons: <concise, from text only> (optional)',
    '• Cheaper item: <A> at <$X> (vs <$Y>) (only for Shopping with 2+ priced items)',
    '',
    'Examples',
    '',
    'Example 1 (Activities format)',
    'Input:',
    'Activities: **Total Wireless iPhone 15 Plus 128GB on sale for $379 (0% APR available).**; **Best Buy iPhone 15 128GB (Black, Unlocked) priced at $629.99.**; **Total Wireless promo: save $250 on iPhone 15 Plus with a 3-month plan.** | Generate 2-3 factual statements',
    '',
    'Output:',
    'Shopping – Apple iPhone 15 & 15 Plus',
    '• Total Wireless lists iPhone 15 Plus 128GB at $379.',
    '• Best Buy lists iPhone 15 128GB (Black, Unlocked) at $629.99.',
    '• Total Wireless offers $250 savings on iPhone 15 Plus with a 3-month plan.',
    '• Pros: 0% APR and plan savings available (Total Wireless); unlocked option at Best Buy.',
    '• Cons: Savings require a 3-month plan (carrier); Best Buy price is higher.',
    '• Cheaper item: iPhone 15 Plus at $379 (vs $629.99).',
    '',
    'Example 2 (Activities format)',
    'Input:',
    'Activities: **Jordan Retro 3 men\'s at Foot Locker — $205.00 with interest-free installments.**; **adidas Ultraboost Light men\'s — $180.00; occasional $20 coupon.** | Generate 2-3 factual statements',
    '',
    'Output:',
    'Shopping – Jordan Retro 3 & adidas Ultraboost Light (Men\'s)',
    '• Foot Locker lists Jordan Retro 3 at $205.00 with interest-free payments.',
    '• Ultraboost Light is priced at $180.00 with an occasional $20 coupon.',
    '• Pros: Interest-free installments (Jordan); lower base price and coupon potential (Ultraboost).',
    '• Cons: Jordan price is higher than Ultraboost; coupon timing not guaranteed (Ultraboost).',
    '• Cheaper item: adidas Ultraboost Light at $180 (vs $205).',
    '',
    'Example 3 (Activities format)',
    'Input:',
    'Activities: **Sony WH-1000XM5 review rates ANC and comfort at 4.5/5; list price $399, deals around $349.**; **Bose QC Ultra review scores 4/5; highlights call quality; similar price range.** | Generate 2-3 factual statements',
    '',
    'Output:',
    'Review – Sony WH-1000XM5 & Bose QC Ultra',
    '• XM5 rated 4.5/5 with strong ANC and comfort; list price $399, common deals ~$349.',
    '• QC Ultra rated 4/5; emphasizes call quality; similar price range.',
    '• Pros: XM5—top-tier ANC/comfort; QC Ultra—call quality focus.',
    '• Cons: XM5—higher list price than sale price; QC Ultra—slightly lower rating than XM5.',
    '',
    'Example 4 (Numbered statements format)',
    'Input:',
    'Here are 3 factual statements based on the provided text: 1. **adidas Mundial Team soccer sneakers are currently on sale for $46, representing a discount from their original price of $65.** 2. **The sale on adidas Mundial Team sneakers ends on November 5th.** 3. **adidas Copa Mundial soccer cleats are available for $159.44, a discount from the original price of $179.95.**',
    '',
    'Output:',
    'Shopping – adidas Mundial Team & adidas Copa Mundial',
    '• adidas Mundial Team on sale for $46 (was $65).',
    '• Sale ends November 5.',
    '• adidas Copa Mundial priced at $159.44 (was $179.95).',
    '• Pros: Both listings are discounted; Mundial Team has a clear end date.',
    '• Cons: Copa Mundial remains pricier; Mundial Team sale is time-limited.',
    '• Cheaper item: adidas Mundial Team at $46 (vs $159.44).',
    '',
    'Remember: Start with the heading. Never echo the input phrasing or numbering.',
    'Always at the end provide final result which contains the best choice, it should always be in the last line, you should give the reason in 5 to 10 words, Choose only one product, result should always be provided with the website name where you took the product from'
  ].join('\n');
}


export function studyCoachPrompt() {
  return [
    // Strictness & scope
    'You are precise and format-strict. Output ONLY the requested format. No prefaces, no markdown fences, no extra lines.',
    'Task: Identify the study topic from Activities + TopSites and produce a 5-day learning plan.',
    // Hard formatting rules
    'Plain text only. EXACTLY one heading line, then EXACTLY 6 bullets. No blank lines. No emojis.',
    'Heading format (single line): Study – <topic>',
    'Each bullet must start with "• " (bullet, space). No other bullet symbols. No numbered lists.',
    'Do not exceed ~140 characters per bullet.',
    // Required bullets in this exact order (always 6)
    'Bullets (exactly 6, in order):',
    '• Focus: <key concepts from activities> (e.g., n-grams, tokenization, transformer basics)',
    '• Resources: <site1> — <2–6 word note>; <site2> — <note>; <site3> — <note> (use TopSites order; if fewer than 3, write "unknown" placeholders)',
    '• Schedule: Start by <earliest due − 5 days> if a due date exists; otherwise "Start today; plan 5 days"',
    '• 5-day plan: D1 …; D2 …; D3 …; D4 …; D5 … (concise, escalating difficulty)',
    '• Tools: <tools/libraries clearly implied> (write "unknown" if none)',
    '• Next step: <single imperative line>',
    // Data rules
    'Rules:',
    '• Use ONLY Activities and TopSites. Do NOT invent URLs or facts.',
    '• If a datum is missing, write "unknown" to preserve the 6-bullet format.',
    '• If multiple due dates exist, use the earliest; format dates like "Nov 5". Compute start as calendar days (due − 5).',
    '• No trailing commentary after the sixth bullet.',
    // Optional validator hint (for the model)
    'Validation target (conceptual): ^Study – .+\\n(?:• .+\\n){5}• .+$',

  ].join('\n');
}

