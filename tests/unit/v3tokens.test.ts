import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import v3 from '../../src/styles/tokens.v3.json';
import kitTokens from '../../PORTOS_V3_Design_Engineering_Upgrade/assets/design-tokens.json';
import { inspectorWidthPx } from '../../src/styles/layout';

const css = readFileSync(resolve(__dirname, '../../src/styles/tokens.css'), 'utf-8');
const v3Block = css.slice(css.indexOf(":root[data-theme='v3'] {"));
const v3Root = v3Block.slice(0, v3Block.indexOf('\n}') + 2);

function token(name: string, block = v3Root): string {
  const m = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`missing --${name} in V3 block`);
  const v = m[1].trim();
  const ref = v.match(/^var\(--([\w-]+)\)$/);
  return ref ? token(ref[1], block) : v;
}

function luminance(hex: string) {
  const c = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Composite a translucent glass tier over the darkest and the lightest map surface it can sit on. */
function over(rgba: string, bg: string): string {
  const m = rgba.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  if (!m) return rgba;
  const a = Number(m[4]);
  const b = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
  const out = [1, 2, 3].map((i, k) => Math.round(Number(m[i]) * a + b[k] * (1 - a)));
  return `#${out.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

describe('V3 tokens mirror the kit and tokens.v3.json', () => {
  it('kit colours are unchanged in tokens.v3.json', () => {
    for (const [k, v] of Object.entries(kitTokens.colors)) expect((v3.colors as Record<string, string>)[k], k).toBe(v);
    expect(v3.spacingPx).toEqual(kitTokens.spacingPx);
    expect(v3.simulationSpeedPresets).toEqual(kitTokens.simulationSpeedPresets);
    expect(v3.layout.headerDesktopPx).toBe(kitTokens.layout.headerDesktopPx);
    expect(v3.layout.headerMobilePx).toBe(kitTokens.layout.headerMobilePx);
    expect(v3.radiiPx.panel).toBe(kitTokens.radiiPx.panel);
  });

  it.each([
    ['color-app', v3.colors.canvas],
    ['color-panel', v3.colors.surface1],
    ['color-panel-secondary', v3.colors.surface2],
    ['color-ink', v3.colors.textPrimary],
    ['color-ink-secondary', v3.colors.textSecondary],
    ['color-ink-muted', v3.colors.textMuted],
    ['color-accent', v3.colors.selection],
    ['color-healthy', v3.colors.success],
    ['color-warning', v3.colors.warning],
    ['color-critical', v3.colors.danger],
    ['color-info', v3.colors.info],
    ['color-map-ocean', v3.map.ocean],
    ['color-map-land', v3.map.land],
    ['color-route-base', v3.map.routeBase],
  ])('--%s equals tokens.v3.json', (name, value) => {
    expect(token(name).toLowerCase()).toBe(value.toLowerCase());
  });

  it('font stack starts with Urbanist; header 64 px; panel radius 16 px; blur 18 px', () => {
    expect(token('font-ui')).toMatch(/^'Urbanist Variable', 'Urbanist'/);
    expect(token('shell-header-h')).toBe('64px');
    expect(token('radius-panel')).toBe('16px');
    expect(token('hud-filter')).toContain(`blur(${v3.blurPx}px)`);
    expect(css).toMatch(/@media \(max-width: 767px\) \{\s*:root\[data-theme='v3'\] \{\s*--shell-header-h: 56px;/);
  });

  it('inspector width follows clamp(360px, 29vw, 464px)', () => {
    expect(token('inspector-w')).toBe('clamp(360px, 29vw, 464px)');
    expect(inspectorWidthPx(1440)).toBe(418);
    expect(inspectorWidthPx(1024)).toBe(360);
    expect(inspectorWidthPx(1920)).toBe(464);
  });
});

describe('V3 text contrast (WCAG AA on dark surfaces and glass)', () => {
  const surfaces = () => [token('color-app'), token('color-panel'), token('color-panel-secondary'), over(token('surface-hud'), v3.map.landHover), over(token('surface-inspector'), v3.map.landHover)];

  it.each(['color-ink', 'color-ink-secondary', 'color-ink-muted', 'color-accent-ink', 'color-warning-ink', 'color-unknown-ink', 'color-healthy', 'color-critical', 'color-info'])(
    '%s reaches 4.5:1 on every V3 surface and glass tier over bright land',
    (fg) => {
      for (const bg of surfaces()) expect(contrast(token(fg), bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each([
    ['color-healthy', 'color-healthy-subtle'],
    ['color-critical', 'color-critical-subtle'],
    ['color-info', 'color-info-subtle'],
    ['color-warning-ink', 'color-warning-subtle'],
    ['color-unknown-ink', 'color-unknown-subtle'],
    ['color-accent-ink', 'color-accent-subtle'],
  ])('chip text %s on %s reaches 4.5:1', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it('text on filled orange and filled critical controls reaches 4.5:1', () => {
    expect(contrast(token('color-on-accent'), token('color-accent-fill'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('color-on-critical'), token('color-critical'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('color-on-accent'), v3.data.observed)).toBeGreaterThanOrEqual(4.5);
  });

  it('routes and data roles read as graphics (3:1) on the V3 ocean', () => {
    for (const n of ['color-route-base', 'color-route-selected', 'color-data-observed', 'color-data-planned', 'color-data-uncertain']) expect(contrast(token(n), token('color-map-ocean')), n).toBeGreaterThanOrEqual(3);
    for (const s of v3.data.series) expect(contrast(s, v3.colors.surface1), s).toBeGreaterThanOrEqual(3);
  });

  it('orange is reserved: the accent is not reused as a status colour', () => {
    for (const n of ['color-healthy', 'color-warning', 'color-critical', 'color-info', 'color-unknown']) expect(token(n).toLowerCase()).not.toBe(token('color-accent').toLowerCase());
  });
});

describe('token lint (V3 spec 02/02 G01)', () => {
  const src = resolve(__dirname, '../../src');
  const vueFiles = (readdirSync(src, { recursive: true }) as string[]).filter((p) => p.endsWith('.vue'));
  /** Neutral white/black overlays are allowed; every hue must come from a token. */
  const RAW = /#[0-9a-fA-F]{3,8}\b|rgba?\((?!\s*(255,\s*255,\s*255|0,\s*0,\s*0)\b)/;

  it('Vue styles and templates use token variables, not raw colour literals', () => {
    const offenders: string[] = [];
    for (const f of vueFiles) {
      const text = readFileSync(resolve(src, f), 'utf-8');
      const styles = [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
      const template = text.match(/<template>([\s\S]*)<\/template>/)?.[1] ?? '';
      for (const [where, body] of [['style', styles], ['template', template]] as const)
        body.split('\n').forEach((line, i) => {
          if (RAW.test(line) && !line.includes('token-exempt')) offenders.push(`${f} ${where}:${i + 1} ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
