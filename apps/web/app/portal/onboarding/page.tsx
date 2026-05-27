import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import { getIntakeStateByJobSeekerId } from "@/lib/intake";
import OnboardingWizard from "./OnboardingWizard";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: { code?: string };
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data: profile } = await supabaseAdmin
    .from("job_seekers")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: documents } = await supabaseAdmin
    .from("job_seeker_documents")
    .select("*")
    .eq("job_seeker_id", user.id)
    .eq("doc_type", "resume")
    .order("uploaded_at", { ascending: false });

  const intakeState = await getIntakeStateByJobSeekerId(user.id);

  return (
    <OnboardingWizard
      profile={profile || {}}
      documents={documents || []}
      userEmail={user.email}
      initialOfferCode={searchParams?.code ?? null}
      initialIntakeState={
        intakeState
          ? {
              selectedPlan: intakeState.selected_plan,
              offerPath: intakeState.offer_path,
              submittedCode: intakeState.submitted_code,
              previewAgreedAt: intakeState.preview_agreed_at,
            }
          : null
      }
    />
  );
}
