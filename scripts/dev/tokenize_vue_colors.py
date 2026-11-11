#!/usr/bin/env python3
"""One-off migration (V3 Gate 1): replace raw colour literals in Vue <style> blocks with token variables.

Only the CSS inside <style> is rewritten; script-side MapLibre paint values stay as they are. Translucent
literals become `color-mix(in srgb, var(--token) N%, transparent)` so both themes resolve their own hue.
Run from the repo root: python3 scripts/dev/tokenize_vue_colors.py
"""
import pathlib
import re

RGBA = {
    (7, 26, 39): '--map-scrim',
    (10, 18, 28): '--map-scrim',
    (16, 40, 55): '--map-scrim',
    (247, 250, 252): '--color-ink-on-dark',
    (207, 225, 234): '--map-line',
    (211, 221, 227): '--map-line',
    (159, 193, 209): '--map-line',
    (196, 226, 232): '--map-line',
    (233, 103, 34): '--color-accent',
    (230, 106, 45): '--color-accent',
    (212, 154, 46): '--color-warning',
    (182, 123, 23): '--color-warning',
    (198, 59, 59): '--color-critical',
    (201, 58, 58): '--color-critical',
    (127, 139, 148): '--color-data-planned',
    (166, 169, 180): '--color-data-uncertain',
    (19, 25, 30): '--color-ink',
    (125, 147, 161): '--color-unknown',
    (90, 173, 183): '--color-data-observed',
    (27, 52, 66): '--map-scrim',
}
HEX = {
    '#e66a2d': 'var(--color-accent)',
    '#13191e': 'var(--color-ink)',
    '#5aadb7': 'var(--color-data-observed)',
    '#2f7f89': 'var(--color-data-observed)',
    '#8c98a1': 'var(--color-data-planned)',
    '#7f8b94': 'var(--color-data-planned)',
    '#a6a9b4': 'var(--color-data-uncertain)',
    '#8a8e9a': 'var(--color-data-uncertain)',
    '#2e9c84': 'var(--color-healthy)',
    '#147a66': 'var(--color-healthy)',
    '#c63b3b': 'var(--color-critical)',
    '#d49a2e': 'var(--color-warning)',
    '#b67b17': 'var(--color-warning)',
    '#c9a227': 'var(--color-warning)',
    '#8a5a0c': 'var(--color-warning-ink)',
    '#071a27': 'var(--color-map-ocean)',
    '#03080d': 'var(--color-space)',
    '#d97a72': 'var(--map-incident)',
    '#c98a4f': 'var(--map-risk)',
    '#dcb27f': 'var(--map-delayed)',
    '#e7a64f': 'var(--map-warning-soft)',
    '#d9c46a': 'var(--map-caution)',
    '#e8eef2': 'var(--color-ink-on-dark)',
    '#f7fafc': 'var(--color-ink-on-dark)',
    '#f1c9c4': 'color-mix(in srgb, var(--color-critical) 40%, transparent)',
}

rgba_re = re.compile(r'rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)')
hex_re = re.compile(r'#[0-9a-fA-F]{6}\b')


def sub_rgba(m: re.Match) -> str:
    key = tuple(int(m.group(i)) for i in (1, 2, 3))
    var = RGBA.get(key)
    if not var:
        return m.group(0)
    pct = round(float(m.group(4)) * 100)
    return f'color-mix(in srgb, var({var}) {pct}%, transparent)'


def sub_hex(m: re.Match) -> str:
    return HEX.get(m.group(0).lower(), m.group(0))


changed = 0
for path in pathlib.Path('src').rglob('*.vue'):
    text = path.read_text()
    parts = re.split(r'(<style[^>]*>|</style>)', text)
    inside = False
    for i, p in enumerate(parts):
        if p.startswith('<style'):
            inside = True
            continue
        if p == '</style>':
            inside = False
            continue
        if inside:
            parts[i] = hex_re.sub(sub_hex, rgba_re.sub(sub_rgba, p))
    new = ''.join(parts)
    if new != text:
        path.write_text(new)
        changed += 1
        print('updated', path)
print(changed, 'files')
