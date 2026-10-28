// Nocturne design tokens, copied from design/handoff/styles.css. Match exactly.
import { alpha } from './color';

const neutral = {
  100: '#f3f5fe',
  200: '#e4e7f5',
  300: '#cfd3e5',
  400: '#b2b6ca',
  500: '#9397ab',
  600: '#75798c',
  700: '#595d6c',
  800: '#3f424d',
  900: '#292b31',
} as const;

const accent = {
  100: '#f5f4ff',
  200: '#e7e5fe',
  300: '#d2cefd',
  400: '#b5abfc',
  500: '#968ae0',
  600: '#796cbf',
  700: '#5d5294',
  800: '#423a6a',
  900: '#2b2741',
} as const;

const text = '#e9e9ed';

export const colors = {
  bg: '#161826',
  surface: '#232532',
  text,
  accent: '#9184d9',
  divider: alpha(text, 0.16),
  /** List-row bottom rule. */
  rowRule: alpha(text, 0.08),
  neutral,
  accentRamp: accent,
  /** Saturated "presence" ground; share card only. */
  section: '#262a60',
  sectionGlow: '#353b80',
  /** Screen ground gradient stops: radial-gradient(120% 55% at 0% 0%, #232532 0%, #161826 62%). */
  groundFrom: '#232532',
  groundTo: '#161826',
} as const;

/** 0.7-density spacing scale. */
export const space = {
  1: 2.8,
  2: 5.6,
  3: 8.4,
  4: 11.2,
  6: 16.8,
  8: 22.4,
} as const;

export const radius = { sm: 4, md: 8, lg: 14 } as const;

export const layout = {
  /** Horizontal page padding. */
  pageX: 20,
  /** Horizontal padding on Onboarding. */
  onboardingX: 24,
  /** Gap between the safe area and the first content. */
  contentTop: 6,
  hitTarget: 44,
  /** Freestanding rules fade to transparent over this many points at each end. */
  ruleFade: 48,
} as const;

export type Colors = typeof colors;
