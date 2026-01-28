const STORAGE_KEYS = {
  apiBaseUrl: "apiBaseUrl",
  amEmail: "amEmail",
  jobSeekerId: "jobSeekerId",
  runnerEnabled: "runnerEnabled",
};

const RUNNER_ALARM = "jobgenius-runner";

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
    headers: { "x-am-email": amEmail },
  });

  if (!response.ok) {
    throw new Error(`Next job request failed (${response.status}).`);
  }

  return response.json();
}

async function runJobInTab(job, runId, apiBaseUrl, amEmail) {
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
    apiBaseUrl,
    amEmail,
    job,
  });
}

async function pollRunner() {
  const {
    apiBaseUrl,
    amEmail,
    jobSeekerId,
    runnerEnabled,
  } = await getStorage(Object.values(STORAGE_KEYS));

  if (!runnerEnabled) {
    return;
  }

  if (!apiBaseUrl || !amEmail || !jobSeekerId) {
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
    await runJobInTab(payload.job, payload.run_id, apiBaseUrl, amEmail);
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

  return false;
});
