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

  // ── Mode 3 persistent sidebar (JobWizard-style field checklist) ─────────
  // A steady on-page panel that lists the form's fields and ticks each one as
  // it gets autofilled. Self-contained (no dependency on the autonomous runner
  // sidebar) so it always renders when the autofill runs.
  const mode3Sidebar = (() => {
    const PANEL_ID = "jobgenius-autofill-panel";
    let rowsBySig = new Map();

    function injectStyle() {
      if (document.getElementById("jobgenius-autofill-style")) return;
      const s = document.createElement("style");
      s.id = "jobgenius-autofill-style";
      s.textContent = `
        #${PANEL_ID}{position:fixed;top:76px;right:16px;width:300px;max-height:72vh;
          display:flex;flex-direction:column;background:#fff;border:1px solid #e5e7eb;
          border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.18);z-index:2147483647;
          font-family:Segoe UI,Arial,sans-serif;color:#111827;overflow:hidden}
        #${PANEL_ID} .jg-hd{display:flex;align-items:center;justify-content:space-between;
          padding:11px 14px;border-bottom:1px solid #eef2f7}
        #${PANEL_ID} .jg-ti{font-size:13px;font-weight:700}
        #${PANEL_ID} .jg-x{cursor:pointer;color:#9ca3af;font-size:18px;line-height:1;border:0;background:none}
        #${PANEL_ID} .jg-sub{padding:8px 14px;font-size:11px;color:#6b7280;border-bottom:1px solid #f3f4f6}
        #${PANEL_ID} .jg-list{overflow:auto;padding:2px 0}
        #${PANEL_ID} .jg-row{display:flex;align-items:center;justify-content:space-between;
          gap:8px;padding:8px 14px;border-bottom:1px solid #f6f7f9;font-size:12px}
        #${PANEL_ID} .jg-lb{color:#374151;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        #${PANEL_ID} .jg-st{width:18px;height:18px;border-radius:50%;flex:none;display:flex;
          align-items:center;justify-content:center;font-size:11px;font-weight:700}
        #${PANEL_ID} .jg-pending{border:2px solid #d1d5db;color:transparent}
        #${PANEL_ID} .jg-filled{background:#16a34a;color:#fff}
        #${PANEL_ID} .jg-attn{background:#f59e0b;color:#fff}`;
      (document.head || document.documentElement).appendChild(s);
    }

    function mount() {
      injectStyle();
      let el = document.getElementById(PANEL_ID);
      if (el) return el;
      el = document.createElement("div");
      el.id = PANEL_ID;
      el.innerHTML =
        '<div class="jg-hd"><span class="jg-ti">JobGenius Autofill</span>' +
        '<button class="jg-x" aria-label="Close">×</button></div>' +
        '<div class="jg-sub" data-jg-sub>Scanning form…</div>' +
        '<div class="jg-list" data-jg-list></div>';
      (document.body || document.documentElement).appendChild(el);
      el.querySelector(".jg-x").addEventListener("click", () => el.remove());
      return el;
    }

    function renderFields(rows) {
      const el = mount();
      const list = el.querySelector("[data-jg-list]");
      list.innerHTML = "";
      rowsBySig = new Map();
      for (const r of rows) {
        const row = document.createElement("div");
        row.className = "jg-row";
        const lb = document.createElement("span");
        lb.className = "jg-lb";
        lb.textContent = r.label;
        lb.title = r.label;
        const st = document.createElement("span");
        st.className = "jg-st jg-pending";
        row.appendChild(lb);
        row.appendChild(st);
        list.appendChild(row);
        rowsBySig.set(r.sig, st);
      }
    }

    function setStatus(sig, state) {
      const st = rowsBySig.get(sig);
      if (!st) return;
      st.className =
        "jg-st " +
        (state === "filled" ? "jg-filled" : state === "attention" ? "jg-attn" : "jg-pending");
      st.textContent = state === "filled" ? "✓" : state === "attention" ? "!" : "";
    }

    function setHeader(text) {
      const el = document.getElementById(PANEL_ID);
      if (el) el.querySelector("[data-jg-sub]").textContent = text;
    }

    return { mount, renderFields, setStatus, setHeader };
  })();

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

    console.log(
      "[JobGenius] AUTOFILL_PAGE received. ATS:",
      atsType,
      "profile:",
      !!ctx.profile
    );

    // Render the checklist immediately from the fields currently on the page,
    // so the user sees the panel even before/if filling has any effect.
    const labelOk = (l) => l && l.toLowerCase() !== "unknown field";
    const preFields = dom.enumerateFields ? dom.enumerateFields() : [];
    const rows = [];
    const seen = new Set();
    for (const f of preFields) {
      if (!labelOk(f.label)) continue;
      const sig = fieldSignature(f);
      if (seen.has(sig)) continue;
      seen.add(sig);
      rows.push({ sig, label: f.label });
    }
    const hasFileInput = !!document.querySelector("input[type='file']");
    if (ctx.resumeUrl && hasFileInput) {
      rows.push({ sig: "__resume__", label: "Resume / CV" });
    }

    // This frame has no application fields (e.g. a tracking/ads iframe, or the
    // top frame when the form is embedded). Stay silent so only the frame that
    // actually holds the form shows the panel and fills.
    if (rows.length === 0) {
      console.log("[JobGenius] no fillable fields in this frame — skipping.");
      return;
    }

    mode3Sidebar.renderFields(rows);
    mode3Sidebar.setHeader("Autofilling…");

    if (dom.hasCaptcha()) {
      mode3Sidebar.setHeader("Captcha detected — solve it, then autofill again.");
      chrome.runtime.sendMessage({ type: "AUTOFILL_COMPLETE", ok: false, reason: "CAPTCHA" });
      return;
    }

    // Fill known fields (adapter wraps dom.fillAllFields + resume upload). We do
    // NOT click any "apply" entry button here — Mode 3 fills the form the user is
    // already viewing, and clicking "Apply"/"Quick Apply" can navigate away.
    let resumeUploaded = false;
    if (adapter?.fillKnownFields) {
      const res = await adapter.fillKnownFields(ctx);
      resumeUploaded = res?.ok !== false;
    } else {
      dom.fillAllFields(ctx.defaultEmail, ctx.profile, ctx.job);
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
    if (Array.isArray(missing) && missing.length > 0) {
      const classified = (await dom.classifyAndFill?.(ctx, missing)) ?? 0;
      if (classified > 0) {
        await dom.sleep(400);
        missing = extractMissing();
      }
    }

    // Update the checklist from the post-fill DOM state: a field with a value is
    // ticked; a still-empty REQUIRED field is flagged for the user's attention.
    const missingSigs = new Set(
      (Array.isArray(missing) ? missing : []).map((f) => fieldSignature(f))
    );
    const postValueBySig = new Map();
    for (const f of dom.enumerateFields ? dom.enumerateFields() : []) {
      postValueBySig.set(fieldSignature(f), String(f.value ?? "").trim());
    }

    let filledCount = 0;
    for (const r of rows) {
      if (r.sig === "__resume__") {
        mode3Sidebar.setStatus(r.sig, resumeUploaded ? "filled" : "attention");
        if (resumeUploaded) filledCount++;
        continue;
      }
      const val = postValueBySig.get(r.sig) ?? "";
      if (val) {
        mode3Sidebar.setStatus(r.sig, "filled");
        filledCount++;
      } else if (missingSigs.has(r.sig)) {
        mode3Sidebar.setStatus(r.sig, "attention");
      } else {
        mode3Sidebar.setStatus(r.sig, "pending");
      }
    }

    const remaining = missingSigs.size;
    console.log(
      `[JobGenius] autofill done: ${filledCount}/${rows.length} filled, ${remaining} required remaining`
    );
    mode3Sidebar.setHeader(
      remaining > 0
        ? `Filled ${filledCount}. ${remaining} still need your input — review & submit.`
        : `Filled ${filledCount}. Review & submit.`
    );

    // Start watching for the human's corrections so we can teach the runner.
    try {
      setupLearningCapture(ctx);
    } catch (error) {
      console.warn("setupLearningCapture failed (non-fatal):", error);
    }

    chrome.runtime.sendMessage({
      type: "AUTOFILL_COMPLETE",
      ok: true,
      filled: filledCount,
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
    // Unlike START_RUN we do NOT gate on shouldRunInThisFrame: fill-only is
    // harmless to run in multiple frames, and the form fields may live in the
    // top frame even when an ATS iframe is present (which would make the top
    // frame defer and nothing would fill). runAutofill self-skips any frame
    // that has no fillable fields.
    runAutofill(message).catch((error) => {
      console.error("[JobGenius] Autofill error:", error);
      try {
        mode3Sidebar.setHeader("Autofill error: " + (error?.message ?? "failed"));
      } catch (_) {
        /* panel may not be mounted */
      }
      chrome.runtime.sendMessage({ type: "AUTOFILL_COMPLETE", ok: false, reason: "ERROR" });
    });
  });
})();
