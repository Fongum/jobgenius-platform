// Storage keys
const STORAGE_KEYS = {
  apiBaseUrl: "apiBaseUrl",
  authToken: "authToken",
  amInfo: "amInfo",
  activeSeekerId: "activeSeekerId",
  runnerEnabled: "runnerEnabled",
  dryRun: "dryRun",
};

// State
let authToken = null;
let amInfo = null;
let activeSeekerId = null;

// DOM Elements
const els = {
  authGate: document.getElementById("authGate"),
  mainApp: document.getElementById("mainApp"),
  apiBaseUrlAuth: document.getElementById("apiBaseUrlAuth"),
  amCodeInput: document.getElementById("amCodeInput"),
  connectBtn: document.getElementById("connectBtn"),
  authStatus: document.getElementById("authStatus"),
  connectionBadge: document.getElementById("connectionBadge"),
  connectionText: document.getElementById("connectionText"),
  amAvatar: document.getElementById("amAvatar"),
  amName: document.getElementById("amName"),
  amEmailDisplay: document.getElementById("amEmailDisplay"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  seekerSelect: document.getElementById("seekerSelect"),
  tabs: document.querySelectorAll(".tab"),
  panels: document.querySelectorAll(".panel"),
  pageTitle: document.getElementById("pageTitle"),
  pageUrl: document.getElementById("pageUrl"),
  detectedBoard: document.getElementById("detectedBoard"),
  saveJobBtn: document.getElementById("saveJob"),
  scrapeVisibleBtn: document.getElementById("scrapeVisible"),
  scrapeAllBtn: document.getElementById("scrapeAll"),
  saveStatus: document.getElementById("saveStatus"),
  refreshMatchedBtn: document.getElementById("refreshMatched"),
  matchedJobsList: document.getElementById("matchedJobsList"),
  matchedEmpty: document.getElementById("matchedEmpty"),
  scrapeContactsBtn: document.getElementById("scrapeContacts"),
  contactsList: document.getElementById("contactsList"),
  contactsEmpty: document.getElementById("contactsEmpty"),
  contactsStatus: document.getElementById("contactsStatus"),
  apiBaseUrl: document.getElementById("apiBaseUrl"),
  dryRun: document.getElementById("dryRun"),
  toggleRunnerBtn: document.getElementById("toggleRunner"),
  saveSessionStateBtn: document.getElementById("saveSessionState"),
  runnerIndicator: document.getElementById("runnerIndicator"),
  runnerStatusText: document.getElementById("runnerStatusText"),
  settingsStatus: document.getElementById("settingsStatus"),
};

// Job board detection
const JOB_BOARDS = {
  linkedin: { name: "LinkedIn", patterns: ["linkedin.com/jobs", "linkedin.com/job"], color: "#0a66c2" },
  indeed: { name: "Indeed", patterns: ["indeed.com/viewjob", "indeed.com/jobs"], color: "#2164f3" },
  glassdoor: { name: "Glassdoor", patterns: ["glassdoor.com/job-listing", "glassdoor.com/Job"], color: "#0caa41" },
  greenhouse: { name: "Greenhouse", patterns: ["greenhouse.io", "boards.greenhouse.io"], color: "#3ab549" },
  workday: { name: "Workday", patterns: ["myworkdayjobs.com", "workday.com"], color: "#005cb9" },
  lever: { name: "Lever", patterns: ["lever.co", "jobs.lever.co"], color: "#1a1a1a" },
  dice: { name: "Dice", patterns: ["dice.com/job-detail"], color: "#eb1c26" },
  ziprecruiter: { name: "ZipRecruiter", patterns: ["ziprecruiter.com/jobs"], color: "#50b848" },
};

// ─── Utility Functions ────────────────────────────────────────

function setStatus(element, message, type = "info") {
  element.textContent = message;
  element.className = `status visible ${type}`;
  if (type === "success" || type === "info") {
    setTimeout(() => element.classList.remove("visible"), 5000);
  }
}

function normalizeUrl(url) { return (url || "").replace(/\/+$/, ""); }
function isValidUrl(url) { return /^https?:\/\//i.test(url); }

function detectJobBoard(url) {
  if (!url) return null;
  const lower = url.toLowerCase();
  for (const [key, board] of Object.entries(JOB_BOARDS)) {
    for (const pattern of board.patterns) {
      if (lower.includes(pattern)) return { key, ...board };
    }
  }
  return null;
}

function getApiBaseUrl() {
  const settingsUrl = els.apiBaseUrl?.value?.trim();
  const authUrl = els.apiBaseUrlAuth?.value?.trim();
  return normalizeUrl(settingsUrl || authUrl || "");
}

function getHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
    "x-runner": "extension",
  };
}

function mapSameSite(value) {
  switch ((value || "").toLowerCase()) {
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

// ─── Auth Functions ───────────────────────────────────────────

async function connect() {
  const apiBaseUrl = normalizeUrl(els.apiBaseUrlAuth.value.trim());
  const amCode = els.amCodeInput.value.trim().toUpperCase();

  if (!apiBaseUrl || !isValidUrl(apiBaseUrl)) {
    setStatus(els.authStatus, "Please enter a valid API Base URL.", "error");
    return;
  }
  if (!amCode) {
    setStatus(els.authStatus, "Please enter your AM code.", "error");
    return;
  }

  setStatus(els.authStatus, "Connecting...", "info");
  els.connectBtn.disabled = true;

  try {
    const response = await fetch(`${apiBaseUrl}/api/extension/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ am_code: amCode }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setStatus(els.authStatus, data.error || `Connection failed (${response.status})`, "error");
      return;
    }

    const data = await response.json();
    authToken = data.token;
    amInfo = data.account_manager;

    await chrome.storage.local.set({
      [STORAGE_KEYS.authToken]: authToken,
      [STORAGE_KEYS.amInfo]: amInfo,
      [STORAGE_KEYS.apiBaseUrl]: apiBaseUrl,
    });

    showConnectedUI();
    loadSeekers();
  } catch (error) {
    setStatus(els.authStatus, "Network error: " + error.message, "error");
  } finally {
    els.connectBtn.disabled = false;
  }
}

async function disconnect() {
  const apiBaseUrl = getApiBaseUrl();
  try {
    if (authToken && apiBaseUrl) {
      await fetch(`${apiBaseUrl}/api/extension/auth`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` },
      });
    }
  } catch (e) { /* ignore */ }

  authToken = null;
  amInfo = null;
  activeSeekerId = null;

  await chrome.storage.local.remove([
    STORAGE_KEYS.authToken,
    STORAGE_KEYS.amInfo,
    STORAGE_KEYS.activeSeekerId,
    STORAGE_KEYS.runnerEnabled,
  ]);

  showDisconnectedUI();
}

