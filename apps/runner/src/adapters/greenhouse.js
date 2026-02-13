import {
  extractRequiredFields,
  fillKnownFields,
  findButtonByText,
} from "./base.js";

export const greenhouseAdapter = {
  name: "GREENHOUSE",
  async detect(page) {
    return Boolean(await page.$("form[action*='greenhouse']"));
  },
  async clickApplyEntry(page) {
    const applyButton = await findButtonByText(page, ["apply", "apply now"]);
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
    const submitButton = await findButtonByText(page, [
      "submit application",
      "submit",
    ]);
    if (!submitButton) return { ok: false, reason: "SUBMIT_BUTTON_MISSING" };
    if (ctx.dryRun) return { ok: false, reason: "DRY_RUN_CONFIRM_SUBMIT" };
    await submitButton.click();
    await page.waitForTimeout(1500);
    return { ok: true };
  },
  async confirm(page) {
    const text = (await page.textContent("body"))?.toLowerCase() ?? "";
    return text.includes("thank you") || text.includes("application submitted");
  },
};
