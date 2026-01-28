const storageKey = "apiBaseUrl";
const amEmailKey = "amEmail";
const jobSeekerKey = "jobSeekerId";
const runnerKey = "runnerEnabled";
const apiBaseUrlInput = document.getElementById("apiBaseUrl");
const amEmailInput = document.getElementById("amEmail");
const jobSeekerInput = document.getElementById("jobSeekerId");
const saveButton = document.getElementById("saveJob");
const toggleRunnerButton = document.getElementById("toggleRunner");
const statusEl = document.getElementById("status");

function setStatus(message, tone = "neutral") {
  statusEl.textContent = message;
  statusEl.style.color =
    tone === "error" ? "#b91c1c" : tone === "success" ? "#047857" : "#1f2937";
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function getApiBaseUrlFromInput() {
  return normalizeBaseUrl(apiBaseUrlInput.value.trim());
}

function isValidBaseUrl(value) {
  return /^https?:\/\//i.test(value);
}

chrome.storage.local.get([storageKey], (result) => {
  if (result[storageKey]) {
    apiBaseUrlInput.value = result[storageKey];
  }
});

chrome.storage.local.get([amEmailKey], (result) => {
  if (result[amEmailKey]) {
    amEmailInput.value = result[amEmailKey];
  }
});

chrome.storage.local.get([jobSeekerKey], (result) => {
  if (result[jobSeekerKey]) {
    jobSeekerInput.value = result[jobSeekerKey];
  }
});

chrome.storage.local.get([runnerKey], (result) => {
  toggleRunnerButton.textContent = result[runnerKey]
    ? "Stop Runner"
    : "Start Runner";
});

function persistBaseUrlFromInput() {
  const value = getApiBaseUrlFromInput();
  chrome.storage.local.set({ [storageKey]: value });
}

apiBaseUrlInput.addEventListener("input", persistBaseUrlFromInput);
apiBaseUrlInput.addEventListener("blur", persistBaseUrlFromInput);

amEmailInput.addEventListener("input", () => {
  chrome.storage.local.set({ [amEmailKey]: amEmailInput.value.trim() });
});

jobSeekerInput.addEventListener("input", () => {
  chrome.storage.local.set({ [jobSeekerKey]: jobSeekerInput.value.trim() });
});

saveButton.addEventListener("click", async () => {
  const apiBaseUrl = getApiBaseUrlFromInput();
  const amEmail = amEmailInput.value.trim();

  if (!apiBaseUrl) {
    setStatus("Please set the API Base URL first.", "error");
    return;
  }

  if (!isValidBaseUrl(apiBaseUrl)) {
    setStatus("API Base URL must start with http:// or https://", "error");
    return;
  }

  if (!amEmail) {
    setStatus("Please set the AM email header.", "error");
    return;
  }

  chrome.storage.local.set({ [storageKey]: apiBaseUrl, [amEmailKey]: amEmail });
  console.log("Using API base URL:", apiBaseUrl);
  setStatus(`Using: ${apiBaseUrl}. Saving...`);

  let tab;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
  } catch (error) {
    setStatus("Unable to read the active tab.", "error");
    return;
  }

  if (!tab || !tab.url) {
    setStatus("No active tab URL found.", "error");
    return;
  }

  const payload = {
    url: tab.url,
    title: tab.title || "Untitled",
    source: "extension",
    raw_html: null,
    raw_text: null,
  };

  const endpoint = `${apiBaseUrl}/api/jobs/save`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setStatus(`Request failed (${response.status}).`, "error");
      return;
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      setStatus("Response was not valid JSON.", "error");
      return;
    }

    if (data?.success) {
      if (data.duplicate) {
        setStatus("Job already saved (duplicate).", "success");
      } else if (data.needs_attention) {
        setStatus("Saved, needs attention.", "success");
      } else if (data.id) {
        setStatus(`Saved! ID: ${data.id}`, "success");
      } else {
        setStatus("Saved!", "success");
      }
      return;
    }

    setStatus("Save failed. Check the API response.", "error");
  } catch (error) {
    setStatus("Network error while saving job.", "error");
  }
});

toggleRunnerButton.addEventListener("click", async () => {
  chrome.storage.local.get([runnerKey], (result) => {
    const enabled = Boolean(result[runnerKey]);
    const nextValue = !enabled;
    const apiBaseUrl = getApiBaseUrlFromInput();
    const amEmail = amEmailInput.value.trim();
    const jobSeekerId = jobSeekerInput.value.trim();

    if (nextValue) {
      if (!apiBaseUrl || !isValidBaseUrl(apiBaseUrl)) {
        setStatus("Set a valid API Base URL before starting.", "error");
        return;
      }
      if (!amEmail || !jobSeekerId) {
        setStatus("Set AM Email and Job Seeker ID before starting.", "error");
        return;
      }
    }

    chrome.storage.local.set({ [runnerKey]: nextValue });
    chrome.runtime.sendMessage({ type: "RUNNER_TOGGLE", enabled: nextValue });
    toggleRunnerButton.textContent = nextValue ? "Stop Runner" : "Start Runner";
    setStatus(nextValue ? "Runner started." : "Runner stopped.");
  });
});
