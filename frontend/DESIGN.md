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

## Questions 3 and 4 (issue #6)

Code: `src/views/blended/` (Q3, plus the pieces Q4 reuses: `common.tsx`,
`money.ts`, `SegmentChips.tsx`, `common.css`) and `src/views/yearly/` (Q4).

**Q3, blended cost.** Answer first: the cheapest single carrier and its blended
cost per parcel (`--text-figure`), the others with their gap, then the
"best mix" (cheapest carrier per parcel) and its saving. Directly under it, the
verdict box answers "does my shipping price cover the cost?" in the money
colour (`--loss` or `--profit` border and wash), `--text-2xl`, with the share of
parcels shipped at a loss and a margin table per carrier (signed amount plus
the word "loss" or "margin", and a loss-share meter). Then the segment chips
(radio-like toggle buttons, 44 px tall, a check mark on the selected one so the
state is not colour alone), which re-query `/api/blended` and repeat the
segment's result next to the parcel count, because the answer above may be off
screen. Then the stacked cost split.

- Cost split colours (tokens in `src/styles/tokens.css`): neutral `--q3-base` for the
  base rate, a single teal ramp `--q3-sur-1..4` for surcharge kinds (darkest =
  largest kind; beyond three kinds they fold into "Other surcharges"), and
  `--q3-fuel` (ink) for fuel. Teal sits outside the carrier and money hues.
  Each carrier's row label carries its name, total and surcharge/fuel shares,
  so the split reads without the legend.

**Q4, year over year.** Answer first: for the carrier cheapest in the latest
year every carrier publishes, the percent change from its first year, with the
dollars and the announced increases compounded over the same years. A
next-year slider (default: that carrier's latest announced increase) sits in a
raised `--sheet` panel with the projected cost. The line chart uses solid
carrier lines with a marker shape per carrier (USPS circle, UPS square, FedEx
triangle; blue and purple are close under protanopia, see the validator note
below), dashed lines for the announced-increase path and dotted segments for
the projection. A "Scale" toggle switches to an index (each carrier's first
year = 100, announced paths and projection indexed the same way); it is the
default on phones, where the dollar gap between USPS and the others flattens
the slopes. Points with a note carry a "!" badge; the notes are listed in
plain words under the chart. "How much of the change is fuel?" sits right
under the chart with a small per-year fuel table. The driver chart is a
diverging bar chart from zero: warm `--q4-up` when a segment made parcels
dearer, cool `--q4-down` when cheaper (neither is the loss/profit pair), sorted
by size. Each row label gives both the contribution to the total (what the
bars show, they add up to the change) and the change per parcel within the
segment ("each", `change_total / parcels`), so a small segment that rose fast
is not hidden by a big one; the sentence names the largest contributor and,
when different, the fastest-rising segment.

**Accessibility.** Every chart is a `<figure>` with a visible text summary as
its caption and a "Show as table" toggle (`aria-pressed`). The chart SVG is
`aria-hidden`; the summary and the table carry the content. Carrier colour is
never alone: names, marker shapes or row labels go with it.

**Colour check.** The dataviz palette validator flags the carrier trio as below
the CVD target (USPS/FedEx ΔE about 5 under protanopia, light and dark), which
DESIGN.md already anticipated; Q3/Q4 therefore always pair carrier colour with
the carrier name or a marker shape.

## Q1 quote and Q2 breakeven views (issue #5)

Code in `src/views/QuoteView.tsx`, `src/views/BreakevenView.tsx` and the folders
`src/views/quote/` and `src/views/breakeven/`, each with its own CSS file. Helpers the
two views share (margin wording, carriers per year, debounce, the view-level note,
error and skeleton classes, the small segmented toggle) live in `src/views/quote/shared.ts`
and `shared.css`; move them to `src/lib` and `src/styles` if Q3/Q4 want them.

**Q1.** The answer (cheapest total for the chosen speed) sits directly under the
question at `--text-figure`, followed by carrier and service at `--text-lg` and the
margin with a sign and the word "margin" or "loss". Below a heavy rule, the form
(left, 17 rem) and the explanation (right) share a two-column grid that stacks under
52 rem. The form prices live with a 300 ms debounce; the previous answer stays visible
at 55 % opacity while the next one loads, so typing never flashes a skeleton. Each
carrier row is a disclosure button: rank, carrier name in its colour, a stacked bar
(base solid, surcharges hatched, fuel wash with an outline, so the three parts differ
by texture and not only by tint), total and the difference to the cheapest. Line items
carry their source under the label in small muted type. Unavailable services are struck
through and muted, with the reason in words. When dimensional weight sets the billable
weight, a ruled note shows actual, dimensional and billable weight per service. Server
422 messages appear under the input they concern, in `--loss`, and the input gets
`aria-invalid`.

**Q2.** The figure is the lightest weight at which USPS Ground Advantage stops being
cheapest, with a caption naming the distances and rivals; one plain sentence per
distance band (neighbouring bands that read the same are merged) follows. The map is a
hand-built SVG: rows are weights, columns the zone-band midpoints, cell colour is the
winner's carrier colour mixed with its wash in four fixed saving steps (under $1,
$1–3, $3–10, $10+), so the legend means the same on every map. A heavy ink line marks
where USPS stops or starts winning and a dotted line where UPS and FedEx swap; runs
tall enough carry the carrier name. Colour is therefore never the only cue. The grid is
a roving-tabindex `role="grid"` (arrows, Home/End, PageUp/PageDown, Escape closes the
tooltip); hover, tap or focus shows every carrier's total. "Show as table" swaps the
map for a sticky-header table. At 375 px the map fits without horizontal scroll (columns
shrink, headers abbreviate to "z5").
