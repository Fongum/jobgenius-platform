// Real-browser fixture tests for the extension runner (see helpers.js).
// These run the ACTUAL runner/{phrases,dom}.js and adapters in headless
// Chromium against fixture pages cloning Greenhouse / Lever / Workday /
// LinkedIn structures — asserting the behaviors jsdom can't: real layout
// visibility, real pointer-event handling, async portal rendering, and
// file inputs.
const { test, expect } = require("@playwright/test");
const {
  loadRunner,
  GREENHOUSE_FIXTURE,
  LEVER_FIXTURE,
  WORKDAY_FIXTURE,
  LINKEDIN_FIXTURE,
  PROFILE,
} = require("./helpers");

test.describe("Greenhouse-style form", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(GREENHOUSE_FIXTURE);
    await loadRunner(page);
  });

  test("button scoring picks the real submit over decoy controls", async ({ page }) => {
    const pickedId = await page.evaluate(() => {
      const btn = window.JobGeniusDom.findButtonByText(
        window.JobGeniusPhrases.submit
      );
      return btn ? btn.id : null;
    });
    expect(pickedId).toBe("submit-app"); // not decoy-filters / decoy-clear
  });

  test("fillAllFields fills profile fields with real input events", async ({ page }) => {
    const summary = await page.evaluate((profile) => {
      return window.JobGeniusDom.fillAllFields("fallback@x.com", profile, null);
    }, PROFILE);
    expect(summary.text).toBeGreaterThanOrEqual(4);
    await expect(page.locator("#first_name")).toHaveValue("Ada");
    await expect(page.locator("#last_name")).toHaveValue("Lovelace");
    await expect(page.locator("#email")).toHaveValue("ada@analytical.dev");
    await expect(page.locator("#phone")).toHaveValue(PROFILE.phone);
  });

  test("uploadResume attaches a fetched file to the real file input", async ({ page }) => {
    await page.route("https://fixtures.test/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: { "access-control-allow-origin": "*" },
        body: Buffer.from("%PDF-1.4 fake resume"),
      })
    );
    const result = await page.evaluate(() =>
      window.JobGeniusDom.uploadResume("https://fixtures.test/resume.pdf")
    );
    expect(result.ok).toBe(true);
    const fileMeta = await page.evaluate(() => {
      const input = document.getElementById("resume");
      return input.files.length === 1
        ? { name: input.files[0].name, type: input.files[0].type }
        : null;
    });
    expect(fileMeta).toEqual({ name: "resume.pdf", type: "application/pdf" });
  });

  test("end-to-end: fill, upload, submit, confined confirmation detected", async ({ page }) => {
    await page.route("https://fixtures.test/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: { "access-control-allow-origin": "*" },
        body: Buffer.from("%PDF-1.4 fake resume"),
      })
    );
    const outcome = await page.evaluate(async (profile) => {
      const dom = window.JobGeniusDom;
      dom.fillAllFields("fallback@x.com", profile, null);
      await dom.uploadResume("https://fixtures.test/resume.pdf");
      const missingBefore = dom.extractRequiredFields().length;
      const submit = dom.findButtonByText(window.JobGeniusPhrases.submit);
      await dom.clickElement(submit);
      return { missingBefore };
    }, PROFILE);
    expect(outcome.missingBefore).toBe(0);

    await expect(page.locator("[role='alert']")).toContainText("Thank you");
    const confirmed = await page.evaluate(() =>
      window.JobGeniusDom.isConfirmationVisible(window.JobGeniusPhrases.confirmation)
    );
    expect(confirmed).toBe(true);
  });
});

test.describe("Lever-style posting", () => {
  test("generic adapter drives entry → fill → submit → confirm", async ({ page }) => {
    await page.setContent(LEVER_FIXTURE);
    await loadRunner(page);

    const result = await page.evaluate(async (profile) => {
      const dom = window.JobGeniusDom;
      const adapter = window.JobGeniusAdapterRegistry.getAdapter("GENERIC");
      const ctx = { profile, defaultEmail: "fallback@x.com", dryRun: false };

      const entry = await adapter.clickApplyEntry(ctx);
      const formVisible =
        document.getElementById("app-wrap").style.display === "block";

      const fill = await adapter.fillKnownFields(ctx);
      const missing = adapter.extractRequiredFields().length;
      const submit = await adapter.submit(ctx);
      const confirmed = adapter.confirm(ctx);

      return {
        entryOk: entry.ok,
        formVisible,
        fillOk: fill.ok,
        missing,
        submitOk: submit.ok,
        clickedLabel: submit.clickedLabel,
        confirmed,
      };
    }, PROFILE);

    expect(result.entryOk).toBe(true);
    expect(result.formVisible).toBe(true);
    expect(result.fillOk).toBe(true);
    expect(result.missing).toBe(0);
    expect(result.submitOk).toBe(true);
    expect(result.clickedLabel).toBe("Submit application");
    expect(result.confirmed).toBe(true);
  });
});

test.describe("Workday-style widgets", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(WORKDAY_FIXTURE);
    await loadRunner(page);
  });

  test("combobox driver selects from an async portal listbox", async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const trigger = document.getElementById("country-trigger");
      // Options render ~250ms after the open click — exercises the poll.
      return window.JobGeniusDom.fillComboboxByValue(
        trigger,
        "United States of America"
      );
    });
    expect(ok).toBe(true);
    const committed = await page.evaluate(() => window.__committedCountry);
    expect(committed).toBe("United States of America");
  });

  test("account-creation step is not misread as a login wall", async ({ page }) => {
    const wall = await page.evaluate(() =>
      window.JobGeniusDom.hasLoginWall("https://acme.wd5.myworkdayjobs.com/careers/job/123")
    );
    expect(wall).toBe(false);
  });
});

test.describe("LinkedIn Easy Apply-style modal", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(LINKEDIN_FIXTURE);
    await loadRunner(page);
  });

  test("real-layout visibility: hidden duplicate and decoy are skipped", async ({ page }) => {
    const pickedId = await page.evaluate(() => {
      const btn = window.JobGeniusDom.findButtonByText(["easy apply"]);
      return btn ? btn.id : null;
    });
    // Not #hidden-apply (display:none — jsdom can't verify this, Chromium can)
    // and not #decoy-settings ("Apply settings").
    expect(pickedId).toBe("easy-apply");
  });

  test("modal stepper: entry → step 1 → Next → step 2 → submit → confirmation", async ({ page }) => {
    await page.evaluate(async (profile) => {
      const dom = window.JobGeniusDom;
      // Entry
      await dom.clickElement(dom.findButtonByText(["easy apply"]));
      // Step 1: fill and advance. "Next" must win over the (hidden) submit.
      dom.fillAllFields("fallback@x.com", profile, null);
      await dom.clickElement(dom.findButtonByText(window.JobGeniusPhrases.submit));
    }, PROFILE);

    await expect(page.locator("#step-2")).toBeVisible();

    await page.evaluate(async (profile) => {
      const dom = window.JobGeniusDom;
      dom.fillAllFields("fallback@x.com", profile, null);
      await dom.clickElement(dom.findButtonByText(window.JobGeniusPhrases.submit));
    }, PROFILE);

    await expect(page.locator("[role='alert']")).toContainText("Application submitted");
    const confirmed = await page.evaluate(() =>
      window.JobGeniusDom.isConfirmationVisible(window.JobGeniusPhrases.confirmation)
    );
    expect(confirmed).toBe(true);
  });
});
