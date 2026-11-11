# PORTOS V3 — Design tokens and compositional rules

## Brand and tone
Urbanist; premium maritime/industrial workstation. **Not** white SaaS tiles; **not** gaming neon. Surfaces: slate/graphite and low-alpha glass. Single accent warm orange for active object or primary action. Danger/warning not the same as selection.

## Color tokens
| Token | Hex or RGBA | Purpose |
|---|---|---|
| canvas | `#07161B` | ocean/map background |
| surface-1 | `#0E1B1F` | solid panels |
| surface-2 | `#15282B` | raised containers |
| glass | `rgba(14,26,29,.82)` | contextual HUD |
| glass-border | `rgba(231,242,237,.10)` | thin edge |
| text-primary | `#EDF3F0` | body and KPI |
| text-secondary | `#A7B9B8` | supportive copy |
| text-muted | `#829594` | tertiary |
| selection | `#F09A58` | selected item/actions |
| success | `#9CCDB0` | healthy/completed |
| warning | `#E3B86A` | actionable concern |
| danger | `#E87170` | confirmed critical status |
| info | `#80BFC9` | neutral context |

## Type system
- `font-family: Urbanist, Inter, system-ui, sans-serif` loaded legitimately in app.
- Display 40/44 (600), H1 28/34 (600), H2 22/28 (600), section 16/22 (600), body 14/21 (400/500), metadata 12/17 (500). 11px uppercase technical tags only nonessential.
- Tabular numerals on metrics, UTC timestamps, distances and currency. Use unambiguous units and clear source freshness.

## Layout / surface metrics
- Spacing 4px base; 4,8,12,16,20,24,32,40,48,64.
- Header 64px desktop/56px phone; outer screen gutter 24px desktop, 16px tablet, 12px phone.
- Detail panel width 360–464px desktop; mobile bottom sheet with 20%,55%,92% snap points.
- HUD controls height 40px desktop/44px touch; icon optical 16–20px; border radii 8 control,12 card,16 panel.
- Background blur 18px on compact glass panels; use solid higher-opacity fallback.
- Map at least 75–85% available desktop view when drawers closed; camera safe rect adjusts for open overlays.

## Motion specs
- Hover UI 120–160ms; panel 180–260ms; country lift 220–320ms; camera handoff 850–1400ms; highlights no flashing.
- Easing: easeOutCubic for standard UI, damped camera follow, cubic path transitions. Reduced motion supported.

## Prohibitions
No multi-color gradients on every card, giant game HUD decoration, unreadable 10px text, arbitrary animations, full-screen blur filters, text-heavy default panels, impossible ship/port geometry or 3D visuals without data semantics.
