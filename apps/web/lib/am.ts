import { headers } from "next/headers";

export function getAmEmailFromHeaders(headerSource?: Headers) {
  const emailFromHeader =
    headerSource?.get("x-am-email") ?? headers().get("x-am-email");
  return emailFromHeader?.trim() || process.env.AM_EMAIL || null;
}
