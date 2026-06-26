# Extension — live verification checklist

The automated test (`apps/web/tests/extension-dom-shadow.test.mjs`,
`node tests/extension-dom-shadow.test.mjs` from `apps/web`) proves the
shadow-DOM piercing in `dom.js`. The items below need a **real browser with the
extension loaded and real ATS logins** — they can't be checked headlessly.

## Setup
1. `chrome://extensions` → enable Developer mode → **Load unpacked** → select `apps/extension`.
2. Open the popup → connect with an **AM code** → pick a **seeker** who has
   screening answers configured (incl. `sponsorship`).
3. Keep the **background service worker console** open (Inspect views: service
   worker) to watch run logs, and DevTools on the page frame.

## 1. Embedded ATS iframe (all-frames + election) — Greenhouse/Lever embed
- Open a company **careers page that embeds Greenhouse/Lever** (form lives in an `iframe`).
- Trigger apply. **Expected:** the form **inside the iframe** gets filled; the
  runner sidebar appears in that iframe; the top frame does **not** also run
  (no duplicate fills). In the SW console you should see one run, not several.

## 2. Shadow-DOM ATS — Workday
- Open a **Workday** posting (`*.myworkdayjobs.com`).
- Trigger apply. **Expected:** fields rendered in web components are detected and
  filled (this is the shadow-DOM path the jsdom test covers mechanically).

## 3. Top-frame app — LinkedIn Easy Apply
- Open a LinkedIn job with **Easy Apply** (no embedded ATS iframe).
- Trigger apply. **Expected:** the **top frame** runs (election lets it, since no
  ATS iframe is present); Easy Apply modal fields fill.

## 4. Duplicate-apply guard
- Apply to a job and let it reach **Applied**.
- Try to apply to the **same job** again (from Matches/Apply).
- **Expected:** popup shows *"This job is already marked applied."* and **no second
  submission** happens.

## 5. Screening correctness
- For a seeker whose `sponsorship` screening answer is e.g. *"Yes, I need sponsorship"*,
  apply to a job that asks about sponsorship.
- **Expected:** the form is answered with the **seeker's** answer, not a blanket "No".
  (EEO questions with no seeker answer → "Prefer not to answer"; work-auth → "Yes".)

## 6. Branding
- Popup header shows the **violet orbit + orange sparkle** mark and the two-tone
  **Job**(violet)/**Genius**(orange) wordmark; controls are violet, not indigo/blue.
- Autofill modal header is a **violet→orange** gradient.
- (Optional) run `npm install canvas && node generate-icons.js` in `apps/extension`,
  add the printed snippet to `manifest.json`, reload → toolbar icon appears.

## 7. Apply Health dashboard (AM-facing)
- In the AM dashboard: **Pipeline → Apply Health** (`/dashboard/apply-health`).
- **Expected:** stat cards (runs / applied / success rate / need you / failed /
  running), a **Needs you** table with humanized blockers, and **By ATS** + **By
  seeker** breakdowns scoped to *your* assigned seekers.

## What to watch for (regressions)
- More than one frame running on a single apply (election bug).
- Fields left blank on a Workday/web-component form (shadow-DOM regression).
- A second submission on an already-applied job (dup-apply regression).
- Instant, robotic fill with no scroll (pacing not applied).
