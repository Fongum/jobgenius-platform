async function postJson(url, payload, amEmail) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-am-email": amEmail,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}).`);
  }

  return response.json();
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

async function fillTextInputs() {
  const inputs = Array.from(
    document.querySelectorAll("input[type='text'], input[type='email'], textarea")
  );

  inputs.forEach((input) => {
    if (input.value) return;
    if (input.disabled) return;
    input.focus();
    input.value = input.type === "email" ? "am@jobgenius.ai" : "N/A";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function runAutomation({ runId, apiBaseUrl, amEmail, job }) {
  const atsType = detectAtsType();

  await postJson(`${apiBaseUrl}/api/apply/event`, {
    run_id: runId,
    event_type: "RUNNER_STARTED",
    message: `Runner started on ${atsType}.`,
    payload: { ats_type: atsType },
  }, amEmail);

  if (atsType === "UNKNOWN") {
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
    return;
  }

  await postJson(`${apiBaseUrl}/api/apply/event`, {
    run_id: runId,
    event_type: "STEP_APPLY_CLICK",
    message: "Attempting to click apply.",
    payload: { url: window.location.href },
  }, amEmail);

  const applyButton = findButtonByText(["easy apply", "apply"]);
  if (!applyButton) {
    await postJson(
      `${apiBaseUrl}/api/apply/pause`,
      {
        run_id: runId,
        reason: "APPLY_BUTTON_MISSING",
        message: "Apply button not found.",
        last_seen_url: window.location.href,
      },
      amEmail
    );
    return;
  }

  applyButton.click();

  await postJson(`${apiBaseUrl}/api/apply/event`, {
    run_id: runId,
    event_type: "STEP_FILL_FIELDS",
    message: "Filling basic fields.",
  }, amEmail);

  await new Promise((resolve) => setTimeout(resolve, 1500));
  await fillTextInputs();

  const fileInput = document.querySelector("input[type='file']");
  if (fileInput) {
    await postJson(
      `${apiBaseUrl}/api/apply/event`,
      {
        run_id: runId,
        event_type: "UPLOAD_RESUME_SKIPPED",
        message: "Resume upload is not configured in MVP.",
      },
      amEmail
    );
  }

  const submitButton = findButtonByText(["submit", "review", "next"]);
  if (!submitButton) {
    await postJson(
      `${apiBaseUrl}/api/apply/pause`,
      {
        run_id: runId,
        reason: "UNEXPECTED_FORM_STATE",
        message: "Submission button not found.",
        last_seen_url: window.location.href,
      },
      amEmail
    );
    return;
  }

  submitButton.click();

  await postJson(`${apiBaseUrl}/api/apply/event`, {
    run_id: runId,
    event_type: "STEP_SUBMIT_CLICK",
    message: "Clicked submit/review.",
  }, amEmail);

  await new Promise((resolve) => setTimeout(resolve, 2000));

  const confirmationText = document.body?.innerText?.toLowerCase() ?? "";
  if (confirmationText.includes("thank you") || confirmationText.includes("submitted")) {
    await postJson(
      `${apiBaseUrl}/api/apply/complete`,
      {
        run_id: runId,
        note: "Application submitted by runner.",
        last_seen_url: window.location.href,
      },
      amEmail
    );
    return;
  }

  await postJson(
    `${apiBaseUrl}/api/apply/pause`,
    {
      run_id: runId,
      reason: "REQUIRES_REVIEW",
      message: "Submission requires manual review.",
      last_seen_url: window.location.href,
    },
    amEmail
  );
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "START_RUN") return;
  runAutomation({
    runId: message.runId,
    apiBaseUrl: message.apiBaseUrl,
    amEmail: message.amEmail,
    job: message.job,
  }).catch((error) => {
    console.error("Runner error:", error);
  });
});
