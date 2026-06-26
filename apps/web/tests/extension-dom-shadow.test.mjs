/**
 * Shadow-DOM piercing test for the extension runner's DOM layer.
 *
 * Loads the real apps/extension/runner/dom.js into a jsdom window and exercises
 * extractRequiredFields + fillFieldsByLabel (both ride queryAllDeep) against a
 * form whose fields live inside an open shadow root. This is the closest
 * automatable proxy for the "fields inside web components are now seen" change;
 * a true end-to-end check still needs the extension loaded in a real browser
 * (see apps/extension/VERIFY.md).
 *
 * Run from apps/web:  node tests/extension-dom-shadow.test.mjs
 */
import { JSDOM } from "jsdom";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import assert from "assert";

const here = path.dirname(fileURLToPath(import.meta.url));
const domSrc = readFileSync(
  path.resolve(here, "../../extension/runner/dom.js"),
  "utf8"
);

const dom = new JSDOM(
  `<!DOCTYPE html><body><input id="light" aria-label="Full Name"></body>`,
  { runScripts: "outside-only" }
);
const { window } = dom;

// jsdom doesn't lay out, so every rect is 0x0; force a non-zero box so the
// runner's visibility filter treats the synthetic fields as visible.
window.Element.prototype.getBoundingClientRect = function () {
  return { width: 120, height: 24, top: 0, left: 0, right: 120, bottom: 24, x: 0, y: 0, toJSON() {} };
};

// Application fields nested inside an open shadow root (Workday-style).
const host = window.document.createElement("div");
window.document.body.appendChild(host);
const shadow = host.attachShadow({ mode: "open" });
shadow.innerHTML = `
  <input id="email" type="email" aria-label="Email" required>
  <select id="gender" aria-label="Gender" required>
    <option value=""></option>
    <option>Male</option>
    <option>Female</option>
    <option>Prefer not to answer</option>
  </select>
`;

// Load the real runner DOM layer into this window.
window.eval(domSrc);
const JG = window.JobGeniusDom;
assert.ok(JG, "JobGeniusDom should be defined after loading dom.js");

let passed = 0;
function check(name, cond) {
  assert.ok(cond, name);
  console.log("PASS  " + name);
  passed += 1;
}

// 1. extractRequiredFields pierces the shadow root.
const required = JG.extractRequiredFields();
const labels = required.map((f) => f.label);
check("extractRequiredFields detects shadow-DOM 'Email'", labels.includes("Email"));
check("extractRequiredFields detects shadow-DOM 'Gender'", labels.includes("Gender"));

// 2. fillFieldsByLabel fills fields inside the shadow root.
const filled = JG.fillFieldsByLabel({
  Email: "tester@example.com",
  Gender: "Prefer not to answer",
});
const emailEl = shadow.getElementById("email");
const genderEl = shadow.getElementById("gender");
check("fillFieldsByLabel filled >= 2 shadow fields", filled >= 2);
check("shadow <input> received value", emailEl.value === "tester@example.com");
check(
  "shadow <select> matched the right option",
  Boolean(genderEl.value) &&
    /prefer not/i.test(genderEl.options[genderEl.selectedIndex].textContent)
);

// 3. Sanity: a light-DOM field is still found alongside shadow ones.
const lightFilled = JG.fillFieldsByLabel({ "Full Name": "Jane Doe" });
check("light-DOM field still fillable", window.document.getElementById("light").value === "Jane Doe" && lightFilled === 1);

console.log(`\n${passed} checks passed.`);
