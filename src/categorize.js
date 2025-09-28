// Maps TheFly icon class (from <span class="icon_story_type X">) to your buckets
const ICON_CLASS_MAP = {
  hot_stocks: 'Hot Stocks',
  rumors: 'Rumors',
  general_news: 'General',
  periodicals: 'Periodicals',
  earnings: 'Earnings',
  technical_analysis: 'Tech Analysis',
  options: 'Options',
  syndic: 'Syndicate',
  events: 'Events',
  on_the_fly: 'On The Fly',
  recomm: 'Recommendations',
  recUpgrade: 'Recommendations',
  recDowngrade: 'Recommendations',
  recInitiate: 'Recommendations',
  initiate: 'Recommendations',
  recNoChange: 'Recommendations',
};

// fallback if we ever get a human-readable label instead of the class
const LABEL_FALLBACKS = new Map([
  ['Hot Stocks', 'Hot Stocks'],
  ['Options', 'Options'],
  ['Syndicate', 'Syndicate'],
  ['Periodicals', 'Periodicals'],
  ['On The Fly', 'On The Fly'],
  ['Earnings', 'Earnings'],
  ['Recommendations', 'Recommendations'],
  ['General', 'General'],
]);

export const GROUPS_TAG = new Map([
  ['Hot Stocks', 'news'],
  ['Rumors', 'rumors'],
  ['General', 'news'],
  ['Periodicals', 'news'],
  ['Earnings', 'earnings'],
  ['Tech Analysis', 'hot_stocks'],
  ['Options', 'options'],
  ['Syndicate', 'nice_to_know'],
  ['Events', 'nice_to_know'],
  ['On The Fly', 'news'],
  ['Recommendations', 'analyst_rating'],
]);

export function normalizeCategory(raw) {
  if (!raw) return 'General';
  const key = String(raw).trim();

  if (ICON_CLASS_MAP[key]) return ICON_CLASS_MAP[key];

  for (const [label, mapped] of LABEL_FALLBACKS.entries()) {
    if (key.toLowerCase() === label.toLowerCase()) return mapped;
  }
  return 'General';
}
