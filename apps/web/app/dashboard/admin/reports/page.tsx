import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth/roles";
import {
  DEFAULT_JOBGENIUS_REPORT_SETTINGS,
  type JobGeniusReportSettings,
} from "@/lib/jobgenius/report";
import ReportsSettingsClient from "./ReportsSettingsClient";

type SettingsRow = JobGeniusReportSettings & {
  updated_at?: string;
};

export default async function AdminReportsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  if (user.userType !== "am" || !isAdminRole(user.role)) {
    redirect("/dashboard");
  }

  const { data, error } = await supabaseAdmin
    .from("jobgenius_report_settings")
    .select("settings_key, system_prompt, output_instructions, default_goal, updated_at")
    .eq("settings_key", DEFAULT_JOBGENIUS_REPORT_SETTINGS.settings_key)
    .maybeSingle();

  const initialSettings: SettingsRow = {
    settings_key:
      typeof data?.settings_key === "string"
        ? data.settings_key
        : DEFAULT_JOBGENIUS_REPORT_SETTINGS.settings_key,
    system_prompt:
      typeof data?.system_prompt === "string" && data.system_prompt.trim()
        ? data.system_prompt
        : DEFAULT_JOBGENIUS_REPORT_SETTINGS.system_prompt,
    output_instructions:
      typeof data?.output_instructions === "string" &&
      data.output_instructions.trim()
        ? data.output_instructions
        : DEFAULT_JOBGENIUS_REPORT_SETTINGS.output_instructions,
    default_goal:
      typeof data?.default_goal === "string" && data.default_goal.trim()
        ? data.default_goal
        : DEFAULT_JOBGENIUS_REPORT_SETTINGS.default_goal,
    updated_at:
      typeof data?.updated_at === "string" && data.updated_at
        ? data.updated_at
        : undefined,
  };

  return (
    <ReportsSettingsClient
      initialSettings={initialSettings}
      initialError={error ? "Failed to load saved settings. Showing defaults." : null}
    />
  );
}
