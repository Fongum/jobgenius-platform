import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { guardApiRequest } from "./lib/api-guard";

// Routes that require authentication
const PROTECTED_ROUTES = ["/dashboard", "/portal"];

// Routes that should redirect to dashboard if already authenticated
const AUTH_ROUTES = ["/login", "/signup"];

// Cookie name for access token
const ACCESS_TOKEN_COOKIE = "jg_access_token";
const USER_TYPE_COOKIE = "jg_user_type";
const CORS_API_PREFIXES = ["/api/extension", "/api/apply", "/api/otp"];
const CORS_ALLOW_HEADERS = [
  "Authorization",
  "Content-Type",
  "x-runner",
  "x-runner-id",
  "x-claim-token",
  "x-ops-key",
];
const CORS_ALLOW_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

function needsCors(pathname: string) {
  return CORS_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function applyCors(response: NextResponse, request: NextRequest) {
  const origin = request.headers.get("origin");
  response.headers.set("Access-Control-Allow-Origin", origin ?? "*");
  response.headers.set("Access-Control-Allow-Methods", CORS_ALLOW_METHODS.join(", "));
  response.headers.set("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS.join(", "));
  response.headers.set("Access-Control-Max-Age", "86400");
  response.headers.set("Vary", "Origin");
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api")) {
    if (needsCors(pathname) && request.method.toUpperCase() === "OPTIONS") {
      return applyCors(new NextResponse(null, { status: 204 }), request);
    }

    const blocked = guardApiRequest(request);
    if (blocked) {
      if (needsCors(pathname)) {
        return applyCors(blocked, request);
      }
      return blocked;
    }

    if (needsCors(pathname)) {
      return applyCors(NextResponse.next(), request);
    }
    return NextResponse.next();
  }

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
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files
     */
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
};