async function verifySession() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken) return false;

  try {
    const response = await fetch(`${apiBaseUrl}/api/extension/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) { await disconnect(); return false; }
    const data = await response.json();
    amInfo = data.account_manager;
    await chrome.storage.local.set({ [STORAGE_KEYS.amInfo]: amInfo });
    return true;
  } catch { return false; }
}

// ─── UI State Management ──────────────────────────────────────

function showConnectedUI() {
  els.authGate.classList.add("hidden");
  els.mainApp.classList.remove("hidden");
  els.connectionBadge.classList.remove("disconnected");
  els.connectionText.textContent = "Connected";

  if (amInfo) {
    const initial = (amInfo.name || amInfo.email || "?")[0].toUpperCase();
    els.amAvatar.textContent = initial;
    els.amName.textContent = amInfo.name || "Account Manager";
    els.amEmailDisplay.textContent = amInfo.email || "";
  }

  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl && els.apiBaseUrl) els.apiBaseUrl.value = apiBaseUrl;
}

function showDisconnectedUI() {
  els.authGate.classList.remove("hidden");
  els.mainApp.classList.add("hidden");
  els.connectionBadge.classList.add("disconnected");
  els.connectionText.textContent = "Not Connected";
}

// ─── Seeker Management ────────────────────────────────────────

async function loadSeekers() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken) return;

  try {
    const response = await fetch(`${apiBaseUrl}/api/extension/seekers`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) return;

    const data = await response.json();
    const seekers = data.seekers || [];

    els.seekerSelect.innerHTML = '<option value="">-- Select Job Seeker --</option>';
    seekers.forEach((s) => {
      const option = document.createElement("option");
      option.value = s.id;
      option.textContent = `${s.full_name || s.email} ${s.location ? "(" + s.location + ")" : ""}`;
      els.seekerSelect.appendChild(option);
    });

    if (activeSeekerId) {
      els.seekerSelect.value = activeSeekerId;
    } else if (data.active_job_seeker_id) {
      els.seekerSelect.value = data.active_job_seeker_id;
      activeSeekerId = data.active_job_seeker_id;
    }
  } catch (e) { console.error("Failed to load seekers:", e); }
}

async function setActiveSeeker(seekerId) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken || !seekerId) return;

  activeSeekerId = seekerId;
  await chrome.storage.local.set({ [STORAGE_KEYS.activeSeekerId]: seekerId });

  try {
    await fetch(`${apiBaseUrl}/api/extension/seekers`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ job_seeker_id: seekerId }),
    });
  } catch (e) { console.error("Failed to set active seeker:", e); }
}

// ─── Matched Jobs ─────────────────────────────────────────────

function sanitizeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAttentionReason(reason) {
  if (!reason) return "Needs attention";
  return String(reason)
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function triggerRunnerNow() {
  await chrome.storage.local.set({ [STORAGE_KEYS.runnerEnabled]: true });
  chrome.runtime.sendMessage({ type: "RUNNER_TOGGLE", enabled: true });
  chrome.runtime.sendMessage({ type: "RUNNER_RUN_NOW" });
  updateRunnerUI(true);
}

async function loadMatchedJobs() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken || !activeSeekerId) {
    els.matchedEmpty.style.display = "block";
    return;
  }

  els.matchedEmpty.style.display = "none";
  els.matchedJobsList.innerHTML = '<div style="text-align:center;padding:10px;font-size:11px;color:#6b7280">Loading matched jobs...</div>';

  try {
    const response = await fetch(`${apiBaseUrl}/api/extension/matched-jobs`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) {
      els.matchedJobsList.innerHTML = '<div class="empty-state">Failed to load matched jobs.</div>';
      return;
    }

    const data = await response.json();
    const jobs = data.jobs || [];
    const threshold = data.threshold || 50;
    const attentionJobs = jobs.filter((j) => j.needs_attention || j.queue_status === "NEEDS_ATTENTION");

    if (jobs.length === 0) {
      els.matchedJobsList.innerHTML = `
        <div class="empty-state">
          <div>No matched jobs above ${threshold}% threshold.</div>
          <div style="font-size:10px;color:#9ca3af;margin-top:4px">Scrape jobs or ask your AM to adjust the threshold.</div>
        </div>`;
      return;
    }

    const queueableJobs = jobs.filter((j) => !j.queue_status);
    const applyableJobs = jobs.filter(
      (j) => !j.queue_status || ["QUEUED", "READY", "RETRYING"].includes(j.queue_status)
    );
    const resumableAttentionJobs = attentionJobs.filter((j) => !!j.run_id);

    const headerHtml = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:#f0fdf4;border-radius:6px;margin-bottom:6px">
        <span style="font-size:10px;color:#166534">${jobs.length} jobs tracked (${attentionJobs.length} need attention)</span>
        <div style="display:flex;gap:4px">
          ${queueableJobs.length > 0 ? `<button class="btn btn-secondary btn-sm" onclick="queueAllJobs()" style="width:auto;padding:2px 8px;font-size:9px">Queue All (${queueableJobs.length})</button>` : ""}
          ${applyableJobs.length > 0 ? `<button class="btn btn-apply btn-sm" onclick="applyAllJobs()" style="width:auto;padding:2px 8px;font-size:9px">Apply All (${applyableJobs.length})</button>` : ""}
          ${resumableAttentionJobs.length > 1 ? `<button class="btn btn-secondary btn-sm" onclick="resumeAllAttention()" style="width:auto;padding:2px 8px;font-size:9px">Resume Attention (${resumableAttentionJobs.length})</button>` : ""}
        </div>
      </div>`;

    const jobsHtml = jobs.map((job) => {
      const numericScore = Number(job.score);
      const hasScore = Number.isFinite(numericScore) && numericScore >= 0;
      const scoreClass = hasScore
        ? (numericScore >= 80 ? "high" : numericScore >= 60 ? "medium" : "low")
        : "low";
      const cardClass = job.needs_attention
        ? "score-medium"
        : (hasScore ? (numericScore >= 80 ? "score-high" : numericScore >= 60 ? "score-medium" : "score-low") : "score-low");
      const recLabel = job.recommendation === "strong_match"
        ? "Strong"
        : job.recommendation === "good_match"
          ? "Good"
          : job.recommendation
            ? "Fair"
            : "Unrated";
      const recColor = job.recommendation === "strong_match"
        ? "#166534"
        : job.recommendation === "good_match"
          ? "#1e40af"
          : "#92400e";
      const scoreLabel = hasScore ? `${Math.round(numericScore)}%` : "--";

      let actionHtml;
      if (job.queue_status === "NEEDS_ATTENTION") {
        if (job.run_id) {
          actionHtml = `<div style="display:flex;gap:4px;align-items:center"><span class="queue-badge" style="background:#fff7ed;color:#9a3412">Needs Attention</span><button class="btn btn-secondary btn-sm" onclick="resumeJob('${job.run_id}', '${encodeURIComponent(job.url || "")}')" style="width:auto;padding:3px 8px;font-size:9px">Resume</button></div>`;
        } else {
          actionHtml = '<span class="queue-badge" style="background:#fff7ed;color:#9a3412">Needs Attention</span>';
        }
      } else if (job.queue_status === "APPLIED" || job.queue_status === "COMPLETED") {
        actionHtml = '<span class="queue-badge" style="background:#dcfce7;color:#166534">Applied</span>';
      } else if (job.queue_status === "RUNNING") {
        actionHtml = '<span class="queue-badge" style="background:#dbeafe;color:#1e40af">Running</span>';
      } else if (job.queue_status === "QUEUED" || job.queue_status === "READY" || job.queue_status === "RETRYING") {
        actionHtml = `<div style="display:flex;gap:4px;align-items:center"><span class="queue-badge">${job.queue_status}</span><button class="btn btn-apply btn-sm" onclick="applyJob('${job.id}')" style="width:auto;padding:3px 8px;font-size:9px">Apply</button></div>`;
      } else if (job.queue_status) {
        actionHtml = `<span class="queue-badge">${job.queue_status}</span>`;
      } else {
        actionHtml = `<div style="display:flex;gap:4px"><button class="btn btn-secondary btn-sm" onclick="queueJob('${job.id}')" style="width:auto;padding:3px 8px;font-size:9px">Queue</button><button class="btn btn-apply btn-sm" onclick="applyJob('${job.id}')" style="width:auto;padding:3px 8px;font-size:9px">Apply</button></div>`;
      }

      const attentionReason = job.needs_attention_reason
        ? `<div style="font-size:9px;color:#9a3412;margin-top:4px">Reason: ${sanitizeText(formatAttentionReason(job.needs_attention_reason))}</div>`
        : "";
      const attentionError = job.last_error
        ? `<div style="font-size:9px;color:#92400e;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${sanitizeText(job.last_error)}">${sanitizeText(job.last_error)}</div>`
        : "";

      return `
        <div class="job-card ${cardClass}">
          <div class="title" title="${sanitizeText(job.title)}">
            <a href="${sanitizeText(job.url)}" target="_blank" style="color:inherit;text-decoration:none">${sanitizeText(job.title)}</a>
          </div>
          <div class="meta">${sanitizeText(job.company || "Unknown")} ${job.location ? " - " + sanitizeText(job.location) : ""}</div>
          <div style="display:flex;gap:4px;margin-top:2px">
            ${job.work_type ? `<span style="font-size:8px;padding:1px 4px;background:#f3f4f6;border-radius:3px;color:#6b7280;text-transform:capitalize">${sanitizeText(job.work_type)}</span>` : ""}
            <span style="font-size:8px;padding:1px 4px;background:#ede9fe;border-radius:3px;color:${recColor}">${recLabel}</span>
            ${job.confidence === "high" ? '<span style="font-size:8px;padding:1px 4px;background:#dbeafe;border-radius:3px;color:#1e40af">High Conf.</span>' : ""}
          </div>
          ${job.queue_status === "NEEDS_ATTENTION" ? attentionReason + attentionError : ""}
          <div class="bottom">
            <span class="score-badge ${scoreClass}">${scoreLabel}</span>
            ${actionHtml}
          </div>
        </div>`;
    }).join("");

    els.matchedJobsList.innerHTML = headerHtml + jobsHtml;
  } catch (error) {
    els.matchedJobsList.innerHTML = '<div class="empty-state">Error loading jobs.</div>';
    console.error("Matched jobs error:", error);
  }
}

