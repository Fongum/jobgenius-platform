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
const sessionSyncHistory = new Map();
const sessionSyncInFlight = new Set();
const AUTO_RESUME_REASONS = new Set([
  "CAPTCHA",
  "LOGIN_REQUIRED",
  "REAUTH_REQUIRED",
  "OTP_SMS",
  "OTP_EMAIL",
]);
const JOB_SPY_SCRIPT_FILE = "spy-overlay.js";
const SESSION_SYNC_THROTTLE_MS = 2 * 60 * 1000;
const SESSION_SYNC_HOST_HINTS = [
  "linkedin.com",
  "indeed.com",
  "greenhouse.io",
  "workday.com",
  "myworkdayjobs.com",
  "lever.co",
  "smartrecruiters.com",
  "icims.com",
  "jobvite.com",
  "breezy.hr",
  "ashbyhq.com",
  "bamboohr.com",
  "workable.com",
  "recruitee.com",
  "personio.com",
];
const JOB_SPY_HOST_HINTS = [
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "greenhouse.io",
  "workday.com",
  "myworkdayjobs.com",
  "lever.co",
  "smartrecruiters.com",
  "icims.com",
  "jobvite.com",
  "workable.com",
  "bamboohr.com",
  "recruitee.com",
  "ashbyhq.com",
  "breezy.hr",
];
const SESSION_SYNC_EXCLUDED_HOST_HINTS = [
  "job-genius.com",
  "vercel.app",
  "localhost",
];
const RUNNER_SCRIPT_FILES = [
  "runner/captcha-overlay.js",
  "runner/sidebar.js",
  "runner/dom.js",
  "runner/adapters/base.js",
  "runner/adapters/linkedin_easy_apply.js",
  "runner/adapters/greenhouse.js",
  "runner/adapters/workday.js",
  "runner/adapters/lever.js",
  "runner/adapters/smartrecruiters.js",
  "runner/adapters/generic.js",
  "runner/engine.js",
  "runner/index.js",
];

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

function mapSameSite(value) {
  switch (String(value ?? "").toLowerCase()) {
    case "no_restriction":
      return "None";
    case "strict":
      return "Strict";
    case "lax":
      return "Lax";
    default:
      return "Lax";
  }
}

function normalizeHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function pathLooksLikeJob(pathname) {
  const path = String(pathname || "").toLowerCase();
  return (
    path.includes("/job") ||
    path.includes("/jobs") ||
    path.includes("/career") ||
    path.includes("/careers") ||
    path.includes("/position") ||
    path.includes("/vacancy") ||
    path.includes("/opportunity") ||
    path.includes("/apply")
  );
}

function isEligibleSessionSyncUrl(url, apiBaseUrl, force = false) {
  if (!url || !/^https:\/\//i.test(url)) {
    return false;
  }

  const host = normalizeHostname(url);
  if (!host) {
    return false;
  }

  if (SESSION_SYNC_EXCLUDED_HOST_HINTS.some((hint) => host.includes(hint))) {
    return false;
  }

  const apiHost = normalizeHostname(apiBaseUrl);
  if (apiHost && host === apiHost) {
    return false;
  }

  if (force) {
    return true;
  }

  return SESSION_SYNC_HOST_HINTS.some(
    (hint) => host === hint || host.endsWith(`.${hint}`)
  );
}

function isEligibleJobSpyUrl(url, apiBaseUrl) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return false;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const host = normalizeHostname(url);
  if (!host) {
    return false;
  }

  if (SESSION_SYNC_EXCLUDED_HOST_HINTS.some((hint) => host.includes(hint))) {
    return false;
  }

  const apiHost = normalizeHostname(apiBaseUrl);
  if (apiHost && host === apiHost) {
    return false;
  }

  if (JOB_SPY_HOST_HINTS.some((hint) => host === hint || host.endsWith(`.${hint}`))) {
    return true;
  }

  return pathLooksLikeJob(parsed.pathname);
}

function canSyncOriginNow(syncKey, force = false) {
  if (force) {
    return true;
  }
  const lastSync = sessionSyncHistory.get(syncKey) ?? 0;
  return Date.now() - lastSync >= SESSION_SYNC_THROTTLE_MS;
}

async function captureStorageStateForTab(tabId, url) {
  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    return null;
  }

  let cookies = [];
  try {
    const rawCookies = await chrome.cookies.getAll({ url: origin });
    cookies = rawCookies.map((cookie) => {
      const mapped = {
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        httpOnly: Boolean(cookie.httpOnly),
        secure: Boolean(cookie.secure),
        sameSite: mapSameSite(cookie.sameSite),
      };
      if (typeof cookie.expirationDate === "number") {
        mapped.expires = cookie.expirationDate;
      }
      return mapped;
    });
  } catch (error) {
    console.warn("Session sync cookie capture failed:", error);
  }

  let localStorageData = [];
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const entries = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (key) {
            entries.push({
              name: key,
              value: localStorage.getItem(key) ?? "",
            });
          }
        }
        return entries;
      },
    });
    localStorageData = results?.[0]?.result ?? [];
  } catch (error) {
    console.warn("Session sync localStorage capture failed:", error);
  }

  if (cookies.length === 0 && localStorageData.length === 0) {
    return null;
  }

  return {
    cookies,
    origins: [
      {
        origin,
        localStorage: localStorageData,
      },
    ],
  };
}

