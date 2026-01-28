import { logLine } from "./logger.js";

function buildHeaders(amEmail, claimToken, runnerId) {
  const headers = {
    "Content-Type": "application/json",
    "x-am-email": amEmail,
    "x-runner": "cloud",
  };

  if (claimToken) {
    headers["x-claim-token"] = claimToken;
  }

  if (runnerId) {
    headers["x-runner-id"] = runnerId;
  }

  return headers;
}

export async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GET ${url} failed (${response.status})`);
  }
  return response.json();
}

export async function postJson(url, payload, amEmail, claimToken, runnerId) {
  const response = await fetch(url, {
    method: "POST",
    headers: buildHeaders(amEmail, claimToken, runnerId),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`POST ${url} failed (${response.status})`);
  }

  return response.json();
}

export async function fetchNextGlobal(apiBaseUrl, amEmail, runnerId) {
  const endpoint = `${apiBaseUrl}/api/apply/next-global`;
  const response = await fetch(endpoint, {
    headers: buildHeaders(amEmail, null, runnerId),
  });

  if (!response.ok) {
    throw new Error(`GET ${endpoint} failed (${response.status})`);
  }

  return response.json();
}

export async function fetchPlan(apiBaseUrl, runId, amEmail, claimToken, runnerId) {
  const url = `${apiBaseUrl}/api/apply/plan?runId=${encodeURIComponent(runId)}`;
  const response = await fetch(url, {
    headers: buildHeaders(amEmail, claimToken, runnerId),
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`GET ${url} failed (${response.status})`);
  }
  return response.json();
}

export async function generatePlan(apiBaseUrl, runId, amEmail, claimToken, runnerId) {
  return postJson(
    `${apiBaseUrl}/api/apply/plan/generate`,
    { run_id: runId },
    amEmail,
    claimToken,
    runnerId
  );
}

export async function sendEvent(apiBaseUrl, payload, amEmail, claimToken, runnerId) {
  logLine({
    level: payload.level ?? "INFO",
    runId: payload.run_id,
    step: payload.step,
    msg: payload.message ?? payload.event_type,
  });
  return postJson(
    `${apiBaseUrl}/api/apply/event`,
    { ...payload, claim_token: claimToken },
    amEmail,
    claimToken,
    runnerId
  );
}

export async function pauseRun(apiBaseUrl, payload, amEmail, claimToken, runnerId) {
  return postJson(
    `${apiBaseUrl}/api/apply/pause`,
    { ...payload, claim_token: claimToken },
    amEmail,
    claimToken,
    runnerId
  );
}

export async function completeRun(apiBaseUrl, payload, amEmail, claimToken, runnerId) {
  return postJson(
    `${apiBaseUrl}/api/apply/complete`,
    { ...payload, claim_token: claimToken },
    amEmail,
    claimToken,
    runnerId
  );
}

export async function retryRun(apiBaseUrl, payload, amEmail, claimToken, runnerId) {
  return postJson(
    `${apiBaseUrl}/api/apply/retry`,
    { ...payload, claim_token: claimToken },
    amEmail,
    claimToken,
    runnerId
  );
}
