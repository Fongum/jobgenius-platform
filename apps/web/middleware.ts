import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that require authentication
const PROTECTED_ROUTES = ["/dashboard", "/portal"];

// Routes that should redirect to dashboard if already authenticated
const AUTH_ROUTES = ["/login", "/signup"];

// Cookie name for access token
const ACCESS_TOKEN_COOKIE = "jg_access_token";
const USER_TYPE_COOKIE = "jg_user_type";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get auth state from cookies
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const userType = request.cookies.get(USER_TYPE_COOKIE)?.value;
  const isAuthenticated = !!accessToken;

  // Check if route is protected
  const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  // Check if route is auth route (login/signup)
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  // Redirect unauthenticated users away from protected routes
  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from auth routes
  if (isAuthRoute && isAuthenticated) {
    // Redirect to appropriate dashboard based on user type
    const redirectUrl =
      userType === "job_seeker" ? "/portal" : "/dashboard";
    return NextResponse.redirect(new URL(redirectUrl, request.url));
  }

  // Check portal access - only job seekers
  if (pathname.startsWith("/portal") && userType === "am") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Check dashboard access - only AMs
  if (pathname.startsWith("/dashboard") && userType === "job_seeker") {
    return NextResponse.redirect(new URL("/portal", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes (they handle their own auth)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files
     */
    "/((?!api|_next/static|_next/image|favicon.ico|public).*)",
  ],
};
