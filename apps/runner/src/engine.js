import { hasCaptcha, hasEmailOtp, hasSmsOtp } from "./signals.js";
import { extractRequiredFields } from "./adapters/base.js";
import { logLine } from "./logger.js";
import {
  sendEvent,
  pauseRun,
  completeRun,
  retryRun,
} from "./api.js";

export async function runPlan({
  apiBaseUrl,
  amEmail,
  runnerId,
  run,
  claimToken,
  plan,
  adapter,
  page,
  context,
  dryRun,
  onProgress,
}) {
  const ctx = {
    runId: run.run_id,
    jobSeekerId: run.job_seeker_id,
    atsType: run.ats_type,
    currentStep: "INIT",
    defaultEmail: amEmail,
    dryRun,
  };

  await sendEvent(apiBaseUrl, {
    run_id: ctx.runId,
    event_type: "RUNNER_STARTED",
    message: `Cloud runner started on ${ctx.atsType}.`,
    step: ctx.currentStep,
    last_seen_url: page.url(),
  }, amEmail, claimToken, runnerId);
  onProgress?.({
    type: "RUNNER_STARTED",
    runId: ctx.runId,
    atsType: ctx.atsType,
    step: ctx.currentStep,
  });

  if (!adapter) {
    await pauseRun(apiBaseUrl, {
      run_id: ctx.runId,
      reason: "UNKNOWN_ATS",
      message: "Adapter not found.",
      last_seen_url: page.url(),
      step: "DETECT_ATS",
    }, amEmail, claimToken, runnerId);
    onProgress?.({
      type: "PAUSED",
      reason: "UNKNOWN_ATS",
      runId: ctx.runId,
      atsType: ctx.atsType,
      step: "DETECT_ATS",
    });
    return;
  }

  if (await hasCaptcha(page)) {
    await pauseRun(apiBaseUrl, {
      run_id: ctx.runId,
      reason: "CAPTCHA",
      message: "Captcha detected.",
      last_seen_url: page.url(),
      step: "DETECT_ATS",
    }, amEmail, claimToken, runnerId);
    onProgress?.({
      type: "PAUSED",
      reason: "CAPTCHA",
      runId: ctx.runId,
      atsType: ctx.atsType,
      step: "DETECT_ATS",
    });
    return;
  }

  if (await hasSmsOtp(page)) {
    await pauseRun(apiBaseUrl, {
      run_id: ctx.runId,
      reason: "OTP_SMS",
      message: "SMS verification required.",
      last_seen_url: page.url(),
      step: "DETECT_ATS",
    }, amEmail, claimToken, runnerId);
    onProgress?.({
      type: "PAUSED",
      reason: "OTP_SMS",
      runId: ctx.runId,
      atsType: ctx.atsType,
      step: "DETECT_ATS",
    });
    return;
  }

  if (await hasEmailOtp(page)) {
    await pauseRun(apiBaseUrl, {
      run_id: ctx.runId,
      reason: "OTP_EMAIL",
      message: "Email verification required.",
      last_seen_url: page.url(),
      step: "DETECT_ATS",
    }, amEmail, claimToken, runnerId);
    onProgress?.({
      type: "PAUSED",
      reason: "OTP_EMAIL",
      runId: ctx.runId,
      atsType: ctx.atsType,
      step: "DETECT_ATS",
    });
    return;
  }

  for (const step of plan.steps ?? []) {
    ctx.currentStep = step.name;
    await sendEvent(apiBaseUrl, {
      run_id: ctx.runId,
      event_type: "STEP_STARTED",
      step: step.name,
      message: `Starting ${step.name}.`,
      last_seen_url: page.url(),
    }, amEmail, claimToken, runnerId);
    onProgress?.({
      type: "STEP_STARTED",
      runId: ctx.runId,
      atsType: ctx.atsType,
      step: step.name,
    });

    if (step.name === "OPEN_URL") {
      continue;
    }

    if (step.name === "DETECT_ATS") {
      const detected = await adapter.detect(page);
      if (!detected) {
        await pauseRun(apiBaseUrl, {
          run_id: ctx.runId,
          reason: "UNKNOWN_ATS",
          message: "ATS not detected.",
          last_seen_url: page.url(),
          step: step.name,
        }, amEmail, claimToken, runnerId);
        onProgress?.({
          type: "PAUSED",
          reason: "UNKNOWN_ATS",
          runId: ctx.runId,
          atsType: ctx.atsType,
          step: step.name,
        });
        return;
      }
      continue;
    }

    if (step.name === "TRY_APPLY_ENTRY") {
      const result = await adapter.clickApplyEntry(page, ctx);
      if (result?.ok === false) {
        await pauseRun(apiBaseUrl, {
          run_id: ctx.runId,
          reason: result.reason ?? "APPLY_BUTTON_MISSING",
          message: "Apply entry not found.",
          last_seen_url: page.url(),
          step: step.name,
        }, amEmail, claimToken, runnerId);
        onProgress?.({
          type: "PAUSED",
          reason: result.reason ?? "APPLY_BUTTON_MISSING",
          runId: ctx.runId,
          atsType: ctx.atsType,
          step: step.name,
        });
        return;
      }
      continue;
    }

    if (step.name === "EXTRACT_FIELDS") {
      ctx.missingFields = adapter.extractRequiredFields
        ? await adapter.extractRequiredFields(page)
        : await extractRequiredFields(page);
      continue;
    }

    if (step.name === "FILL_KNOWN") {
      const result = await adapter.fillKnownFields(page, ctx);
      if (result?.ok === false) {
        await pauseRun(apiBaseUrl, {
          run_id: ctx.runId,
          reason: result.reason ?? "FILL_FAILED",
          message: "Failed to fill fields.",
          last_seen_url: page.url(),
          step: step.name,
        }, amEmail, claimToken, runnerId);
        onProgress?.({
          type: "PAUSED",
          reason: result.reason ?? "FILL_FAILED",
          runId: ctx.runId,
          atsType: ctx.atsType,
          step: step.name,
        });
        return;
      }
      continue;
    }

    if (step.name === "CHECK_REQUIRED") {
      const missingFields = adapter.extractRequiredFields
        ? await adapter.extractRequiredFields(page)
        : await extractRequiredFields(page);
      if (missingFields.length > 0) {
        await pauseRun(apiBaseUrl, {
          run_id: ctx.runId,
          reason: "REQUIRED_FIELDS",
          message: "Required fields missing.",
          last_seen_url: page.url(),
          step: step.name,
          meta: {
            missing_fields: missingFields,
            ats: ctx.atsType,
            step: step.name,
          },
        }, amEmail, claimToken, runnerId);
        onProgress?.({
          type: "PAUSED",
          reason: "REQUIRED_FIELDS",
          runId: ctx.runId,
          atsType: ctx.atsType,
          step: step.name,
          meta: { missing_fields: missingFields },
        });
        return;
      }
      continue;
    }

    if (step.name === "TRY_SUBMIT") {
      if (dryRun) {
        await pauseRun(apiBaseUrl, {
          run_id: ctx.runId,
          reason: "DRY_RUN_CONFIRM_SUBMIT",
          message: "Dry run enabled.",
          last_seen_url: page.url(),
          step: step.name,
        }, amEmail, claimToken, runnerId);
        onProgress?.({
          type: "PAUSED",
          reason: "DRY_RUN_CONFIRM_SUBMIT",
          runId: ctx.runId,
          atsType: ctx.atsType,
          step: step.name,
        });
        return;
      }
      const result = await adapter.submit(page, ctx);
      if (result?.ok === false) {
        await pauseRun(apiBaseUrl, {
          run_id: ctx.runId,
          reason: result.reason ?? "SUBMIT_BUTTON_MISSING",
          message: "Submit not available.",
          last_seen_url: page.url(),
          step: step.name,
        }, amEmail, claimToken, runnerId);
        onProgress?.({
          type: "PAUSED",
          reason: result.reason ?? "SUBMIT_BUTTON_MISSING",
          runId: ctx.runId,
          atsType: ctx.atsType,
          step: step.name,
        });
        return;
      }
      continue;
    }

    if (step.name === "CONFIRM") {
      const confirmed = await adapter.confirm(page, ctx);
      if (confirmed) {
        await completeRun(apiBaseUrl, {
          run_id: ctx.runId,
          note: "Application submitted by cloud runner.",
          last_seen_url: page.url(),
        }, amEmail, claimToken, runnerId);
        onProgress?.({
          type: "COMPLETED",
          runId: ctx.runId,
          atsType: ctx.atsType,
          step: step.name,
        });
        logLine({ level: "INFO", runId: ctx.runId, step: step.name, msg: "Applied" });
        return;
      }

      await pauseRun(apiBaseUrl, {
        run_id: ctx.runId,
        reason: "REQUIRES_REVIEW",
        message: "Confirmation not detected.",
        last_seen_url: page.url(),
        step: step.name,
      }, amEmail, claimToken, runnerId);
      onProgress?.({
        type: "PAUSED",
        reason: "REQUIRES_REVIEW",
        runId: ctx.runId,
        atsType: ctx.atsType,
        step: step.name,
      });
      return;
    }
  }

  await retryRun(apiBaseUrl, {
    run_id: ctx.runId,
    note: "Plan exhausted without confirmation.",
  }, amEmail, claimToken, runnerId);
  onProgress?.({
    type: "RETRIED",
    reason: "PLAN_EXHAUSTED",
    runId: ctx.runId,
    atsType: ctx.atsType,
  });
}
