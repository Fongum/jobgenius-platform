const STORAGE_KEYS = {
  apiBaseUrl: "apiBaseUrl",
  authToken: "authToken",
  activeSeekerId: "activeSeekerId",
  runnerEnabled: "runnerEnabled",
  dryRun: "dryRun",
};

const RUNNER_ALARM = "jobgenius-runner";
const activeRuns = new Set();
const ATTENTION_RESUME_COOLDOWN_MS = 10 * 60 * 1000;
const attentionResumeHistory = new Map();
const AUTO_RESUME_REASONS = new Set([
  "CAPTCHA",
  "LOGIN_REQUIRED",
  "REAUTH_REQUIRED",
  "OTP_SMS",
  "OTP_EMAIL",
]);

function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function setStorage(values) {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, resolve);
  });
}

async function fetchNextJob(apiBaseUrl, authToken, activeSeekerId, runId = null) {
  const params = new URLSearchParams({
    jobseekerId: activeSeekerId,
  });
  if (runId) {
    params.set("runId", runId);
  }
  const endpoint = `${apiBaseUrl}/api/apply/next?${params.toString()}`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "x-runner": "extension",
    },
  });

  if (!response.ok) {
    throw new Error(`Next job request failed (${response.status}).`);
  }

  return response.json();
}

function normalizeReason(reason) {
  return String(reason ?? "")
    .trim()
    .toUpperCase();
}

function shouldAutoResumeAttention(reason) {
  return AUTO_RESUME_REASONS.has(normalizeReason(reason));
}

function cleanupAttentionResumeHistory() {
  const cutoff = Date.now() - ATTENTION_RESUME_COOLDOWN_MS * 3;
  for (const [runId, ts] of attentionResumeHistory.entries()) {
    if (ts < cutoff) {
      attentionResumeHistory.delete(runId);
    }
  }
}

function canResumeRunNow(runId) {
  const lastAttempt = attentionResumeHistory.get(runId) ?? 0;
  return Date.now() - lastAttempt >= ATTENTION_RESUME_COOLDOWN_MS;
}

async function fetchNeedsAttentionJobs(apiBaseUrl, authToken) {
  const response = await fetch(`${apiBaseUrl}/api/extension/my-jobs?status=NEEDS_ATTENTION`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "x-runner": "extension",
    },
  });

  if (!response.ok) {
    throw new Error(`Needs-attention fetch failed (${response.status}).`);
  }

  return response.json();
}

function pickAutoResumableAttentionItem(items) {
  if (!Array.isArray(items)) {
    return null;
  }

  for (const item of items) {
    const runId = item?.run_id;
    if (!runId) {
      continue;
    }

    const reason = normalizeReason(item?.needs_attention_reason ?? item?.last_error_code ?? "");
    if (!shouldAutoResumeAttention(reason)) {
      continue;
    }

    if (!canResumeRunNow(runId)) {
      continue;
    }

    return {
      runId,
      reason,
      job: item?.job ?? null,
    };
  }

  return null;
}

async function resumeNeedsAttentionRun(apiBaseUrl, authToken, runId, reason) {
  const response = await fetch(`${apiBaseUrl}/api/apply/resume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
      "x-runner": "extension",
    },
    body: JSON.stringify({
      run_id: runId,
      note: `Auto-resumed by extension for ${reason || "needs attention"}.`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resume run failed (${response.status}).`);
  }

  return response.json();
}

function shouldOpenInteractiveTab(reason) {
  const normalized = normalizeReason(reason);
  return (
    normalized === "CAPTCHA" ||
    normalized === "LOGIN_REQUIRED" ||
    normalized === "REAUTH_REQUIRED" ||
    normalized === "OTP_SMS" ||
    normalized === "OTP_EMAIL"
  );
}

