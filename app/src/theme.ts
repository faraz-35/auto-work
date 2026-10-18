import { Appearance } from 'react-native';

export type Scheme = 'dark' | 'light';

const palettes = {
  dark: {
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
    inputBg: 'rgba(0,0,0,0.35)',
  },
  light: {
    bg: '#f6f6f7',
    card: '#ededf0',
    cardRaised: '#ffffff',
    border: '#dedee3',
    text: '#1b1b1f',
    dim: '#73737c',
    // interactive layer inverts to dark monochrome; meaning-colors deepen
    accent: '#27272b',
    accentBg: '#e2e2e7',
    good: '#059669',
    goodBg: '#d8f1e5',
    warn: '#b45309',
    warnBg: '#fbeecd',
    bad: '#dc2626',
    badBg: '#fde2e2',
    scrim: 'rgba(0,0,0,0.45)',
    inputBg: 'rgba(0,0,0,0.05)',
  },
};

export type Colors = typeof palettes.dark;

/** The live palette. Reads follow the current scheme; after setScheme,
 *  components re-render via ThemeEpoch and rebuild their style sheets. */
export const C: Colors = { ...palettes[Appearance.getColorScheme() === 'light' ? 'light' : 'dark'] };

let scheme: Scheme = Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
let epoch = 0;

export function setScheme(next: Scheme): void {
  if (next === scheme) return;
  scheme = next;
  Object.assign(C, palettes[scheme]);
  epoch++;
}

export const getScheme = (): Scheme => scheme;

/** Bumped on every scheme flip; drives style-sheet rebuilds. */
export const themeEpoch = (): number => epoch;

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
