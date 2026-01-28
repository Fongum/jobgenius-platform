export function logLine(payload) {
  const line = {
    ts: new Date().toISOString(),
    ...payload,
  };
  console.log(JSON.stringify(line));
}
