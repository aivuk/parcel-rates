# Visual direction: the shipping label

The dashboard reads like the one printed object every parcel sender already
knows: the shipping label. Stark white stock, heavy black rules that cut the
page into zones, condensed bold figures, receipt-style monospaced line items,
and a single accent, safety orange, that appears only when the answer is a loss.

It replaces the earlier "shipping ledger" direction (warm cream paper, a soft
newspaper serif), which read like a generic AI-product page; see
`docs/DECISIONS.md`, 2026-10-23, "Shipping-label redesign".

## Why it fits

The user is a shop owner deciding where a few dollars per parcel go. A label
is built to be read in a second at arm's length: the service class sits in a
black box, the zones are separated by thick rules, and everything else is
small, uppercase and orderly. That is exactly the hierarchy the dashboard
needs: the answer in the largest, heaviest type; the assumptions in a strip of
small labelled values like a label's header; the evidence (line items, rates,
citations) in a monospaced receipt underneath. Nothing on the page is
decoration except the barcode stripe in the header, which is the one cue that
says "label" before a word is read.

## Hierarchy

1. **The answer** (cheapest carrier, cost per parcel, margin): Barlow Condensed
   700, `--text-figure`, tabular figures. On Q3 and Q4 the figure is a
   **stamp**: paper-coloured figure on an ink block, like the service-class box
   on a label (`.answer__figure--stamp`).
2. **The question** each section answers: Barlow Condensed 600, `--text-xl`.
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
4. **Assumptions** (year, rate card, fuel, peak, flat price): on desktop a
   **label header strip** across the top of the page, under the masthead:
   uppercase `--text-xs` labels, bold values, no card or border box, one heavy
   rule beneath. Below 64 rem it is the bottom sheet behind a one-line summary
   bar, as before.

## Zones and rules

The page is divided like a label: **2 px ink rules (`--rule-heavy`) between
major zones** (masthead, assumptions strip, parcel set, question tabs, each
block inside a question) and **1 px hairlines (`--rule`) inside tables and
lists**. No cards, no shadows on the page itself, square corners
(`--radius: 0`). The only shadow is the mobile sheet, which really does sit
above the page.

## Palette (`src/styles/tokens.css`)

Cool neutrals only: no cream or warm cast on any surface in either theme.

| Token | Light | Dark | Use | Contrast on `--paper` (light / dark) |
|---|---|---|---|---|
| `--paper` | `#FFFFFF` | `#0F1113` | page | — |
| `--sheet` | `#F3F4F2` | `#191C1F` | strip inputs, sheet, raised panels | — |
| `--ink` | `#111111` | `#ECEEEA` | text, heavy rules, stamp block, focus ring | 18.9 / 16.2 |
| `--ink-muted` | `#5B6066` | `#A6ACB2` | secondary text, labels | 6.3 / 8.3 (5.8 / 7.5 on `--sheet`) |
| `--rule` | `#D3D6D9` | `#34393E` | hairlines inside tables and lists | — |
| `--carrier-usps` | `#1F4E9A` | `#7FA8EE` | USPS everywhere | 8.0 / 7.9 |
| `--carrier-ups` | `#7A4E0F` | `#D9A35A` | UPS everywhere | 7.2 / 8.4 |
| `--carrier-fedex` | `#9C2A7E` | `#E68AC9` | FedEx everywhere | 6.9 / 8.0 |
| `--accent` | `#E8590C` | `#E8590C` | the loss verdict only (rule, figure ≥ 24 px) | 3.6 / 5.3 |
| `--loss` | `#C2410C` | `#E8590C` | small loss text (tables, "loss", errors) | 5.2 / 5.3 |
| `--profit` | `#1D6B3F` | `#6FCB94` | positive margin | 6.5 / 9.6 |
| `--mock` | `#8A5A00` | `#E8B860` | the mock-data banner only | 5.9 / 10.3 |

