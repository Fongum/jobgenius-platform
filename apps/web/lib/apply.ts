import { resolveJobTargetUrl } from "@/lib/job-url";

type AtsType = "LINKEDIN" | "GREENHOUSE" | "WORKDAY" | "GENERIC";

const STEP_SETS: Record<AtsType, string[]> = {
  LINKEDIN: [
    "OPEN_JOB",
    "CLICK_EASY_APPLY",
    "FILL_FORM",
    "UPLOAD_RESUME",
    "SUBMIT",
    "CONFIRMATION",
  ],
  GREENHOUSE: [
    "OPEN_JOB",
    "FILL_FORM",
    "UPLOAD_RESUME",
    "SUBMIT",
    "CONFIRMATION",
  ],
  WORKDAY: [
    "OPEN_JOB",
    "START_APPLY",
    "LOGIN_OR_CONTINUE",
    "FILL_FORM",
    "UPLOAD_RESUME",
    "REVIEW",
    "SUBMIT",
    "CONFIRMATION",
  ],
  GENERIC: [
    "OPEN_JOB",
    "TRY_APPLY_ENTRY",
    "FILL_FORM",
    "UPLOAD_RESUME",
    "SUBMIT",
    "CONFIRMATION",
  ],
};

function hasValue(value: string | null | undefined) {
  return Boolean(value && value.trim().length > 0);
}

export function detectAtsType(source?: string | null, url?: string | null): AtsType {
  const sourceValue = (source ?? "").toLowerCase();
  const rawUrlValue = (url ?? "").toLowerCase();
  const resolvedUrlValue = resolveJobTargetUrl(url ?? "").toLowerCase();
  const combined = `${sourceValue} ${rawUrlValue} ${resolvedUrlValue}`;

  if (combined.includes("greenhouse")) {
    return "GREENHOUSE";
  }

  if (combined.includes("workday") || combined.includes("myworkdayjobs")) {
    return "WORKDAY";
  }

  if (combined.includes("linkedin")) {
    return "LINKEDIN";
  }

  if (
    combined.includes("lever.co") ||
    combined.includes("ashby") ||
    combined.includes("jobvite") ||
    combined.includes("smartrecruiters") ||
    combined.includes("icims") ||
    combined.includes("workable") ||
    combined.includes("recruitee") ||
    combined.includes("bamboohr") ||
    combined.includes("successfactors") ||
    combined.includes("taleo") ||
    combined.includes("oraclecloud") ||
    combined.includes("personio")
  ) {
    return "GENERIC";
  }

  return "GENERIC";
}

export function getStepsForAts(atsType: AtsType) {
  return STEP_SETS[atsType];
}

export function getNextStep(atsType: AtsType, currentStep: string) {
  const steps = getStepsForAts(atsType);
  const currentIndex = steps.indexOf(currentStep);
  if (currentIndex === -1) {
    return steps[0];
  }
  return steps[currentIndex + 1] ?? null;
}

export function buildExecutionContract({
  runId,
  status,
  atsType,
  currentStep,
}: {
  runId: string;
  status: string;
  atsType: AtsType;
  currentStep: string;
}) {
  const notes = `Execute step ${currentStep} for ${atsType}.`;

  return {
    run_id: runId,
    status,
    ats_type: atsType,
    current_step: currentStep,
    instructions: {
      action: currentStep,
      notes,
    },
  };
}

export function getInitialStep(atsType: AtsType) {
  const steps = getStepsForAts(atsType);
  return steps[0] ?? "OPEN_JOB";
}

export function getErrorCodeHint(code?: string | null) {
  if (!hasValue(code)) {
    return "UNKNOWN";
  }
  return code;
}
