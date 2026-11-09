import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../../src/styles/tokens.css'), 'utf-8');

function token(name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`missing --${name}`);
  const v = m[1].trim();
  const ref = v.match(/^var\(--([\w-]+)\)$/);
  return ref ? token(ref[1]) : v;
}

function luminance(hex: string) {
  const c = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const SURFACES = ['color-panel', 'color-app', 'color-panel-secondary'];

describe('text contrast (WCAG AA)', () => {
  it.each(['color-ink', 'color-ink-secondary', 'color-ink-muted', 'color-accent-ink', 'color-warning-ink', 'color-unknown-ink', 'color-healthy', 'color-critical', 'color-info'])(
    '%s reaches 4.5:1 on every light surface',
    (fg) => {
      for (const bg of SURFACES) expect(contrast(token(fg), token(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each([
    ['color-healthy', 'color-healthy-subtle'],
    ['color-critical', 'color-critical-subtle'],
    ['color-info', 'color-info-subtle'],
    ['color-warning-ink', 'color-warning-subtle'],
    ['color-unknown-ink', 'color-unknown-subtle'],
    ['color-accent-ink', 'color-accent-subtle'],
  ])('status chip text %s on %s reaches 4.5:1', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it('white text on filled accent and critical controls reaches 4.5:1', () => {
    expect(contrast('#ffffff', token('color-accent-fill'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', token('color-critical'))).toBeGreaterThanOrEqual(4.5);
  });

  it('on-map text and routes stay legible against the ocean', () => {
    expect(contrast(token('color-ink-on-dark'), token('color-map-ocean'))).toBeGreaterThanOrEqual(7);
    expect(contrast(token('color-route-base'), token('color-map-ocean'))).toBeGreaterThanOrEqual(3);
  });

  it('raw kit hues that fail for small text are not used as text colours', () => {
    expect(contrast(token('color-accent'), token('color-panel'))).toBeLessThan(4.5);
    const src = resolve(__dirname, '../../src');
    const offenders = (readdirSync(src, { recursive: true }) as string[])
      .filter((p) => /\.(vue|css)$/.test(p))
      .filter((p) => /(?<![-\w])color: var\(--color-(accent|accent-hover|warning|unknown)\)/.test(readFileSync(resolve(src, p), 'utf-8')));
    expect(offenders).toEqual([]);
  });
});