window.queueJob = async function (jobPostId) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken) return;

  try {
    const response = await fetch(`${apiBaseUrl}/api/extension/queue-job`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ job_post_id: jobPostId }),
    });
    if (response.ok) loadMatchedJobs();
  } catch (error) { console.error("Queue error:", error); }
};

window.queueAllJobs = async function () {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken) return;

  // Re-fetch to get current list
  try {
    const response = await fetch(`${apiBaseUrl}/api/extension/matched-jobs`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) return;
    const data = await response.json();
    const jobs = (data.jobs || []).filter((j) => !j.queue_status);

    let queued = 0;
    for (const job of jobs) {
      try {
        const res = await fetch(`${apiBaseUrl}/api/extension/queue-job`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ job_post_id: job.id }),
        });
        if (res.ok) queued++;
      } catch (e) { console.error("Queue error:", e); }
    }

    loadMatchedJobs();
  } catch (error) { console.error("Queue all error:", error); }
};

window.applyJob = async function (jobPostId) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken) return;

  try {
    // Queue the job first if not already queued
    await fetch(`${apiBaseUrl}/api/extension/queue-job`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ job_post_id: jobPostId }),
    });

    await triggerRunnerNow();
    loadMatchedJobs();
  } catch (error) { console.error("Apply error:", error); }
};

