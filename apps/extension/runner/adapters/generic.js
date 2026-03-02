(() => {
  const dom = window.JobGeniusDom;
  const registry = window.JobGeniusAdapterRegistry;

  const DEFAULT_SUBMIT_BUTTONS = [
    "next",
    "continue",
    "save and continue",
    "proceed",
    "submit application",
    "submit",
    "apply",
    "begin application",
  ];

  registry.registerAdapter("GENERIC", {
    detect() {
      return true;
    },

    async clickApplyEntry(ctx) {
      const applyButton = dom.findButtonByText([
        "apply now",
        "apply",
        "start application",
        "begin application",
      ]);
      if (applyButton) {
        applyButton.click();
        await dom.sleep(1200);
      }
      return { ok: true };
    },

    async fillKnownFields(ctx) {
      const fillSummary = dom.fillAllFields(ctx.defaultEmail, ctx.profile, ctx.job);
      if (ctx.resumeUrl) {
        const upload = await dom.uploadResume(ctx.resumeUrl);
        if (!upload.ok) {
          return { ok: false, reason: "RESUME_UPLOAD_FAILED" };
        }
      }
      return { ok: true, fillSummary };
    },

    extractRequiredFields() {
      return dom.extractRequiredFields();
    },

    async submit(ctx) {
      const hints = Array.isArray(ctx?.buttonHints) ? ctx.buttonHints : [];
      const submitButton = dom.findButtonByText([
        ...hints,
        ...DEFAULT_SUBMIT_BUTTONS,
      ]);
      if (!submitButton) {
        return { ok: false, reason: "SUBMIT_BUTTON_MISSING" };
      }
      if (ctx.dryRun) {
        return { ok: false, reason: "DRY_RUN_CONFIRM_SUBMIT" };
      }
      const clickedLabel =
        submitButton.textContent?.trim() ||
        submitButton.getAttribute("aria-label") ||
        submitButton.getAttribute("value") ||
        "Continue";
      submitButton.click();
      await dom.sleep(1400);
      return { ok: true, clickedLabel };
    },

    confirm() {
      const text = document.body?.innerText?.toLowerCase() ?? "";
      return (
        text.includes("thank you") ||
        text.includes("application submitted") ||
        text.includes("successfully applied") ||
        text.includes("application received") ||
        text.includes("we have received") ||
        text.includes("application complete")
      );
    },

    async runFallback(ctx) {
      await this.clickApplyEntry(ctx);

      const maxSteps = Number(ctx?.automation?.maxAutoAdvanceSteps ?? 8);
      let noProgressRounds = 0;

      for (let step = 0; step < maxSteps; step += 1) {
        if (this.confirm()) return { status: "APPLIED" };
        if (dom.hasCaptcha()) return { status: "NEEDS_ATTENTION", reason: "CAPTCHA" };

        const fillResult = await this.fillKnownFields(ctx);
        if (!fillResult.ok) {
          return { status: "NEEDS_ATTENTION", reason: fillResult.reason };
        }

        const missing = this.extractRequiredFields();
        if (missing.length > 0) {
          return {
            status: "NEEDS_ATTENTION",
            reason: "REQUIRED_FIELDS",
            missing_fields: missing,
          };
        }

        if (ctx.dryRun) {
          return { status: "NEEDS_ATTENTION", reason: "DRY_RUN_CONFIRM_SUBMIT" };
        }

        const before = dom.captureFlowFingerprint?.() ?? window.location.href;
        const submitResult = await this.submit(ctx);
        if (!submitResult.ok) {
          return { status: "NEEDS_ATTENTION", reason: submitResult.reason };
        }

        await dom.sleep(1200);
        const after = dom.captureFlowFingerprint?.() ?? window.location.href;
        if (after === before) {
          noProgressRounds += 1;
          if (noProgressRounds >= 2) break;
        } else {
          noProgressRounds = 0;
        }
      }

      if (this.confirm()) return { status: "APPLIED" };
      return { status: "NEEDS_ATTENTION", reason: "REQUIRES_REVIEW" };
    },
  });
})();
