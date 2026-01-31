# JobGenius Cloud Runner (Phase 5.1)

## Overview
Long-running Playwright worker that polls the JobGenius API for runs and executes ATS steps in the cloud.

## Environment
- `JOBGENIUS_API_BASE_URL` (required)
- `RUNNER_AM_EMAIL` (required, used for internal auth header)
- `RUNNER_ID` (optional)
- `RUNNER_POLL_INTERVAL_MS` (default 60000)
- `RUNNER_CONCURRENCY` (default 5)
- `STORAGE_STATE_PATH` (optional, default `apps/runner/.state`)
- `STATE_ENCRYPTION_KEY` (required in production; optional in dev)
- `JOBSEEKER_MAX_PER_HOUR` (default 8)
- `RUNNER_WATCHDOG_TIMEOUT_MS` (default 600000)
- `RUNNER_WATCHDOG_CHECK_MS` (default 30000)
- `RUNNER_CIRCUIT_WINDOW_MS` (default 1800000)
- `RUNNER_CIRCUIT_COOLDOWN_MS` (default 1800000)
- `RUNNER_CAPTCHA_THRESHOLD` (default 3)
- `RUNNER_OTP_SMS_THRESHOLD` (default 3)
- `RUNNER_REQUIRED_FIELDS_THRESHOLD` (default 5)
- `RUNNER_METRICS_INTERVAL_MS` (default 60000)

## Local run
```bash
npm install
npm run start
```

## Encryption
- Storage state is persisted per jobseeker in `.state/{jobSeekerId}.json.enc` when `STATE_ENCRYPTION_KEY` is set.
- Encryption uses AES-256-GCM and only decrypts in memory at runtime.
- Key formats:
  - `base64:<key>` for base64-encoded 32 bytes
  - 64-char hex string for 32-byte keys
  - Any other string is SHA-256 hashed into a 32-byte key

## Rate limits
- `JOBSEEKER_MAX_PER_HOUR` enforces max completed applications per jobseeker per hour (default 8).
- When exceeded, the run is paused with reason `RATE_LIMIT_JOBSEEKER`.

## Circuit breakers
- Rolling 30-minute window per ATS for `CAPTCHA`, `OTP_SMS`, and `REQUIRED_FIELDS`.
- If thresholds are exceeded, the breaker opens for `RUNNER_CIRCUIT_COOLDOWN_MS`.
- Newly claimed runs for that ATS are paused with reason `ATS_DEGRADED`.

## Metrics
- Runner emits structured summary logs every 60s (configurable via `RUNNER_METRICS_INTERVAL_MS`).
- Fields include: claimed, completed, paused by reason, active runs, and avg step duration per ATS.
- Grafana/Prometheus note: use log-based metrics (e.g., Promtail/Loki or CloudWatch metric filters) to scrape `step=METRICS` logs, or add a sidecar log exporter if you want Prometheus scraping.

## Troubleshooting
- If you see plaintext `.json` files, confirm `STATE_ENCRYPTION_KEY` is set.
- `CIRCUIT_BREAKER_OPEN` logs indicate ATS degradation; reduce concurrency or pause that ATS.
- Repeated `WATCHDOG_TIMEOUT` events suggest stuck runs or slow ATS; check network/timeouts.