window.applyAllJobs = async function () {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken) return;

  try {
    const response = await fetch(`${apiBaseUrl}/api/extension/matched-jobs`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) return;
    const data = await response.json();
    const jobs = (data.jobs || []).filter(
      (j) => !j.queue_status || ["QUEUED", "READY", "RETRYING"].includes(j.queue_status)
    );

    // Queue all unqueued jobs
    for (const job of jobs) {
      if (!job.queue_status) {
        try {
          await fetch(`${apiBaseUrl}/api/extension/queue-job`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({ job_post_id: job.id }),
          });
        } catch (e) { console.error("Queue error:", e); }
      }
    }

    await triggerRunnerNow();
    loadMatchedJobs();
  } catch (error) { console.error("Apply all error:", error); }
};


window.resumeJob = async function (runId, encodedJobUrl) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken || !runId) return;

  try {
    const response = await fetch(`${apiBaseUrl}/api/apply/resume`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ run_id: runId, note: "Resumed from extension." }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      console.error("Resume error:", data.error || response.status);
      return;
    }

    const jobUrl = encodedJobUrl ? decodeURIComponent(encodedJobUrl) : "";
    if (jobUrl && /^https?:\/\//i.test(jobUrl)) {
      chrome.tabs.create({ url: jobUrl, active: true }).catch(() => {});
    }

    await triggerRunnerNow();
    loadMatchedJobs();
  } catch (error) {
    console.error("Resume error:", error);
  }
};

window.resumeAllAttention = async function () {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken) return;

  try {
    const response = await fetch(`${apiBaseUrl}/api/extension/matched-jobs`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) return;
    const data = await response.json();
    const jobs = (data.jobs || []).filter(
      (job) => (job.needs_attention || job.queue_status === "NEEDS_ATTENTION") && job.run_id
    );

    for (const job of jobs) {
      try {
        await fetch(`${apiBaseUrl}/api/apply/resume`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ run_id: job.run_id, note: "Bulk resumed from extension." }),
        });
      } catch (error) {
        console.error("Bulk resume error:", error);
      }
    }

    if (jobs.length > 0) {
      await triggerRunnerNow();
    }
    loadMatchedJobs();
  } catch (error) {
    console.error("Resume all attention error:", error);
  }
};

// ─── Contact Scraping ─────────────────────────────────────────

async function loadContacts() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken || !activeSeekerId) {
    els.contactsEmpty.style.display = "block";
    return;
  }

  els.contactsEmpty.style.display = "none";
  els.contactsList.innerHTML = '<div style="text-align:center;padding:10px;font-size:11px;color:#6b7280">Loading...</div>';

  try {
    const response = await fetch(`${apiBaseUrl}/api/extension/contacts`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) {
      els.contactsList.innerHTML = '<div class="empty-state">Failed to load contacts.</div>';
      return;
    }

    const data = await response.json();
    const contacts = data.contacts || [];

    if (contacts.length === 0) {
      els.contactsList.innerHTML = '<div class="empty-state"><div>No contacts yet. Scrape a company page!</div></div>';
      return;
    }

    els.contactsList.innerHTML = contacts.map((c) => `
      <div class="contact-card">
        <div class="name">${c.full_name}</div>
        ${c.role ? `<div class="role">${c.role}</div>` : ""}
        ${c.company_name ? `<div class="company">${c.company_name}</div>` : ""}
        ${c.email ? `<div style="font-size:10px;color:#4f46e5;margin-top:2px">${c.email}</div>` : ""}
        ${c.linkedin_url ? `<div style="font-size:10px;color:#0a66c2;margin-top:2px">LinkedIn</div>` : ""}
      </div>
    `).join("");
  } catch (error) {
    els.contactsList.innerHTML = '<div class="empty-state">Error loading contacts.</div>';
  }
}

async function scrapePageContacts() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken || !activeSeekerId) {
    setStatus(els.contactsStatus, "Select a job seeker first.", "error");
    return;
  }

  setStatus(els.contactsStatus, "Scraping contacts...", "info");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus(els.contactsStatus, "Unable to access current tab.", "error");
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeContactsFromPage,
    });

    const contacts = results[0]?.result || [];
    if (contacts.length === 0) {
      setStatus(els.contactsStatus, "No contacts found on this page.", "info");
      return;
    }

    const response = await fetch(`${apiBaseUrl}/api/extension/contacts`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ contacts }),
    });

    if (response.ok) {
      const data = await response.json();
      setStatus(els.contactsStatus, `Saved ${data.saved} contacts!`, "success");
      loadContacts();
    } else {
      setStatus(els.contactsStatus, "Failed to save contacts.", "error");
    }
  } catch (error) {
    setStatus(els.contactsStatus, "Error: " + error.message, "error");
  }
}

