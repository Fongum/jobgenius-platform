// Storage keys
const STORAGE_KEYS = {
  apiBaseUrl: "apiBaseUrl",
  amEmail: "amEmail",
  jobSeekerId: "jobSeekerId",
  runnerEnabled: "runnerEnabled",
  dryRun: "dryRun",
  searchKeywords: "searchKeywords",
  searchLocation: "searchLocation",
  searchBoard: "searchBoard",
  maxJobs: "maxJobs",
};

// DOM Elements
const elements = {
  // Tabs
  tabs: document.querySelectorAll(".tab"),
  panels: document.querySelectorAll(".panel"),

  // Save panel
  pageTitle: document.getElementById("pageTitle"),
  pageUrl: document.getElementById("pageUrl"),
  detectedBoard: document.getElementById("detectedBoard"),
  saveJobBtn: document.getElementById("saveJob"),
  scrapeVisibleBtn: document.getElementById("scrapeVisible"),
  scrapeAllBtn: document.getElementById("scrapeAll"),
  saveStatus: document.getElementById("saveStatus"),

  // Discover panel
  searchKeywords: document.getElementById("searchKeywords"),
  searchLocation: document.getElementById("searchLocation"),
  searchBoard: document.getElementById("searchBoard"),
  maxJobs: document.getElementById("maxJobs"),
  startDiscoveryBtn: document.getElementById("startDiscovery"),
  discoverStatus: document.getElementById("discoverStatus"),

  // Settings panel
  apiBaseUrl: document.getElementById("apiBaseUrl"),
  amEmail: document.getElementById("amEmail"),
  jobSeekerId: document.getElementById("jobSeekerId"),
  dryRun: document.getElementById("dryRun"),
  toggleRunnerBtn: document.getElementById("toggleRunner"),
  runnerIndicator: document.getElementById("runnerIndicator"),
  runnerStatusText: document.getElementById("runnerStatusText"),
  settingsStatus: document.getElementById("settingsStatus"),
};

// Job board detection patterns
const JOB_BOARDS = {
  linkedin: {
    name: "LinkedIn",
    patterns: ["linkedin.com/jobs", "linkedin.com/job"],
    color: "#0a66c2",
  },
  indeed: {
    name: "Indeed",
    patterns: ["indeed.com/viewjob", "indeed.com/jobs", "indeed.com/cmp"],
    color: "#2164f3",
  },
  glassdoor: {
    name: "Glassdoor",
    patterns: ["glassdoor.com/job-listing", "glassdoor.com/Job"],
    color: "#0caa41",
  },
  greenhouse: {
    name: "Greenhouse",
    patterns: ["greenhouse.io", "boards.greenhouse.io"],
    color: "#3ab549",
  },
  workday: {
    name: "Workday",
    patterns: ["myworkdayjobs.com", "workday.com"],
    color: "#005cb9",
  },
  lever: {
    name: "Lever",
    patterns: ["lever.co", "jobs.lever.co"],
    color: "#1a1a1a",
  },
  dice: {
    name: "Dice",
    patterns: ["dice.com/job-detail"],
    color: "#eb1c26",
  },
  ziprecruiter: {
    name: "ZipRecruiter",
    patterns: ["ziprecruiter.com/jobs", "ziprecruiter.com/c/"],
    color: "#50b848",
  },
};

// Utility functions
function setStatus(element, message, type = "info") {
  element.textContent = message;
  element.className = `status visible ${type}`;
  if (type === "success" || type === "info") {
    setTimeout(() => {
      element.classList.remove("visible");
    }, 5000);
  }
}

function clearStatus(element) {
  element.className = "status";
  element.textContent = "";
}

function normalizeUrl(url) {
  return url.replace(/\/+$/, "");
}

function isValidUrl(url) {
  return /^https?:\/\//i.test(url);
}

function detectJobBoard(url) {
  if (!url) return null;
  const lowerUrl = url.toLowerCase();
  for (const [key, board] of Object.entries(JOB_BOARDS)) {
    for (const pattern of board.patterns) {
      if (lowerUrl.includes(pattern)) {
        return { key, ...board };
      }
    }
  }
  return null;
}

function getApiBaseUrl() {
  return normalizeUrl(elements.apiBaseUrl.value.trim());
}

function getHeaders() {
  return {
    "Content-Type": "application/json",
    "x-am-email": elements.amEmail.value.trim(),
    "x-runner": "extension",
  };
}

