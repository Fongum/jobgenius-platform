(() => {
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normalizeButtonTexts(texts) {
    return (texts ?? [])
      .map((text) => (text ?? "").toString().trim().toLowerCase())
      .filter(Boolean);
  }

  function getButtonLabel(button) {
    return (
      button.textContent ||
      button.getAttribute("value") ||
      button.getAttribute("aria-label") ||
      button.getAttribute("title") ||
      ""
    )
      .toLowerCase()
      .trim();
  }

  function isHidden(button) {
    const style = window.getComputedStyle(button);
    if (!style) return false;
    return (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    );
  }

  function isDisabled(button) {
    if (button.hasAttribute("disabled")) return true;
    const ariaDisabled = (button.getAttribute("aria-disabled") ?? "").toLowerCase();
    return ariaDisabled === "true";
  }

  function findButtonByText(texts) {
    const targets = normalizeButtonTexts(texts);
    if (targets.length === 0) return null;

    const buttons = Array.from(
      document.querySelectorAll(
        "button, input[type='submit'], input[type='button'], [role='button']"
      )
    );

    return buttons.find((button) => {
      if (isDisabled(button) || isHidden(button)) return false;
      const label = getButtonLabel(button);
      if (!label) return false;
      return targets.some((text) => label.includes(text));
    });
  }

  function findClickableByText(texts) {
    const targets = normalizeButtonTexts(texts);
    if (targets.length === 0) return null;

    const controls = Array.from(
      document.querySelectorAll(
        "button, input[type='submit'], input[type='button'], [role='button'], a[href], a[role='button']"
      )
    );

    return controls.find((control) => {
      if (isDisabled(control) || isHidden(control)) return false;
      const label = getButtonLabel(control);
      if (!label) return false;
      return targets.some((text) => label.includes(text));
    });
  }

  function isElementVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    if (!style) return false;
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function hasBlockingCaptchaIframe() {
    const iframes = Array.from(
      document.querySelectorAll(
        "iframe[src*='captcha'], iframe[src*='recaptcha'], iframe[src*='turnstile'], iframe[title*='captcha' i], iframe[title*='challenge' i]"
      )
    );

    return iframes.some((frame) => {
      if (!isElementVisible(frame)) return false;

      const src = (frame.getAttribute("src") || "").toLowerCase();
      const title = (frame.getAttribute("title") || "").toLowerCase();
      const rect = frame.getBoundingClientRect();
      const isSmall = rect.width < 180 || rect.height < 60;
      const isRecaptchaBadge =
        Boolean(frame.closest(".grecaptcha-badge")) ||
        src.includes("recaptcha/api2/anchor");

      if (isSmall || isRecaptchaBadge) return false;

      return (
        src.includes("captcha") ||
        src.includes("recaptcha") ||
        src.includes("turnstile") ||
        title.includes("captcha") ||
        title.includes("challenge")
      );
    });
  }

  function hasBlockingCaptchaWidget() {
    const selectors = [
      ".g-recaptcha",
      ".h-captcha",
      ".cf-turnstile",
      "#captcha",
      "[id*='captcha']",
      "[class*='captcha']",
      "[data-sitekey]",
    ];

    const candidates = selectors.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector))
    );

    return candidates.some((node) => {
      const className = (node.className || "").toString().toLowerCase();
      const id = (node.id || "").toLowerCase();
      const isRecaptchaBadge =
        className.includes("grecaptcha-badge") || id.includes("grecaptcha-badge");
      if (isRecaptchaBadge) return false;

      if (!isElementVisible(node)) return false;
      const rect = node.getBoundingClientRect();
      if (rect.width < 140 || rect.height < 40) return false;

      const text = (node.textContent || "").toLowerCase();
      const mentionsChallenge =
        text.includes("captcha") ||
        text.includes("robot") ||
        text.includes("verify") ||
        text.includes("human") ||
        text.includes("challenge");

      const hasInteractiveControl =
        Boolean(node.querySelector?.("iframe, input, textarea, [role='checkbox'], button")) ||
        node.tagName.toLowerCase() === "iframe";

      return mentionsChallenge || hasInteractiveControl;
    });
  }

  function hasCaptcha() {
    if (hasBlockingCaptchaIframe()) return true;
    if (hasBlockingCaptchaWidget()) return true;

    const text = document.body?.innerText?.toLowerCase() ?? "";
    const challengePhrases = [
      "verify you are human",
      "prove you're human",
      "complete the captcha",
      "i'm not a robot",
      "i am not a robot",
      "security challenge",
    ];
    return challengePhrases.some((phrase) => text.includes(phrase));
  }

  function hasAnyPhrase(text, phrases) {
    return phrases.some((phrase) => text.includes(phrase));
  }

  function looksLikeOtpInput(input) {
    if (!input || input.disabled || !isElementVisible(input)) {
      return false;
    }

    const type = normalizeHint(input.getAttribute("type") || input.type || "text");
    if (["hidden", "file", "checkbox", "radio"].includes(type)) {
      return false;
    }

    const combinedHint = [
      input.getAttribute("autocomplete"),
      input.getAttribute("name"),
      input.getAttribute("id"),
      input.getAttribute("placeholder"),
      input.getAttribute("aria-label"),
      getInputHint(input),
    ]
      .map((value) => normalizeHint(value))
      .filter(Boolean)
      .join(" ");

    const maxLength = Number(input.getAttribute("maxlength") || input.maxLength || 0);

    return (
      combinedHint.includes("one-time-code") ||
      combinedHint.includes("otp") ||
      combinedHint.includes("verification") ||
      combinedHint.includes("passcode") ||
      (combinedHint.includes("auth") && combinedHint.includes("code")) ||
      (combinedHint.includes("security") && combinedHint.includes("code")) ||
      (combinedHint.includes("code") && maxLength > 0 && maxLength <= 8)
    );
  }

  function getOtpInputCandidates() {
    return Array.from(document.querySelectorAll("input, textarea"))
      .filter((input) => looksLikeOtpInput(input))
      .sort((a, b) => {
        const aPriority = normalizeHint(a.getAttribute("autocomplete")) === "one-time-code" ? 1 : 0;
        const bPriority = normalizeHint(b.getAttribute("autocomplete")) === "one-time-code" ? 1 : 0;
        return bPriority - aPriority;
      });
  }

  function findOtpInput() {
    return getOtpInputCandidates()[0] ?? null;
  }

  function hasSmsOtp() {
    const text = document.body?.innerText?.toLowerCase() ?? "";
    const smsPhrases = [
      "sms code",
      "text message code",
      "texted you a code",
      "sent a code to your phone",
      "verification code sent to your phone",
      "phone verification code",
      "enter the code we sent",
    ];

    return hasAnyPhrase(text, smsPhrases) && Boolean(findOtpInput());
  }

  function hasEmailOtp() {
    const text = document.body?.innerText?.toLowerCase() ?? "";
    const emailPhrases = [
      "email code",
      "verification code",
      "confirmation code",
      "one-time code",
      "one time code",
      "check your email",
      "sent to your inbox",
    ];
    const smsPhrases = ["sms", "text message", "texted you", "phone"];

    if (!hasAnyPhrase(text, emailPhrases)) {
      return false;
    }

    if (hasAnyPhrase(text, smsPhrases) && !text.includes("email") && !text.includes("inbox")) {
      return false;
    }

    return Boolean(findOtpInput());
  }

  function normalizeHint(value) {
    return (value ?? "").toString().trim().toLowerCase();
  }

  function pickFirst(...values) {
    for (const value of values) {
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
    return "";
  }

  function splitFullName(fullName) {
    if (!fullName) return { firstName: "", lastName: "" };
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return { firstName: parts[0], lastName: "" };
    return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
  }

  function splitLocation(location) {
    if (!location) return { city: "", state: "" };
    const match = location.match(/^([^,]+),\s*([A-Za-z]{2})$/);
    if (match) return { city: match[1].trim(), state: match[2].trim() };
    return { city: location.trim(), state: "" };
  }

  function getInputHint(input) {
    const id = input.getAttribute("id");
    if (id) {
      const label = document.querySelector(`label[for='${id}']`);
      if (label?.textContent) return normalizeHint(label.textContent);
    }
    const parentLabel = input.closest("label");
    if (parentLabel?.textContent) return normalizeHint(parentLabel.textContent);
    const ariaLabel = input.getAttribute("aria-label");
    if (ariaLabel) return normalizeHint(ariaLabel);
    const placeholder = input.getAttribute("placeholder");
    if (placeholder) return normalizeHint(placeholder);
    const name = input.getAttribute("name");
    if (name) return normalizeHint(name);
    return "";
  }

  function getGroupHint(el) {
    const fieldset = el.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend?.textContent) return normalizeHint(legend.textContent);
    }
    const group = el.closest("[role='group'], [role='radiogroup']");
    if (group) {
      const labelId = group.getAttribute("aria-labelledby");
      if (labelId) {
        const labelEl = document.getElementById(labelId);
        if (labelEl?.textContent) return normalizeHint(labelEl.textContent);
      }
      const ariaLabel = group.getAttribute("aria-label");
      if (ariaLabel) return normalizeHint(ariaLabel);
    }
    return getInputHint(el);
  }

  function findBestOption(options, candidates) {
    const normalized = candidates.map((c) => c.toLowerCase().trim());
    return options.find((opt) => {
      const text = normalizeHint(opt.textContent ?? opt.text ?? "");
      if (!text || text === "select" || text === "choose" || text === "please select") return false;
      return normalized.some((c) => text.includes(c) || c.includes(text));
    }) ?? null;
  }

  function resolveFieldValue(hint, type, profile, defaultEmail) {
    const fullName = pickFirst(profile?.full_name, profile?.name);
    const { firstName, lastName } = splitFullName(fullName);
    const email = pickFirst(profile?.email, defaultEmail);
    const phone = pickFirst(profile?.phone);
    const location = pickFirst(profile?.location);
    const { city, state } = splitLocation(location);

    const addressLine1 = pickFirst(profile?.address_line1);
    const addressCity = pickFirst(profile?.address_city, city);
    const addressState = pickFirst(profile?.address_state, state);
    const addressZip = pickFirst(profile?.address_zip);
    const addressCountry = pickFirst(profile?.address_country);
    const isCompanyField = hint.includes("company") || hint.includes("employer");

    if (hint.includes("first name")) return firstName;
    if (hint.includes("last name")) return lastName;
    if (hint.includes("full name")) return fullName;
    if (hint.includes("name") && !isCompanyField) return fullName;
    if (hint.includes("email")) return email;
    if (hint.includes("phone") || hint.includes("mobile")) return phone;
    if (hint.includes("linkedin")) return pickFirst(profile?.linkedin_url);
    if (hint.includes("portfolio") || hint.includes("website") || hint.includes("github")) {
      return pickFirst(profile?.portfolio_url);
    }
    if (hint.includes("address") || hint.includes("street")) return addressLine1;
    if (hint.includes("city")) return addressCity;
    if (hint.includes("state")) return addressState;
    if (hint.includes("zip") || hint.includes("postal")) return addressZip;
    if (hint.includes("country")) return addressCountry;

    if (hint.includes("salary") || hint.includes("compensation") || hint.includes("desired pay")) {
      return "Negotiable";
    }

    if (hint.includes("how did you hear") || hint.includes("where did you find") || hint.includes("referral source")) {
      return "Job board";
    }

    if (hint.includes("start date") || hint.includes("when can you start") || hint.includes("available to start")) {
      return "Immediately";
    }

    if (hint.includes("notice period")) {
      return "2 weeks";
    }

    if (hint.includes("current") && hint.includes("title")) {
      const lastJob = Array.isArray(profile?.work_history) && profile.work_history.length > 0
        ? profile.work_history[0] : null;
      return pickFirst(lastJob?.title, lastJob?.role) || null;
    }

    if (hint.includes("current employer") || hint.includes("current company") ||
        (isCompanyField && hint.includes("current"))) {
      const lastJob = Array.isArray(profile?.work_history) && profile.work_history.length > 0
        ? profile.work_history[0] : null;
      return pickFirst(lastJob?.company, lastJob?.organization, lastJob?.employer) || null;
    }

    if ((hint.includes("years") && hint.includes("experience")) ||
        hint.includes("years of experience")) {
      if (Array.isArray(profile?.work_history) && profile.work_history.length > 0) {
        return String(Math.min(profile.work_history.length * 2, 15));
      }
      return "3";
    }

    if (type === "email") return email;
    if (type === "tel") return phone;
    return "";
  }

  function fillTextInputs(defaultEmail, profile = null) {
    let filled = 0;
    const inputs = Array.from(
      document.querySelectorAll(
        "input[type='text'], input[type='email'], input[type='tel'], input:not([type])"
      )
    );

    inputs.forEach((input) => {
      if (input.value) return;
      if (input.disabled) return;
      const type = input.getAttribute("type") || "text";
      const hint = getInputHint(input);
      const fillValue = resolveFieldValue(hint, type, profile ?? {}, defaultEmail);
      if (!fillValue) return;
      input.focus();
      input.value = fillValue;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      filled += 1;
    });

    return filled;
  }

  function fillSelectInputs(defaultEmail, profile = null) {
    let filled = 0;
    const selects = Array.from(document.querySelectorAll("select"));

    selects.forEach((select) => {
      if (select.disabled) return;
      const firstOpt = select.options[0];
      const currentVal = select.value;
      const isDefault = !currentVal || currentVal === (firstOpt?.value ?? "");
      if (!isDefault) return;

      const hint = getInputHint(select);
      if (!hint) return;

      let candidates = null;

      if (hint.includes("authorized") || hint.includes("legally work") ||
          hint.includes("eligible to work") || hint.includes("work authorization")) {
        candidates = ["yes", "authorized", "u.s. citizen", "citizen", "legally authorized", "i am authorized"];
      } else if (hint.includes("sponsor") || hint.includes("sponsorship")) {
        candidates = ["no", "does not require", "will not require", "no sponsorship", "i will not"];
      } else if (hint.includes("country")) {
        const country = pickFirst(profile?.address_country);
        const primary = country ? [country.toLowerCase()] : [];
        candidates = [...primary, "united states", "usa", "us", "united states of america"];
      } else if (hint.includes("years of experience") || (hint.includes("years") && hint.includes("experience"))) {
        candidates = ["3-5 years", "3 to 5", "5+ years", "5 years", "4 years", "3 years", "2-5", "1-3"];
      } else if (hint.includes("employment type") || hint.includes("job type") || hint.includes("work type")) {
        candidates = ["full-time", "full time", "permanent", "regular"];
      } else if (hint.includes("gender") || hint.includes("race") || hint.includes("ethnicity") ||
                 hint.includes("veteran") || hint.includes("disability")) {
        candidates = [
          "prefer not to answer",
          "decline to self-identify",
          "i do not wish",
          "prefer not to say",
          "choose not to disclose",
          "i prefer not",
          "decline to answer",
        ];
      }

      if (!candidates) return;

      const options = Array.from(select.options);
      const best = findBestOption(options, candidates);
      if (best) {
        if (select.value === best.value) return;
        select.value = best.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        filled += 1;
      }
    });

    return filled;
  }

  function fillRadioGroups(profile) {
    let filled = 0;
    const radios = Array.from(document.querySelectorAll("input[type='radio']"));

    const groups = new Map();
    radios.forEach((radio) => {
      const name = radio.getAttribute("name");
      if (!name) return;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(radio);
    });

    groups.forEach((group) => {
      if (group.some((r) => r.checked)) return;
      if (group.every((r) => r.disabled)) return;

      const firstRadio = group[0];
      const groupHint = getGroupHint(firstRadio);
      if (!groupHint) return;

      let targetLabel = null;

      if (groupHint.includes("authorized") || groupHint.includes("eligible to work") ||
          groupHint.includes("legally authorized") || groupHint.includes("work in the u")) {
        targetLabel = "yes";
      } else if (groupHint.includes("sponsor") || groupHint.includes("sponsorship")) {
        targetLabel = "no";
      } else if (groupHint.includes("relocate") || groupHint.includes("relocation")) {
        targetLabel = "yes";
      } else if (groupHint.includes("gender") || groupHint.includes("race") ||
                 groupHint.includes("ethnicity") || groupHint.includes("veteran") ||
                 groupHint.includes("disability")) {
        targetLabel = "prefer not to answer";
      }

      if (!targetLabel) return;

      const target = group.find((r) => {
        if (r.disabled) return false;
        const radioHint = normalizeHint(
          r.getAttribute("aria-label") ||
          r.getAttribute("value") ||
          getInputHint(r)
        );
        return radioHint.includes(targetLabel) || targetLabel.includes(radioHint);
      });

      if (target) {
        target.click();
        target.dispatchEvent(new Event("change", { bubbles: true }));
        filled += 1;
      }
    });

    return filled;
  }

  function fillCheckboxes() {
    let filled = 0;
    const checkboxes = Array.from(document.querySelectorAll("input[type='checkbox']"));
    const autoCheckKeywords = [
      "agree", "accept", "certify", "confirm", "acknowledge",
      "terms", "conditions", "correct", "authorize",
    ];

    checkboxes.forEach((checkbox) => {
      if (checkbox.checked) return;
      if (checkbox.disabled) return;
      const hint = getInputHint(checkbox);
      if (autoCheckKeywords.some((kw) => hint.includes(kw))) {
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        filled += 1;
      }
    });

    return filled;
  }

  function fillTextAreas(profile, job) {
    let filled = 0;
    const textareas = Array.from(document.querySelectorAll("textarea"));
    const fullName = pickFirst(profile?.full_name, profile?.name);
    const jobTitle = pickFirst(job?.title, "this position");
    const company = pickFirst(job?.company, "your company");

    let background = "my professional experience";
    if (Array.isArray(profile?.work_history) && profile.work_history.length > 0) {
      const latest = profile.work_history[0];
      background = pickFirst(latest?.title, latest?.role, background);
    }

    textareas.forEach((textarea) => {
      if (textarea.disabled) return;
      const hint = getInputHint(textarea);

      let fillValue = null;

      if (hint.includes("cover letter") || hint.includes("introduction") || hint.includes("letter")) {
        fillValue = `Dear Hiring Team,\n\nI am excited to apply for the ${jobTitle} role at ${company}. My background in ${background} makes me a strong fit for this position. I look forward to contributing to your team.\n\nBest regards,\n${fullName}`;
      } else if (hint.includes("why") || hint.includes("motivation") ||
                 hint.includes("interest") || hint.includes("reason")) {
        fillValue = `I am excited about the ${jobTitle} opportunity at ${company} because it aligns perfectly with my background and career goals.`;
      } else if (hint.includes("additional") || hint.includes("anything else")) {
        fillValue = "No additional information at this time.";
      }

      if (!fillValue && textarea.required) {
        fillValue =
          "I am excited about this role and confident my experience aligns with the position requirements.";
      }

      if (!fillValue) return;
      textarea.focus();
      textarea.value = fillValue;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
      filled += 1;
    });

    return filled;
  }

  function fillAllFields(defaultEmail, profile, job) {
    const text = fillTextInputs(defaultEmail, profile);
    const selects = fillSelectInputs(defaultEmail, profile);
    const radios = fillRadioGroups(profile);
    const checkboxes = fillCheckboxes();
    const textareas = fillTextAreas(profile, job);
    return {
      text,
      selects,
      radios,
      checkboxes,
      textareas,
      total: text + selects + radios + checkboxes + textareas,
    };
  }

  async function uploadResume(resumeUrl) {
    const fileInputs = Array.from(document.querySelectorAll("input[type='file']"))
      .filter((input) => !input.disabled);
    const input =
      fileInputs.find((fileInput) => {
        const hint = getInputHint(fileInput);
        return (
          hint.includes("resume") ||
          hint.includes("cv") ||
          hint.includes("curriculum vitae")
        );
      }) ||
      fileInputs[0] ||
      null;
    if (!input || !resumeUrl) return { ok: false, reason: "NO_INPUT_OR_URL" };

    const response = await fetch(resumeUrl);
    if (!response.ok) {
      return { ok: false, reason: "FETCH_FAILED" };
    }

    const blob = await response.blob();
    const file = new File([blob], "resume.pdf", {
      type: blob.type || "application/pdf",
    });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  }

  function getLabelText(input) {
    const id = input.getAttribute("id");
    if (id) {
      const label = document.querySelector(`label[for='${id}']`);
      if (label?.textContent) return label.textContent.trim();
    }

    const parentLabel = input.closest("label");
    if (parentLabel?.textContent) return parentLabel.textContent.trim();

    const ariaLabel = input.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel.trim();

    const name = input.getAttribute("name");
    return name ? name.trim() : "Unknown field";
  }

  function isRequiredField(input) {
    return Boolean(input.matches?.("[required], [aria-required='true']"));
  }

  function hasEmptyValue(input) {
    const tag = input.tagName.toLowerCase();
    const type = normalizeHint(input.getAttribute("type") || "");

    if (type === "checkbox") {
      return !input.checked;
    }

    if (type === "file") {
      return !input.files || input.files.length === 0;
    }

    if (tag === "select") {
      return !String(input.value ?? "").trim();
    }

    return !String(input.value ?? "").trim();
  }

  function extractRequiredFields() {
    const requiredFields = [];
    const radioGroups = new Map();
    const inputs = Array.from(document.querySelectorAll("input, textarea, select"));

    inputs.forEach((input) => {
      if (input.disabled || !isRequiredField(input)) {
        return;
      }

      const type = normalizeHint(input.getAttribute("type") || input.tagName.toLowerCase());
      if (type === "radio") {
        const groupKey = input.getAttribute("name") || input.getAttribute("id") || getLabelText(input);
        if (!radioGroups.has(groupKey)) {
          radioGroups.set(groupKey, []);
        }
        radioGroups.get(groupKey).push(input);
        return;
      }

      if (!isElementVisible(input) && type !== "file") {
        return;
      }

      if (!hasEmptyValue(input)) {
        return;
      }

      let options = null;
      if (input.tagName.toLowerCase() === "select") {
        options = Array.from(input.options)
          .map((option) => option.textContent?.trim())
          .filter(Boolean);
      }

      requiredFields.push({
        label: getLabelText(input),
        type,
        options,
        required: true,
      });
    });

    for (const group of radioGroups.values()) {
      if (group.length === 0 || group.some((input) => input.checked)) {
        continue;
      }

      const visibleGroup = group.filter((input) => isElementVisible(input));
      const firstInput = visibleGroup[0] || group[0];
      requiredFields.push({
        label: getLabelText(firstInput),
        type: "radio",
        options: group
          .map((input) =>
            input.getAttribute("aria-label") ||
            input.getAttribute("value") ||
            getLabelText(input)
          )
          .filter(Boolean),
        required: true,
      });
    }

    return requiredFields;
  }

  function requiredFieldsMissing() {
    return extractRequiredFields().length > 0;
  }

  function captureFlowFingerprint() {
    const headerText =
      document.querySelector("h1, h2, [role='heading']")?.textContent?.trim() ?? "";
    const requiredCount = extractRequiredFields().length;
    const buttonSnapshot = Array.from(
      document.querySelectorAll(
        "button, input[type='submit'], input[type='button'], [role='button']"
      )
    )
      .slice(0, 4)
      .map((button) => getButtonLabel(button))
      .filter(Boolean)
      .join("|");

    return [
      window.location.pathname,
      document.title ?? "",
      headerText.slice(0, 120),
      String(requiredCount),
      buttonSnapshot.slice(0, 240),
    ].join("::");
  }

  /**
   * Wait for the DOM to stop mutating before proceeding.
   * Resolves after `idleMs` of no mutations or `totalMs` timeout.
   */
  function waitForDomStable(idleMs = 800, totalMs = 8000) {
    return new Promise((resolve) => {
      let timer = null;
      const deadline = setTimeout(() => {
        if (observer) observer.disconnect();
        resolve();
      }, totalMs);

      const observer = new MutationObserver(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          observer.disconnect();
          clearTimeout(deadline);
          resolve();
        }, idleMs);
      });

      const target = document.body ?? document.documentElement;
      if (target) {
        observer.observe(target, {
          childList: true,
          subtree: true,
          attributes: true,
        });
      }

      timer = setTimeout(() => {
        observer.disconnect();
        clearTimeout(deadline);
        resolve();
      }, idleMs);
    });
  }

  /**
   * Dismiss common blocking overlays (cookie banners, modals).
   */
  function dismissOverlays() {
    let dismissed = false;

    // Cookie consent
    const cookieSelectors = [
      "button[id*='cookie' i][id*='accept' i]",
      "#onetrust-accept-btn-handler",
      ".cc-dismiss",
      ".cc-btn.cc-allow",
      "[data-testid='cookie-accept']",
    ];
    for (const sel of cookieSelectors) {
      const btn = document.querySelector(sel);
      if (btn instanceof HTMLElement && btn.offsetParent !== null) {
        btn.click();
        dismissed = true;
        break;
      }
    }

    // Modal close
    const modalSelectors = [
      "[role='dialog'] button[aria-label*='close' i]",
      ".modal button.close",
      ".modal-close",
      "[data-dismiss='modal']",
    ];
    for (const sel of modalSelectors) {
      const btn = document.querySelector(sel);
      if (btn instanceof HTMLElement && btn.offsetParent !== null) {
        btn.click();
        dismissed = true;
        break;
      }
    }

    return dismissed;
  }

  /**
   * Upload a file via drag-and-drop zone if standard input not found.
   */
  async function uploadViaDragDrop(resumeUrl) {
    if (!resumeUrl) return { ok: false, reason: "NO_INPUT_OR_URL" };

    // Try standard input first
    const fileInputs = Array.from(document.querySelectorAll("input[type='file']"))
      .filter((input) => !input.disabled);
    if (fileInputs.length > 0) {
      return uploadResume(resumeUrl); // Use existing method
    }

    // Look for drop zones
    const dropZone = document.querySelector(
      "[class*='dropzone'], [class*='drop-zone'], [class*='upload-area'], " +
      "[class*='file-upload'], [class*='drag-drop'], " +
      ".dz-clickable, .filepond--root"
    );

    if (dropZone) {
      // Clicking often reveals a file input
      dropZone.click();
      await sleep(1000);
      const revealedInput = document.querySelector("input[type='file']");
      if (revealedInput) {
        return uploadResume(resumeUrl);
      }
    }

    return { ok: false, reason: "NO_UPLOAD_ELEMENT" };
  }

  window.JobGeniusDom = {
    sleep,
    findButtonByText,
    findClickableByText,
    hasCaptcha,
    hasSmsOtp,
    hasEmailOtp,
    fillTextInputs,
    fillSelectInputs,
    fillRadioGroups,
    fillCheckboxes,
    fillTextAreas,
    fillAllFields,
    uploadResume,
    uploadViaDragDrop,
    findOtpInput,
    extractRequiredFields,
    requiredFieldsMissing,
    captureFlowFingerprint,
    waitForDomStable,
    dismissOverlays,
  };
})();
