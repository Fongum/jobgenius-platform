import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/auth";
import { DEFAULT_JOBGENIUS_REPORT_SETTINGS } from "@/lib/jobgenius/report";

type SettingsRow = {
  settings_key: string;
  system_prompt: string;
  output_instructions: string;
  default_goal: string;
  updated_at: string;
};

const SETTINGS_KEY = DEFAULT_JOBGENIUS_REPORT_SETTINGS.settings_key;

async function ensureSettingsRow(updatedBy?: string): Promise<{
  data: SettingsRow | null;
  error: string | null;
}> {
  const { data, error } = await supabaseAdmin
    .from("jobgenius_report_settings")
    .select("settings_key, system_prompt, output_instructions, default_goal, updated_at")
    .eq("settings_key", SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    return { data: null, error: "Failed to load JobGenius report settings." };
  }

  if (data) {
    return {
      data: data as SettingsRow,
      error: null,
    };
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("jobgenius_report_settings")
    .insert({
      settings_key: SETTINGS_KEY,
      system_prompt: DEFAULT_JOBGENIUS_REPORT_SETTINGS.system_prompt,
      output_instructions: DEFAULT_JOBGENIUS_REPORT_SETTINGS.output_instructions,
      default_goal: DEFAULT_JOBGENIUS_REPORT_SETTINGS.default_goal,
      updated_by: updatedBy ?? null,
    })
    .select("settings_key, system_prompt, output_instructions, default_goal, updated_at")
    .single();

  if (insertError || !inserted) {
    return {
      data: null,
      error: "Failed to initialize JobGenius report settings.",
    };
  }

  return {
    data: inserted as SettingsRow,
    error: null,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const ensured = await ensureSettingsRow(auth.user.id);
  if (ensured.error || !ensured.data) {
    return NextResponse.json({ error: ensured.error }, { status: 500 });
  }

  return NextResponse.json({ settings: ensured.data });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const ensured = await ensureSettingsRow(auth.user.id);
  if (ensured.error || !ensured.data) {
    return NextResponse.json({ error: ensured.error }, { status: 500 });
  }

  let body: {
    systemPrompt?: string;
    outputInstructions?: string;
    defaultGoal?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const nextSystemPrompt =
    typeof body.systemPrompt === "string"
      ? body.systemPrompt.trim()
      : ensured.data.system_prompt;
  const nextOutputInstructions =
    typeof body.outputInstructions === "string"
      ? body.outputInstructions.trim()
      : ensured.data.output_instructions;
  const nextDefaultGoal =
    typeof body.defaultGoal === "string"
      ? body.defaultGoal.trim()
      : ensured.data.default_goal;

  if (!nextSystemPrompt || nextSystemPrompt.length < 20) {
    return NextResponse.json(
      { error: "System prompt must be at least 20 characters." },
      { status: 400 }
    );
  }

  if (!nextOutputInstructions || nextOutputInstructions.length < 20) {
    return NextResponse.json(
      { error: "Output instructions must be at least 20 characters." },
      { status: 400 }
    );
  }

  if (!nextDefaultGoal || nextDefaultGoal.length < 10) {
    return NextResponse.json(
      { error: "Default goal must be at least 10 characters." },
      { status: 400 }
    );
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("jobgenius_report_settings")
    .update({
      system_prompt: nextSystemPrompt,
      output_instructions: nextOutputInstructions,
      default_goal: nextDefaultGoal,
      updated_by: auth.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("settings_key", SETTINGS_KEY)
    .select("settings_key, system_prompt, output_instructions, default_goal, updated_at")
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: "Failed to update JobGenius report settings." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, settings: updated });
}
