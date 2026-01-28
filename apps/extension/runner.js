const APPLY_HEADERS = (amEmail) => ({
  "Content-Type": "application/json",
  "x-am-email": amEmail,
  "x-runner": "extension",
});

async function postJson(url, payload, amEmail) {
  const response = await fetch(url, {
    method: "POST",
    headers: APPLY_HEADERS(amEmail),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}).`);
  }

  return response.json();
}

async function logEvent(ctx, payload) {
  return postJson(`${ctx.apiBaseUrl}/api/apply/event`, payload, ctx.amEmail);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectAtsType() {
  const host = window.location.hostname.toLowerCase();
  if (host.includes("linkedin")) return "LINKEDIN";
  if (host.includes("greenhouse")) return "GREENHOUSE";
  if (host.includes("workday") || host.includes("myworkdayjobs")) return "WORKDAY";
  return "UNKNOWN";
}

function hasCaptcha() {
  const text = document.body?.innerText?.toLowerCase() ?? "";
  if (text.includes("captcha")) return true;
  return Boolean(document.querySelector("iframe[src*='captcha']"));
}

function findButtonByText(texts) {
  const buttons = Array.from(document.querySelectorAll("button"));
  return buttons.find((button) => {
    const label = button.textContent?.toLowerCase() ?? "";
    return texts.some((text) => label.includes(text));
  });
}

function hasSmsOtp() {
  const text = document.body?.innerText?.toLowerCase() ?? "";
  if (text.includes("sms") && text.includes("code")) return true;
  if (text.includes("text message") && text.includes("code")) return true;
  return Boolean(document.querySelector("input[type='tel']"));
}

async function fillTextInputs(defaultEmail) {
  const inputs = Array.from(
    document.querySelectorAll("input[type='text'], input[type='email'], textarea")
  );

  inputs.forEach((input) => {
    if (input.value) return;
    if (input.disabled) return;
    input.focus();
    input.value = input.type === "email" ? defaultEmail : "N/A";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function uploadResume(resumeUrl) {
  const input = document.querySelector("input[type='file']");
  if (!input || !resumeUrl) return { ok: false, reason: "NO_INPUT_OR_URL" };

  const response = await fetch(resumeUrl);
  if (!response.ok) {
    return { ok: false, reason: "FETCH_FAILED" };
  }

  const blob = await response.blob();
  const file = new File([blob], "resume.pdf", { type: blob.type || "application/pdf" });
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  input.files = dataTransfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true };
}

function requiredFieldsMissing() {
  const requiredInputs = Array.from(
    document.querySelectorAll("input[required], textarea[required], select[required]")
  );
  return requiredInputs.some((input) => !input.value);
}

const adapters = {
  LINKEDIN: {
    detect: () => document.querySelector("button[aria-label*='Easy Apply']"),
    async run(ctx) {
      await logEvent(ctx, {
        run_id: ctx.runId,
        event_type: "STEP_APPLY_CLICK",
        message: "Attempting to click Easy Apply.",
        last_seen_url: window.location.href,
      });
      const applyButton =
        document.querySelector("button[aria-label*='Easy Apply']") ||
        findButtonByText(["easy apply"]);

      if (!applyButton) {
        return { status: "NEEDS_ATTENTION", reason: "APPLY_BUTTON_MISSING" };
      }

      applyButton.click();
      await sleep(1500);

      if (hasCaptcha()) {
        return { status: "NEEDS_ATTENTION", reason: "CAPTCHA" };
      }

      await logEvent(ctx, {
        run_id: ctx.runId,
        event_type: "STEP_FILL_FIELDS",
        message: "Filling LinkedIn form fields.",
        last_seen_url: window.location.href,
      });

      await fillTextInputs(ctx.defaultEmail);
      if (ctx.resumeUrl) {
        const upload = await uploadResume(ctx.resumeUrl);
        if (!upload.ok) {
          return { status: "NEEDS_ATTENTION", reason: "RESUME_UPLOAD_FAILED" };
        }
      }

      if (requiredFieldsMissing()) {
        return { status: "NEEDS_ATTENTION", reason: "REQUIRED_FIELD_MISSING" };
      }

      const nextButton =
        findButtonByText(["next", "review", "submit application", "submit"]);
      if (!nextButton) {
        return { status: "NEEDS_ATTENTION", reason: "SUBMIT_BUTTON_MISSING" };
      }

      await logEvent(ctx, {
        run_id: ctx.runId,
        event_type: "STEP_SUBMIT_CLICK",
        message: "Clicking submit/review.",
        last_seen_url: window.location.href,
      });

      nextButton.click();
      await sleep(1500);

      const confirmationText = document.body?.innerText?.toLowerCase() ?? "";
      if (confirmationText.includes("thank you") || confirmationText.includes("submitted")) {
        return { status: "APPLIED" };
      }

      return { status: "NEEDS_ATTENTION", reason: "REQUIRES_REVIEW" };
    },
  },
  GREENHOUSE: {
    detect: () => Boolean(document.querySelector("form[action*='greenhouse']")),
    async run(ctx) {
      await logEvent(ctx, {
        run_id: ctx.runId,
        event_type: "STEP_APPLY_CLICK",
        message: "Attempting to click Apply.",
        last_seen_url: window.location.href,
      });
      const applyButton = findButtonByText(["apply", "apply now"]);
      if (applyButton) {
        applyButton.click();
        await sleep(1200);
      }

      await logEvent(ctx, {
        run_id: ctx.runId,
        event_type: "STEP_FILL_FIELDS",
        message: "Filling Greenhouse form fields.",
        last_seen_url: window.location.href,
      });
      await fillTextInputs(ctx.defaultEmail);
      if (ctx.resumeUrl) {
        const upload = await uploadResume(ctx.resumeUrl);
        if (!upload.ok) {
          return { status: "NEEDS_ATTENTION", reason: "RESUME_UPLOAD_FAILED" };
        }
      }

      if (requiredFieldsMissing()) {
        return { status: "NEEDS_ATTENTION", reason: "REQUIRED_FIELD_MISSING" };
      }

      const submitButton = findButtonByText(["submit application", "submit"]);
      if (!submitButton) {
        return { status: "NEEDS_ATTENTION", reason: "SUBMIT_BUTTON_MISSING" };
      }

      await logEvent(ctx, {
        run_id: ctx.runId,
        event_type: "STEP_SUBMIT_CLICK",
        message: "Submitting Greenhouse application.",
        last_seen_url: window.location.href,
      });
      submitButton.click();
      await sleep(1500);

      const confirmationText = document.body?.innerText?.toLowerCase() ?? "";
      if (confirmationText.includes("thank you") || confirmationText.includes("application submitted")) {
        return { status: "APPLIED" };
      }

      return { status: "NEEDS_ATTENTION", reason: "REQUIRES_REVIEW" };
    },
  },
  WORKDAY: {
    detect: () => window.location.hostname.toLowerCase().includes("workday"),
    async run(ctx) {
      if (hasSmsOtp()) {
        return { status: "NEEDS_ATTENTION", reason: "SMS_OTP_REQUIRED" };
      }

      await logEvent(ctx, {
        run_id: ctx.runId,
        event_type: "STEP_APPLY_CLICK",
        message: "Attempting to click Apply.",
        last_seen_url: window.location.href,
      });
      const applyButton = findButtonByText(["apply", "apply now", "start application"]);
      if (applyButton) {
        applyButton.click();
        await sleep(1500);
      }

      if (document.body?.innerText?.toLowerCase().includes("sign in")) {
        return { status: "NEEDS_ATTENTION", reason: "LOGIN_REQUIRED" };
      }

      await logEvent(ctx, {
        run_id: ctx.runId,
        event_type: "STEP_FILL_FIELDS",
        message: "Filling Workday form fields.",
        last_seen_url: window.location.href,
      });
      await fillTextInputs(ctx.defaultEmail);
      if (ctx.resumeUrl) {
        const upload = await uploadResume(ctx.resumeUrl);
        if (!upload.ok) {
          return { status: "NEEDS_ATTENTION", reason: "RESUME_UPLOAD_FAILED" };
        }
      }

      if (requiredFieldsMissing()) {
        return { status: "NEEDS_ATTENTION", reason: "REQUIRED_FIELD_MISSING" };
      }

      const nextButton = findButtonByText(["next", "review", "submit"]);
      if (!nextButton) {
        return { status: "NEEDS_ATTENTION", reason: "SUBMIT_BUTTON_MISSING" };
      }

      await logEvent(ctx, {
        run_id: ctx.runId,
        event_type: "STEP_SUBMIT_CLICK",
        message: "Submitting Workday application.",
        last_seen_url: window.location.href,
      });
      nextButton.click();
      await sleep(1500);

      const confirmationText = document.body?.innerText?.toLowerCase() ?? "";
      if (confirmationText.includes("thank you") || confirmationText.includes("submitted")) {
        return { status: "APPLIED" };
      }

      return { status: "NEEDS_ATTENTION", reason: "REQUIRES_REVIEW" };
    },
  },
};

async function runAutomation({ runId, apiBaseUrl, amEmail, job, resumeUrl }) {
  const atsType = detectAtsType();
  const adapter = adapters[atsType] ?? null;

  const ctx = { runId, apiBaseUrl, amEmail, defaultEmail: amEmail, resumeUrl };

  await logEvent(ctx, {
    run_id: runId,
    event_type: "RUNNER_STARTED",
    message: `Runner started on ${atsType}.`,
    payload: { ats_type: atsType },
    last_seen_url: window.location.href,
  });

  if (!adapter) {
    await postJson(
      `${apiBaseUrl}/api/apply/pause`,
      {
        run_id: runId,
        reason: "UNKNOWN_ATS",
        message: "ATS type not recognized.",
        last_seen_url: window.location.href,
      },
      amEmail
    );
    chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId });
    return;
  }

  if (hasCaptcha()) {
    await postJson(
      `${apiBaseUrl}/api/apply/pause`,
      {
        run_id: runId,
        reason: "CAPTCHA",
        message: "Captcha detected.",
        last_seen_url: window.location.href,
      },
      amEmail
    );
    chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId });
    return;
  }

  if (hasSmsOtp()) {
    await postJson(
      `${apiBaseUrl}/api/apply/pause`,
      {
        run_id: runId,
        reason: "SMS_OTP_REQUIRED",
        message: "SMS verification required.",
        last_seen_url: window.location.href,
      },
      amEmail
    );
    chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId });
    return;
  }

  let result;
  try {
    result = await adapter.run(ctx);
  } catch (error) {
    await postJson(
      `${apiBaseUrl}/api/apply/retry`,
      {
        run_id: runId,
        note: "Runner error, retry requested.",
      },
      amEmail
    );
    chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId });
    return;
  }

  if (result.status === "APPLIED") {
    await postJson(
      `${apiBaseUrl}/api/apply/complete`,
      {
        run_id: runId,
        note: "Application submitted by runner.",
        last_seen_url: window.location.href,
      },
      amEmail
    );
    chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId });
    return;
  }

  if (result.status === "NEEDS_ATTENTION") {
    await postJson(
      `${apiBaseUrl}/api/apply/pause`,
      {
        run_id: runId,
        reason: result.reason ?? "UNKNOWN",
        message: "Runner needs attention.",
        last_seen_url: window.location.href,
      },
      amEmail
    );
    chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId });
    return;
  }

  await postJson(
    `${apiBaseUrl}/api/apply/retry`,
    {
      run_id: runId,
      note: "Runner retry.",
    },
    amEmail
  );

  chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "START_RUN") return;
  runAutomation({
    runId: message.runId,
    apiBaseUrl: message.apiBaseUrl,
    amEmail: message.amEmail,
    job: message.job,
    resumeUrl: message.resumeUrl,
  }).catch((error) => {
    console.error("Runner error:", error);
    chrome.runtime.sendMessage({ type: "RUN_COMPLETE", runId: message.runId });
  });
});
