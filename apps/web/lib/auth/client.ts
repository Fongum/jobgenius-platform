"use client";

/**
 * Client-side Authentication Utilities
 */

import { useEffect, useState, useCallback } from "react";
import type { AuthUser } from "./types";

/**
 * Hook to get the current user
 */
export function useUser() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me");
      const data = await response.json();

      if (data.success && data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      setError("Failed to fetch user");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchUser();
  }, [fetchUser]);

  return { user, loading, error, refresh };
}

/**
 * Login function
 */
export async function login(email: string, password: string) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();
  return data;
}

/**
 * Signup function
 */
export async function signup(
  email: string,
  password: string,
  name?: string,
  userType: "am" | "job_seeker" = "am"
) {
  const response = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name, userType }),
  });

  const data = await response.json();
  return data;
}

/**
 * Logout function
 */
export async function logout() {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
  });

  const data = await response.json();
  return data;
}

/**
 * Refresh session
 */
export async function refreshSession() {
  const response = await fetch("/api/auth/refresh", {
    method: "POST",
  });

  const data = await response.json();
  return data;
}

/**
 * Request password reset
 */
export async function requestPasswordReset(email: string) {
  const response = await fetch("/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  const data = await response.json();
  return data;
}

/**
 * Get user type from cookie (for routing decisions)
 */
export function getUserTypeFromCookie(): "am" | "job_seeker" | null {
  if (typeof document === "undefined") return null;

  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=");
    if (name === "jg_user_type") {
      return value as "am" | "job_seeker";
    }
  }
  return null;
}

/**
 * Check if user is authenticated (from cookie)
 */
export function isAuthenticated(): boolean {
  if (typeof document === "undefined") return false;

  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [name] = cookie.trim().split("=");
    if (name === "jg_access_token") {
      return true;
    }
  }
  return false;
}
