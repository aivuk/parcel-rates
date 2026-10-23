# Visual direction: the shipping ledger

The dashboard reads like a printed price sheet or a merchant's ledger, not like
a SaaS dashboard. Warm paper, black ink, hairline rules, figures set in a
newspaper serif, and colour reserved for meaning.

## Why it fits

The user is a shop owner deciding where a few dollars per parcel go. The
decision lives in a handful of numbers: which carrier is cheapest, what one
parcel costs, whether the flat price still leaves a margin. A ledger puts those
numbers first, in the largest type on the page, and pushes everything else
(assumptions, sliders, provenance) into small, quiet type around them. Rules
and columns instead of cards make it feel like an account the owner keeps, and
they print well for an accountant.

## Hierarchy

1. **The answer** (cheapest carrier, cost per parcel, margin): display serif,
   `--text-figure`, tabular figures, carrier or money colour.
2. **The question** each section answers: display serif, `--text-xl`.
3. **The owner's parcel set**: once loaded, a one-line strip (count, share to
   homes, speed split) with the full summary behind "Details", so the
   questions and the answer stay above the fold, also on a phone.

### Rule for every question view (issues #5 and #6)

The answer is the largest element of its section. Put it first under the
question, in `.answer > .answer__figure` (`--text-figure`), with a short
`.answer__caption` saying what it is ("UPS Ground, $8.41 per parcel, $1.58
margin"). Nothing else in the section, including the question (`--text-xl`),
chart titles and table figures, may be set larger. Charts and tables come
after the answer and explain it.
4. **Assumptions** (year, rate card, fuel, peak, flat price): a left rail in the
   UI face at `--text-sm`, always visible on desktop, a bottom sheet on phones
   behind a one-line summary bar.

## Palette (`src/styles/tokens.css`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#F5F1E8` | `#15140F` | page |
| `--sheet` | `#FBF9F4` | `#1E1C17` | rail, inputs, raised panels |
| `--ink` | `#1C1B18` | `#EDE8DC` | text, rules, focus ring |
| `--ink-muted` | `#5E5A50` | `#A9A292` | secondary text (6.1:1 / 7.3:1) |
| `--carrier-usps` | `#1F4E9A` | `#7FA8EE` | USPS everywhere (7.1:1 / 7.7:1) |
| `--carrier-ups` | `#7A4E0F` | `#D9A35A` | UPS everywhere (6.4:1 / 8.2:1) |
| `--carrier-fedex` | `#9C2A7E` | `#E68AC9` | FedEx everywhere (6.1:1 / 7.8:1) |
| `--loss` | `#B3261E` | `#F2877E` | negative margin (5.8:1 / 7.5:1) |
| `--profit` | `#1D6B3F` | `#6FCB94` | positive margin (5.8:1 / 9.4:1) |
| `--mock` | `#8A5A00` | `#E8B860` | the mock-data banner only |

Contrast ratios are against `--paper` and meet WCAG AA for body text in both
themes. Carrier hues follow the brands loosely (postal blue, brown, purple)
so the owner recognises them without a legend. Blue and purple are close for
some colour-vision deficiencies, so colour is never the only cue: every
carrier mark carries its name or initial, and money always carries a sign and
the word "loss" or "margin".

Each carrier also has a `-wash` tint for backgrounds and heatmap cells
(issue #5 scales intensity between the wash and the full colour).

## Type

- **Newsreader** (display serif, optical sizes) for questions and figures.
  A newspaper face gives the editorial voice and has good tabular numerals.
- **IBM Plex Sans** for the interface: labels, controls, tables. Industrial,
  slightly technical, legible at 12-14 px.

Both load from Google Fonts with `display=swap`; fallbacks are Georgia and
Helvetica/Arial. All figures use `font-variant-numeric: tabular-nums` so
columns of prices line up.

## Spacing and shape

A 4 px base (`--space-1` … `--space-8`: 4, 8, 12, 16, 24, 32, 48, 72 px) with a
deliberate jump to 48-72 px between sections, so sections read as chapters.
Corners are nearly square (`--radius: 2px`). Separation comes from hairline
rules (`--rule`) and one heavy rule under the masthead and active tab, not
from shadows; the only shadow is on the mobile controls sheet, which really
does sit above the page.

## Motion

Only opacity and transform, 120-220 ms, for the sheet and tab underline. All
of it is disabled under `prefers-reduced-motion: reduce`.

## Charts (for issues #5 and #6)

- Use the carrier tokens for series and cells; read them in JS with
  `getComputedStyle(document.documentElement).getPropertyValue("--carrier-usps")`
  or the `carrierColor()` helper in `src/lib/carriers.ts`, so dark mode works.
- Axis text in `--ink-muted`, gridlines in `--rule`, no chart borders.
- Announced increases and projections are dashed lines in the carrier colour.
