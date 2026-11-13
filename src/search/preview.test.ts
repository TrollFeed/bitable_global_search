import { describe, it, expect } from 'vitest';
import { buildPreview } from './preview';

describe('buildPreview', () => {
  it('returns short values untouched', () => {
    const matches = [{ start: 2, length: 3 }];
    expect(buildPreview('hello world', matches, 200)).toEqual({
      text: 'hello world',
      matches,
      truncatedStart: false,
      truncatedEnd: false,
    });
  });

  it('keeps a match near the start in view and truncates the tail', () => {
    const value = 'needle ' + 'x'.repeat(400);
    const p = buildPreview(value, [{ start: 0, length: 6 }], 100);

    expect(p.text.startsWith('needle')).toBe(true);
    expect(p.text).toHaveLength(100);
    expect(p.truncatedStart).toBe(false);
    expect(p.truncatedEnd).toBe(true);
    expect(p.matches).toEqual([{ start: 0, length: 6 }]);
  });

  it('windows around a match that sits far past the limit', () => {
    // The old behaviour showed the first 200 chars with nothing highlighted.
    const value = 'a'.repeat(900) + 'NEEDLE' + 'b'.repeat(900);
    const p = buildPreview(value, [{ start: 900, length: 6 }], 200, 40);

    expect(p.text).toContain('NEEDLE');
    expect(p.truncatedStart).toBe(true);
    expect(p.truncatedEnd).toBe(true);
    expect(p.matches).toHaveLength(1);
    expect(p.text.slice(p.matches[0].start, p.matches[0].start + p.matches[0].length)).toBe(
      'NEEDLE'
    );
  });

  it('shifts every kept match and drops those outside the window', () => {
    const value = '0123456789'.repeat(60); // 600 chars
    const p = buildPreview(
      value,
      [
        { start: 300, length: 2 },
        { start: 320, length: 2 },
        { start: 590, length: 2 }, // outside the window
      ],
      100,
      10
    );

    expect(p.matches).toHaveLength(2);
    for (const m of p.matches) {
      expect(p.text.slice(m.start, m.start + m.length)).toBe(value.slice(300, 302));
    }
  });

  it('clamps a match that straddles the end of the window', () => {
    const value = 'x'.repeat(300);
    // lead 90 puts the window at [0, 100); the match runs 90..120.
    const p = buildPreview(value, [{ start: 90, length: 30 }], 100, 90);

    expect(p.text).toHaveLength(100);
    expect(p.matches).toEqual([{ start: 90, length: 10 }]);
  });

  it('never splits a surrogate pair at either edge', () => {
    // 😀 is two code units. Place pairs exactly on both cut points.
    const value = 'a'.repeat(39) + '😀' + 'b'.repeat(50) + '😀' + 'c'.repeat(200);
    const p = buildPreview(value, [{ start: 41, length: 3 }], 92, 2);

    const first = p.text.charCodeAt(0);
    const last = p.text.charCodeAt(p.text.length - 1);
    expect(first >= 0xdc00 && first <= 0xdfff).toBe(false); // not a lone low surrogate
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false); // not a lone high surrogate
  });

  it('uses the earliest match as the anchor even when ranges are unsorted', () => {
    const value = 'x'.repeat(500) + 'A' + 'y'.repeat(500) + 'B' + 'z'.repeat(100);
    const p = buildPreview(
      value,
      [
        { start: 1001, length: 1 },
        { start: 500, length: 1 },
      ],
      100,
      10
    );

    expect(p.text).toContain('A');
  });

  it('handles a long value with no matches by showing its head', () => {
    const p = buildPreview('x'.repeat(500), [], 100);
    expect(p.text).toHaveLength(100);
    expect(p.truncatedStart).toBe(false);
    expect(p.truncatedEnd).toBe(true);
    expect(p.matches).toEqual([]);
  });
});
