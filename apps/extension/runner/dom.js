(() => {
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function findButtonByText(texts) {
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons.find((button) => {
      const label = button.textContent?.toLowerCase() ?? "";
      return texts.some((text) => label.includes(text));
    });
  }

  function hasCaptcha() {
    const text = document.body?.innerText?.toLowerCase() ?? "";
    if (text.includes("captcha")) return true;
    return Boolean(document.querySelector("iframe[src*='captcha']"));
  }

  function hasSmsOtp() {
    const text = document.body?.innerText?.toLowerCase() ?? "";
    if (text.includes("sms") && text.includes("code")) return true;
    if (text.includes("text message") && text.includes("code")) return true;
    return Boolean(document.querySelector("input[type='tel']"));
  }

  function hasEmailOtp() {
    const text = document.body?.innerText?.toLowerCase() ?? "";
    if (text.includes("email") && text.includes("code")) return true;
    if (text.includes("verification") && text.includes("code")) return true;
    return Boolean(
      document.querySelector(
        "input[autocomplete='one-time-code'], input[name*='code']"
      )
    );
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

    if (type === "email") return email;
    if (type === "tel") return phone;
    return type === "email" ? email : "N/A";
  }

  function fillTextInputs(defaultEmail, profile = null) {
    const inputs = Array.from(
      document.querySelectorAll(
        "input[type='text'], input[type='email'], input[type='tel'], input:not([type]), textarea"
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
    });
  }

  async function uploadResume(resumeUrl) {
    const input = document.querySelector("input[type='file']");
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

  function extractRequiredFields() {
    const requiredInputs = Array.from(
      document.querySelectorAll(
        "input[required], textarea[required], select[required]"
      )
    );

    return requiredInputs
      .filter((input) => !input.value)
      .map((input) => {
        const type = input.tagName.toLowerCase();
        let options = null;
        if (input.tagName.toLowerCase() === "select") {
          options = Array.from(input.options)
            .map((option) => option.textContent?.trim())
            .filter(Boolean);
        }
        return {
          label: getLabelText(input),
          type,
          options,
          required: true,
        };
      });
  }

  function requiredFieldsMissing() {
    return extractRequiredFields().length > 0;
  }

  window.JobGeniusDom = {
    sleep,
    findButtonByText,
    hasCaptcha,
    hasSmsOtp,
    hasEmailOtp,
    fillTextInputs,
    uploadResume,
    extractRequiredFields,
    requiredFieldsMissing,
  };
})();
