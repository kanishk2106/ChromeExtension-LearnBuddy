import { normalizeCategory } from './categorize.js';

const CATEGORY_ACTIONS = {
  shopping: [
    'Compare product prices across open tabs.',
    'Search for coupon codes or cashback offers.',
    'Read recent reviews to confirm quality.',
    'Add the item to a wishlist for later review.'
  ],
  learning: [
    'Capture quick notes or highlights from this page.',
    'Schedule a follow-up session to continue learning.',
    'Share insights with teammates or study partners.',
    'Bookmark the resource in your learning tracker.'
  ],
  finance: [
    'Check due dates or upcoming payments related to this topic.',
    'Compare rates or fees with alternative providers.',
    'Review budget impact before making decisions.',
    'Document action items in your finance tracker.'
  ],
  social: [
    'Respond to outstanding messages that need attention.',
    'Unfollow or mute distractions that break focus.',
    'Share concise updates or takeaways with your network.'
  ],
  productivity: [
    'Convert key points into actionable tasks.',
    'Set a reminder or follow-up for critical deadlines.',
    'Organize related documents inside your workspace.'
  ],
  research: [
    'Log citations or references for later.',
    'Summarize findings and note open questions.',
    'Identify supporting or conflicting sources to review next.'
  ],
  entertainment: [
    'Add upcoming releases or events to your calendar.',
    'Share highlights with friends who might enjoy this.',
    'Track how much time you want to spend on this topic.'
  ],
  news: [
    'Verify facts across multiple reputable sources.',
    'Record key impacts or decisions that apply to you.',
    'Mute repetitive topics to regain focus if needed.'
  ],
  other: [
    'Clarify whether this page supports your current goal.',
    'Decide if you should archive or close this tab.',
    'Set a reminder if you need to revisit later.'
  ]
};

export function getActionPoints(category) {
  const normalized = normalizeCategory(category);
  return CATEGORY_ACTIONS[normalized] || CATEGORY_ACTIONS.other;
}

export function actionSummary(category) {
  const normalized = normalizeCategory(category);
  const actions = getActionPoints(normalized).slice(0, 2);
  return actions.join(' ');
}
