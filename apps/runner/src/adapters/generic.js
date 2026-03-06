import {
  clickElementHandle,
  extractRequiredFields,
  fillKnownFields,
  findClickableByText,
  findButtonByText,
} from "./base.js";

const APPLY_ENTRY_BUTTONS = [
  "easy apply",
  "apply now",
  "apply on company site",
  "apply on company website",
  "apply",
  "start application",
  "begin application",
  "continue application",
  "continue applying",
  "continue to application",
  "go to application",
  "view application",
  "external apply",
  "visit employer site",
];

const SUBMIT_BUTTONS = [
  "next",
  "continue",
  "save and continue",
  "proceed",
  "review",
  "review and submit",
  "submit application",
  "submit",
  "apply",
  "finish",
];

export const genericAdapter = {
  name: "GENERIC",
  async detect() {
    return true;
  },
  async clickApplyEntry(page, ctx) {
    const entryHints =
      Array.isArray(ctx?.applyEntryHints) && ctx.applyEntryHints.length > 0
        ? ctx.applyEntryHints
        : APPLY_ENTRY_BUTTONS;
    const applyButton = await findClickableByText(page, entryHints);
    if (!applyButton) {
      const alreadyInApplication = Boolean(
        await page.$(
          "form input, form textarea, form select, form input[type='file'], input[required], textarea[required], select[required]"
        )
      );
      if (alreadyInApplication) {
        return { ok: true };
      }
      return { ok: false, reason: "APPLY_BUTTON_MISSING" };
    }

    const existingPages = new Set(page.context().pages());
    const popupPromise = page
      .context()
      .waitForEvent("page", {
        timeout: 3000,
        predicate: (candidate) => !existingPages.has(candidate),
      })
      .catch(() => null);

    const clicked = await clickElementHandle(applyButton, 10000);
    if (!clicked) {
      return { ok: false, reason: "APPLY_BUTTON_NOT_INTERACTABLE" };
    }

    const popupPage = await popupPromise;
    if (popupPage) {
      await popupPage.waitForLoadState("domcontentloaded").catch(() => null);
      return { ok: true, nextPage: popupPage, handoff: "NEW_PAGE" };
    }

    await page.waitForTimeout(1200);
    return { ok: true };
  },
  async fillKnownFields(page, ctx) {
    await fillKnownFields(page, ctx);
    return { ok: true };
  },
  async extractRequiredFields(page) {
    return extractRequiredFields(page);
  },
  async submit(page, ctx) {
    const hints = Array.isArray(ctx?.buttonHints) ? ctx.buttonHints : [];
    const submitButton = await findButtonByText(page, [...hints, ...SUBMIT_BUTTONS]);
    if (!submitButton) return { ok: false, reason: "SUBMIT_BUTTON_MISSING" };
    if (ctx.dryRun) return { ok: false, reason: "DRY_RUN_CONFIRM_SUBMIT" };
    const clicked = await clickElementHandle(submitButton, 10000);
    if (!clicked) return { ok: false, reason: "SUBMIT_BUTTON_NOT_INTERACTABLE" };
    await page.waitForTimeout(1400);
    return { ok: true };
  },
  async confirm(page) {
    const text = (await page.textContent("body"))?.toLowerCase() ?? "";
    return (
      text.includes("thank you") ||
      text.includes("application submitted") ||
      text.includes("successfully applied") ||
      text.includes("application received") ||
      text.includes("we have received your application") ||
      text.includes("application complete")
    );
  },
};
