import {
  extractRequiredFields,
  fillKnownFields,
  findButtonByText,
} from "./base.js";

const APPLY_ENTRY_BUTTONS = [
  "easy apply",
  "apply now",
  "apply",
  "start application",
  "begin application",
  "continue application",
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
  async clickApplyEntry(page) {
    const applyButton = await findButtonByText(page, APPLY_ENTRY_BUTTONS);
    if (applyButton) {
      await applyButton.click();
      await page.waitForTimeout(1200);
    }
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
    await submitButton.click();
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