// Tab switching
elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const targetId = tab.dataset.tab;

    elements.tabs.forEach((t) => t.classList.remove("active"));
    elements.panels.forEach((p) => p.classList.remove("active"));

    tab.classList.add("active");
    document.getElementById(`panel-${targetId}`).classList.add("active");
  });
});

// Load saved settings
async function loadSettings() {
  const result = await chrome.storage.local.get(Object.values(STORAGE_KEYS));

  if (result[STORAGE_KEYS.apiBaseUrl]) {
    elements.apiBaseUrl.value = result[STORAGE_KEYS.apiBaseUrl];
  }
  if (result[STORAGE_KEYS.amEmail]) {
    elements.amEmail.value = result[STORAGE_KEYS.amEmail];
  }
  if (result[STORAGE_KEYS.jobSeekerId]) {
    elements.jobSeekerId.value = result[STORAGE_KEYS.jobSeekerId];
  }
  if (result[STORAGE_KEYS.dryRun]) {
    elements.dryRun.checked = result[STORAGE_KEYS.dryRun];
  }
  if (result[STORAGE_KEYS.searchKeywords]) {
    elements.searchKeywords.value = result[STORAGE_KEYS.searchKeywords];
  }
  if (result[STORAGE_KEYS.searchLocation]) {
    elements.searchLocation.value = result[STORAGE_KEYS.searchLocation];
  }
  if (result[STORAGE_KEYS.searchBoard]) {
    elements.searchBoard.value = result[STORAGE_KEYS.searchBoard];
  }
  if (result[STORAGE_KEYS.maxJobs]) {
    elements.maxJobs.value = result[STORAGE_KEYS.maxJobs];
  }

  // Update runner status
  updateRunnerUI(result[STORAGE_KEYS.runnerEnabled] || false);
}

// Save settings on change
function setupAutoSave() {
  const saveOnInput = (element, key) => {
    element.addEventListener("input", () => {
      chrome.storage.local.set({ [key]: element.value.trim() });
    });
    element.addEventListener("blur", () => {
      chrome.storage.local.set({ [key]: element.value.trim() });
    });
  };

  saveOnInput(elements.apiBaseUrl, STORAGE_KEYS.apiBaseUrl);
  saveOnInput(elements.amEmail, STORAGE_KEYS.amEmail);
  saveOnInput(elements.jobSeekerId, STORAGE_KEYS.jobSeekerId);
  saveOnInput(elements.searchKeywords, STORAGE_KEYS.searchKeywords);
  saveOnInput(elements.searchLocation, STORAGE_KEYS.searchLocation);

  elements.searchBoard.addEventListener("change", () => {
    chrome.storage.local.set({ [STORAGE_KEYS.searchBoard]: elements.searchBoard.value });
  });

  elements.maxJobs.addEventListener("change", () => {
    chrome.storage.local.set({ [STORAGE_KEYS.maxJobs]: elements.maxJobs.value });
  });

  elements.dryRun.addEventListener("change", () => {
    chrome.storage.local.set({ [STORAGE_KEYS.dryRun]: elements.dryRun.checked });
  });
}

// Update current page info
async function updatePageInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      elements.pageTitle.textContent = tab.title || "Untitled";
      elements.pageUrl.textContent = tab.url || "-";

      const board = detectJobBoard(tab.url);
      if (board) {
        elements.detectedBoard.innerHTML = `
          <div class="detected-board" style="background: ${board.color}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            ${board.name} Detected
          </div>
        `;
      } else {
        elements.detectedBoard.innerHTML = "";
      }
    }
  } catch (error) {
    elements.pageTitle.textContent = "Unable to read page";
    elements.pageUrl.textContent = "-";
  }
}

// Update runner UI
function updateRunnerUI(enabled) {
  if (enabled) {
    elements.runnerIndicator.classList.add("active");
    elements.runnerStatusText.textContent = "Running";
    elements.toggleRunnerBtn.textContent = "Stop Runner";
    elements.toggleRunnerBtn.classList.remove("btn-success");
    elements.toggleRunnerBtn.classList.add("btn-danger");
    elements.toggleRunnerBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="6" y="4" width="4" height="16"/>
        <rect x="14" y="4" width="4" height="16"/>
      </svg>
      Stop Runner
    `;
  } else {
    elements.runnerIndicator.classList.remove("active");
    elements.runnerStatusText.textContent = "Stopped";
    elements.toggleRunnerBtn.classList.remove("btn-danger");
    elements.toggleRunnerBtn.classList.add("btn-success");
    elements.toggleRunnerBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
      Start Runner
    `;
  }
}

// Save job handler
elements.saveJobBtn.addEventListener("click", async () => {
  const apiBaseUrl = getApiBaseUrl();
  const amEmail = elements.amEmail.value.trim();

  if (!apiBaseUrl || !isValidUrl(apiBaseUrl)) {
    setStatus(elements.saveStatus, "Please set a valid API Base URL in Settings.", "error");
    return;
  }

  if (!amEmail) {
    setStatus(elements.saveStatus, "Please set AM Email in Settings.", "error");
    return;
  }

  setStatus(elements.saveStatus, "Saving job...", "info");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) {
      setStatus(elements.saveStatus, "Unable to read current tab.", "error");
      return;
    }

    const board = detectJobBoard(tab.url);
    const payload = {
      url: tab.url,
      title: tab.title || "Untitled",
      source: board?.key || "extension",
      raw_html: null,
      raw_text: null,
    };

    const response = await fetch(`${apiBaseUrl}/api/jobs/save`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setStatus(elements.saveStatus, `Failed to save (${response.status})`, "error");
      return;
    }

    const data = await response.json();

    if (data?.success) {
      if (data.duplicate) {
        setStatus(elements.saveStatus, "Job already saved (duplicate)", "info");
      } else {
        setStatus(elements.saveStatus, `Job saved! ID: ${data.id?.substring(0, 8)}...`, "success");
      }
    } else {
      setStatus(elements.saveStatus, "Failed to save job", "error");
    }
  } catch (error) {
    setStatus(elements.saveStatus, "Network error while saving", "error");
  }
});

// Scrape visible jobs handler
elements.scrapeVisibleBtn.addEventListener("click", async () => {
  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl || !isValidUrl(apiBaseUrl)) {
    setStatus(elements.saveStatus, "Please set a valid API Base URL in Settings.", "error");
    return;
  }

  setStatus(elements.saveStatus, "Scraping visible jobs...", "info");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus(elements.saveStatus, "Unable to access current tab.", "error");
      return;
    }

    // Inject scraper script
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeVisibleJobs,
    });

    const jobs = results[0]?.result || [];

    if (jobs.length === 0) {
      setStatus(elements.saveStatus, "No job listings found on this page.", "info");
      return;
    }

    // Save each job
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
            raw_text: job.description,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.duplicate) {
            duplicates++;
          } else {
            saved++;
          }
        }
      } catch (e) {
        console.error("Error saving job:", e);
      }
    }

    setStatus(
      elements.saveStatus,
      `Scraped ${jobs.length} jobs: ${saved} saved, ${duplicates} duplicates`,
      "success"
    );
  } catch (error) {
    setStatus(elements.saveStatus, "Error scraping jobs: " + error.message, "error");
  }
});

// Scrape all jobs (with scroll)
elements.scrapeAllBtn.addEventListener("click", async () => {
  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl || !isValidUrl(apiBaseUrl)) {
    setStatus(elements.saveStatus, "Please set a valid API Base URL in Settings.", "error");
    return;
  }

  setStatus(elements.saveStatus, "Scraping all jobs (scrolling page)...", "info");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus(elements.saveStatus, "Unable to access current tab.", "error");
      return;
    }

    // Inject scraper with scrolling
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeAllJobsWithScroll,
    });

    const jobs = results[0]?.result || [];

    if (jobs.length === 0) {
      setStatus(elements.saveStatus, "No job listings found.", "info");
      return;
    }

    // Save jobs
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
            raw_text: job.description,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.duplicate) {
            duplicates++;
          } else {
            saved++;
          }
        }
      } catch (e) {
        console.error("Error saving job:", e);
      }
    }

    setStatus(
      elements.saveStatus,
      `Scraped ${jobs.length} jobs: ${saved} saved, ${duplicates} duplicates`,
      "success"
    );
  } catch (error) {
    setStatus(elements.saveStatus, "Error scraping jobs: " + error.message, "error");
  }
});

// Start discovery handler
elements.startDiscoveryBtn.addEventListener("click", async () => {
  const apiBaseUrl = getApiBaseUrl();
  const keywords = elements.searchKeywords.value.trim();
  const location = elements.searchLocation.value.trim();
  const board = elements.searchBoard.value;
  const maxJobs = parseInt(elements.maxJobs.value, 10);

  if (!apiBaseUrl || !isValidUrl(apiBaseUrl)) {
    setStatus(elements.discoverStatus, "Please set API Base URL in Settings.", "error");
    return;
  }

  if (!keywords) {
    setStatus(elements.discoverStatus, "Please enter search keywords.", "error");
    return;
  }

  setStatus(elements.discoverStatus, "Starting job discovery...", "info");

  try {
    const response = await fetch(`${apiBaseUrl}/api/discovery/searches`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        source_name: board,
        keywords,
        location: location || "Remote",
        filters: {},
        max_results: maxJobs,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      setStatus(elements.discoverStatus, `Discovery failed: ${error}`, "error");
      return;
    }

    const data = await response.json();
    setStatus(
      elements.discoverStatus,
      `Discovery started! Search ID: ${data.id?.substring(0, 8)}...`,
      "success"
    );

    // Open the job board search URL in a new tab
    const searchUrl = buildSearchUrl(board, keywords, location);
    if (searchUrl) {
      chrome.tabs.create({ url: searchUrl });
    }
  } catch (error) {
    setStatus(elements.discoverStatus, "Network error: " + error.message, "error");
  }
});

// Build search URL for job board
function buildSearchUrl(board, keywords, location) {
  const encodedKeywords = encodeURIComponent(keywords);
  const encodedLocation = encodeURIComponent(location || "");

  switch (board) {
    case "linkedin":
      return `https://www.linkedin.com/jobs/search/?keywords=${encodedKeywords}&location=${encodedLocation}`;
    case "indeed":
      return `https://www.indeed.com/jobs?q=${encodedKeywords}&l=${encodedLocation}`;
    case "glassdoor":
      return `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodedKeywords}&locT=&locId=&locKeyword=${encodedLocation}`;
    case "dice":
      return `https://www.dice.com/jobs?q=${encodedKeywords}&location=${encodedLocation}`;
    case "ziprecruiter":
      return `https://www.ziprecruiter.com/jobs-search?search=${encodedKeywords}&location=${encodedLocation}`;
    default:
      return null;
  }
}

// Toggle runner handler
elements.toggleRunnerBtn.addEventListener("click", async () => {
  const result = await chrome.storage.local.get([STORAGE_KEYS.runnerEnabled]);
  const currentlyEnabled = result[STORAGE_KEYS.runnerEnabled] || false;
  const newValue = !currentlyEnabled;

  if (newValue) {
    const apiBaseUrl = getApiBaseUrl();
    const amEmail = elements.amEmail.value.trim();
    const jobSeekerId = elements.jobSeekerId.value.trim();

    if (!apiBaseUrl || !isValidUrl(apiBaseUrl)) {
      setStatus(elements.settingsStatus, "Set a valid API Base URL first.", "error");
      return;
    }

    if (!amEmail || !jobSeekerId) {
      setStatus(elements.settingsStatus, "Set AM Email and Job Seeker ID first.", "error");
      return;
    }
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.runnerEnabled]: newValue });
  chrome.runtime.sendMessage({ type: "RUNNER_TOGGLE", enabled: newValue });
  updateRunnerUI(newValue);

  setStatus(elements.settingsStatus, newValue ? "Runner started!" : "Runner stopped.", "info");

  if (newValue) {
    chrome.runtime.sendMessage({ type: "RUNNER_RUN_NOW" });
  }
});

// Injected function to scrape visible jobs
function scrapeVisibleJobs() {
  const jobs = [];
  const url = window.location.href.toLowerCase();

  // LinkedIn
  if (url.includes("linkedin.com")) {
    const jobCards = document.querySelectorAll(".job-card-container, .jobs-search-results__list-item");
    jobCards.forEach((card) => {
      const titleEl = card.querySelector(".job-card-list__title, .job-card-container__link");
      const companyEl = card.querySelector(".job-card-container__company-name, .artdeco-entity-lockup__subtitle");
      const locationEl = card.querySelector(".job-card-container__metadata-item, .artdeco-entity-lockup__caption");
      const linkEl = card.querySelector("a[href*='/jobs/view/']");

      if (titleEl && linkEl) {
        jobs.push({
          title: titleEl.textContent.trim(),
          company: companyEl?.textContent.trim() || "",
          location: locationEl?.textContent.trim() || "",
          url: linkEl.href.split("?")[0],
          source: "linkedin",
        });
      }
    });
  }

  // Indeed
  else if (url.includes("indeed.com")) {
    const jobCards = document.querySelectorAll(".job_seen_beacon, .jobsearch-ResultsList > li");
    jobCards.forEach((card) => {
      const titleEl = card.querySelector(".jobTitle a, h2.jobTitle");
      const companyEl = card.querySelector(".companyName, [data-testid='company-name']");
      const locationEl = card.querySelector(".companyLocation, [data-testid='text-location']");
      const linkEl = card.querySelector("a[href*='/viewjob'], a[id^='job_']");

      if (titleEl) {
        const href = linkEl?.href || titleEl?.href;
        jobs.push({
          title: titleEl.textContent.trim(),
          company: companyEl?.textContent.trim() || "",
          location: locationEl?.textContent.trim() || "",
          url: href ? new URL(href, window.location.origin).href : "",
          source: "indeed",
        });
      }
    });
  }

  // Glassdoor
  else if (url.includes("glassdoor.com")) {
    const jobCards = document.querySelectorAll("[data-test='jobListing'], .react-job-listing");
    jobCards.forEach((card) => {
      const titleEl = card.querySelector("[data-test='job-title'], .job-title");
      const companyEl = card.querySelector("[data-test='employer-name'], .employer-name");
      const locationEl = card.querySelector("[data-test='location'], .location");
      const linkEl = card.querySelector("a[href*='/job-listing/']");

      if (titleEl) {
        jobs.push({
          title: titleEl.textContent.trim(),
          company: companyEl?.textContent.trim() || "",
          location: locationEl?.textContent.trim() || "",
          url: linkEl?.href || "",
          source: "glassdoor",
        });
      }
    });
  }

  // Dice
  else if (url.includes("dice.com")) {
    const jobCards = document.querySelectorAll("[data-cy='search-result-card']");
    jobCards.forEach((card) => {
      const titleEl = card.querySelector("[data-cy='card-title']");
      const companyEl = card.querySelector("[data-cy='card-company']");
      const locationEl = card.querySelector("[data-cy='card-location']");
      const linkEl = card.querySelector("a[href*='/job-detail/']");

      if (titleEl) {
        jobs.push({
          title: titleEl.textContent.trim(),
          company: companyEl?.textContent.trim() || "",
          location: locationEl?.textContent.trim() || "",
          url: linkEl?.href || "",
          source: "dice",
        });
      }
    });
  }

  // ZipRecruiter
  else if (url.includes("ziprecruiter.com")) {
    const jobCards = document.querySelectorAll(".job_content, article.job-listing");
    jobCards.forEach((card) => {
      const titleEl = card.querySelector(".job_title, .title");
      const companyEl = card.querySelector(".hiring_company, .company");
      const locationEl = card.querySelector(".job_location, .location");
      const linkEl = card.querySelector("a[href*='/jobs/']");

      if (titleEl) {
        jobs.push({
          title: titleEl.textContent.trim(),
          company: companyEl?.textContent.trim() || "",
          location: locationEl?.textContent.trim() || "",
          url: linkEl?.href || "",
          source: "ziprecruiter",
        });
      }
    });
  }

  return jobs;
}

