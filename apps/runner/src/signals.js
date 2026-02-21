function bodyHasAny(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase));
}

async function getBodyText(page) {
  return (
    (await page
      .evaluate(() => document.body?.innerText?.toLowerCase() ?? "")
      .catch(() => "")) ?? ""
  );
}

async function hasOtpLikeInput(page) {
  return page
    .evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll(
          "input, textarea"
        )
      );

      const isVisible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(node);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.opacity === "0"
        ) {
          return false;
        }
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const hasHint = (hint, re) => re.test(hint);

      return candidates.some((node) => {
        if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) {
          return false;
        }
        if (!isVisible(node)) return false;

        const type =
          node instanceof HTMLInputElement
            ? (node.type || "text").toLowerCase()
            : "textarea";

        if (!["text", "number", "tel", "password", "search", "textarea"].includes(type)) {
          return false;
        }

        const autocomplete = (node.getAttribute("autocomplete") || "").toLowerCase();
        const name = (node.getAttribute("name") || "").toLowerCase();
        const id = (node.getAttribute("id") || "").toLowerCase();
        const placeholder = (node.getAttribute("placeholder") || "").toLowerCase();
        const aria = (node.getAttribute("aria-label") || "").toLowerCase();
        const pattern = (node.getAttribute("pattern") || "").toLowerCase();
        const maxLength = Number(node.getAttribute("maxlength") || 0);
        const inputMode = (node.getAttribute("inputmode") || "").toLowerCase();
        const hint = [autocomplete, name, id, placeholder, aria].join(" ");

        if (
          hasHint(hint, /\b(zip|postal|cvv|cvc|coupon|promo)\b/) ||
          hint.includes("country code")
        ) {
          return false;
        }

        if (autocomplete === "one-time-code") {
          return true;
        }

        const mentionsOtp = hasHint(
          hint,
          /\b(otp|one[\s-]?time|verification|verify|passcode|auth(?:entication)?|two[\s-]?factor|2fa|security code)\b/
        );
        const mentionsCode = hasHint(hint, /\bcode\b/);
        const likelyShortNumeric =
          (maxLength > 0 && maxLength <= 8) ||
          inputMode === "numeric" ||
          pattern.includes("\\d");

        if (mentionsOtp) return true;
        if (mentionsCode && likelyShortNumeric) return true;

        return false;
      });
    })
    .catch(() => false);
}

export async function hasCaptcha(page) {
  const widgetDetected = await page
    .evaluate(() => {
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(node);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.opacity === "0"
        ) {
          return false;
        }
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const iframes = Array.from(
        document.querySelectorAll(
          "iframe[src*='captcha'], iframe[src*='recaptcha'], iframe[src*='turnstile'], iframe[title*='captcha' i], iframe[title*='challenge' i]"
        )
      );

      const hasBlockingIframe = iframes.some((frame) => {
        if (!(frame instanceof HTMLIFrameElement)) return false;
        if (!isVisible(frame)) return false;

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

      if (hasBlockingIframe) return true;

      const selectors = [
        ".g-recaptcha",
        ".h-captcha",
        ".cf-turnstile",
        "#captcha",
        "[id*='captcha']",
        "[class*='captcha']",
      ];

      const nodes = selectors.flatMap((selector) =>
        Array.from(document.querySelectorAll(selector))
      );

      return nodes.some((node) => {
        if (!(node instanceof HTMLElement)) return false;

        const className = (node.className || "").toString().toLowerCase();
        const id = (node.id || "").toLowerCase();
        const isRecaptchaBadge =
          className.includes("grecaptcha-badge") || id.includes("grecaptcha-badge");
        if (isRecaptchaBadge) return false;
        if (!isVisible(node)) return false;

        const rect = node.getBoundingClientRect();
        if (rect.width < 140 || rect.height < 40) return false;

        const text = (node.textContent || "").toLowerCase();
        return (
          text.includes("captcha") ||
          text.includes("verify") ||
          text.includes("human") ||
          text.includes("challenge")
        );
      });
    })
    .catch(() => false);

  if (widgetDetected) {
    return true;
  }

  const text = await getBodyText(page);
  return bodyHasAny(text, [
    "verify you are human",
    "prove you're human",
    "complete the captcha",
    "i'm not a robot",
    "i am not a robot",
    "security challenge",
  ]);
}

export async function hasSmsOtp(page) {
  const [text, otpInput] = await Promise.all([getBodyText(page), hasOtpLikeInput(page)]);
  if (!otpInput) {
    return false;
  }

  return bodyHasAny(text, [
    "sms code",
    "text message code",
    "text message",
    "sent to your phone",
    "verify your phone",
    "phone verification",
  ]);
}

export async function hasEmailOtp(page) {
  const [text, otpInput] = await Promise.all([getBodyText(page), hasOtpLikeInput(page)]);
  if (!otpInput) {
    return false;
  }

  return bodyHasAny(text, [
    "email code",
    "verification email",
    "sent to your email",
    "check your inbox",
    "email verification",
  ]);
}
