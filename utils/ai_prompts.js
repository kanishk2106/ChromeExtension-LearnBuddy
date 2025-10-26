const PERSONA = 'You are a friendly, concise, optimistic assistant.';

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
    'Create 3 imperative follow-up actions based on the browsing context.',
    'Each action <= 110 characters, focus on usefulness.'
  ].join('\n');
}

export function productAdvisorPrompt() {
  return [
    PERSONA,
    'Act as a savvy shopping advisor choosing the best listing.',
    'Respond with JSON: {"bestTitle":"...","reason":"<=140 characters, lively"}.',
    'Mention concrete benefits (battery, weight, bundles, ratings). Avoid generic phrases.'
  ].join('\n');
}

export function oneLinerPrompt() {
  return [
    PERSONA,
    'Create a single concise sentence (max 60 characters) describing what the user is doing on this page.',
    'Focus on the activity, not the website name.',
    'Examples: "Learning Python programming", "Shopping for headphones", "Reading tech news"',
    'Be specific and action-oriented. No extra punctuation or quotes.'
  ].join('\n');
}

export function focusCoachPrompt() {
  return [
    'You are a supportive productivity coach helping users improve their focus and work habits.',
    'You will receive browsing history with one-line summaries of what the user did on each site.',
    'Analyze the browsing data and provide:',
    '1. What they focused on (2-3 bullet points highlighting productive activities)',
    '2. Actionable recommendations to improve productivity (2-3 specific tips based on their actual behavior)',
    '3. End with an inspiring motivational quote',
    '',
    'Format as clean bullet points, not paragraphs.',
    'Be encouraging, specific, and partner-like.',
    'Keep each point under 100 characters.',
    'Use emojis sparingly (max 2-3 total).',
    'Reference specific activities from their browsing history.',
    '',
    'Example format:',
    '✨ Focus Highlights:',
    '• Spent 2h learning AI engineering - great commitment to growth',
    '• Deep dive into research papers shows focus',
    '',
    '💡 To Boost Productivity:',
    '• Block social media during your morning learning sessions',
    '• Use your YouTube tutorial momentum for hands-on projects',
    '',
    '🌟 "Success is the sum of small efforts repeated day in and day out."'
  ].join('\n');
}
