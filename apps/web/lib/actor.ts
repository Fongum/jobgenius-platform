export function getActorFromHeaders(headers?: Headers) {
  const source = headers?.get("x-runner") ?? "";
  if (source.toLowerCase() === "extension") {
    return "EXTENSION";
  }
  if (source.toLowerCase() === "am_ui") {
    return "AM_UI";
  }
  return "SYSTEM";
}