async function runJobInTab(
  job,
  runId,
  apiBaseUrl,
  authToken,
  resumeUrl,
  claimToken,
  activeSeekerId,
  dryRun,
  profile,
  activeTab = false
) {
  const tab = await chrome.tabs.create({ url: job.url, active: Boolean(activeTab) });

  await new Promise((resolve) => {
    const listener = (tabId, changeInfo) => {
      if (tabId === tab.id && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: [
      "runner/captcha-overlay.js",
      "runner/sidebar.js",
      "runner/dom.js",
      "runner/adapters/base.js",
      "runner/adapters/linkedin_easy_apply.js",
      "runner/adapters/greenhouse.js",
      "runner/adapters/workday.js",
      "runner/adapters/generic.js",
      "runner/engine.js",
      "runner/index.js",
    ],
  });

  chrome.tabs.sendMessage(tab.id, {
    type: "START_RUN",
    runId,
    claimToken,
    apiBaseUrl,
    authToken,
    jobSeekerId: activeSeekerId,
    activeSeekerId,
    job,
    resumeUrl,
    profile,
    dryRun: Boolean(dryRun),
  });
}

async function launchPayloadRun(payload, context, activeTab = false) {
  const { apiBaseUrl, authToken, activeSeekerId, dryRun } = context;
  if (!payload?.run_id || !payload?.job?.url) {
    return false;
  }

  activeRuns.add(payload.run_id);
  await runJobInTab(
    payload.job,
    payload.run_id,
    apiBaseUrl,
    authToken,
    payload.resume?.url ?? null,
    payload.claim_token ?? null,
    payload.job_seeker_id ?? activeSeekerId,
    dryRun,
    payload.profile ?? null,
    Boolean(activeTab)
  );
  return true;
}

async function tryResumeNeedsAttention(context) {
  cleanupAttentionResumeHistory();

  const { apiBaseUrl, authToken, activeSeekerId } = context;
  let attentionPayload;

  try {
    attentionPayload = await fetchNeedsAttentionJobs(apiBaseUrl, authToken);
  } catch (error) {
    console.warn("Needs-attention polling failed:", error);
    return false;
  }

  const candidate = pickAutoResumableAttentionItem(attentionPayload?.items ?? []);
  if (!candidate?.runId) {
    return false;
  }

  attentionResumeHistory.set(candidate.runId, Date.now());

  try {
    await resumeNeedsAttentionRun(
      apiBaseUrl,
      authToken,
      candidate.runId,
      candidate.reason
    );
  } catch (error) {
    console.warn("Needs-attention resume failed:", error);
    return false;
  }

  let resumedRun;
  try {
    resumedRun = await fetchNextJob(
      apiBaseUrl,
      authToken,
      activeSeekerId,
      candidate.runId
    );
  } catch (error) {
    console.warn("Needs-attention claim failed:", error);
    return false;
  }

  if (!resumedRun?.success || resumedRun.status === "IDLE" || resumedRun.blocked) {
    return false;
  }

  return launchPayloadRun(
    resumedRun,
    context,
    shouldOpenInteractiveTab(candidate.reason)
  );
}

async function pollRunner() {
  const {
    apiBaseUrl,
    authToken,
    activeSeekerId,
    runnerEnabled,
    dryRun,
  } = await getStorage(Object.values(STORAGE_KEYS));

  if (!runnerEnabled) {
    return;
  }

  if (!apiBaseUrl || !authToken || !activeSeekerId) {
    return;
  }

  if (activeRuns.size >= 5) {
    return;
  }

  const context = {
    apiBaseUrl,
    authToken,
    activeSeekerId,
    dryRun,
  };

  let payload;
  try {
    payload = await fetchNextJob(apiBaseUrl, authToken, activeSeekerId);
  } catch (error) {
    console.warn("Runner polling failed:", error);
    return;
  }

  if (!payload?.success) {
    return;
  }

  if (payload.blocked) {
    return;
  }

  if (payload.status === "IDLE") {
    await tryResumeNeedsAttention(context);
    return;
  }

  await launchPayloadRun(payload, context, false);
}

async function runSpecificRun(runId, activateTab = true) {
  const {
    apiBaseUrl,
    authToken,
    activeSeekerId,
    dryRun,
  } = await getStorage(Object.values(STORAGE_KEYS));

  if (!apiBaseUrl || !authToken || !activeSeekerId) {
    return { success: false, error: "Extension is not connected." };
  }

  if (!runId) {
    return { success: false, error: "Missing run ID." };
  }

  if (activeRuns.size >= 5) {
    return { success: false, error: "Runner is at max concurrency." };
  }

  await setStorage({ [STORAGE_KEYS.runnerEnabled]: true });

  let payload;
  try {
    payload = await fetchNextJob(apiBaseUrl, authToken, activeSeekerId, runId);
  } catch (error) {
    return {
      success: false,
      error: error?.message ?? "Failed to claim run.",
    };
  }

  if (!payload?.success) {
    return { success: false, error: payload?.error ?? "Failed to start run." };
  }

  if (payload.status === "IDLE") {
    return {
      success: false,
      error: "Run is not ready yet. Try again in a moment.",
    };
  }

  if (!payload.run_id || !payload.job?.url) {
    return { success: false, error: "Runner payload is incomplete." };
  }

  await launchPayloadRun(
    payload,
    { apiBaseUrl, authToken, activeSeekerId, dryRun },
    Boolean(activateTab)
  );

  return { success: true, run_id: payload.run_id };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(RUNNER_ALARM, { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(RUNNER_ALARM, { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RUNNER_ALARM) {
    pollRunner();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "RUNNER_TOGGLE") {
    setStorage({ [STORAGE_KEYS.runnerEnabled]: message.enabled }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message?.type === "RUNNER_RUN_NOW") {
    pollRunner().then(() => sendResponse({ success: true }));
    return true;
  }

  if (message?.type === "RUNNER_RUN_FOR_RUN_ID") {
    runSpecificRun(message.runId, message.activateTab !== false)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({
          success: false,
          error: error?.message ?? "Failed to run selected job.",
        })
      );
    return true;
  }

  if (message?.type === "RUN_COMPLETE" && message.runId) {
    activeRuns.delete(message.runId);
    attentionResumeHistory.delete(message.runId);
    return false;
  }

  return false;
});
