import { describe, expect, test } from '@jest/globals';

import { alpha, colors, em, type } from '@/theme';

describe('alpha', () => {
  test('converts hex + opacity to rgba', () => {
    expect(alpha('#9184d9', 0.14)).toBe('rgba(145,132,217,0.14)');
    expect(alpha('#E9E9ED', 1)).toBe('rgba(233,233,237,1)');
  });
  test('clamps opacity and rejects other formats', () => {
    expect(alpha('#000000', 2)).toBe('rgba(0,0,0,1)');
    expect(() => alpha('red', 0.5)).toThrow();
  });
});

describe('tokens', () => {
  test('divider is text at 16%', () => {
    expect(colors.divider).toBe('rgba(233,233,237,0.16)');
  });
  test('em converts tracking to points', () => {
    expect(em(-0.015, 28)).toBeCloseTo(-0.42);
  });
  test('headings never exceed weight 500', () => {
    for (const style of Object.values(type)) {
      expect(['Inter_400Regular', 'Inter_500Medium']).toContain(style.fontFamily);
    }
  });
});
