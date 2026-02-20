import {
  extractRequiredFields,
  fillKnownFields,
  findButtonByText,
} from "./base.js";

const DEFAULT_SUBMIT_BUTTONS = [
  "next",
  "continue",
  "review",
  "submit application",
  "submit",
];

export const linkedinAdapter = {
  name: "LINKEDIN",
  async detect(page) {
    return Boolean(await page.$("button[aria-label*='Easy Apply']"));
  },
  async clickApplyEntry(page) {
    const applyButton =
      (await page.$("button[aria-label*='Easy Apply']")) ||
      (await findButtonByText(page, ["easy apply"]));
    if (!applyButton) return { ok: false, reason: "APPLY_BUTTON_MISSING" };
    await applyButton.click();
    await page.waitForTimeout(1500);
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
    const nextButton = await findButtonByText(page, [
      ...hints,
      ...DEFAULT_SUBMIT_BUTTONS,
    ]);
    if (!nextButton) return { ok: false, reason: "SUBMIT_BUTTON_MISSING" };
    if (ctx.dryRun) return { ok: false, reason: "DRY_RUN_CONFIRM_SUBMIT" };
    await nextButton.click();
    await page.waitForTimeout(1500);
    return { ok: true };
  },
  async confirm(page) {
    const text = (await page.textContent("body"))?.toLowerCase() ?? "";
    return text.includes("thank you") || text.includes("submitted");
  },
};
