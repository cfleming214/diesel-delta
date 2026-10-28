import type { TextStyle } from 'react-native';

/** Inter 400/500 only. Headings never go above 500. */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
} as const;

/** CSS letter-spacing in em → React Native points. */
export const em = (value: number, fontSize: number) => value * fontSize;

const heading = (fontSize: number, lineHeight = 1.12, tracking = -0.015): TextStyle => ({
  fontFamily: fonts.medium,
  fontSize,
  lineHeight: Math.round(fontSize * lineHeight),
  letterSpacing: em(tracking, fontSize),
});

/** Named text styles used across screens (sizes from the handoff README). */
export const type = {
  /** Onboarding headline: 34/1.1, −0.025em. */
  display: heading(34, 1.1, -0.025),
  /** Screen title (h2): 28/1.12, −0.015em. */
  title: heading(28),
  /** Section heading (h5): 16/500. */
  section: heading(16),
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: Math.round(15 * 1.5) },
  bodySmall: { fontFamily: fonts.regular, fontSize: 13, lineHeight: Math.round(13 * 1.45) },
  /** Subtitles, helper text, captions. */
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  /** Uppercase kicker: 11pt, 0.1em tracking. */
  kicker: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: em(0.1, 11),
    textTransform: 'uppercase',
  },
  /** Button and input text. */
  control: { fontFamily: fonts.medium, fontSize: 14, lineHeight: Math.round(14 * 1.2) },
  tabLabel: { fontFamily: fonts.medium, fontSize: 10 },
} satisfies Record<string, TextStyle>;

/** All numbers render with tabular figures. */
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };
