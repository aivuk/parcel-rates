# UX review of the end-to-end screenshots (issue #8)

Screenshots: `frontend/e2e/screenshots/`, captured by `npm run e2e:update-screens`
against `docker compose up` with the sample mix loaded, default controls (2026,
USPS commercial, default fuel, no peak, $9.99) and the default Q1 parcel (3 lb,
12 × 10 × 6 in, 600 miles, to a home, ground). Desktop is 1440 × 900 at 1×,
mobile is 375 × 812 at 2× with touch. Every view is captured full page, scrolled
to the top first, in light and dark.

Reviewed for: the answer as the largest element, readability of numbers,
overflow, tap targets (44 px), chart legibility on a phone, colour-blind
safety, dark mode, loading and empty states, and consistency between views.

Severity: **high** blocks or misleads the user, **medium** slows them down or
hides something, **low** polish. Status: **fixed** (in this branch, recaptured),
**open** (left as is, with the reason).

## Summary of changes made

| # | Finding | Severity | Change |
|---|---|---|---|
| 1 | On phones the answer of every question sat below the first screen (masthead deck plus two rows of tabs pushed it to about 790 px of 812) | high | Masthead deck hidden below 40 rem; the four tabs stay on one row with `--text-xs` labels. The answer figure now starts between about 540 and 650 px on all four views |
| 2 | The phone assumptions bar cut the line with an ellipsis, so "$9.99 charged" (the input behind every margin) was never visible | medium | Bar wraps to two lines (`line-clamp: 2`) |
| 3 | Tap targets under 44 px on touch: "Details" and "Replace CSV" (36 px), quiet buttons such as "Quote 2–3 day", "Show as table", "Done" (40 px), the fuel sliders (16 px track), the flat price input (41 px) | medium | `@media (pointer: coarse)`: `.btn` and the price input `min-height: 44px`, fuel slider track 44 px |
| 4 | Q4 line chart: UPS and FedEx prices are within cents of each other, FedEx is drawn last and hid the UPS line and its square markers completely, in dollars and index scale | medium | UPS line drawn wider (5.5 px) with a larger marker, so it shows as a brown casing around FedEx where they overlap |
| 5 | axe (serious): the fuel table under the Q4 chart scrolls sideways on phones but could not be reached by keyboard; the same latent problem in every "Show as table" view | medium | Both wrappers are focusable `role="region"` with a label |
| 6 | The selected chip's check mark came from CSS `content` and became part of the button name ("✓ Dollars"). `content: "✓" / ""` is mis-read by Chromium 131 ("✓ " / "Dollars") | low | The mark is an `aria-hidden` span |
| 7 | axe (moderate): the phone assumptions bar was outside any landmark | low | `role="region"`, "Current assumptions" |

All 59 functional and axe tests pass on both projects after the changes; the
screenshots in the folder are the recaptured ones.

## Per screenshot

### Q1, typical parcel (`q1-typical-*`)