async function uploadStorageState(apiBaseUrl, authToken, activeSeekerId, storageState) {
  const response = await fetch(`${apiBaseUrl}/api/extension/storage-state`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
      "x-runner": "extension",
    },
    body: JSON.stringify({
      job_seeker_id: activeSeekerId,
      storage_state: storageState,
    }),
  });

  if (!response.ok) {
    throw new Error(`Storage state upload failed (${response.status}).`);
  }

  return response.json();
}

async function saveSpyAppliedJob(apiBaseUrl, authToken, activeSeekerId, job) {
  const response = await fetch(`${apiBaseUrl}/api/extension/spy-apply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
      "x-runner": "extension",
    },
    body: JSON.stringify({
      job_seeker_id: activeSeekerId,
      job,
      note: "Tracked as applied by JobGenius Spy.",
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Spy apply failed (${response.status}).`);
  }

  return data;
}

async function maybeInjectJobSpyForTab(tabId, url) {
  if (activeRuns.size > 0) {
    return false;
  }

  const {
    apiBaseUrl,
    authToken,
    activeSeekerId,
  } = await getStorage([
    STORAGE_KEYS.apiBaseUrl,
    STORAGE_KEYS.authToken,
    STORAGE_KEYS.activeSeekerId,
  ]);

  if (!apiBaseUrl || !authToken || !activeSeekerId) {
    return false;
  }

  if (!isEligibleJobSpyUrl(url, apiBaseUrl)) {
    return false;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [JOB_SPY_SCRIPT_FILE],
    });
    return true;
  } catch (error) {
    console.warn("Job spy injection failed:", error);
    return false;
  }
}

async function maybeSyncSessionStateForTab(tabId, url, options = {}) {
  const force = Boolean(options.force);
  const {
    apiBaseUrl,
    authToken,
    activeSeekerId,
  } = await getStorage([
    STORAGE_KEYS.apiBaseUrl,
    STORAGE_KEYS.authToken,
    STORAGE_KEYS.activeSeekerId,
  ]);

  if (!apiBaseUrl || !authToken || !activeSeekerId) {
    return false;
  }

  if (!isEligibleSessionSyncUrl(url, apiBaseUrl, force)) {
    return false;
  }

  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    return false;
  }

  const syncKey = `${activeSeekerId}::${origin}`;
  if (sessionSyncInFlight.has(syncKey)) {
    return false;
  }

  if (!canSyncOriginNow(syncKey, force)) {
    return false;
  }

  sessionSyncInFlight.add(syncKey);
  try {
    const storageState = await captureStorageStateForTab(tabId, url);
    if (!storageState) {
      return false;
    }
    await uploadStorageState(apiBaseUrl, authToken, activeSeekerId, storageState);
    sessionSyncHistory.set(syncKey, Date.now());
    return true;
  } catch (error) {
    console.warn("Session sync failed:", error);
    return false;
  } finally {
    sessionSyncInFlight.delete(syncKey);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTabComplete(tabId, timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) {
      throw new Error("Target tab is no longer available.");
    }
    if (tab.status === "complete") {
      return tab;
    }
    await sleep(200);
  }
  return chrome.tabs.get(tabId);
}

async function startRunnerInExistingTab(tabId, payload) {
  const {
    job,
    runId,
    apiBaseUrl,
    authToken,
    resumeUrl,
    claimToken,
    jobSeekerId,
    activeSeekerId,
    dryRun,
    profile,
  } = payload;

  const tab = await waitForTabComplete(tabId);
  if (tab?.url) {
    await maybeSyncSessionStateForTab(tabId, tab.url, { force: true });
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: RUNNER_SCRIPT_FILES,
  });

  chrome.tabs.sendMessage(tabId, {
    type: "START_RUN",
    runId,
    claimToken,
    apiBaseUrl,
    authToken,
    jobSeekerId,
    activeSeekerId,
    job,
    resumeUrl,
    profile,
    dryRun: Boolean(dryRun),
  });
}

