export async function extractRequiredFields(page) {
  return page.evaluate(() => {
    const requiredInputs = Array.from(
      document.querySelectorAll(
        "input[required], textarea[required], select[required], input[aria-required='true'], textarea[aria-required='true'], select[aria-required='true']"
      )
    );

    const getLabelText = (input) => {
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
    };

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
  });
}

export async function fillKnownFields(page, defaultEmail) {
  const inputs = await page.$$("input[type='text'], input[type='email'], textarea");
  for (const input of inputs) {
    const isDisabled = await input.getAttribute("disabled");
    if (isDisabled !== null) continue;
    const value = await input.inputValue();
    if (value) continue;
    const type = (await input.getAttribute("type")) ?? "text";
    const fillValue = type === "email" ? defaultEmail : "N/A";
    await input.fill(fillValue);
  }
}

export async function uploadResume(page, resumePath) {
  const input = await page.$("input[type='file']");
  if (!input || !resumePath) return { ok: false, reason: "NO_INPUT_OR_URL" };
  await input.setInputFiles(resumePath);
  return { ok: true };
}

export async function hasCaptcha(page) {
  const text = (await page.textContent("body"))?.toLowerCase() ?? "";
  if (text.includes("captcha")) return true;
  return Boolean(await page.$("iframe[src*='captcha']"));
}

export async function hasSmsOtp(page) {
  const text = (await page.textContent("body"))?.toLowerCase() ?? "";
  if (text.includes("sms") && text.includes("code")) return true;
  if (text.includes("text message") && text.includes("code")) return true;
  return Boolean(await page.$("input[type='tel']"));
}

export async function hasEmailOtp(page) {
  const text = (await page.textContent("body"))?.toLowerCase() ?? "";
  if (text.includes("email") && text.includes("code")) return true;
  if (text.includes("verification") && text.includes("code")) return true;
  return Boolean(await page.$("input[autocomplete='one-time-code'], input[name*='code']"));
}

export async function findButtonByText(page, texts) {
  const buttons = await page.$$("button");
  for (const button of buttons) {
    const label = (await button.textContent())?.toLowerCase() ?? "";
    if (texts.some((text) => label.includes(text))) {
      return button;
    }
  }
  return null;
}
