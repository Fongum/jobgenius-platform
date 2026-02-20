(() => {
  const dom = window.JobGeniusDom;

  function toBoundedInt(value, fallback, min = 1, max = 15) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(parsed)));
  }

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
    if (!ctx.jobSeekerId) {
      return null;
    }

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

  async function emitLearningSignal(ctx, payload) {
    try {
      await logEvent(ctx, {
        run_id: ctx.runId,
        event_type: "LEARNING_SIGNAL",
        step: ctx.currentStep,
        message: "Captured automation signal.",
        ...payload,
      });
    } catch (error) {
      console.warn("Learning signal failed:", error);
    }
  }

  function getAutomationConfig(ctx, step) {
    const maxIterations = toBoundedInt(
      step?.max_iterations ?? ctx?.automation?.maxAutoAdvanceSteps,
      7,
      1,
      20
    );
    const maxNoProgressRounds = toBoundedInt(
      step?.max_no_progress_rounds ?? ctx?.automation?.maxNoProgressRounds,
      2,
      1,
      5
    );
    return { maxIterations, maxNoProgressRounds };
  }

  async function runAutoAdvance(ctx, step, adapter) {
    const { maxIterations, maxNoProgressRounds } = getAutomationConfig(ctx, step);
    let noProgressRounds = 0;

    for (let attempt = 1; attempt <= maxIterations; attempt += 1) {
      if (adapter.confirm ? adapter.confirm(ctx) : false) {
        return { status: "APPLIED" };
      }

      if (dom.hasCaptcha()) {
        return {
          status: "NEEDS_ATTENTION",
          reason: "CAPTCHA",
          meta: { attempt },
        };
      }

      const otpReady = await ensureOtp(ctx);
      if (!otpReady) {
        return { status: "STOPPED" };
      }

      if (adapter.fillKnownFields) {
        const fillResult = await adapter.fillKnownFields(ctx);
        if (fillResult && fillResult.ok === false) {
          return {
            status: "NEEDS_ATTENTION",
            reason: fillResult.reason ?? "FILL_FAILED",
            meta: { attempt },
          };
        }
      } else {
        dom.fillTextInputs(ctx.defaultEmail, ctx.profile);
      }

      const missingFields = adapter.extractRequiredFields
        ? adapter.extractRequiredFields()
        : dom.extractRequiredFields();

      if (missingFields.length > 0) {
        return {
          status: "NEEDS_ATTENTION",
          reason: "REQUIRED_FIELDS",
          meta: { attempt, missing_fields: missingFields },
        };
      }

      if (ctx.dryRun) {
        return {
          status: "NEEDS_ATTENTION",
          reason: "DRY_RUN_CONFIRM_SUBMIT",
          meta: { attempt },
        };
      }

      const beforeFingerprint =
        dom.captureFlowFingerprint?.() ?? window.location.href;

      const submitResult = adapter.submit
        ? await adapter.submit(ctx)
        : { ok: false, reason: "SUBMIT_BUTTON_MISSING" };

      if (submitResult && submitResult.ok === false) {
        if (submitResult.reason === "SUBMIT_BUTTON_MISSING") {
          break;
        }
        return {
          status: "NEEDS_ATTENTION",
          reason: submitResult.reason ?? "SUBMIT_BUTTON_MISSING",
          meta: { attempt },
        };
      }

      await dom.sleep(1300);
      const afterFingerprint =
        dom.captureFlowFingerprint?.() ?? window.location.href;
      const progressed = beforeFingerprint !== afterFingerprint;

      await emitLearningSignal(ctx, {
        meta: {
          ats: ctx.atsType,
          attempt,
          progressed,
          no_progress_rounds: noProgressRounds,
          automation_mode: "extension_autofill",
        },
      });

      if (!progressed) {
        noProgressRounds += 1;
        if (noProgressRounds >= maxNoProgressRounds) {
          return {
            status: "NEEDS_ATTENTION",
            reason: "NO_PROGRESS",
            meta: {
              attempt,
              no_progress_rounds: noProgressRounds,
            },
          };
        }
      } else {
        noProgressRounds = 0;
      }
    }

    if (adapter.confirm ? adapter.confirm(ctx) : false) {
      return { status: "APPLIED" };
    }

    return { status: "REVIEW_REQUIRED" };
  }

  async function runPlan(ctx, plan, adapter) {
    ctx.currentStep = "INIT";
    ctx.buttonHints = Array.isArray(ctx.buttonHints) ? ctx.buttonHints : [];
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

      if (step.name === "AUTO_ADVANCE") {
        const advanceResult = await runAutoAdvance(ctx, step, adapter);

        if (advanceResult.status === "STOPPED") {
          return;
        }

        if (advanceResult.status === "APPLIED") {
          await completeRun(ctx, "Application submitted by autofill agent.");
          chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId: ctx.runId });
          return;
        }

        if (advanceResult.status === "NEEDS_ATTENTION") {
          await pauseRun(ctx, advanceResult.reason ?? "REQUIRES_REVIEW", {
            step: step.name,
            ats: ctx.atsType,
            ...(advanceResult.meta ?? {}),
          });
          return;
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
