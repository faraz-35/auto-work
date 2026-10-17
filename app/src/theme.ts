export const C = {
  bg: '#09090b',
  card: '#131316',
  cardRaised: '#1a1a1f',
  border: '#26262b',
  text: '#f4f4f5',
  dim: '#8b8b93',
  // interactive layer is bright monochrome; color is reserved for meaning
  // (good = all clear, warn = alarm/overdue, bad = overdue)
  accent: '#e7e5e4',
  accentBg: '#26262b',
  good: '#34d399',
  goodBg: '#0d3527',
  warn: '#fbbf24',
  warnBg: '#3a2d0b',
  bad: '#f87171',
  badBg: '#3b1416',
  scrim: 'rgba(0,0,0,0.6)',
};

export const R = {
  card: 16,
  pill: 999,
  btn: 14,
  sheet: 24,
  input: 12,
};

/** Type scale — the only font sizes in the app. */
export const T = {
  tiny: 12,     // dates, footer rows
  meta: 13,     // secondary lines, hints
  body: 14,     // list body, chips
  item: 15,     // emphasized list rows, amounts
  title: 16,    // card titles
  heading: 18,  // sheet titles
  hero: 20,     // today hero, section leads
  display: 26,  // the countdown
};

/** Type weights — the only font weights in the app. */
export const W = {
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
} as const;

/** Spacing scale — paddings and gaps beyond small layout tweaks. */
export const S = {
  screen: 20,       // screen side padding
  gap: 16,          // between cards
  gapTight: 12,     // inside dense cards
  rowGap: 10,       // between rows in a list card
  card: 18,         // card padding
  sheetBottom: 20,  // sheet content above the gesture bar
};

export const font = {
  regular: 'System',
};
