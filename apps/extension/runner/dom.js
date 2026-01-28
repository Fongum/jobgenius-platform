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

  function fillTextInputs(defaultEmail) {
    const inputs = Array.from(
      document.querySelectorAll("input[type='text'], input[type='email'], textarea")
    );

    inputs.forEach((input) => {
      if (input.value) return;
      if (input.disabled) return;
      input.focus();
      input.value = input.type === "email" ? defaultEmail : "N/A";
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
