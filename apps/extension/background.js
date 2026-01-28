const STORAGE_KEYS = {
  apiBaseUrl: "apiBaseUrl",
  amEmail: "amEmail",
  jobSeekerId: "jobSeekerId",
  runnerEnabled: "runnerEnabled",
  dryRun: "dryRun",
};

const RUNNER_ALARM = "jobgenius-runner";
const activeRuns = new Set();

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

async function fetchNextJob(apiBaseUrl, amEmail, jobSeekerId) {
  const endpoint = `${apiBaseUrl}/api/apply/next?jobseekerId=${encodeURIComponent(
    jobSeekerId
  )}`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: { "x-am-email": amEmail, "x-runner": "extension" },
  });

  if (!response.ok) {
    throw new Error(`Next job request failed (${response.status}).`);
  }

  return response.json();
}

async function runJobInTab(job, runId, apiBaseUrl, amEmail, resumeUrl, claimToken, jobSeekerId, dryRun) {
  const tab = await chrome.tabs.create({ url: job.url, active: false });

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
    files: ["runner.js"],
  });

  chrome.tabs.sendMessage(tab.id, {
    type: "START_RUN",
    runId,
    claimToken,
    apiBaseUrl,
    amEmail,
    jobSeekerId,
    job,
    resumeUrl,
    dryRun: Boolean(dryRun),
  });
}

async function pollRunner() {
  const {
    apiBaseUrl,
    amEmail,
    jobSeekerId,
    runnerEnabled,
    dryRun,
  } = await getStorage(Object.values(STORAGE_KEYS));

  if (!runnerEnabled) {
    return;
  }

  if (!apiBaseUrl || !amEmail || !jobSeekerId) {
    return;
  }

  if (activeRuns.size >= 5) {
    return;
  }

  let payload;
  try {
    payload = await fetchNextJob(apiBaseUrl, amEmail, jobSeekerId);
  } catch (error) {
    console.warn("Runner polling failed:", error);
    return;
  }

  if (!payload?.success) {
    return;
  }

  if (payload.status === "IDLE" || payload.blocked) {
    return;
  }

  if (payload.run_id && payload.job?.url) {
    activeRuns.add(payload.run_id);
    await runJobInTab(
      payload.job,
      payload.run_id,
      apiBaseUrl,
      amEmail,
      payload.resume?.url ?? null,
      payload.claim_token ?? null,
      payload.job_seeker_id ?? jobSeekerId,
      dryRun
    );
  }
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

  if (message?.type === "RUN_COMPLETE" && message.runId) {
    activeRuns.delete(message.runId);
    return false;
  }

  return false;
});