function scrapeContactsFromPage() {
  const contacts = [];
  const url = window.location.href.toLowerCase();

  if (url.includes("linkedin.com")) {
    document.querySelectorAll(".org-people-profile-card, .artdeco-entity-lockup").forEach((card) => {
      const nameEl = card.querySelector(".org-people-profile-card__profile-title, .artdeco-entity-lockup__title");
      const roleEl = card.querySelector(".artdeco-entity-lockup__subtitle, .org-people-profile-card__profile-info");
      const linkEl = card.querySelector("a[href*='/in/']");
      if (nameEl) {
        contacts.push({
          full_name: nameEl.textContent.trim(),
          role: roleEl?.textContent.trim() || null,
          linkedin_url: linkEl?.href?.split("?")[0] || null,
          company_name: document.querySelector(".org-top-card-summary__title, h1")?.textContent?.trim() || null,
          source: "linkedin_company_page",
        });
      }
    });

    document.querySelectorAll(".reusable-search__result-container").forEach((card) => {
      const nameEl = card.querySelector(".entity-result__title-text a span[aria-hidden='true']");
      const roleEl = card.querySelector(".entity-result__primary-subtitle");
      const linkEl = card.querySelector("a[href*='/in/']");
      if (nameEl) {
        contacts.push({
          full_name: nameEl.textContent.trim(),
          role: roleEl?.textContent.trim() || null,
          linkedin_url: linkEl?.href?.split("?")[0] || null,
          source: "linkedin_search",
        });
      }
    });
  }

  if (contacts.length === 0) {
    const bodyText = document.body.innerText;
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = [...new Set(bodyText.match(emailRegex) || [])];
    emails.forEach((email) => {
      if (!email.includes("example.com") && !email.includes("test.com")) {
        contacts.push({
          full_name: email.split("@")[0].replace(/[._-]/g, " "),
          email,
          source: "page_scrape",
        });
      }
    });
  }

  return contacts;
}

// ─── Save/Scrape Job Handlers ─────────────────────────────────

async function saveCurrentJob() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !isValidUrl(apiBaseUrl)) {
    setStatus(els.saveStatus, "Set API Base URL in Settings.", "error");
    return;
  }

  setStatus(els.saveStatus, "Saving job...", "info");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !tab?.id) {
      setStatus(els.saveStatus, "Unable to read current tab.", "error");
      return;
    }

    // Try to extract job description from the current page
    let description = null;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Try common job description selectors
          const selectors = [
            ".jobs-description__content",
            ".jobs-box__html-content",
            ".jobs-description-content__text",
            "#jobDescriptionText",
            ".jobsearch-jobDescriptionText",
            "[data-test='jobDescriptionContent']",
            ".job-description",
            ".job_description",
            "#job-description",
            "#job_description",
            "[class*='jobDescription']",
            "[class*='job-description']",
            ".posting-page .content",
            ".desc",
          ];
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim().length > 50) {
              return el.textContent.trim().slice(0, 5000);
            }
          }
          return null;
        },
      });
      description = results[0]?.result || null;
    } catch (e) {
      // Couldn't inject script - that's fine, save without description
    }

    // Try to extract company and location from the page
    let company = null;
    let location = null;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          let co = null;
          let loc = null;
          // LinkedIn
          co = document.querySelector(".jobs-unified-top-card__company-name, .topcard__org-name-link, .company-name")?.textContent?.trim();
          loc = document.querySelector(".jobs-unified-top-card__bullet, .topcard__flavor--bullet, .job-location")?.textContent?.trim();
          // Indeed
          if (!co) co = document.querySelector("[data-testid='inlineHeader-companyName'], .jobsearch-InlineCompanyRating-companyHeader")?.textContent?.trim();
          if (!loc) loc = document.querySelector("[data-testid='inlineHeader-companyLocation'], .jobsearch-JobInfoHeader-subtitle > div:last-child")?.textContent?.trim();
          // Greenhouse
          if (!co) co = document.querySelector(".company-name, .employer")?.textContent?.trim();
          if (!loc) loc = document.querySelector(".location")?.textContent?.trim();
          return { company: co, location: loc };
        },
      });
      company = results[0]?.result?.company || null;
      location = results[0]?.result?.location || null;
    } catch (e) { /* ignore */ }

    const board = detectJobBoard(tab.url);
    const response = await fetch(`${apiBaseUrl}/api/jobs/save`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        url: tab.url,
        title: tab.title || "Untitled",
        company,
        location,
        source: board?.key || "extension",
        raw_html: null,
        raw_text: description,
      }),
    });

    if (!response.ok) {
      setStatus(els.saveStatus, `Failed to save (${response.status})`, "error");
      return;
    }

    const data = await response.json();
    if (data?.success) {
      const msg = data.duplicate ? "Already saved (duplicate)" : "Job saved & auto-matched!";
      setStatus(els.saveStatus, msg, "success");
      // Refresh matched jobs since auto-match runs
      if (!data.duplicate) setTimeout(() => loadMatchedJobs(), 1500);
    } else {
      setStatus(els.saveStatus, "Failed to save job", "error");
    }
  } catch (error) {
    setStatus(els.saveStatus, "Network error", "error");
  }
}

