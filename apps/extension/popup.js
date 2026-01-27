const storageKey = "apiBaseUrl";
const apiBaseUrlInput = document.getElementById("apiBaseUrl");
const saveButton = document.getElementById("saveJob");
const statusEl = document.getElementById("status");

function setStatus(message, tone = "neutral") {
  statusEl.textContent = message;
  statusEl.style.color =
    tone === "error" ? "#b91c1c" : tone === "success" ? "#047857" : "#1f2937";
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function isValidBaseUrl(value) {
  return /^https?:\/\//i.test(value);
}

chrome.storage.local.get([storageKey], (result) => {
  if (result[storageKey]) {
    apiBaseUrlInput.value = result[storageKey];
  }
});

apiBaseUrlInput.addEventListener("input", () => {
  const value = apiBaseUrlInput.value.trim();
  chrome.storage.local.set({ [storageKey]: value });
});

saveButton.addEventListener("click", async () => {
  const rawBaseUrl = apiBaseUrlInput.value.trim();

  if (!rawBaseUrl) {
    setStatus("Please set the API Base URL first.", "error");
    return;
  }

  if (!isValidBaseUrl(rawBaseUrl)) {
    setStatus("API Base URL must start with http:// or https://", "error");
    return;
  }

  setStatus("Saving...");

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

  const apiBaseUrl = normalizeBaseUrl(rawBaseUrl);
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