// Injected function to scrape all jobs with scrolling
async function scrapeAllJobsWithScroll() {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const allJobs = new Map();

  const scrapeCurrentJobs = () => {
    const jobs = [];
    const url = window.location.href.toLowerCase();

    // LinkedIn
    if (url.includes("linkedin.com")) {
      const jobCards = document.querySelectorAll(".job-card-container, .jobs-search-results__list-item");
      jobCards.forEach((card) => {
        const titleEl = card.querySelector(".job-card-list__title, .job-card-container__link");
        const companyEl = card.querySelector(".job-card-container__company-name");
        const locationEl = card.querySelector(".job-card-container__metadata-item");
        const linkEl = card.querySelector("a[href*='/jobs/view/']");

        if (titleEl && linkEl) {
          const jobUrl = linkEl.href.split("?")[0];
          jobs.push({
            id: jobUrl,
            title: titleEl.textContent.trim(),
            company: companyEl?.textContent.trim() || "",
            location: locationEl?.textContent.trim() || "",
            url: jobUrl,
            source: "linkedin",
          });
        }
      });
    }

    // Indeed
    else if (url.includes("indeed.com")) {
      const jobCards = document.querySelectorAll(".job_seen_beacon, .jobsearch-ResultsList > li");
      jobCards.forEach((card) => {
        const titleEl = card.querySelector(".jobTitle a, h2.jobTitle");
        const companyEl = card.querySelector(".companyName");
        const locationEl = card.querySelector(".companyLocation");
        const linkEl = card.querySelector("a[href*='/viewjob'], a[id^='job_']");

        if (titleEl) {
          const href = linkEl?.href || titleEl?.href;
          const jobUrl = href ? new URL(href, window.location.origin).href : "";
          jobs.push({
            id: jobUrl,
            title: titleEl.textContent.trim(),
            company: companyEl?.textContent.trim() || "",
            location: locationEl?.textContent.trim() || "",
            url: jobUrl,
            source: "indeed",
          });
        }
      });
    }

    // Glassdoor
    else if (url.includes("glassdoor.com")) {
      const jobCards = document.querySelectorAll("[data-test='jobListing'], .react-job-listing");
      jobCards.forEach((card) => {
        const titleEl = card.querySelector("[data-test='job-title'], .job-title");
        const companyEl = card.querySelector("[data-test='employer-name']");
        const locationEl = card.querySelector("[data-test='location']");
        const linkEl = card.querySelector("a[href*='/job-listing/']");

        if (titleEl && linkEl) {
          jobs.push({
            id: linkEl.href,
            title: titleEl.textContent.trim(),
            company: companyEl?.textContent.trim() || "",
            location: locationEl?.textContent.trim() || "",
            url: linkEl.href,
            source: "glassdoor",
          });
        }
      });
    }

    // Dice
    else if (url.includes("dice.com")) {
      const jobCards = document.querySelectorAll("[data-cy='search-result-card']");
      jobCards.forEach((card) => {
        const titleEl = card.querySelector("[data-cy='card-title']");
        const companyEl = card.querySelector("[data-cy='card-company']");
        const locationEl = card.querySelector("[data-cy='card-location']");
        const linkEl = card.querySelector("a[href*='/job-detail/']");

        if (titleEl && linkEl) {
          jobs.push({
            id: linkEl.href,
            title: titleEl.textContent.trim(),
            company: companyEl?.textContent.trim() || "",
            location: locationEl?.textContent.trim() || "",
            url: linkEl.href,
            source: "dice",
          });
        }
      });
    }

    // ZipRecruiter
    else if (url.includes("ziprecruiter.com")) {
      const jobCards = document.querySelectorAll(".job_content, article.job-listing");
      jobCards.forEach((card) => {
        const titleEl = card.querySelector(".job_title, .title");
        const companyEl = card.querySelector(".hiring_company, .company");
        const locationEl = card.querySelector(".job_location, .location");
        const linkEl = card.querySelector("a[href*='/jobs/']");

        if (titleEl && linkEl) {
          jobs.push({
            id: linkEl.href,
            title: titleEl.textContent.trim(),
            company: companyEl?.textContent.trim() || "",
            location: locationEl?.textContent.trim() || "",
            url: linkEl.href,
            source: "ziprecruiter",
          });
        }
      });
    }

    return jobs;
  };

  // Initial scrape
  let currentJobs = scrapeCurrentJobs();
  currentJobs.forEach((job) => allJobs.set(job.id, job));

  // Scroll and scrape
  const maxScrolls = 20;
  let scrollCount = 0;
  let lastHeight = document.body.scrollHeight;

  while (scrollCount < maxScrolls) {
    // Scroll down
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(1500);

    // Check for "Load More" or "Show More" buttons
    const loadMoreBtn = document.querySelector(
      'button[aria-label*="more"], button[class*="load-more"], button[class*="show-more"], .infinite-scroller__show-more-button'
    );
    if (loadMoreBtn) {
      loadMoreBtn.click();
      await sleep(2000);
    }

    // Scrape new jobs
    currentJobs = scrapeCurrentJobs();
    currentJobs.forEach((job) => allJobs.set(job.id, job));

    // Check if we've reached the bottom
    const newHeight = document.body.scrollHeight;
    if (newHeight === lastHeight) {
      break;
    }
    lastHeight = newHeight;
    scrollCount++;
  }

  // Scroll back to top
  window.scrollTo(0, 0);

  return Array.from(allJobs.values());
}

// Initialize
loadSettings();
setupAutoSave();
updatePageInfo();