async function scrapeAndSaveJobs(scrapeFunc) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !isValidUrl(apiBaseUrl)) {
    setStatus(els.saveStatus, "Set API Base URL in Settings.", "error");
    return;
  }

  setStatus(els.saveStatus, "Scraping jobs...", "info");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus(els.saveStatus, "Unable to access current tab.", "error");
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeFunc,
    });

    const jobs = results[0]?.result || [];
    if (jobs.length === 0) {
      setStatus(els.saveStatus, "No job listings found.", "info");
      return;
    }

    let saved = 0;
    let duplicates = 0;

    for (const job of jobs) {
      try {
        const response = await fetch(`${apiBaseUrl}/api/jobs/save`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({
            url: job.url,
            title: job.title,
            company: job.company,
            location: job.location,
            source: job.source || "extension_scrape",
            raw_text: job.description || null,
          }),
        });
        if (response.ok) {
          const data = await response.json();
          if (data.duplicate) duplicates++;
          else saved++;
        }
      } catch (e) { console.error("Error saving job:", e); }
    }

    setStatus(els.saveStatus, `Scraped ${jobs.length}: ${saved} saved, ${duplicates} duplicates. Jobs auto-matched!`, "success");
    // Refresh matched jobs after scraping since auto-match runs server-side
    setTimeout(() => loadMatchedJobs(), 2000);
  } catch (error) {
    setStatus(els.saveStatus, "Error: " + error.message, "error");
  }
}

// Injected scrape functions
function scrapeVisibleJobs() {
  const jobs = [];
  const url = window.location.href.toLowerCase();

  // Try to grab job description from the detail panel (LinkedIn shows it on the right side)
  function getVisibleDescription() {
    // LinkedIn job detail panel
    const linkedinDesc = document.querySelector(".jobs-description__content, .jobs-box__html-content, .jobs-description-content__text");
    if (linkedinDesc) return linkedinDesc.textContent.trim().slice(0, 5000);
    // Indeed job detail
    const indeedDesc = document.querySelector("#jobDescriptionText, .jobsearch-jobDescriptionText");
    if (indeedDesc) return indeedDesc.textContent.trim().slice(0, 5000);
    // Glassdoor
    const glassdoorDesc = document.querySelector("[data-test='jobDescriptionContent'], .desc");
    if (glassdoorDesc) return glassdoorDesc.textContent.trim().slice(0, 5000);
    // Generic
    const genericDesc = document.querySelector("[class*='description'], [id*='description']");
    if (genericDesc) return genericDesc.textContent.trim().slice(0, 5000);
    return null;
  }

  if (url.includes("linkedin.com")) {
    const desc = getVisibleDescription();
    document.querySelectorAll(".job-card-container, .jobs-search-results__list-item").forEach((card) => {
      const titleEl = card.querySelector(".job-card-list__title, .job-card-container__link");
      const companyEl = card.querySelector(".job-card-container__company-name, .artdeco-entity-lockup__subtitle");
      const locationEl = card.querySelector(".job-card-container__metadata-item, .artdeco-entity-lockup__caption");
      const linkEl = card.querySelector("a[href*='/jobs/view/']");
      if (titleEl && linkEl) {
        // Only attach description to the first/active card
        const isActive = card.classList.contains("jobs-search-results-list__list-item--active") || card.querySelector(".job-card-container--clickable.active");
        jobs.push({ title: titleEl.textContent.trim(), company: companyEl?.textContent.trim() || "", location: locationEl?.textContent.trim() || "", url: linkEl.href.split("?")[0], source: "linkedin", description: isActive ? desc : null });
      }
    });
  } else if (url.includes("indeed.com")) {
    const desc = getVisibleDescription();
    document.querySelectorAll(".job_seen_beacon, .jobsearch-ResultsList > li").forEach((card) => {
      const titleEl = card.querySelector(".jobTitle a, h2.jobTitle");
      const companyEl = card.querySelector(".companyName, [data-testid='company-name']");
      const locationEl = card.querySelector(".companyLocation, [data-testid='text-location']");
      const linkEl = card.querySelector("a[href*='/viewjob'], a[id^='job_']");
      if (titleEl) {
        const href = linkEl?.href || titleEl?.href;
        const isActive = card.classList.contains("mosaic-provider-jobcards") || card.querySelector(".selected");
        jobs.push({ title: titleEl.textContent.trim(), company: companyEl?.textContent.trim() || "", location: locationEl?.textContent.trim() || "", url: href ? new URL(href, window.location.origin).href : "", source: "indeed", description: isActive ? desc : null });
      }
    });
  } else if (url.includes("glassdoor.com")) {
    document.querySelectorAll("[data-test='jobListing'], .react-job-listing").forEach((card) => {
      const titleEl = card.querySelector("[data-test='job-title'], .job-title");
      const companyEl = card.querySelector("[data-test='employer-name'], .employer-name");
      const locationEl = card.querySelector("[data-test='location'], .location");
      const linkEl = card.querySelector("a[href*='/job-listing/']");
      if (titleEl) {
        jobs.push({ title: titleEl.textContent.trim(), company: companyEl?.textContent.trim() || "", location: locationEl?.textContent.trim() || "", url: linkEl?.href || "", source: "glassdoor", description: null });
      }
    });
  } else if (url.includes("dice.com")) {
    document.querySelectorAll("[data-cy='search-result-card']").forEach((card) => {
      const titleEl = card.querySelector("[data-cy='card-title']");
      const companyEl = card.querySelector("[data-cy='card-company']");
      const locationEl = card.querySelector("[data-cy='card-location']");
      const linkEl = card.querySelector("a[href*='/job-detail/']");
      if (titleEl) {
        jobs.push({ title: titleEl.textContent.trim(), company: companyEl?.textContent.trim() || "", location: locationEl?.textContent.trim() || "", url: linkEl?.href || "", source: "dice", description: null });
      }
    });
  } else if (url.includes("ziprecruiter.com")) {
    document.querySelectorAll(".job_content, article.job-listing").forEach((card) => {
      const titleEl = card.querySelector(".job_title, .title");
      const companyEl = card.querySelector(".hiring_company, .company");
      const locationEl = card.querySelector(".job_location, .location");
      const linkEl = card.querySelector("a[href*='/jobs/']");
      if (titleEl) {
        jobs.push({ title: titleEl.textContent.trim(), company: companyEl?.textContent.trim() || "", location: locationEl?.textContent.trim() || "", url: linkEl?.href || "", source: "ziprecruiter", description: null });
      }
    });
  }

  return jobs;
}