Ratios were measured with the WCAG 2 relative-luminance formula and are
against `--paper`; every text colour also clears 4.5:1 on `--sheet`
(lowest: `--loss` 4.7 light, `--accent` 4.8 dark). `--accent` on white is
3.6:1, so in light mode it is used only for the verdict figure (≥ 24 px bold,
AA large text needs 3:1) and the verdict rule (non-text, 3:1); smaller loss
text uses `--loss`, the same orange darkened to pass 4.5:1. The pink wash
behind the verdict is gone: the verdict is a white zone with a heavy accent
rule.

Carrier hues follow the brands loosely (postal blue, brown, purple) so the
owner recognises them without a legend. Blue and purple are close for some
colour-vision deficiencies, so colour is never the only cue: every carrier
mark carries its name or initial, and money always carries a sign and the word
"loss" or "margin". Inside a stamp, the carrier name sits in a small carrier-
coloured box with paper-coloured text (white on the carrier colour: 8.0 / 7.2
/ 6.9 in light; dark text on the light carrier tints in dark mode), because
the carrier colours themselves are too dark to read on the ink block.

Each carrier also has a `-wash` tint for backgrounds and heatmap cells
(issue #5 mixes between the wash and the full colour). The washes are clean,
hue-true tints chosen for white paper, not the old beige-cast ones: USPS
`#D6E4FB` / `#18233A`, UPS `#F6DCAE` / `#2C2318`, FedEx `#F8D3EE` / `#301A2B`
(light / dark). The Q2 heatmap mixes them in oklch and its lightest saving
step keeps 45 % of the carrier colour, so no cell goes pastel on white.
The washes appear only mixed into heatmap cells, never on their own: the Q1
bars fill the surcharge hatch and the fuel segment with the neutral `--wash`
and an outline in the carrier colour, so no warm tint (the UPS wash is a light
brown) shows anywhere as a surface.

## Type

- **Barlow Condensed** 600 and 700 (`--font-display`) for questions, figures
  and the stamp. A condensed grotesque is what labels use for service class
  and tracking text; it sets big numbers narrow, so the answer can be large on
  a phone.
- **IBM Plex Sans** 400, 500 and 600 (`--font-ui`) for the interface: labels,
  controls, captions.
- **IBM Plex Mono** 400 and 500 (`--font-mono`) for line items, tables and
  citations, receipt style.

One Google Fonts request for the three families, only the weights above, with
`display=swap`; fallbacks are Arial Narrow, Helvetica/Arial and the system
monospace. Every figure uses `font-variant-numeric: tabular-nums` so columns
of prices line up (set on `body`, repeated on figure classes).

## Spacing and shape

A 4 px base (`--space-1` … `--space-8`: 4, 8, 12, 16, 24, 32, 48, 72 px) with a
deliberate jump to 48-72 px between sections, so sections read as zones.
Corners are square. Separation comes from rules, not from boxes or shadows.

## Texture

One CSS-generated barcode stripe (`repeating-linear-gradient` of uneven ink
bars) in the masthead, `aria-hidden`, at reduced opacity. It is the only
decorative element on the page; nothing else carries texture.

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

Code: `src/views/blended/` (Q3) and `src/views/yearly/` (Q4). The pieces every
view shares live in one place: formatting and margin wording in `src/lib/format.ts`,
carrier names, colours and years in `src/lib/carriers.ts`, hooks (`useDebounced`,
`useLastData`, `useCssColors`) in `src/hooks/`, UI (`ChartFrame`, `ChipGroup`,
`NeedParcels`, `LoadProblem`) in `src/components/`, and their CSS in
`src/styles/views.css`, `chips.css` and `chart.css`.

**Q3, blended cost.** Answer first: the cheapest single carrier and its blended
cost per parcel (`--text-figure`), the others with their gap, then the
"best mix" (cheapest carrier per parcel) and its saving. Directly under it, the
verdict answers "does my shipping price cover the cost?" under a heavy rule in
the money colour (`--accent` for a loss, `--profit` otherwise; no wash), figure
at `--text-2xl` in the same colour, with the share of
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
two views share with Q3 and Q4 (margin wording, carriers per year, debounce, the
view-level note, error and skeleton classes, the small segmented toggle) live in
`src/lib/`, `src/hooks/` and `src/styles/views.css` (see Questions 3 and 4 above).

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
