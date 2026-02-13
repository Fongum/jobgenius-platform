(() => {
  const dom = window.JobGeniusDom;

  async function postJson(url, payload, authToken) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-runner": "extension",
        Authorization: authToken ? `Bearer ${authToken}` : "",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Request failed (${response.status}).`);
    }

    return response.json();
  }

  async function logEvent(ctx, payload) {
    return postJson(
      `${ctx.apiBaseUrl}/api/apply/event`,
      { ...payload, claim_token: ctx.claimToken },
      ctx.authToken
    );
  }

  async function pauseRun(ctx, reason, meta) {
    return postJson(
      `${ctx.apiBaseUrl}/api/apply/pause`,
      {
        run_id: ctx.runId,
        claim_token: ctx.claimToken,
        reason,
        message: meta?.message ?? "Runner needs attention.",
        last_seen_url: window.location.href,
        step: meta?.step,
        meta,
      },
      ctx.authToken
    );
  }

  async function completeRun(ctx, note) {
    return postJson(
      `${ctx.apiBaseUrl}/api/apply/complete`,
      {
        run_id: ctx.runId,
        claim_token: ctx.claimToken,
        note,
        last_seen_url: window.location.href,
      },
      ctx.authToken
    );
  }

  async function retryRun(ctx, note) {
    return postJson(
      `${ctx.apiBaseUrl}/api/apply/retry`,
      {
        run_id: ctx.runId,
        claim_token: ctx.claimToken,
        note,
      },
      ctx.authToken
    );
  }

  async function waitForEmailOtp(ctx, timeoutMs = 60000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const response = await fetch(
          `${ctx.apiBaseUrl}/api/otp/latest?jobSeekerId=${encodeURIComponent(
            ctx.jobSeekerId
          )}`,
          {
            headers: {
              "x-runner": "extension",
              Authorization: ctx.authToken ? `Bearer ${ctx.authToken}` : "",
            },
          }
        );
        if (response.ok) {
          const data = await response.json();
          if (data?.code && data?.id) {
            return { code: data.code, id: data.id };
          }
        }
      } catch {
        // ignore polling errors
      }
      await dom.sleep(3000);
    }

    return null;
  }

  async function markOtpUsed(ctx, otpId) {
    if (!otpId) return;
    await postJson(
      `${ctx.apiBaseUrl}/api/otp/mark-used`,
      { otp_id: otpId },
      ctx.authToken
    );
  }

  async function ensureOtp(ctx) {
    if (dom.hasSmsOtp()) {
      await pauseRun(ctx, "OTP_SMS", {
        step: ctx.currentStep,
        ats: ctx.atsType,
        message: "SMS verification required.",
      });
      return false;
    }

    if (dom.hasEmailOtp()) {
      const otp = await waitForEmailOtp(ctx);
      if (!otp?.code) {
        await pauseRun(ctx, "OTP_EMAIL", {
          step: ctx.currentStep,
          ats: ctx.atsType,
          message: "Email verification code required.",
        });
        return false;
      }

      const otpInput =
        document.querySelector("input[autocomplete='one-time-code']") ||
        document.querySelector("input[name*='code']") ||
        document.querySelector("input[type='text']");

      if (!otpInput) {
        await pauseRun(ctx, "OTP_EMAIL", {
          step: ctx.currentStep,
          ats: ctx.atsType,
          message: "OTP input not found.",
        });
        return false;
      }

      otpInput.focus();
      otpInput.value = otp.code;
      otpInput.dispatchEvent(new Event("input", { bubbles: true }));
      await markOtpUsed(ctx, otp.id);
    }

    return true;
  }

  async function handleMissingFields(ctx, adapter, stepName) {
    const missingFields = adapter.extractRequiredFields
      ? adapter.extractRequiredFields()
      : dom.extractRequiredFields();

    if (missingFields.length > 0) {
      await pauseRun(ctx, "REQUIRED_FIELDS", {
        step: stepName,
        ats: ctx.atsType,
        missing_fields: missingFields,
        message: "Required fields missing.",
      });
      return false;
    }

    return true;
  }

  async function runPlan(ctx, plan, adapter) {
    ctx.currentStep = "INIT";
    await logEvent(ctx, {
      run_id: ctx.runId,
      event_type: "RUNNER_STARTED",
      message: `Runner started on ${ctx.atsType}.`,
      last_seen_url: window.location.href,
    });

    if (!adapter || !adapter.detect || !adapter.detect()) {
      await pauseRun(ctx, "UNKNOWN_ATS", {
        step: "DETECT_ATS",
        ats: ctx.atsType,
        message: "ATS type not recognized.",
      });
      return;
    }

    if (dom.hasCaptcha()) {
      await pauseRun(ctx, "CAPTCHA", {
        step: "DETECT_ATS",
        ats: ctx.atsType,
        message: "Captcha detected.",
      });
      return;
    }

    const otpReady = await ensureOtp(ctx);
    if (!otpReady) return;

    for (const step of plan.steps ?? []) {
      ctx.currentStep = step.name;
      await logEvent(ctx, {
        run_id: ctx.runId,
        event_type: "STEP_STARTED",
        step: step.name,
        message: `Starting ${step.name}.`,
        last_seen_url: window.location.href,
      });

      if (step.name === "OPEN_URL") {
        continue;
      }

      if (step.name === "DETECT_ATS") {
        if (!adapter.detect || !adapter.detect()) {
          await pauseRun(ctx, "UNKNOWN_ATS", {
            step: step.name,
            ats: ctx.atsType,
          });
          return;
        }
        continue;
      }

      if (step.name === "TRY_APPLY_ENTRY") {
        if (adapter.clickApplyEntry) {
          const result = await adapter.clickApplyEntry(ctx);
          if (result && result.ok === false) {
            await pauseRun(ctx, result.reason ?? "APPLY_BUTTON_MISSING", {
              step: step.name,
              ats: ctx.atsType,
            });
            return;
          }
        }
        continue;
      }

      if (step.name === "EXTRACT_FIELDS") {
        ctx.missingFields = adapter.extractRequiredFields
          ? adapter.extractRequiredFields()
          : dom.extractRequiredFields();
        continue;
      }

      if (step.name === "FILL_KNOWN") {
        if (adapter.fillKnownFields) {
          const result = await adapter.fillKnownFields(ctx);
          if (result && result.ok === false) {
            await pauseRun(ctx, result.reason ?? "FILL_FAILED", {
              step: step.name,
              ats: ctx.atsType,
            });
            return;
          }
        } else {
          dom.fillTextInputs(ctx.defaultEmail, ctx.profile);
        }
        continue;
      }

      if (step.name === "CHECK_REQUIRED") {
        const ok = await handleMissingFields(ctx, adapter, step.name);
        if (!ok) return;
        continue;
      }

      if (step.name === "TRY_SUBMIT") {
        if (ctx.dryRun) {
          await pauseRun(ctx, "DRY_RUN_CONFIRM_SUBMIT", {
            step: step.name,
            ats: ctx.atsType,
            message: "Dry run enabled.",
          });
          return;
        }
        if (adapter.submit) {
          const result = await adapter.submit(ctx);
          if (result && result.ok === false) {
            await pauseRun(ctx, result.reason ?? "SUBMIT_BUTTON_MISSING", {
              step: step.name,
              ats: ctx.atsType,
            });
            return;
          }
        }
        continue;
      }

      if (step.name === "CONFIRM") {
        const confirmed = adapter.confirm ? adapter.confirm(ctx) : false;
        if (confirmed) {
          await completeRun(ctx, "Application submitted by runner.");
          chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId: ctx.runId });
          return;
        }
        await pauseRun(ctx, "REQUIRES_REVIEW", {
          step: step.name,
          ats: ctx.atsType,
        });
        return;
      }
    }

    await retryRun(ctx, "Plan exhausted without confirmation.");
    chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId: ctx.runId });
  }

  window.JobGeniusEngine = {
    runPlan,
    retryRun,
    pauseRun,
    completeRun,
  };
})();
