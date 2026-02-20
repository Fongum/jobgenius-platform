(() => {
  const dom = window.JobGeniusDom;
  const registry = window.JobGeniusAdapterRegistry;
  const engine = window.JobGeniusEngine;
  const MIN_PLAN_VERSION = 2;

  function detectAtsType() {
    const host = window.location.hostname.toLowerCase();
    if (host.includes("linkedin")) return "LINKEDIN";
    if (host.includes("greenhouse")) return "GREENHOUSE";
    if (host.includes("workday") || host.includes("myworkdayjobs")) return "WORKDAY";
    return "UNKNOWN";
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

  async function runFallback(ctx, adapter) {
    if (!adapter?.runFallback) {
      await engine.pauseRun(ctx, "UNKNOWN_ATS", {
        step: "DETECT_ATS",
        ats: ctx.atsType,
        message: "Adapter missing fallback.",
      });
      chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId: ctx.runId });
      return;
    }

    const result = await adapter.runFallback(ctx);
    if (result.status === "APPLIED") {
      await engine.completeRun(ctx, "Application submitted by runner.");
      chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId: ctx.runId });
      return;
    }

    if (result.status === "NEEDS_ATTENTION") {
      await engine.pauseRun(ctx, result.reason ?? "UNKNOWN", {
        step: ctx.currentStep ?? "FALLBACK",
        ats: ctx.atsType,
        missing_fields: result.missing_fields ?? null,
      });
      chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId: ctx.runId });
      return;
    }

    await engine.retryRun(ctx, "Runner retry.");
    chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId: ctx.runId });
  }

  async function runAutomation(message) {
    const atsType = detectAtsType();
    const adapter =
      registry.getAdapter(atsType) || registry.getAdapter(message.atsType);

    const ctx = {
      runId: message.runId,
      claimToken: message.claimToken,
      apiBaseUrl: message.apiBaseUrl,
      authToken: message.authToken,
      jobSeekerId: message.jobSeekerId ?? message.activeSeekerId ?? null,
      activeSeekerId: message.activeSeekerId,
      resumeUrl: message.resumeUrl,
      profile: message.profile ?? null,
      defaultEmail: message.profile?.email ?? "",
      dryRun: Boolean(message.dryRun),
      atsType,
    };

    if (dom.hasCaptcha()) {
      await engine.pauseRun(ctx, "CAPTCHA", {
        step: "DETECT_ATS",
        ats: ctx.atsType,
        message: "Captcha detected.",
      });
      chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId: ctx.runId });
      return;
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
    };
    ctx.buttonHints = ctx.automation.buttonHints;

    await engine.runPlan(ctx, plan, adapter);
    chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId: ctx.runId });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "START_RUN") return;
    runAutomation(message).catch(async (error) => {
      console.error("Runner error:", error);
      chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId: message.runId });
    });
  });
})();
