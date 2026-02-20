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
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function splitLocation(location) {
  if (!location) return { city: "", state: "" };
  const match = location.match(/^([^,]+),\s*([A-Za-z]{2})$/);
  if (match) {
    return { city: match[1].trim(), state: match[2].trim() };
  }
  return { city: location.trim(), state: "" };
}

async function getInputHint(input) {
  const label = await input.evaluate((el) => {
    const id = el.getAttribute("id");
    if (id) {
      const labelEl = document.querySelector(`label[for='${id}']`);
      if (labelEl?.textContent) return labelEl.textContent.trim();
    }
    const parentLabel = el.closest("label");
    if (parentLabel?.textContent) return parentLabel.textContent.trim();
    return "";
  });
  const ariaLabel = await input.getAttribute("aria-label");
  const placeholder = await input.getAttribute("placeholder");
  const name = await input.getAttribute("name");
  const id = await input.getAttribute("id");
  return normalizeHint([label, ariaLabel, placeholder, name, id].filter(Boolean).join(" "));
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

export async function fillKnownFields(page, ctx) {
  const profile = ctx?.profile ?? {};
  const defaultEmail = ctx?.defaultEmail ?? "";
  const inputs = await page.$$(
    "input[type='text'], input[type='email'], input[type='tel'], input:not([type]), textarea"
  );
  for (const input of inputs) {
    const isDisabled = await input.getAttribute("disabled");
    if (isDisabled !== null) continue;
    const value = await input.inputValue();
    if (value) continue;
    const type = (await input.getAttribute("type")) ?? "text";
    const hint = await getInputHint(input);
    const fillValue = resolveFieldValue(hint, type, profile, defaultEmail);
    if (!fillValue) continue;
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
  const targets = (texts ?? [])
    .map((text) => (text ?? "").toString().trim().toLowerCase())
    .filter(Boolean);
  if (targets.length === 0) {
    return null;
  }

  const buttons = await page.$$(
    "button, input[type='submit'], input[type='button'], [role='button']"
  );
  for (const button of buttons) {
    const disabled = await button
      .evaluate((el) => {
        if (!(el instanceof HTMLElement)) {
          return false;
        }
        if (el.hasAttribute("disabled")) {
          return true;
        }
        return (el.getAttribute("aria-disabled") ?? "").toLowerCase() === "true";
      })
      .catch(() => false);

    if (disabled) {
      continue;
    }

    const label = (
      (await button.textContent()) ??
      (await button.getAttribute("value")) ??
      (await button.getAttribute("aria-label")) ??
      (await button.getAttribute("title")) ??
      ""
    )
      .toLowerCase()
      .trim();

    if (!label) {
      continue;
    }

    if (targets.some((text) => label.includes(text))) {
      return button;
    }
  }
  return null;
}
