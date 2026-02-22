import { NextResponse } from "next/server";
import { requireAM, supabaseAdmin } from "@/lib/auth";
import { hasJobSeekerAccess } from "@/lib/am-access";
import { buildPagedPdf } from "@/lib/pdf";
import {
  DEFAULT_JOBGENIUS_REPORT_SETTINGS,
  buildJobGeniusReportPdfLines,
  normalizeJobGeniusReport,
} from "@/lib/jobgenius/report";

interface RouteParams {
  params: { id: string };
}

type PdfPayload = {
  report?: unknown;
  goal?: string;
  admin_input?: string;
  generated_at?: string;
};

function normalizeDate(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

function safeFilenamePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireAM(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const seekerId = params.id;
  if (!(await hasJobSeekerAccess(auth.user.id, seekerId))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  let payload: PdfPayload;
  try {
    payload = (await request.json()) as PdfPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!payload.report) {
    return NextResponse.json(
      { error: "Report payload is required." },
      { status: 400 }
    );
  }

  const { data: seeker, error: seekerError } = await supabaseAdmin
    .from("job_seekers")
    .select("id, full_name, email")
    .eq("id", seekerId)
    .single();

  if (seekerError || !seeker) {
    return NextResponse.json({ error: "Job seeker not found." }, { status: 404 });
  }

  const report = normalizeJobGeniusReport(payload.report);
  const goal =
    typeof payload.goal === "string" && payload.goal.trim()
      ? payload.goal.trim()
      : DEFAULT_JOBGENIUS_REPORT_SETTINGS.default_goal;
  const adminInput =
    typeof payload.admin_input === "string" ? payload.admin_input.trim() : "";
  const generatedAt = normalizeDate(payload.generated_at);

  const lines = buildJobGeniusReportPdfLines({
    seekerName: seeker.full_name?.trim() || "Unnamed Seeker",
    seekerEmail: seeker.email,
    generatedAtIso: generatedAt,
    goal,
    adminInput,
    report,
  });

  const pdfBuffer = buildPagedPdf(lines, {
    linesPerPage: 46,
    fontSize: 10,
    lineHeight: 13,
  });

  const namePart = safeFilenamePart(seeker.full_name || seeker.email || seeker.id) || "seeker";
  const stamp = generatedAt.slice(0, 10);
  const fileName = `jobgenius-report-${namePart}-${stamp}.pdf`;

  return new Response(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"${fileName}\"`,
    },
  });
}