async function scrapeAllJobsWithScroll() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const allJobs = new Map();

  const scrape = () => {
    const jobs = [];
    const url = window.location.href.toLowerCase();
    if (url.includes("linkedin.com")) {
      document.querySelectorAll(".job-card-container, .jobs-search-results__list-item").forEach((card) => {
        const titleEl = card.querySelector(".job-card-list__title, .job-card-container__link");
        const companyEl = card.querySelector(".job-card-container__company-name");
        const locationEl = card.querySelector(".job-card-container__metadata-item");
        const linkEl = card.querySelector("a[href*='/jobs/view/']");
        if (titleEl && linkEl) { const u = linkEl.href.split("?")[0]; jobs.push({ id: u, title: titleEl.textContent.trim(), company: companyEl?.textContent.trim() || "", location: locationEl?.textContent.trim() || "", url: u, source: "linkedin" }); }
      });
    } else if (url.includes("indeed.com")) {
      document.querySelectorAll(".job_seen_beacon, .jobsearch-ResultsList > li").forEach((card) => {
        const titleEl = card.querySelector(".jobTitle a, h2.jobTitle");
        const companyEl = card.querySelector(".companyName");
        const locationEl = card.querySelector(".companyLocation");
        const linkEl = card.querySelector("a[href*='/viewjob'], a[id^='job_']");
        if (titleEl) { const href = linkEl?.href || titleEl?.href; const u = href ? new URL(href, window.location.origin).href : ""; jobs.push({ id: u, title: titleEl.textContent.trim(), company: companyEl?.textContent.trim() || "", location: locationEl?.textContent.trim() || "", url: u, source: "indeed" }); }
      });
    } else if (url.includes("glassdoor.com")) {
      document.querySelectorAll("[data-test='jobListing'], .react-job-listing").forEach((card) => {
        const titleEl = card.querySelector("[data-test='job-title'], .job-title");
        const companyEl = card.querySelector("[data-test='employer-name']");
        const locationEl = card.querySelector("[data-test='location']");
        const linkEl = card.querySelector("a[href*='/job-listing/']");
        if (titleEl && linkEl) { jobs.push({ id: linkEl.href, title: titleEl.textContent.trim(), company: companyEl?.textContent.trim() || "", location: locationEl?.textContent.trim() || "", url: linkEl.href, source: "glassdoor" }); }
      });
    } else if (url.includes("dice.com")) {
      document.querySelectorAll("[data-cy='search-result-card']").forEach((card) => {
        const titleEl = card.querySelector("[data-cy='card-title']");
        const companyEl = card.querySelector("[data-cy='card-company']");
        const locationEl = card.querySelector("[data-cy='card-location']");
        const linkEl = card.querySelector("a[href*='/job-detail/']");
        if (titleEl && linkEl) { jobs.push({ id: linkEl.href, title: titleEl.textContent.trim(), company: companyEl?.textContent.trim() || "", location: locationEl?.textContent.trim() || "", url: linkEl.href, source: "dice" }); }
      });
    } else if (url.includes("ziprecruiter.com")) {
      document.querySelectorAll(".job_content, article.job-listing").forEach((card) => {
        const titleEl = card.querySelector(".job_title, .title");
        const companyEl = card.querySelector(".hiring_company, .company");
        const locationEl = card.querySelector(".job_location, .location");
        const linkEl = card.querySelector("a[href*='/jobs/']");
        if (titleEl && linkEl) { jobs.push({ id: linkEl.href, title: titleEl.textContent.trim(), company: companyEl?.textContent.trim() || "", location: locationEl?.textContent.trim() || "", url: linkEl.href, source: "ziprecruiter" }); }
      });
    }
    return jobs;
  };

  let currentJobs = scrape();
  currentJobs.forEach((j) => allJobs.set(j.id, j));

  let scrollCount = 0;
  let lastHeight = document.body.scrollHeight;

  while (scrollCount < 20) {
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(1500);
    const loadMoreBtn = document.querySelector('button[aria-label*="more"], button[class*="load-more"], .infinite-scroller__show-more-button');
    if (loadMoreBtn) { loadMoreBtn.click(); await sleep(2000); }
    currentJobs = scrape();
    currentJobs.forEach((j) => allJobs.set(j.id, j));
    const newHeight = document.body.scrollHeight;
    if (newHeight === lastHeight) break;
    lastHeight = newHeight;
    scrollCount++;
  }

  window.scrollTo(0, 0);
  return Array.from(allJobs.values());
}

// ─── Runner ───────────────────────────────────────────────────

function updateRunnerUI(enabled) {
  if (enabled) {
    els.runnerIndicator.classList.add("active");
    els.runnerStatusText.textContent = "Running";
    els.toggleRunnerBtn.textContent = "Stop Runner";
    els.toggleRunnerBtn.classList.remove("btn-success");
    els.toggleRunnerBtn.classList.add("btn-danger");
  } else {
    els.runnerIndicator.classList.remove("active");
    els.runnerStatusText.textContent = "Stopped";
    els.toggleRunnerBtn.textContent = "Start Runner";
    els.toggleRunnerBtn.classList.remove("btn-danger");
    els.toggleRunnerBtn.classList.add("btn-success");
  }
}

