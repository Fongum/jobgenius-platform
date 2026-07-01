(() => {
  const dom = window.JobGeniusDom;
  const registry = window.JobGeniusAdapterRegistry;
  const engine = window.JobGeniusEngine;
  const sidebar = window.JobGeniusRunnerSidebar;
  const MIN_PLAN_VERSION = 4;

  const ATS_FRAME_HOSTS = [
    "greenhouse.io",
    "lever.co",
    "myworkdayjobs.com",
    "workday.com",
    "ashbyhq.com",
    "workable.com",
    "icims.com",
    "smartrecruiters.com",
    "jobvite.com",
    "breezy.hr",
    "bamboohr.com",
  ];

  // With all-frames injection every frame receives START_RUN. Exactly one
  // frame should actually drive the run, so each frame self-elects:
  //   • a child frame runs only if it is a known ATS application frame;
  //   • the top frame runs unless it embeds a known ATS iframe (then it
  //     defers to that iframe's own runner).
  function shouldRunInThisFrame() {
    const isTop = window.top === window.self;
    if (!isTop) {
      const host = window.location.hostname.toLowerCase();
      return ATS_FRAME_HOSTS.some((h) => host.includes(h));
    }
    const hasAtsIframe = ATS_FRAME_HOSTS.some((h) =>
      document.querySelector(`iframe[src*='${h}']`)
    );
    return !hasAtsIframe;
  }

  function detectAtsType() {
    const host = window.location.hostname.toLowerCase();
    if (host.includes("linkedin")) return "LINKEDIN";
    if (host.includes("greenhouse")) return "GREENHOUSE";
    if (host.includes("workday") || host.includes("myworkdayjobs")) return "WORKDAY";
    if (host.includes("lever.co") || host.includes("jobs.lever.co")) return "LEVER";
    if (host.includes("smartrecruiters")) return "SMARTRECRUITERS";
    if (host.includes("icims.com")) return "ICIMS";
    if (host.includes("jobvite.com")) return "JOBVITE";
    if (host.includes("breezy.hr")) return "BREEZY";
    if (host.includes("ashbyhq.com")) return "ASHBY";
    if (host.includes("workable.com")) return "WORKABLE";
    if (host.includes("bamboohr.com")) return "BAMBOOHR";
    return "GENERIC";
  }

  async function fetchPlan(ctx) {
    const response = await fetch(
      `${ctx.apiBaseUrl}/api/apply/plan?runId=${encodeURIComponent(ctx.runId)}`,
      {
        headers: {
          Authorization: `Bearer ${ctx.authToken}`,
          "x-runner": "extension",
          "x-claim-token": ctx.claimToken ?? "",
        },
      }
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Plan fetch failed (${response.status}).`);
    }

    const data = await response.json();
    const plan = data?.plan ?? null;
    const version = Number(data?.version ?? plan?.version ?? 1);
    const hasAutoAdvance = Boolean(
      plan?.steps?.some((step) => step?.name === "AUTO_ADVANCE")
    );
    if (!plan || version < MIN_PLAN_VERSION || !hasAutoAdvance) {
      return null;
    }
    return { plan, version };
  }

  async function generatePlan(ctx) {
    const response = await fetch(`${ctx.apiBaseUrl}/api/apply/plan/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.authToken}`,
        "x-runner": "extension",
        "x-claim-token": ctx.claimToken ?? "",
      },
      body: JSON.stringify({ run_id: ctx.runId }),
    });

    if (!response.ok) {
      throw new Error(`Plan generation failed (${response.status}).`);
    }

    return response.json();
  }

  async function handleCaptchaAtStart(ctx) {
    const overlay = window.JobGeniusCaptchaOverlay;
    if (!overlay) {
      await engine.pauseRun(ctx, "CAPTCHA", {
        step: "DETECT_ATS",
        ats: ctx.atsType,
        message: "Captcha detected.",
      });
      sidebar?.finish?.("Needs Attention", "CAPTCHA requires manual action.");
      return false;
    }
    overlay.inject();
    const result = await overlay.waitForUser();
    if (result === "STOP") {
      await engine.pauseRun(ctx, "CAPTCHA", {
        step: "DETECT_ATS",
        ats: ctx.atsType,
        message: "Captcha detected.",
      });
      sidebar?.finish?.("Needs Attention", "CAPTCHA requires manual action.");
      return false;
    }
    return true;
  }

  async function runFallback(ctx, adapter) {
    sidebar?.show?.({
      atsType: ctx.atsType,
      jobTitle: ctx.job?.title ?? null,
      step: "FALLBACK",
    });
    sidebar?.setStatus?.("Running fallback");

    if (!adapter?.runFallback) {
      await engine.pauseRun(ctx, "UNKNOWN_ATS", {
        step: "DETECT_ATS",
        ats: ctx.atsType,
        message: "Adapter missing fallback.",
      });
      sidebar?.finish?.("Needs Attention", "Adapter missing fallback.");
      chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId: ctx.runId });
      return;
    }

    const result = await adapter.runFallback(ctx);
    if (result.status === "HANDOFF") {
      sidebar?.finish?.("Transferred", "Continuing in the application tab.");
      return;
    }
    if (result.status === "APPLIED") {
      await engine.completeRun(ctx, "Application submitted by runner.");
      sidebar?.finish?.("Applied", "Application submitted by fallback.");
      chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId: ctx.runId });
      return;
    }

    if (result.status === "NEEDS_ATTENTION") {
      await engine.pauseRun(ctx, result.reason ?? "UNKNOWN", {
        step: ctx.currentStep ?? "FALLBACK",
        ats: ctx.atsType,
        missing_fields: result.missing_fields ?? null,
      });
      sidebar?.finish?.("Needs Attention", "Human intervention required.");
      chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId: ctx.runId });
      return;
    }

    await engine.retryRun(ctx, "Runner retry.");
    sidebar?.finish?.("Retry queued", "Fallback completed without confirmation.");
    chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId: ctx.runId });
  }

  async function runAutomation(message) {
    const atsType = detectAtsType();
    const adapter = registry.resolveAdapter
      ? registry.resolveAdapter(atsType)
      : registry.getAdapter(atsType) || registry.getAdapter("GENERIC");

    const ctx = {
      runId: message.runId,
      claimToken: message.claimToken,
      apiBaseUrl: message.apiBaseUrl,
      authToken: message.authToken,
      jobSeekerId: message.jobSeekerId ?? message.activeSeekerId ?? null,
      activeSeekerId: message.activeSeekerId,
      resumeUrl: message.resumeUrl,
      profile: message.profile ?? null,
      job: message.job ?? null,
      defaultEmail: message.profile?.email ?? "",
      dryRun: Boolean(message.dryRun),
      atsType,
      handoffToNewTab: () =>
        new Promise((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "RUNNER_HANDOFF_TO_CHILD_TAB",
              runId: message.runId,
              claimToken: message.claimToken,
              apiBaseUrl: message.apiBaseUrl,
              authToken: message.authToken,
              jobSeekerId: message.jobSeekerId ?? message.activeSeekerId ?? null,
              activeSeekerId: message.activeSeekerId,
              job: message.job ?? null,
              resumeUrl: message.resumeUrl ?? null,
              profile: message.profile ?? null,
              dryRun: Boolean(message.dryRun),
            },
            (response) => resolve(Boolean(response?.success))
          );
        }),
    };

    sidebar?.show?.({
      atsType: ctx.atsType,
      jobTitle: ctx.job?.title ?? null,
      step: "INIT",
    });
    sidebar?.setStatus?.("Initializing");

    if (dom.hasCaptcha()) {
      const ok = await handleCaptchaAtStart(ctx);
      if (!ok) {
        chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId: ctx.runId });
        return;
      }
    }

    let plan = null;
    try {
      const fetched = await fetchPlan(ctx);
      plan = fetched?.plan ?? null;
      if (!plan) {
        await generatePlan(ctx);
        const regenerated = await fetchPlan(ctx);
        plan = regenerated?.plan ?? null;
      }
    } catch (error) {
      console.warn("Plan fetch failed, falling back:", error);
    }

    if (!plan) {
      await runFallback(ctx, adapter);
      return;
    }

    const automation = plan.metadata?.automation ?? {};
    ctx.automation = {
      maxAutoAdvanceSteps: Number(automation.max_auto_advance_steps ?? 7),
      maxNoProgressRounds: Number(automation.max_no_progress_rounds ?? 2),
      buttonHints: Array.isArray(automation.button_hints)
        ? automation.button_hints
        : [],
      applyEntryHints: Array.isArray(automation.apply_entry_hints)
        ? automation.apply_entry_hints
        : [],
      requiresApplyEntry: Boolean(automation.requires_apply_entry),
      preferPopupHandoff: Boolean(automation.prefer_popup_handoff),
      hostRuleId:
        typeof automation.rule_id === "string" ? automation.rule_id : null,
      urlHost:
        typeof automation.url_host === "string" ? automation.url_host : null,
    };
    ctx.buttonHints = ctx.automation.buttonHints;
    ctx.applyEntryHints = ctx.automation.applyEntryHints;

    await engine.runPlan(ctx, plan, adapter);
    chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId: ctx.runId });
  }

  // Learning capture: after a Mode 3 fill, snapshot the form, then on the first
  // submit/apply action diff the final values vs what we filled and emit the
  // human's corrections / blank-fills to the background (which POSTs them). The
  // background survives the page navigation that a submit triggers.
  function fieldSignature(field) {
    const label = String(field.label ?? "").toLowerCase().replace(/\s+/g, " ").trim();
    const type = String(field.type ?? "").toLowerCase();
    const opts = Array.isArray(field.options)
      ? field.options.map((o) => String(o).toLowerCase().trim()).sort().join(",")
      : "";
    return `${label}|${type}|${opts}`;
  }

  function setupLearningCapture(ctx) {
    if (!dom.enumerateFields) return;

    const snapshot = new Map();
    for (const field of dom.enumerateFields()) {
      snapshot.set(fieldSignature(field), { value: field.value ?? "", field });
    }

    let emitted = false;
    const emit = () => {
      if (emitted) return;
      emitted = true;

      const events = [];
      for (const field of dom.enumerateFields()) {
        const key = fieldSignature(field);
        const after = String(field.value ?? "").trim();
        if (!after) continue;

        const prior = snapshot.get(key);
        const before = prior ? String(prior.value ?? "").trim() : "";

        if (!before) {
          events.push({
            label: field.label,
            type: field.type,
            options: field.options,
            outcome: "filled_blank",
            autofilled_value: "",
            final_value: after,
          });
        } else if (before !== after) {
          events.push({
            label: field.label,
            type: field.type,
            options: field.options,
            outcome: "corrected",
            autofilled_value: before,
            final_value: after,
          });
        } else {
          // Autofilled value kept unchanged by the human = accepted. Emitting
          // these gives host graduation a real accuracy denominator (accepted
          // vs corrected); the server audits them without learning a value.
          events.push({
            label: field.label,
            type: field.type,
            options: field.options,
            outcome: "accepted",
            autofilled_value: before,
            final_value: after,
          });
        }
      }

      if (events.length === 0) return;

      chrome.runtime.sendMessage({
        type: "LEARN_FIELDS",
        ats_type: ctx.atsType ?? null,
        url_host: window.location.hostname,
        job: ctx.job
          ? {
              title: ctx.job.title ?? null,
              company: ctx.job.company ?? null,
              url: ctx.job.url ?? null,
              job_post_id: ctx.job.job_post_id ?? null,
            }
          : null,
        events,
      });
    };

    // Submit event (capture) fires before navigation; also catch clicks on
    // submit/apply-like controls in case the form submits programmatically.
    document.addEventListener("submit", emit, true);
    document.addEventListener(
      "click",
      (e) => {
        const target = e.target?.closest?.(
          "button, input[type='submit'], [role='button'], a"
        );
        if (!target) return;
        const label = (
          target.textContent ||
          target.value ||
          target.getAttribute?.("aria-label") ||
          ""
        )
          .toLowerCase()
          .trim();
        // Deliberately conservative: bare "apply" often just OPENS the form.
        // The form 'submit' event above is the primary trigger; this is a
        // fallback for programmatic submits.
        if (/\bsubmit\b|submit application|send application/.test(label)) {
          emit();
        }
      },
      true
    );
  }

  // ── Mode 3: interactive "Autofill this page" ──────────────────────────
  // Fills the visible application form from the seeker's profile on ANY page
  // (matched or unmatched). No plan, no run, no submit — the human reviews and
  // submits. Reuses the same adapters + dom primitives as the autonomous runner.
  async function runAutofill(message) {
    const atsType = detectAtsType();
    const adapter = registry.resolveAdapter
      ? registry.resolveAdapter(atsType)
      : registry.getAdapter(atsType) || registry.getAdapter("GENERIC");

    const ctx = {
      apiBaseUrl: message.apiBaseUrl,
      authToken: message.authToken,
      jobSeekerId: message.jobSeekerId ?? message.activeSeekerId ?? null,
      activeSeekerId: message.activeSeekerId ?? null,
      resumeUrl: message.resumeUrl ?? null,
      profile: message.profile ?? null,
      job: message.job ?? null,
      defaultEmail: message.profile?.email ?? "",
      dryRun: true, // never submit in live-autofill mode
      mode: "LIVE_AUTOFILL",
      atsType,
    };

    sidebar?.show?.({
      atsType,
      jobTitle: ctx.job?.title ?? null,
      step: "AUTOFILL",
    });
    sidebar?.setStatus?.("Autofilling this page");

    if (dom.hasCaptcha()) {
      sidebar?.finish?.(
        "Needs Attention",
        "Captcha detected — solve it, then autofill again."
      );
      chrome.runtime.sendMessage({ type: "AUTOFILL_COMPLETE", ok: false, reason: "CAPTCHA" });
      return;
    }

    // Optionally open the application form if the page shows an apply entry.
    if (adapter?.clickApplyEntry) {
      try {
        await adapter.clickApplyEntry(ctx);
      } catch (error) {
        console.warn("clickApplyEntry failed (non-fatal):", error);
      }
    }

    // Fill known fields (adapter wraps dom.fillAllFields + resume upload).
    let fillSummary = null;
    let resumeUploaded = false;
    if (adapter?.fillKnownFields) {
      const res = await adapter.fillKnownFields(ctx);
      fillSummary = res?.fillSummary ?? null;
      resumeUploaded = res?.ok !== false;
    } else {
      fillSummary = dom.fillAllFields(ctx.defaultEmail, ctx.profile, ctx.job);
      if (ctx.resumeUrl) {
        const up = await dom.uploadResume(ctx.resumeUrl);
        resumeUploaded = Boolean(up?.ok);
      }
    }

    // Resolve any remaining required fields via the shared field classifier
    // (learned rules → screening answers → LLM), same as the autonomous runner.
    const extractMissing = () =>
      adapter?.extractRequiredFields
        ? adapter.extractRequiredFields()
        : dom.extractRequiredFields();

    let missing = extractMissing();
    let classified = 0;
    if (Array.isArray(missing) && missing.length > 0) {
      classified = (await dom.classifyAndFill?.(ctx, missing)) ?? 0;
      if (classified > 0) {
        await dom.sleep(400);
        missing = extractMissing();
      }
    }

    const remaining = Array.isArray(missing) ? missing.length : 0;
    const filledTotal = (fillSummary?.total ?? 0) + classified;

    // Start watching for the human's corrections so we can teach the runner.
    try {
      setupLearningCapture(ctx);
    } catch (error) {
      console.warn("setupLearningCapture failed (non-fatal):", error);
    }

    sidebar?.finish?.(
      "Ready for review",
      remaining > 0
        ? `Filled ${filledTotal} field(s). ${remaining} still need your input — review and submit.`
        : `Filled ${filledTotal} field(s). Review and submit.`
    );

    chrome.runtime.sendMessage({
      type: "AUTOFILL_COMPLETE",
      ok: true,
      filled: filledTotal,
      remaining,
      resume_uploaded: resumeUploaded,
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "START_RUN") return;
    // Only the elected frame drives the run; other frames stay silent so they
    // don't race or emit a premature RUN_COMPLETE.
    if (!shouldRunInThisFrame()) return;
    runAutomation(message).catch(async (error) => {
      console.error("Runner error:", error);
      sidebar?.finish?.("Error", error?.message ?? "Runner failed.");
      chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId: message.runId });
    });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "AUTOFILL_PAGE") return;
    // Same per-frame self-election as START_RUN so exactly one frame fills.
    if (!shouldRunInThisFrame()) return;
    runAutofill(message).catch((error) => {
      console.error("Autofill error:", error);
      sidebar?.finish?.("Error", error?.message ?? "Autofill failed.");
      chrome.runtime.sendMessage({ type: "AUTOFILL_COMPLETE", ok: false, reason: "ERROR" });
    });
  });
})();
