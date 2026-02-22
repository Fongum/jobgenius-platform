export interface JobGeniusReportActionStep {
  step: string;
  why: string;
  timeline: string;
  priority: string;
}

export interface JobGeniusReport {
  title: string;
  profile_readiness: string;
  summary: string;
  analysis: string[];
  action_steps: JobGeniusReportActionStep[];
  suggestions: string[];
  next_steps: string[];
}

export interface JobGeniusReportSettings {
  settings_key: string;
  system_prompt: string;
  output_instructions: string;
  default_goal: string;
}

export const DEFAULT_JOBGENIUS_REPORT_SETTINGS: JobGeniusReportSettings = {
  settings_key: "default",
  system_prompt:
    "You are JobGenius, an expert career strategist for job seekers. Use the seeker profile details plus admin context to produce a practical, motivating, and specific report focused on getting the seeker hired faster.",
  output_instructions:
    "Prioritize high-impact improvements, realistic timelines, and concrete actions. Avoid generic advice. Tie recommendations to the seeker's profile gaps, target roles, and constraints.",
  default_goal:
    "Help this seeker secure a strong-fit job with interviews, better positioning, and clear next actions.",
};

const DEFAULT_REPORT: JobGeniusReport = {
  title: "JobGenius Career Action Report",
  profile_readiness: "Needs Work",
  summary: "A tailored report was generated to improve job search outcomes.",
  analysis: [],
  action_steps: [],
  suggestions: [],
  next_steps: [],
};

function cleanString(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim();
  return cleaned || fallback;
}

function cleanStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 25);
}

export function normalizeJobGeniusReport(raw: unknown): JobGeniusReport {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_REPORT };
  }

  const source = raw as Record<string, unknown>;
  const actionSteps = Array.isArray(source.action_steps)
    ? source.action_steps
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            return null;
          }
          const row = item as Record<string, unknown>;
          const step = cleanString(row.step);
          if (!step) {
            return null;
          }
          return {
            step,
            why: cleanString(row.why),
            timeline: cleanString(row.timeline),
            priority: cleanString(row.priority, "medium"),
          };
        })
        .filter((item): item is JobGeniusReportActionStep => Boolean(item))
        .slice(0, 12)
    : [];

  return {
    title: cleanString(source.title, DEFAULT_REPORT.title),
    profile_readiness: cleanString(
      source.profile_readiness,
      DEFAULT_REPORT.profile_readiness
    ),
    summary: cleanString(source.summary, DEFAULT_REPORT.summary),
    analysis: cleanStringArray(source.analysis),
    action_steps: actionSteps,
    suggestions: cleanStringArray(source.suggestions),
    next_steps: cleanStringArray(source.next_steps),
  };
}

function wrapLine(line: string, width: number): string[] {
  const text = line.trim();
  if (!text) return [""];
  if (text.length <= width) return [text];

  const words = text.split(/\s+/);
  const out: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }

    if (current.length + 1 + word.length <= width) {
      current += ` ${word}`;
      continue;
    }

    out.push(current);
    current = word;
  }

  if (current) {
    out.push(current);
  }

  return out;
}

function appendWrapped(lines: string[], value: string, width = 96) {
  wrapLine(value, width).forEach((line) => lines.push(line));
}

function appendList(lines: string[], title: string, items: string[]) {
  lines.push(title);
  if (items.length === 0) {
    lines.push("- No items available.");
  } else {
    items.forEach((item) => appendWrapped(lines, `- ${item}`));
  }
  lines.push("");
}

export function buildJobGeniusReportPdfLines(params: {
  seekerName: string;
  seekerEmail: string;
  generatedAtIso: string;
  goal: string;
  adminInput: string;
  report: JobGeniusReport;
}): string[] {
  const { seekerName, seekerEmail, generatedAtIso, goal, adminInput, report } = params;
  const lines: string[] = [];

  lines.push(report.title || "JobGenius Career Action Report");
  lines.push("");
  lines.push(`Generated: ${new Date(generatedAtIso).toLocaleString()}`);
  lines.push(`Job Seeker: ${seekerName}`);
  lines.push(`Email: ${seekerEmail}`);
  lines.push(`Profile Readiness: ${report.profile_readiness}`);
  lines.push("");

  lines.push("Goal");
  appendWrapped(lines, goal || DEFAULT_JOBGENIUS_REPORT_SETTINGS.default_goal);
  lines.push("");

  if (adminInput.trim()) {
    lines.push("Admin Inputs");
    appendWrapped(lines, adminInput);
    lines.push("");
  }

  lines.push("Summary");
  appendWrapped(lines, report.summary);
  lines.push("");

  appendList(lines, "Analysis", report.analysis);

  lines.push("Action Steps");
  if (report.action_steps.length === 0) {
    lines.push("- No action steps available.");
  } else {
    report.action_steps.forEach((step, index) => {
      appendWrapped(lines, `${index + 1}. ${step.step}`);
      if (step.why) {
        appendWrapped(lines, `   Why: ${step.why}`);
      }
      if (step.timeline) {
        appendWrapped(lines, `   Timeline: ${step.timeline}`);
      }
      if (step.priority) {
        appendWrapped(lines, `   Priority: ${step.priority}`);
      }
    });
  }
  lines.push("");

  appendList(lines, "Suggestions", report.suggestions);
  appendList(lines, "Next Steps", report.next_steps);

  lines.push("JobGenius Note");
  appendWrapped(
    lines,
    "Consistency wins. Complete the steps above, keep your profile updated, and stay active with your AM to accelerate interviews and offers."
  );

  return lines;
}

export function buildJobGeniusReportMessage(params: {
  seekerName: string;
  goal: string;
  report: JobGeniusReport;
}): string {
  const { seekerName, goal, report } = params;
  const lines: string[] = [];

  lines.push(`Hi ${seekerName},`);
  lines.push("");
  lines.push("I generated your JobGenius report with analysis, action steps, and suggestions.");
  lines.push(`Goal: ${goal || DEFAULT_JOBGENIUS_REPORT_SETTINGS.default_goal}`);
  lines.push(`Profile readiness: ${report.profile_readiness}`);
  lines.push("");
  lines.push("Summary:");
  lines.push(report.summary);
  lines.push("");

  lines.push("Top analysis points:");
  if (report.analysis.length === 0) {
    lines.push("- No additional analysis points.");
  } else {
    report.analysis.slice(0, 6).forEach((item) => {
      lines.push(`- ${item}`);
    });
  }
  lines.push("");

  lines.push("Action steps:");
  if (report.action_steps.length === 0) {
    lines.push("- No action steps were generated.");
  } else {
    report.action_steps.slice(0, 8).forEach((step, index) => {
      const detail = [
        step.step,
        step.timeline ? `Timeline: ${step.timeline}` : null,
        step.priority ? `Priority: ${step.priority}` : null,
      ]
        .filter(Boolean)
        .join(" | ");
      lines.push(`${index + 1}. ${detail}`);
      if (step.why) {
        lines.push(`   Why: ${step.why}`);
      }
    });
  }
  lines.push("");

  lines.push("Suggestions:");
  if (report.suggestions.length === 0) {
    lines.push("- No additional suggestions.");
  } else {
    report.suggestions.slice(0, 8).forEach((item) => {
      lines.push(`- ${item}`);
    });
  }
  lines.push("");

  lines.push("Reply with updates after completing the next steps so we can adjust your strategy quickly.");

  return lines.join("\n");
}