async function toggleRunner() {
  const result = await chrome.storage.local.get([STORAGE_KEYS.runnerEnabled]);
  const newValue = !(result[STORAGE_KEYS.runnerEnabled] || false);

  if (newValue && (!authToken || !activeSeekerId)) {
    setStatus(els.settingsStatus, "Connect and select a job seeker first.", "error");
    return;
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.runnerEnabled]: newValue });
  chrome.runtime.sendMessage({ type: "RUNNER_TOGGLE", enabled: newValue });
  updateRunnerUI(newValue);
  setStatus(els.settingsStatus, newValue ? "Runner started!" : "Runner stopped.", "info");
  if (newValue) chrome.runtime.sendMessage({ type: "RUNNER_RUN_NOW" });
}

async function saveSessionState() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !authToken || !activeSeekerId) {
    setStatus(els.settingsStatus, "Connect and select a job seeker first.", "error");
    return;
  }

  let tab;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
  } catch (error) {
    setStatus(els.settingsStatus, "Unable to access current tab.", "error");
    return;
  }

  if (!tab?.url || !/^https?:\/\//i.test(tab.url)) {
    setStatus(els.settingsStatus, "Open a job board page first.", "error");
    return;
  }

  setStatus(els.settingsStatus, "Saving session state...", "info");

  let origin;
  try {
    origin = new URL(tab.url).origin;
  } catch {
    setStatus(els.settingsStatus, "Invalid tab URL.", "error");
    return;
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
    console.warn("Cookie capture failed:", error);
  }

  let localStorageData = [];
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const entries = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (key) entries.push({ name: key, value: localStorage.getItem(key) ?? "" });
        }
        return entries;
      },
    });
    localStorageData = results?.[0]?.result ?? [];
  } catch (error) {
    console.warn("LocalStorage capture failed:", error);
  }

  const storageState = {
    cookies,
    origins: [
      {
        origin,
        localStorage: localStorageData,
      },
    ],
  };

  try {
    const response = await fetch(`${apiBaseUrl}/api/extension/storage-state`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        job_seeker_id: activeSeekerId,
        storage_state: storageState,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setStatus(els.settingsStatus, data.error || "Failed to save session state.", "error");
      return;
    }

    setStatus(els.settingsStatus, "Session state saved.", "success");
  } catch (error) {
    setStatus(els.settingsStatus, "Failed to save session state.", "error");
  }
}

// ─── Page Info ────────────────────────────────────────────────

async function updatePageInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      els.pageTitle.textContent = tab.title || "Untitled";
      els.pageUrl.textContent = tab.url || "-";
      const board = detectJobBoard(tab.url);
      if (board) {
        els.detectedBoard.innerHTML = `<div class="detected-board" style="background:${board.color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>${board.name}</div>`;
      } else {
        els.detectedBoard.innerHTML = "";
      }
    }
  } catch {
    els.pageTitle.textContent = "Unable to read page";
    els.pageUrl.textContent = "-";
  }
}

// ─── Tab Switching ────────────────────────────────────────────

els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const targetId = tab.dataset.tab;
    els.tabs.forEach((t) => t.classList.remove("active"));
    els.panels.forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`panel-${targetId}`).classList.add("active");
    if (targetId === "matched") loadMatchedJobs();
    if (targetId === "contacts") loadContacts();
  });
});

// ─── Event Listeners ──────────────────────────────────────────

els.connectBtn.addEventListener("click", connect);
els.disconnectBtn.addEventListener("click", disconnect);
els.saveJobBtn.addEventListener("click", saveCurrentJob);
els.scrapeVisibleBtn.addEventListener("click", () => scrapeAndSaveJobs(scrapeVisibleJobs));
els.scrapeAllBtn.addEventListener("click", () => scrapeAndSaveJobs(scrapeAllJobsWithScroll));
els.refreshMatchedBtn.addEventListener("click", loadMatchedJobs);
els.scrapeContactsBtn.addEventListener("click", scrapePageContacts);
els.toggleRunnerBtn.addEventListener("click", toggleRunner);
els.saveSessionStateBtn.addEventListener("click", saveSessionState);

els.seekerSelect.addEventListener("change", (e) => {
  if (e.target.value) {
    setActiveSeeker(e.target.value);
    // Auto-refresh matched jobs when seeker changes
    setTimeout(() => loadMatchedJobs(), 500);
  }
});

els.apiBaseUrl.addEventListener("blur", () => {
  chrome.storage.local.set({ [STORAGE_KEYS.apiBaseUrl]: els.apiBaseUrl.value.trim() });
});

els.dryRun.addEventListener("change", () => {
  chrome.storage.local.set({ [STORAGE_KEYS.dryRun]: els.dryRun.checked });
});

els.apiBaseUrlAuth.addEventListener("blur", () => {
  const val = els.apiBaseUrlAuth.value.trim();
  if (val) chrome.storage.local.set({ [STORAGE_KEYS.apiBaseUrl]: val });
});

// ─── Initialize ───────────────────────────────────────────────

async function init() {
  const result = await chrome.storage.local.get(Object.values(STORAGE_KEYS));

  authToken = result[STORAGE_KEYS.authToken] || null;
  amInfo = result[STORAGE_KEYS.amInfo] || null;
  activeSeekerId = result[STORAGE_KEYS.activeSeekerId] || null;

  const apiBaseUrl = result[STORAGE_KEYS.apiBaseUrl] || "";
  els.apiBaseUrl.value = apiBaseUrl;
  els.apiBaseUrlAuth.value = apiBaseUrl;
  els.dryRun.checked = result[STORAGE_KEYS.dryRun] || false;
  updateRunnerUI(result[STORAGE_KEYS.runnerEnabled] || false);

  if (authToken && amInfo) {
    const valid = await verifySession();
    if (valid) {
      showConnectedUI();
      loadSeekers();
    } else {
      showDisconnectedUI();
    }
  } else {
    showDisconnectedUI();
  }

  updatePageInfo();
}

init();
