(() => {
  function inject() {
    if (document.getElementById("jg-captcha-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "jg-captcha-overlay";
    overlay.style.cssText = [
      "position:fixed",
      "top:20px",
      "right:20px",
      "width:320px",
      "background:#ffffff",
      "border:2px solid #4f46e5",
      "border-radius:12px",
      "padding:20px",
      "z-index:2147483647",
      "box-shadow:0 4px 24px rgba(0,0,0,0.18)",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      "font-size:14px",
      "color:#1a1a1a",
      "line-height:1.5",
    ].join(";");

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:12px;";
    header.innerHTML =
      '<span style="font-size:18px;">&#9889;</span>' +
      '<strong style="font-size:15px;color:#4f46e5;">JobGenius \u2014 Action Required</strong>';

    const body = document.createElement("p");
    body.style.cssText = "margin:0 0 16px;";
    body.innerHTML =
      "<strong>CAPTCHA detected.</strong><br>Please solve it, then click " +
      "<em>Continue</em> to resume your application.";

    const continueBtn = document.createElement("button");
    continueBtn.id = "jg-captcha-continue";
    continueBtn.textContent = "\u2713 Continue Application";
    continueBtn.style.cssText = [
      "display:block",
      "width:100%",
      "margin-bottom:8px",
      "padding:10px 16px",
      "background:#4f46e5",
      "color:#fff",
      "border:none",
      "border-radius:8px",
      "font-size:14px",
      "font-weight:600",
      "cursor:pointer",
    ].join(";");

    const stopBtn = document.createElement("button");
    stopBtn.id = "jg-captcha-stop";
    stopBtn.textContent = "\u2717 Stop \u2014 I\u2019ll apply manually";
    stopBtn.style.cssText = [
      "display:block",
      "width:100%",
      "padding:10px 16px",
      "background:#fff",
      "color:#dc2626",
      "border:1.5px solid #dc2626",
      "border-radius:8px",
      "font-size:14px",
      "font-weight:600",
      "cursor:pointer",
    ].join(";");

    overlay.appendChild(header);
    overlay.appendChild(body);
    overlay.appendChild(continueBtn);
    overlay.appendChild(stopBtn);
    document.body.appendChild(overlay);

    continueBtn.addEventListener("click", () => {
      overlay.remove();
      window.postMessage({ type: "JG_CAPTCHA_SOLVED" }, "*");
    });

    stopBtn.addEventListener("click", () => {
      overlay.remove();
      window.postMessage({ type: "JG_CAPTCHA_STOP" }, "*");
    });
  }

  function waitForUser() {
    return new Promise((resolve) => {
      function handler(event) {
        if (event.source !== window) return;
        if (event.data?.type === "JG_CAPTCHA_SOLVED") {
          window.removeEventListener("message", handler);
          resolve("SOLVED");
        } else if (event.data?.type === "JG_CAPTCHA_STOP") {
          window.removeEventListener("message", handler);
          resolve("STOP");
        }
      }
      window.addEventListener("message", handler);
    });
  }

  window.JobGeniusCaptchaOverlay = { inject, waitForUser };
})();
