(() => {
  const dom = window.JobGeniusDom;
  const registry = window.JobGeniusAdapterRegistry;

  registry.registerAdapter("GREENHOUSE", {
    detect() {
      return Boolean(document.querySelector("form[action*='greenhouse']"));
    },
    async clickApplyEntry(ctx) {
      const applyButton = dom.findButtonByText(["apply", "apply now"]);
      if (applyButton) {
        applyButton.click();
        await dom.sleep(1200);
      }
      return { ok: true };
    },
    async fillKnownFields(ctx) {
      dom.fillTextInputs(ctx.defaultEmail);
      if (ctx.resumeUrl) {
        const upload = await dom.uploadResume(ctx.resumeUrl);
        if (!upload.ok) {
          return { ok: false, reason: "RESUME_UPLOAD_FAILED" };
        }
      }
      return { ok: true };
    },
    extractRequiredFields() {
      return dom.extractRequiredFields();
    },
    async submit(ctx) {
      const submitButton = dom.findButtonByText(["submit application", "submit"]);
      if (!submitButton) {
        return { ok: false, reason: "SUBMIT_BUTTON_MISSING" };
      }
      if (ctx.dryRun) {
        return { ok: false, reason: "DRY_RUN_CONFIRM_SUBMIT" };
      }
      submitButton.click();
      await dom.sleep(1500);
      return { ok: true };
    },
    confirm() {
      const confirmationText = document.body?.innerText?.toLowerCase() ?? "";
      return (
        confirmationText.includes("thank you") ||
        confirmationText.includes("application submitted")
      );
    },
    async runFallback(ctx) {
      await this.clickApplyEntry(ctx);
      const fillResult = await this.fillKnownFields(ctx);
      if (!fillResult.ok) return { status: "NEEDS_ATTENTION", reason: fillResult.reason };

      const missing = this.extractRequiredFields();
      if (missing.length > 0) return { status: "NEEDS_ATTENTION", reason: "REQUIRED_FIELDS", missing_fields: missing };

      const submitResult = await this.submit(ctx);
      if (!submitResult.ok) return { status: "NEEDS_ATTENTION", reason: submitResult.reason };

      if (this.confirm()) return { status: "APPLIED" };
      return { status: "NEEDS_ATTENTION", reason: "REQUIRES_REVIEW" };
    },
  });
})();