async function findChildTab(parentTabId, windowId, timeoutMs = 4000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const tabs = await chrome.tabs.query({ windowId });
    const child = tabs
      .filter((tab) => tab.id && tab.id !== parentTabId && tab.openerTabId === parentTabId)
      .sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0];

    if (child?.id) {
      return child;
    }

    await sleep(250);
  }

  return null;
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
  await startRunnerInExistingTab(tab.id, {
    job,
    runId,
    apiBaseUrl,
    authToken,
    resumeUrl,
    claimToken,
    jobSeekerId: activeSeekerId,
    activeSeekerId,
    dryRun,
    profile,
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

const SESSION_EXPIRY_ALARM = "jobgenius-session-check";
const SESSION_EXPIRY_WARN_HOURS = 24;

chrome.alarms.create(SESSION_EXPIRY_ALARM, { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RUNNER_ALARM) {
    pollRunner();
  }
  if (alarm.name === SESSION_EXPIRY_ALARM) {
    checkSessionExpiry();
  }
});

async function checkSessionExpiry() {
  const criticalCookies = [
    { url: "https://www.linkedin.com", name: "li_at", label: "LinkedIn" },
  ];

  for (const { url, name, label } of criticalCookies) {
    try {
      const cookie = await chrome.cookies.get({ url, name });
      if (!cookie) {
        showSessionWarning(label, "not found — please log in to " + label);
        continue;
      }
      if (typeof cookie.expirationDate === "number") {
        const hoursUntilExpiry = (cookie.expirationDate - Date.now() / 1000) / 3600;
        if (hoursUntilExpiry < SESSION_EXPIRY_WARN_HOURS) {
          showSessionWarning(
            label,
            hoursUntilExpiry <= 0
              ? "session expired — please log in again"
              : `session expires in ${Math.round(hoursUntilExpiry)} hours — visit ${label} to refresh`
          );
        }
      }
    } catch (err) {
      console.warn(`Session expiry check failed for ${label}:`, err);
    }
  }
}

function showSessionWarning(platform, message) {
  chrome.action.setBadgeText({ text: "!" });
  chrome.action.setBadgeBackgroundColor({ color: "#EF4444" });
  // Store warning for popup to display
  setStorage({
    sessionWarning: { platform, message, timestamp: Date.now() },
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab?.url) {
    return;
  }
  maybeSyncSessionStateForTab(tabId, tab.url).catch((error) => {
    console.warn("Session sync on tab update failed:", error);
  });
  maybeInjectJobSpyForTab(tabId, tab.url).catch((error) => {
    console.warn("Job spy injection on tab update failed:", error);
  });
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs
    .get(tabId)
    .then((tab) => {
      if (!tab?.url) {
        return;
      }
      return Promise.allSettled([
        maybeSyncSessionStateForTab(tabId, tab.url),
        maybeInjectJobSpyForTab(tabId, tab.url),
      ]);
    })
    .catch((error) => {
      console.warn("Session sync on tab activate failed:", error);
    });
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

  if (message?.type === "RUNNER_HANDOFF_TO_CHILD_TAB") {
    const sourceTabId = sender?.tab?.id;
    const windowId = sender?.tab?.windowId;

    if (!sourceTabId || windowId === undefined) {
      sendResponse({ success: false, error: "Missing source tab." });
      return false;
    }

    findChildTab(sourceTabId, windowId)
      .then(async (childTab) => {
        if (!childTab?.id) {
          sendResponse({ success: false, error: "Application tab not found." });
          return;
        }

        await startRunnerInExistingTab(childTab.id, {
          job: message.job ?? null,
          runId: message.runId,
          apiBaseUrl: message.apiBaseUrl,
          authToken: message.authToken,
          resumeUrl: message.resumeUrl ?? null,
          claimToken: message.claimToken ?? null,
          jobSeekerId: message.jobSeekerId ?? message.activeSeekerId ?? null,
          activeSeekerId: message.activeSeekerId ?? null,
          dryRun: Boolean(message.dryRun),
          profile: message.profile ?? null,
        });

        sendResponse({ success: true, tab_id: childTab.id });
      })
      .catch((error) =>
        sendResponse({
          success: false,
          error: error?.message ?? "Failed to hand off runner.",
        })
      );

    return true;
  }

  if (message?.type === "JOB_SPY_MARK_APPLIED") {
    getStorage([
      STORAGE_KEYS.apiBaseUrl,
      STORAGE_KEYS.authToken,
      STORAGE_KEYS.activeSeekerId,
    ])
      .then(async ({ apiBaseUrl, authToken, activeSeekerId }) => {
        if (!apiBaseUrl || !authToken || !activeSeekerId) {
          sendResponse({
            success: false,
            error: "Extension is not connected to an active job seeker.",
          });
          return;
        }

        const result = await saveSpyAppliedJob(
          apiBaseUrl,
          authToken,
          activeSeekerId,
          message.job || null
        );
        sendResponse({ success: true, ...result });
      })
      .catch((error) =>
        sendResponse({
          success: false,
          error: error?.message || "Failed to save tracked application.",
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
