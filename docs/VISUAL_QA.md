# Visual QA

Baselines are real renders of the built app (WebGL globe and MapLibre port map), captured by
`tests/e2e/visual.spec.ts` with Playwright Chromium (SwiftShader WebGL), clean demo storage, simulated time
2026-11-09 12:00 UTC (08 uses 10:59 UTC). Every run compares against them with a 1 % pixel tolerance.

```bash
npx playwright test visual                          # compare
npx playwright test visual --update-snapshots=all   # re-baseline after an intended visual change
```

| # | View | Route | 1440 × 900 | 1920 × 1080 |
|---|---|---|---|---|
| 01 | Earth | `/operations` | `tests/visual/01-earth-desktop.png` | `01-earth-1920.png` |
| 02 | Selected cluster (stack picker) | `/region/REG-SEA` + largest cluster | `02-selected-cluster-desktop.png` | `02-selected-cluster-1920.png` |
| 03 | Region | `/region/REG-SEA` | `03-region-desktop.png` | `03-region-1920.png` |
| 04 | Singapore port (2D) | `/port/PRT-SIN?view=2d` | `04-singapore-port-desktop.png` | `04-singapore-port-1920.png` |
| 05 | Selected vessel | `/vessel/VSL-0001` | `05-vessel-desktop.png` | `05-vessel-1920.png` |
| 06 | Investigation drawer (Evidence) | `/incidents/INC-0001` | `06-investigation-desktop.png` | `06-investigation-1920.png` |
| 07 | Route comparison | `/compare/VYG-0001` | `07-route-comparison-desktop.png` | `07-route-comparison-1920.png` |
| 08 | Replay at the INC-0001 detection | `/replay/VYG-0001?t=2026-11-09T10:59:00Z` | `08-replay-desktop.png` | `08-replay-1920.png` |

Responsive and failure-state evidence: `docs/screenshots/phase8-1280-port.png`, `phase8-tablet-1024-sheet.png`,
`phase8-tablet-768-sheet.png`, `phase8-narrow-list.png`, `phase8-webgl-unavailable.png`, `phase8-context-lost.png`,
`phase8-tiles-unavailable.png`.

## Checklist (reviewed against the baselines above)

| Check | Result |
|---|---|
| Map is a live render, never a screenshot substitute | Pass: canvas + `renderer.info` asserted in E2E (`Earth first paint renders the globe through WebGL`) |
| Vessel symbols proportional and readable at each zoom | Pass: screen-sized instanced glyphs, LOD by distance; clusters above density threshold (01–03) |
| White panels readable over the dark map | Pass: opaque panels with `--shadow-panel`, no translucency behind text |
| 8 px spacing rhythm and repeated component dimensions | Pass: `--space-*` tokens; KPI row, queue cards and inspector share padding and radius |
| No clipped text | Pass at 1440 and 1920. Long vessel/terminal names ellipsize with the full name in the inspector |
| No overlapping flyouts | Pass after fix: the 2D attribution now wraps beside the open inspector instead of running into the legend (06) |
| No neon HUD flourishes | Pass: token palette only (D-002); no glow, bloom or chase lights |
| Orange means "selected / needs review" only | Pass: accent on selection, primary action and active tab; statuses use the status palette |
| Selected markers use more than hue | Pass: selection ring + larger glyph on the globe; ring + label in 2D |
| Text contrast ≥ 4.5:1 on light surfaces | Pass: `tests/unit/contrast.test.ts` (D-026). Kit hues that failed as small text now have AA "ink" variants |
| Responsive 1280 × 800 | Pass: header compacts labels to icons; queue and inspector keep full width |
| Responsive 1024 × 768 and 768 × 900 | Pass: inspector becomes a bottom sheet (46 % height, 30 % with the replay rail), map stays central, map tools move top-right |
| Below 768 px | Pass: map hidden (still mounted), note explains why; queue, search and inspector remain usable (`phase8-narrow-list.png`) |
| 200 % zoom (720 × 450 CSS px) | Pass: search, inspector values and close controls reachable (E2E) |
| Reduced motion | Pass: camera flights instant, drawer/sheet animations off, replay updates discretely (E2E) |
| Screen-reader alternative to canvas data | Pass: exception queue, port queue, cluster stack list, KPI drill rows and search expose the same entities as lists with accessible names |
| Keyboard | Pass: no trap across header, map controls and inspector; Escape closes the inspector; `/` focuses search (E2E) |

## Known visual gaps

- At tablet widths with both the replay rail and the inspector sheet open, the visible map band is small (about a
  quarter of the height). Closing either restores it.
- Baselines use SwiftShader; a hardware GPU renders anti-aliased lines slightly differently, so re-baseline when
  switching the CI renderer.
- Basemap tiles come from the public OpenFreeMap service; an upstream style or data change can move the 04 baseline
  beyond tolerance without any code change.
