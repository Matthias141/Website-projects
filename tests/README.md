# Site visual/functional checks

Repeatable checks for the deployed site, replacing one-off phone screen
recordings with something that runs the same way every time.

## Setup
```bash
npm install
npx playwright install chromium   # downloads a real browser, needs real
                                    # network access
```

## First run — generate baselines
```bash
npm run test:e2e:update-baselines
```
This "fails" the Tier 2 tests (no baseline existed yet) but writes the
actual screenshots to `tests/visual-check.spec.js-snapshots/`. Look at them
by hand once — this is the one point a human needs to actually confirm
"yes, this is correct" — then commit them to the repo.

## Every run after that
```bash
npm run test:e2e
```
Tier 1 (functional) always runs for real. Tier 2 (visual) diffs against
the committed baselines and fails on unexpected pixel changes.

## Viewing the HTML report after a run
```bash
npm run test:e2e:report
```

## Known limitation — read before trusting Tier 2 blindly
The debris field's scatter layout uses unseeded `Math.random()` at mount
time (see `src/Sculpture.jsx`), so it's different on every page load — even
with reduced-motion freezing further animation. `maxDiffPixelRatio: 0.05`
absorbs some of that noise, but Tier 2 failures need a human glance to
tell "real regression" from "debris just landed differently this time"
until debris generation is seeded behind a test-mode flag. This is a
separately-scoped follow-up, not yet implemented.

## CI
`.github/workflows/e2e.yml` runs Tier 1 + Tier 2 against `main` on every
push, plus manual dispatch from the Actions tab. `SITE_URL` defaults to
the production URL but can be overridden via a repository variable of the
same name if this ever needs to target a preview deployment. On failure,
the HTML report and diff/actual images are uploaded as a workflow
artifact — no need to reproduce locally to see what broke.
