(function () {
  const GLOBAL_KEY = "__jobGeniusSpy";

  if (window[GLOBAL_KEY] && typeof window[GLOBAL_KEY].refresh === "function") {
    window[GLOBAL_KEY].refresh(true);
    return;
  }

  const HOST_HINTS = [
    "linkedin.com",
    "indeed.com",
    "glassdoor.com",
    "greenhouse.io",
    "myworkdayjobs.com",
    "workday.com",
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
  const PATH_HINTS = [
    "/job",
    "/jobs",
    "/career",
    "/careers",
    "/position",
    "/positions",
    "/vacancy",
    "/opportunity",
    "/apply",
  ];
  const TITLE_SELECTORS = [
    ".jobs-unified-top-card__job-title",
    ".jobsearch-JobInfoHeader-title",
    "[data-testid='jobsearch-JobInfoHeader-title']",
    ".top-card-layout__title",
    ".posting-headline h2",
    ".posting-headline h1",
    ".job-title",
    "h1",
  ];
  const COMPANY_SELECTORS = [
    ".jobs-unified-top-card__company-name",
    ".topcard__org-name-link",
    ".jobsearch-InlineCompanyRating-companyHeader",
    "[data-testid='inlineHeader-companyName']",
    ".top-card-layout__second-subline a",
    ".company-name",
    ".employer",
    "[data-testid='company-name']",
  ];
  const LOCATION_SELECTORS = [
    ".jobs-unified-top-card__bullet",
    ".topcard__flavor--bullet",
    ".jobsearch-JobInfoHeader-subtitle div:last-child",
    "[data-testid='inlineHeader-companyLocation']",
    ".top-card-layout__third-subline",
    ".location",
    "[data-testid='text-location']",
  ];
  const DESCRIPTION_SELECTORS = [
    ".jobs-description__content",
    ".jobs-box__html-content",
    ".jobs-description-content__text",
    "#jobDescriptionText",
    ".jobsearch-jobDescriptionText",
    "[data-test='jobDescriptionContent']",
    ".job-description",
    ".job_description",
    "#job-description",
    ".posting-page .content",
    ".desc",
  ];

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeUrl(url) {
    return String(url || "").split("#")[0];
  }

  function hostMatches(host, hint) {
    return host === hint || host.endsWith("." + hint);
  }

  function isLikelyJobUrl(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return false;
      }

      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();
      if (HOST_HINTS.some((hint) => hostMatches(host, hint))) {
        return true;
      }

      return PATH_HINTS.some((hint) => path.includes(hint));
    } catch {
      return false;
    }
  }

  function getTextFromSelectors(selectors, minLength) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (!element) {
        continue;
      }

      const text = normalizeText(element.textContent);
      if (text.length >= minLength) {
        return text;
      }
    }

    return "";
  }

  function getDescriptionText() {
    for (const selector of DESCRIPTION_SELECTORS) {
      const element = document.querySelector(selector);
      if (!element) {
        continue;
      }

      const text = normalizeText(element.textContent);
      if (text.length >= 80) {
        return text.slice(0, 5000);
      }
    }

    return "";
  }

  function detectSource(hostname) {
    const host = String(hostname || "").toLowerCase();
    if (host.includes("linkedin")) return "linkedin";
    if (host.includes("indeed")) return "indeed";
    if (host.includes("glassdoor")) return "glassdoor";
    if (host.includes("greenhouse")) return "greenhouse";
    if (host.includes("workday")) return "workday";
    if (host.includes("lever")) return "lever";
    if (host.includes("smartrecruiters")) return "smartrecruiters";
    if (host.includes("icims")) return "icims";
    if (host.includes("jobvite")) return "jobvite";
    if (host.includes("workable")) return "workable";
    if (host.includes("bamboohr")) return "bamboohr";
    if (host.includes("recruitee")) return "recruitee";
    if (host.includes("ashby")) return "ashby";
    return host || "extension_spy";
  }

  function buildIdentity(context) {
    return [
      normalizeUrl(context.url),
      normalizeText(context.title),
      normalizeText(context.company || ""),
    ].join("::");
  }

  function getStorageKey(prefix, identity) {
    return prefix + identity;
  }

  function readSessionFlag(prefix, identity) {
    try {
      return sessionStorage.getItem(getStorageKey(prefix, identity)) === "1";
    } catch {
      return false;
    }
  }

  function writeSessionFlag(prefix, identity) {
    try {
      sessionStorage.setItem(getStorageKey(prefix, identity), "1");
    } catch {
      // Ignore storage failures.
    }
  }

  function extractJobContext() {
    const pageUrl = normalizeUrl(window.location.href);
    if (!isLikelyJobUrl(pageUrl)) {
      return null;
    }

    const title = getTextFromSelectors(TITLE_SELECTORS, 4);
    if (!title || title.length > 200) {
      return null;
    }

    const company = getTextFromSelectors(COMPANY_SELECTORS, 2) || null;
    const location = getTextFromSelectors(LOCATION_SELECTORS, 2) || null;
    const rawText = getDescriptionText() || null;

    if (!company && !location && !rawText) {
      return null;
    }

    return {
      title,
      company,
      location,
      raw_text: rawText,
      url: pageUrl,
      source: detectSource(window.location.hostname),
    };
  }

  function removeBanner() {
    const existing = document.getElementById("jobgenius-spy-banner");
    if (existing) {
      existing.remove();
    }
  }

  function setBannerStatus(container, text, color) {
    const status = container.querySelector("[data-jobgenius-spy-status]");
    if (!status) {
      return;
    }

    status.textContent = text;
    status.style.color = color;
  }

  function renderBanner(context) {
    if (!document.body) {
      return;
    }

    removeBanner();

    const banner = document.createElement("div");
    banner.id = "jobgenius-spy-banner";
    banner.style.position = "fixed";
    banner.style.right = "16px";
    banner.style.bottom = "16px";
    banner.style.zIndex = "2147483647";
    banner.style.width = "320px";
    banner.style.maxWidth = "calc(100vw - 32px)";
    banner.style.background = "#111827";
    banner.style.color = "#f9fafb";
    banner.style.borderRadius = "12px";
    banner.style.boxShadow = "0 12px 30px rgba(0,0,0,0.28)";
    banner.style.padding = "14px";
    banner.style.fontFamily = "Segoe UI, Arial, sans-serif";
    banner.style.lineHeight = "1.4";

    const title = document.createElement("div");
    title.textContent = "JobGenius Spy";
    title.style.fontSize = "12px";
    title.style.fontWeight = "700";
    title.style.letterSpacing = "0.02em";
    title.style.textTransform = "uppercase";
    title.style.color = "#93c5fd";

    const prompt = document.createElement("div");
    prompt.textContent = companyAndTitleText(context);
    prompt.style.marginTop = "8px";
    prompt.style.fontSize = "13px";
    prompt.style.fontWeight = "600";

    const meta = document.createElement("div");
    meta.textContent = [context.company, context.location].filter(Boolean).join(" • ");
    meta.style.marginTop = "4px";
    meta.style.fontSize = "12px";
    meta.style.color = "#cbd5e1";

    const status = document.createElement("div");
    status.dataset.jobgeniusSpyStatus = "1";
    status.style.marginTop = "8px";
    status.style.fontSize = "11px";
    status.style.color = "#9ca3af";
    status.textContent = "If you already applied outside the runner, track it here.";

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.marginTop = "12px";

    const yesButton = document.createElement("button");
    yesButton.textContent = "Yes, I Applied";
    yesButton.style.flex = "1";
    yesButton.style.border = "0";
    yesButton.style.borderRadius = "8px";
    yesButton.style.padding = "9px 10px";
    yesButton.style.background = "#2563eb";
    yesButton.style.color = "#ffffff";
    yesButton.style.fontSize = "12px";
    yesButton.style.fontWeight = "600";
    yesButton.style.cursor = "pointer";

    const noButton = document.createElement("button");
    noButton.textContent = "Not Yet";
    noButton.style.flex = "1";
    noButton.style.border = "1px solid #374151";
    noButton.style.borderRadius = "8px";
    noButton.style.padding = "9px 10px";
    noButton.style.background = "transparent";
    noButton.style.color = "#e5e7eb";
    noButton.style.fontSize = "12px";
    noButton.style.fontWeight = "600";
    noButton.style.cursor = "pointer";

    yesButton.addEventListener("click", function () {
      const identity = buildIdentity(context);
      yesButton.disabled = true;
      noButton.disabled = true;
      yesButton.style.opacity = "0.7";
      noButton.style.opacity = "0.7";
      setBannerStatus(banner, "Saving application to the profile...", "#93c5fd");

      chrome.runtime.sendMessage(
        {
          type: "JOB_SPY_MARK_APPLIED",
          job: context,
        },
        function (response) {
          if (chrome.runtime.lastError) {
            setBannerStatus(banner, "Failed to save application.", "#fca5a5");
            yesButton.disabled = false;
            noButton.disabled = false;
            yesButton.style.opacity = "1";
            noButton.style.opacity = "1";
            return;
          }

          if (!response || !response.success) {
            setBannerStatus(
              banner,
              (response && response.error) || "Failed to save application.",
              "#fca5a5"
            );
            yesButton.disabled = false;
            noButton.disabled = false;
            yesButton.style.opacity = "1";
            noButton.style.opacity = "1";
            return;
          }

          writeSessionFlag("jobgenius:spy:tracked:", identity);
          setBannerStatus(
            banner,
            response.already_tracked
              ? "This job was already tracked on the profile."
              : "Application saved to the profile.",
            "#86efac"
          );
          setTimeout(removeBanner, 2200);
        }
      );
    });

    noButton.addEventListener("click", function () {
      writeSessionFlag("jobgenius:spy:dismissed:", buildIdentity(context));
      removeBanner();
    });

    actions.appendChild(yesButton);
    actions.appendChild(noButton);
    banner.appendChild(title);
    banner.appendChild(prompt);
    if (meta.textContent) {
      banner.appendChild(meta);
    }
    banner.appendChild(status);
    banner.appendChild(actions);
    document.body.appendChild(banner);
  }

  function companyAndTitleText(context) {
    if (context.company) {
      return "Did you apply for " + context.title + " at " + context.company + "?";
    }
    return "Did you apply for " + context.title + "?";
  }

  const state = {
    lastUrl: "",
    lastIdentity: "",
    refresh: function (force) {
      const currentUrl = normalizeUrl(window.location.href);
      state.lastUrl = currentUrl;

      const context = extractJobContext();
      if (!context) {
        state.lastIdentity = "";
        removeBanner();
        return;
      }

      const identity = buildIdentity(context);
      if (
        readSessionFlag("jobgenius:spy:dismissed:", identity) ||
        readSessionFlag("jobgenius:spy:tracked:", identity)
      ) {
        state.lastIdentity = identity;
        removeBanner();
        return;
      }

      if (!force && identity === state.lastIdentity) {
        return;
      }

      state.lastIdentity = identity;
      renderBanner(context);
    },
  };

  window[GLOBAL_KEY] = state;
  window.setInterval(function () {
    state.refresh(false);
  }, 2000);
  window.setTimeout(function () {
    state.refresh(true);
  }, 300);
})();