Works:
- The answer ($8.95, USPS Ground Advantage, "+$1.04 margin against your $9.99
  price") is the largest element and sits directly under the question; the
  margin carries a sign and the word, not only green.
- The ranked rows read at a glance: rank, carrier name in its colour, stacked
  bar (base solid, surcharges hatched, fuel outlined, so the parts differ by
  texture), total and "+$20.95". The open row shows each line item with its
  source file, which is the trust anchor of the whole app.
- "Billed by size, not weight" appears for this default box too (12 × 10 × 6 in
  is 6 lb dimensional for UPS and FedEx), which is correct and teaches the rule
  on the first screen.
- Dark mode: carrier colours keep their contrast; the hatching stays visible.

Issues:
- Phone: the answer was below the fold (finding 1, **fixed**); the
  assumptions bar hid the flat price (finding 2, **fixed**); "Quote 2–3 day"
  and "Quote next day" were 40 px (finding 3, **fixed**).
- The USPS bar in the ranked list is short next to $30 rivals; that is the
  data, the figure next to it carries the number. **Open**, by design.
- "Not a box" checkbox is 20 px, but the whole label (≥ 44 px tall) is the
  target. **Open**, acceptable.

### Q1, bulky parcel (`q1-bulky-*`, 24 × 20 × 18 in, 3 lb)

Works: the answer updates and the size note explains why a 3 lb box is billed
as a much heavier one, with actual, dimensional and billable weight per
service in a compact table that fits 375 px without scrolling.

Issues: none beyond the Q1 items above.

### Q2, breakeven map (`q2-*`)

Works:
- "27 lb" is the answer figure, with a caption naming the distances and the
  rivals, then one sentence per distance band. A reader who never looks at the
  map still gets the answer.
- The map fits 375 px with no horizontal scroll (columns shrink, headers
  abbreviate to "z5"); heavy ink lines mark where USPS stops winning and
  carrier names label each run, so the regions read without colour (blue and
  purple are close under protanopia).
- Dark mode: cells keep their order of intensity; run labels stay legible.

Issues:
- In the 27-50 lb band at zones 5-6 the winner alternates between UPS and
  FedEx almost every pound, so that band is a stack of thin slivers. This is
  the data (the two carriers are within cents of each other there) and the
  sentence above already says "mostly". **Fixed** in #27: UPS and FedEx within
  $0.10 are drawn as a striped tie with its own legend entry, and the dotted
  UPS/FedEx edge the legend describes is back (its style had been lost, so
  those edges were drawn as heavy as the USPS line).
- On phones the "FedEx" run label touches the cell edge at 800 mi. **Fixed**
  in #27: 10 px labels on phones, and a label that would not fit its column is
  left out.
- The saving legend is a grey ramp while the cells ramp in each carrier's hue.
  It reads as "darker = bigger saving" and is the same on every map. **Open**,
  low.

### Q3, blended cost (`q3-*`)

Works:
- "USPS $10.98 per parcel" is the answer, the verdict box answers the owner's
  real question in plain words ("No. You lose $0.31 per parcel with USPS",
  "40 % of parcels (124 of 307) ship at a loss"), in the loss colour with the
  word "loss" on every figure.
- Segment chips are 44 px tall on phones, the selected one has a check mark,
  and the parcel count next to them repeats the segment's result.
- The cost split ranks base, surcharges and fuel per carrier; each row label
  carries its name and shares, so it reads without the legend.

Issues:
- The verdict headline is set large and on a phone wraps to two lines; it is
  still smaller than the answer figure. **Open**, intended (DESIGN.md).
- Surcharge kinds below about 1 % (remote area, extended remote area) are
  slivers too thin to see in the split chart, yet listed in the legend. The
  table view has the numbers. **Fixed** in #27: a kind under 2 % of the
  longest bar folds into "Other surcharges"; the table still lists every kind.
- When one carrier wins every parcel, the best mix repeats it (a three-line
  block and a duplicate margin-table row). **Fixed** in #27: one line, "USPS
  wins every parcel", and no duplicate row.

### Q4, year over year (`q4-*`)

Works:
- "USPS +19.7%" with "$9.17 → $10.98 … announced +16.4 % … 3.3 points more
  than announced" answers the question in one sentence.
- The next-year panel ($11.70 in 2027 at +6.5 %) is raised and separate from
  the chart; the slider is 44 px tall.
- The scale defaults to index on phones, where dollars flatten the USPS slope.
  Points with a note carry "!", and the notes are listed under the chart.

Issues:
- UPS hidden under FedEx in the line chart (finding 4, **fixed**).
- Fuel table not keyboard-scrollable on phones (finding 5, **fixed**).
- The view asks the API twice on open: once with the controls, then with the
  next-year increase the first answer suggests. For about 250 ms the answer is
  dimmed as stale. **Fixed** in #27: the backend applies the default increase
  when the request has none, so the view asks once.
- The driver bars use the warm `--q4-up` colour, close to UPS brown, even when
  the chart is about USPS. The chart title names the carrier and DESIGN.md
  keeps `--q4-up`/`--q4-down` apart from the money colours on purpose.
  **Fixed** in #27: `--q4-up` is a neutral graphite, lighter than `--q4-down`
  in light mode and darker in dark mode.
- The page is long on a phone (about 4,500 px). Each block has its own heading
  and the answer is first, so this is acceptable. **Open**.

### Settings sheet on phones (`settings-sheet-mobile-*`)

Works: opens as a modal dialog over a dimmed page, focus starts inside and is
trapped (tested), Escape and "Done" close it and return focus to "Adjust". The
segmented USPS card control and the price input are large; dark mode keeps the
selected state clear (inverted).

Issues: fuel sliders and "Done" were under 44 px (finding 3, **fixed**).

## Loading and empty states

Not in the screenshot set (captures wait for answers), but covered by tests:
Q3 and Q4 show "Load the sample mix or upload a CSV" with both actions before a
set is loaded (`q3-blended.spec.ts`), Q1 keeps the previous answer dimmed while
the next one loads, and a 422 shows the server's message under the weight
input with `aria-invalid` (`q1-quote.spec.ts`).

## Capture notes

- Captures are deterministic in content (fixed sample, fixed controls,
  reduced motion, CSS transitions finished, charts unchanged for five frames,
  fonts loaded, page scrolled to the top). A recapture can still differ by a
  few thousand anti-aliased pixels, so the images are for review, not pixel
  assertions.
- The README images in `docs/screenshots/` are the desktop light captures
  cropped above the footer and resized to 1200 px wide, plus two phone first
  screens, quantised to 256-colour PNG and passed through `optipng`.
