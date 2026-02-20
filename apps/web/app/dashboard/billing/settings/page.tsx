import { redirect } from "next/navigation";
import { getCurrentUser, supabaseAdmin } from "@/lib/auth";
import PaymentSettingsClient from "./PaymentSettingsClient";

export default async function PaymentSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.userType !== "am" || !["admin", "superadmin"].includes(user.role ?? "")) {
    redirect("/dashboard");
  }

  const { data: settings } = await supabaseAdmin
    .from("payment_method_settings")
    .select("*")
    .order("method");

  return <PaymentSettingsClient settings={settings ?? []} />;
}
