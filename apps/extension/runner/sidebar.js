(() => {
  const SIDEBAR_ID = "jg-runner-sidebar";
  const LOG_LIMIT = 10;

  const state = {
    status: "Idle",
    step: "-",
    totals: {
      text: 0,
      selects: 0,
      radios: 0,
      checkboxes: 0,
      textareas: 0,
      total: 0,
    },
    lastAction: "-",
    logs: [],
    startedAt: null,
  };

  function nowTime() {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function getPanel() {
    return document.getElementById(SIDEBAR_ID);
  }

  function isSuccessStatus(status) {
    const s = String(status || "").toLowerCase();
    return s.includes("applied") || s.includes("complete") || s.includes("done") || s.includes("success");
  }

  function isWarningStatus(status) {
    const s = String(status || "").toLowerCase();
    return s.includes("attention") || s.includes("captcha") || s.includes("otp") || s.includes("review");
  }

  function isErrorStatus(status) {
    const s = String(status || "").toLowerCase();
    return s.includes("failed") || s.includes("error") || s.includes("stop");
  }

  function ensurePanel() {
    let panel = getPanel();
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = SIDEBAR_ID;
    panel.style.cssText = [
      "position:fixed",
      "top:84px",
      "left:16px",
      "width:320px",
      "max-height:78vh",
      "display:flex",
      "flex-direction:column",
      "background:#ffffff",
      "border:2px solid #0f172a",
      "border-radius:12px",
      "box-shadow:0 8px 30px rgba(15,23,42,0.24)",
      "z-index:2147483646",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      "overflow:hidden",
      "color:#0f172a",
    ].join(";");

    panel.innerHTML = `
      <div style="padding:12px 12px 10px;background:linear-gradient(90deg,#0f172a,#1e293b);color:#fff;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <strong style="font-size:14px;">JobGenius Runner</strong>
          <button id="jg-runner-stop-btn" style="background:#ef4444;color:#fff;border:none;border-radius:7px;padding:5px 8px;font-size:11px;font-weight:700;cursor:pointer;">Stop</button>
        </div>
        <div id="jg-runner-status" style="margin-top:7px;font-size:12px;font-weight:600;opacity:.95;">Status: Idle</div>
      </div>
      <div style="padding:10px 12px;border-bottom:1px solid #e2e8f0;background:#f8fafc;">
        <div style="font-size:12px;margin-bottom:4px;"><strong>Step:</strong> <span id="jg-runner-step">-</span></div>
        <div style="font-size:12px;"><strong>Last Action:</strong> <span id="jg-runner-action">-</span></div>
      </div>
      <div style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">
        <div style="font-size:12px;font-weight:700;margin-bottom:6px;">Auto-Fill Totals</div>
        <div id="jg-runner-totals" style="font-size:12px;color:#334155;line-height:1.5;">Text 0 • Selects 0 • Radios 0 • Checks 0 • Textareas 0</div>
      </div>
      <div style="padding:10px 12px 8px;font-size:12px;font-weight:700;">Activity</div>
      <div id="jg-runner-log" style="padding:0 12px 12px;overflow:auto;min-height:120px;max-height:250px;font-size:12px;line-height:1.45;color:#1f2937;"></div>
    `;

    document.body.appendChild(panel);

    const stopBtn = panel.querySelector("#jg-runner-stop-btn");
    if (stopBtn) {
      stopBtn.addEventListener("click", () => {
        window.__JG_RUNNER_STOP_REQUESTED = true;
        log("Manual stop requested.", "warn");
        setStatus("Stopping...");
      });
    }

    return panel;
  }

  function render() {
    const panel = ensurePanel();
    if (!panel) return;

    const statusEl = panel.querySelector("#jg-runner-status");
    const stepEl = panel.querySelector("#jg-runner-step");
    const actionEl = panel.querySelector("#jg-runner-action");
    const totalsEl = panel.querySelector("#jg-runner-totals");
    const logEl = panel.querySelector("#jg-runner-log");

    if (statusEl) {
      statusEl.textContent = `Status: ${state.status}`;
      statusEl.style.color = "#dbeafe";
      if (isSuccessStatus(state.status)) statusEl.style.color = "#86efac";
      if (isWarningStatus(state.status)) statusEl.style.color = "#fde68a";
      if (isErrorStatus(state.status)) statusEl.style.color = "#fecaca";
    }

    if (stepEl) stepEl.textContent = state.step || "-";
    if (actionEl) actionEl.textContent = state.lastAction || "-";

    if (totalsEl) {
      totalsEl.textContent =
        `Text ${state.totals.text} • Selects ${state.totals.selects} • Radios ${state.totals.radios} • ` +
        `Checks ${state.totals.checkboxes} • Textareas ${state.totals.textareas} • Total ${state.totals.total}`;
    }

    if (logEl) {
      logEl.innerHTML = state.logs
        .map(
          (entry) =>
            `<div style="margin-bottom:5px;"><span style="color:#64748b;">[${entry.time}]</span> ${entry.message}</div>`
        )
        .join("");
      logEl.scrollTop = logEl.scrollHeight;
    }
  }

  function log(message, level = "info") {
    if (!message) return;

    const prefix =
      level === "error" ? "<span style='color:#b91c1c;'>[ERROR]</span> " :
      level === "warn" ? "<span style='color:#b45309;'>[WARN]</span> " :
      level === "success" ? "<span style='color:#166534;'>[OK]</span> " :
      "";

    state.logs.push({ time: nowTime(), message: `${prefix}${message}` });
    if (state.logs.length > LOG_LIMIT) {
      state.logs = state.logs.slice(state.logs.length - LOG_LIMIT);
    }
    render();
  }

  function show(meta = {}) {
    ensurePanel();
    state.startedAt = Date.now();
    state.status = "Running";
    state.step = meta.step || "INIT";
    state.lastAction = meta.jobTitle ? `Opened: ${meta.jobTitle}` : "Runner started";
    state.totals = { text: 0, selects: 0, radios: 0, checkboxes: 0, textareas: 0, total: 0 };
    state.logs = [];
    window.__JG_RUNNER_STOP_REQUESTED = false;
    render();
    log(`Runner active on ${meta.atsType || "ATS"}${meta.jobTitle ? ` for "${meta.jobTitle}"` : ""}.`);
  }

  function setStatus(status) {
    state.status = status || "Running";
    render();
  }

  function setStep(step) {
    state.step = step || "-";
    render();
  }

  function setAction(action) {
    state.lastAction = action || "-";
    render();
  }

  function reportFill(summary = {}) {
    const text = Number(summary.text || 0);
    const selects = Number(summary.selects || 0);
    const radios = Number(summary.radios || 0);
    const checkboxes = Number(summary.checkboxes || 0);
    const textareas = Number(summary.textareas || 0);
    const total = Number(summary.total || text + selects + radios + checkboxes + textareas);

    state.totals.text += text;
    state.totals.selects += selects;
    state.totals.radios += radios;
    state.totals.checkboxes += checkboxes;
    state.totals.textareas += textareas;
    state.totals.total += total;

    state.lastAction = `Filled ${total} field${total === 1 ? "" : "s"}`;
    render();
    if (total > 0) {
      log(
        `Filled ${total} field${total === 1 ? "" : "s"} (text ${text}, selects ${selects}, radios ${radios}, checks ${checkboxes}, textareas ${textareas}).`
      );
    }
  }

  function reportClick(buttonLabel) {
    const label = (buttonLabel || "Next").trim();
    state.lastAction = `Clicked "${label}"`;
    render();
    log(`Clicked button: "${label}".`);
  }

  function reportMissing(count) {
    const c = Number(count || 0);
    if (c > 0) {
      state.lastAction = `${c} required field${c === 1 ? "" : "s"} unresolved`;
      render();
      log(`${c} required field${c === 1 ? "" : "s"} still need human input.`, "warn");
    }
  }

  function finish(status, message) {
    state.status = status || "Stopped";
    if (message) {
      state.lastAction = message;
      log(message, isSuccessStatus(status) ? "success" : isWarningStatus(status) ? "warn" : "info");
    }
    render();
  }

  function hide() {
    const panel = getPanel();
    if (panel) panel.remove();
  }

  window.JobGeniusRunnerSidebar = {
    show,
    setStatus,
    setStep,
    setAction,
    reportFill,
    reportClick,
    reportMissing,
    log,
    finish,
    hide,
  };
})();
