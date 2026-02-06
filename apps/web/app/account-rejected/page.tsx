import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";

export default async function AccountRejectedPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // If not an AM, redirect to portal
  if (user.userType !== "am") {
    redirect("/portal");
  }

  // If approved, redirect to dashboard
  if (user.status === "approved") {
    redirect("/dashboard");
  }

  // If pending, redirect to pending page
  if (user.status === "pending") {
    redirect("/pending-approval");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          {/* Icon */}
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-10 h-10 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>

          {/* Message */}
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Account Not Approved
          </h1>
          <p className="text-gray-600 mb-6">
            We&apos;re sorry, but your account manager application was not approved at this time.
          </p>

          {/* Info Card */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-gray-600">
              If you believe this is a mistake or would like more information,
              please contact your team administrator.
            </p>
          </div>

          {/* Sign out link */}
          <Link
            href="/auth/signout"
            className="inline-block px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Sign out
          </Link>
        </div>
      </div>
    </div>
  );
}
