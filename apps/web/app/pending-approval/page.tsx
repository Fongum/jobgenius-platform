import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";

export default async function PendingApprovalPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // If not an AM, redirect to portal
  if (user.userType !== "am") {
    redirect("/portal");
  }

  // If already approved, redirect to dashboard
  if (user.status === "approved") {
    redirect("/dashboard");
  }

  // If rejected, redirect to rejected page
  if (user.status === "rejected") {
    redirect("/account-rejected");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          {/* Logo/Icon */}
          <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-10 h-10 text-purple-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          {/* Welcome Message */}
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome to the Team!
          </h1>
          <p className="text-gray-600 mb-6">
            Hi {user.name || "there"}, thanks for signing up as an Account Manager.
          </p>

          {/* Status Card */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-center gap-2 text-amber-700">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span className="font-medium">Pending Approval</span>
            </div>
            <p className="text-amber-600 text-sm mt-2">
              An administrator will review and approve your account shortly.
            </p>
          </div>

          {/* What happens next */}
          <div className="text-left bg-gray-50 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">What happens next?</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-purple-500 mt-0.5">1.</span>
                <span>An admin will review your application</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500 mt-0.5">2.</span>
                <span>Once approved, you&apos;ll receive full dashboard access</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500 mt-0.5">3.</span>
                <span>You&apos;ll get a unique AM code for the Chrome extension</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500 mt-0.5">4.</span>
                <span>Job seekers will be assigned to you by administrators</span>
              </li>
            </ul>
          </div>

          {/* Refresh hint */}
          <p className="text-xs text-gray-400 mb-4">
            This page will automatically redirect once your account is approved.
            You can also refresh to check your status.
          </p>

          {/* Sign out link */}
          <Link
            href="/auth/signout"
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Sign out
          </Link>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-500 mt-4">
          Questions? Contact your team administrator.
        </p>
      </div>
    </div>
  );
}
