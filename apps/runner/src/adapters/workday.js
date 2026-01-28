import {
  extractRequiredFields,
  fillKnownFields,
  findButtonByText,
} from "./base.js";

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
      await applyButton.click();
      await page.waitForTimeout(1500);
    }
    return { ok: true };
  },
  async fillKnownFields(page, ctx) {
    await fillKnownFields(page, ctx.defaultEmail);
    return { ok: true };
  },
  async extractRequiredFields(page) {
    return extractRequiredFields(page);
  },
  async submit(page, ctx) {
    const nextButton = await findButtonByText(page, ["next", "review", "submit"]);
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
