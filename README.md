# Auto Portal — Static Prototype

Indian automotive consumer portal prototype, built as standalone HTML files
(no backend required). Pure white + soft gray palette with oxblood accent.

## Active production files (28)

### Cars (11)
- homepage-final.html      — main car homepage (CURRENT)
- model-page.html          — Tata Curvv EV model detail
- variant-page.html        — full variant table for Curvv EV
- brand-page.html          — all-Tata listing
- budget-page.html         — "cars under ₹X" browser with filters
- on-road-price.html       — city-wise breakdown with RTO + insurance
- compare-page.html        — side-by-side comparison
- reviews-page.html        — user reviews aggregator
- write-review.html        — review submission form
- news-page.html           — news index
- news-article.html        — single news article

### Bikes (11)
Same structure, all prefixed with `bike-`. Anchor model: Royal Enfield Hunter 350.

### Upcoming (2)
- upcoming-page.html       — index of upcoming launches (CURRENT)
- upcoming-model-page.html — Tata Harrier EV (anchor)

### Tools (4)
- byc.html                 — Build Your Car configurator (8-step wizard, inlined jQuery)
- all-brands.html          — brand directory (cars + bikes toggle)
- 404.html                 — error page
- admin-panel.html         — internal admin (dark theme, intentional)

## Legacy / older variants (7) — superseded but included for reference

These were earlier homepage iterations that are no longer linked from anywhere
in the active set. Safe to delete, kept here in case you want to reference
earlier design directions:

- index.html                       — earliest static landing
- homepage-universe.html           — universe-style homepage v1
- homepage-universe-fast.html      — universe v2 with perf tweaks
- homepage-trending-mockup.html    — trending-section mockup
- homepage-trending-swipe.html     — trending swipe-carousel variant
- homepage-with-menu.html          — mega-menu nav exploration
- upcoming-cars.html               — older upcoming page

The current homepage is `homepage-final.html`; the current upcoming page is `upcoming-page.html`.

## Design system

- Background: `#ffffff` (pure white) / `#f5f6f8` (soft gray alt sections)
- Surface: `#ffffff` with `#e9ebee` borders
- Accent: `#8b1820` (oxblood) — primary brand color
- Text: `#1a1410` (ink) / `#52525b` (soft) / `#94949c` (faint)
- Fonts: Apple system stack + display serif fallback (no monospace anywhere; small caps labels use the sans stack)
- NO italics anywhere — use color/weight/underline instead
- Always use `[Brand]` placeholder, never a client name

## Anchors

These are the only models with full data populated:
- Car: **Tata Curvv EV** (8 variants, ₹17.49 L – 21.99 L)
- Bike: **Royal Enfield Hunter 350**
- Upcoming: **Tata Harrier EV**

Click-throughs from other models route back to these so the prototype feels connected.

## Build Your Car (BYC) module

Originated from a separate PHP/MySQL deploy bundle. The static version inlined
in `byc.html` is the design-preview build with jQuery bundled into the file
(works offline on file:// protocol). The PHP deploy bundle for a real server
exists separately and is NOT in this zip — re-upload `byc-deploy.zip` if you
want the production backend.

Key BYC features:
- 2 paths: "I know my model" (4 steps) / "Help me discover" (8 steps)
- Start over button (top-right corner of wizard, toast-undo, no native confirm)
- Smart step skip — picking brand+model skips priorities/body/power/matches steps
- Intent scoring at the end determines hot/warm/cool/cold lead routing

## How to use locally

1. Drop all files into a single folder
2. Open any `.html` file directly in your browser (file:// works fine — no server needed)
3. All links between pages are relative, so the navigation works as expected

## Continuing in Cowork

1. Point a Cowork project at this folder
2. Cowork can read/edit/create files directly — no need to re-upload or copy-paste
3. Memory persists across sessions inside the Cowork project

## Recent updates in the active set

- Pure white + soft gray palette across all 35 files
- Smart Notable Features section on model-page (5 standout features for Curvv EV)
- Toggle-chip features filter on budget-page and brand-page
- BYC: Start over button with undo toast, smart step routing
- ORP city tiles redesigned with arrow + "View price breakdown" CTA
- New: 404 page and all-brands directory page
