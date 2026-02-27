import {
  clickElementHandle,
  extractRequiredFields,
  fillKnownFields,
  findButtonByText,
} from "./base.js";

const DEFAULT_SUBMIT_BUTTONS = [
  "next",
  "continue",
  "save and continue",
  "review",
  "submit application",
  "submit",
];

export const workdayAdapter = {
  name: "WORKDAY",
  async detect(page) {
    const host = new URL(page.url()).hostname.toLowerCase();
    return host.includes("workday") || host.includes("myworkdayjobs");
  },
  async clickApplyEntry(page) {
    const applyButton = await findButtonByText(page, [
      "apply",
      "apply now",
      "start application",
    ]);
    if (applyButton) {
      const clicked = await clickElementHandle(applyButton, 10000);
      if (!clicked) {
        return { ok: false, reason: "APPLY_BUTTON_NOT_INTERACTABLE" };
      }
      await page.waitForTimeout(1500);
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
    const nextButton = await findButtonByText(page, [
      ...hints,
      ...DEFAULT_SUBMIT_BUTTONS,
    ]);
    if (!nextButton) return { ok: false, reason: "SUBMIT_BUTTON_MISSING" };
    if (ctx.dryRun) return { ok: false, reason: "DRY_RUN_CONFIRM_SUBMIT" };
    const clicked = await clickElementHandle(nextButton, 10000);
    if (!clicked) return { ok: false, reason: "SUBMIT_BUTTON_NOT_INTERACTABLE" };
    await page.waitForTimeout(1500);
    return { ok: true };
  },
  async confirm(page) {
    const text = (await page.textContent("body"))?.toLowerCase() ?? "";
    return text.includes("thank you") || text.includes("submitted");
  },
};
