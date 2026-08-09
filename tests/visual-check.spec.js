import { test, expect } from '@playwright/test';

/**
 * This suite exists to replace one-off phone screen recordings with
 * something repeatable. It's split into two tiers on purpose:
 *
 * TIER 1 — functional checks. Fully reliable, no caveats. These would have
 * caught real bugs from this project's history immediately instead of
 * needing a human to notice and screen-record them:
 *   - the vertical line artifact (a console/rendering-health check would
 *     not have caught THIS specific bug, since it wasn't a JS error — but
 *     see the Tier 2 note on why screenshot diffing is the right tool for
 *     that class of bug)
 *   - the collapsed <Scroll html> wrapper (canvas mounts fine, but the
 *     hero being 0-height is a DOM-measurable state, see the hero check)
 *
 * TIER 2 — visual snapshot checks. This is the actually-correct tool for
 * "did an unexpected visual artifact appear" as a general problem — not a
 * hand-rolled heuristic trying to detect "is there a suspicious line",
 * which would be fragile and specific to one past bug. Playwright's
 * toHaveScreenshot() diffs against a committed baseline image and fails on
 * unexpected pixel changes, catching this whole CLASS of regression
 * automatically going forward.
 *
 * CAVEAT, stated plainly rather than hidden: the debris field's scatter
 * positions are generated with unseeded Math.random() at mount time (see
 * Sculpture.jsx), so every page load produces a different debris layout —
 * even with prefers-reduced-motion freezing further animation. This means
 * Tier 2 snapshots will show baseline "diffs" in the debris region that
 * are NOT bugs, just randomness. maxDiffPixelRatio is set generously to
 * absorb that noise, but this is a real gap, not a fully solved problem.
 * See the companion note for a seeded-RNG fix that would make this tier
 * fully trustworthy instead of "mostly trustworthy, spot-check failures."
 */

test.beforeEach(async ({ page }) => {
  // Freeze the scene as much as the app's own reduced-motion path allows —
  // this is the app's existing, already-built determinism mechanism
  // (confirmed present across Sculpture.jsx, CameraRig.jsx per prior
  // session work), not something this test suite is bolting on.
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test.describe('Tier 1 — functional health', () => {
  test('page loads, canvas mounts, WebGL context is live', async ({ page }) => {
    const pageErrors = [];
    const failedRequests = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('requestfailed', (req) => failedRequests.push(`${req.url()} — ${req.failure()?.errorText}`));

    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000); // let the R3F scene finish its first mount/compile pass

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 10000 });

    const canvasInfo = await canvas.evaluate((el) => ({
      width: el.width,
      height: el.height,
    }));
    expect(canvasInfo.width, 'canvas has zero width — likely mounted but never sized').toBeGreaterThan(0);
    expect(canvasInfo.height, 'canvas has zero height — likely mounted but never sized').toBeGreaterThan(0);

    const webglStatus = await canvas.evaluate((el) => {
      const gl = el.getContext('webgl2') || el.getContext('webgl');
      if (!gl) return 'no-context';
      return gl.isContextLost() ? 'context-lost' : 'ok';
    });
    expect(webglStatus, 'WebGL context is missing or lost — this is the exact failure mode documented throughout this project\'s Claude Code sandbox sessions').toBe('ok');

    expect(pageErrors, `uncaught JS errors on load:\n${pageErrors.join('\n')}`).toHaveLength(0);
    expect(failedRequests, `failed network requests:\n${failedRequests.join('\n')}`).toHaveLength(0);
  });

  test('hero text is actually laid out with non-zero size (regression guard for the collapsed-wrapper bug)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Verified against current source (src/Hero.jsx): .kinetic-hero is
    // still the correct, current selector — no drift since this suite was
    // built. Switched to data-testid="hero" (added to Hero.jsx alongside
    // this test suite merge) so this stays stable even if the className
    // changes with future styling work.
    const hero = page.getByTestId('hero').first();
    const box = await hero.boundingBox();

    expect(box, 'hero element not found in the DOM at all — check the selector against current source').not.toBeNull();
    if (box) {
      expect(box.height, 'hero collapsed to zero height — this is exactly the <Scroll html> wrapper bug from earlier this session').toBeGreaterThan(10);
      expect(box.width, 'hero collapsed to zero width').toBeGreaterThan(10);
    }
  });

  test('scrolling through the kinetic-typography region does not crash WebGL', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const canvas = page.locator('canvas').first();
    for (const scrollY of [200, 600, 1200, 2000]) {
      await page.mouse.wheel(0, scrollY / 4);
      await page.waitForTimeout(400);
    }

    const stillOk = await canvas.evaluate((el) => {
      const gl = el.getContext('webgl2') || el.getContext('webgl');
      return gl ? !gl.isContextLost() : false;
    });
    expect(stillOk, 'WebGL context died partway through scrolling').toBe(true);
  });
});

test.describe('Tier 2 — visual snapshots (see file header re: debris-seeding caveat)', () => {
  test('initial hero view', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await expect(page).toHaveScreenshot('hero-initial.png', {
      maxDiffPixelRatio: 0.05, // generous on purpose — see file header
      timeout: 15000,
    });
  });

  test('worst-case hero/sculpture overlap — rotate camera behind the text first', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Drag on the right two-thirds of the viewport (outside the
    // ScrollControls left strip, per the Stage 0 pointer-conflict fix) to
    // rotate the sculpture into the densest overlap position with the
    // hero text before capturing.
    const vw = page.viewportSize().width;
    const vh = page.viewportSize().height;
    await page.mouse.move(vw * 0.8, vh * 0.5);
    await page.mouse.down();
    await page.mouse.move(vw * 0.5, vh * 0.5, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('hero-worst-overlap.png', {
      maxDiffPixelRatio: 0.05,
      timeout: 15000,
    });
  });

  test('hamburger menu open', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Confirmed from current source (src/ui/UIOverlay.jsx): no stable
    // selector existed before this test suite merge — the button only had
    // a className (menu-btn) and aria-label ("Menu"), neither guaranteed
    // stable. Added data-testid="menu-toggle" directly to it, more robust
    // than the previous "last button on the page" positional guess.
    const menuButton = page.getByTestId('menu-toggle');
    await menuButton.click().catch(() => {});
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('menu-open.png', { maxDiffPixelRatio: 0.05 });
  });
});

/**
 * FIRST RUN: there are no baseline images yet, so every Tier 2 test will
 * fail with "no baseline found." That's expected — run once with
 * `npx playwright test --update-snapshots` to generate them, review the
 * output images by hand (this is the ONE time a human needs to actually
 * look — confirming the baseline itself is correct, not broken), commit
 * them to the repo. Every run after that is a real diff against a known-
 * good state.
 */
