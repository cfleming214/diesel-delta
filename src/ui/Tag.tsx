import { StyleSheet, View } from 'react-native';

import { colors, em, fonts } from '@/theme';

import { Text } from './Text';

export type TagTone = 'accent' | 'outline' | 'neutral';

type Props = {
  label: string;
  tone?: TagTone;
  /** sm = 10pt (list rows), md = 11pt (default), lg = 12pt with 4/12 padding (item detail). */
  size?: 'sm' | 'md' | 'lg';
};

const toneStyle = {
  accent: { backgroundColor: colors.accentRamp[800], color: colors.accentRamp[100] },
  outline: { borderWidth: 1, borderColor: colors.accent, color: colors.accent },
  neutral: { backgroundColor: colors.neutral[800], color: colors.neutral[100] },
} as const;

const sizes = {
  sm: { fontSize: 10, paddingVertical: 2, paddingHorizontal: 7 },
  md: { fontSize: 11, paddingVertical: 3, paddingHorizontal: 10 },
  lg: { fontSize: 12, paddingVertical: 4, paddingHorizontal: 12 },
} as const;

/** Verdict and status tags: accent (Gouge Gap), outline (Sticky Price), neutral (Tracking Fuel). */
export function Tag({ label, tone = 'neutral', size = 'md' }: Props) {
  const { color, ...box } = toneStyle[tone];
  const { fontSize, ...pad } = sizes[size];
  return (
    <View style={[styles.base, box, pad]}>
      <Text
        color={color}
        style={{
          fontSize,
          lineHeight: fontSize * 1.3,
          letterSpacing: em(0.02, fontSize),
          fontFamily: fonts.regular,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignSelf: 'flex-start', borderRadius: 6 },
});
