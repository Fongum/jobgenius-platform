import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { fetchNextGlobal, fetchPlan, generatePlan } from "./api.js";
import { runPlan } from "./engine.js";
import { linkedinAdapter } from "./adapters/linkedin_easy_apply.js";
import { greenhouseAdapter } from "./adapters/greenhouse.js";
import { workdayAdapter } from "./adapters/workday.js";
import { logLine } from "./logger.js";

const API_BASE_URL = process.env.JOBGENIUS_API_BASE_URL;
const RUNNER_ID = process.env.RUNNER_ID ?? "cloud-runner";
const AM_EMAIL = process.env.RUNNER_AM_EMAIL ?? process.env.AM_EMAIL ?? "";
const POLL_INTERVAL_MS = Number(process.env.RUNNER_POLL_INTERVAL_MS ?? 60000);
const CONCURRENCY = Number(process.env.RUNNER_CONCURRENCY ?? 5);
const STATE_DIR =
  process.env.STORAGE_STATE_PATH ??
  path.join(process.cwd(), ".state");

if (!API_BASE_URL) {
  throw new Error("JOBGENIUS_API_BASE_URL is required.");
}

if (!AM_EMAIL) {
  throw new Error("RUNNER_AM_EMAIL is required for API access.");
}

if (!fs.existsSync(STATE_DIR)) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

const adapters = [linkedinAdapter, greenhouseAdapter, workdayAdapter];
const activeRuns = new Set();

function getAdapter(atsType) {
  return adapters.find((adapter) => adapter.name === atsType) ?? null;
}

function storageStatePath(jobSeekerId) {
  return path.join(STATE_DIR, `${jobSeekerId}.json`);
}

async function executeRun(run) {
  activeRuns.add(run.run_id);
  logLine({
    level: "INFO",
    runId: run.run_id,
    jobSeekerId: run.job_seeker_id,
    step: "CLAIMED",
    msg: "Run claimed.",
  });

  const storagePath = storageStatePath(run.job_seeker_id);
  const storageState = fs.existsSync(storagePath) ? storagePath : undefined;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(
    storageState ? { storageState } : {}
  );
  const page = await context.newPage();

  try {
    const planResponse = await fetchPlan(
      API_BASE_URL,
      run.run_id,
      AM_EMAIL,
      run.claim_token,
      RUNNER_ID
    );

    if (!planResponse) {
      await generatePlan(
        API_BASE_URL,
        run.run_id,
        AM_EMAIL,
        run.claim_token,
        RUNNER_ID
      );
    }

    const plan = planResponse?.plan ?? (await fetchPlan(
      API_BASE_URL,
      run.run_id,
      AM_EMAIL,
      run.claim_token,
      RUNNER_ID
    ))?.plan;

    if (!plan) {
      logLine({
        level: "WARN",
        runId: run.run_id,
        step: "PLAN",
        msg: "Plan not found. Skipping.",
      });
      return;
    }

    const targetUrl = plan.metadata?.targetUrl ?? run.job?.url;
    if (!targetUrl) {
      logLine({
        level: "WARN",
        runId: run.run_id,
        step: "OPEN_URL",
        msg: "Missing target URL.",
      });
      return;
    }

    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    const adapter = getAdapter(run.ats_type);
    await runPlan({
      apiBaseUrl: API_BASE_URL,
      amEmail: AM_EMAIL,
      runnerId: RUNNER_ID,
      run,
      claimToken: run.claim_token,
      plan,
      adapter,
      page,
      context,
      dryRun: false,
    });
  } catch (error) {
    logLine({
      level: "ERROR",
      runId: run.run_id,
      step: "RUN",
      msg: error?.message ?? "Runner error",
    });
  } finally {
    try {
      await context.storageState({ path: storagePath });
    } catch (error) {
      logLine({
        level: "WARN",
        runId: run.run_id,
        step: "STORAGE",
        msg: "Failed to persist storage state.",
      });
    }
    await context.close();
    await browser.close();
    activeRuns.delete(run.run_id);
  }
}

async function pollOnce() {
  while (activeRuns.size < CONCURRENCY) {
    let next;
    try {
      next = await fetchNextGlobal(API_BASE_URL, AM_EMAIL, RUNNER_ID);
    } catch (error) {
      logLine({ level: "ERROR", step: "POLL", msg: error?.message ?? "Poll failed" });
      return;
    }

    if (!next?.success || next.status === "IDLE" || next.blocked) {
      return;
    }

    await executeRun(next);
  }
}

async function start() {
  logLine({
    level: "INFO",
    step: "BOOT",
    msg: `Runner started (interval=${POLL_INTERVAL_MS}ms, concurrency=${CONCURRENCY}).`,
  });
  await pollOnce();
  setInterval(() => {
    pollOnce().catch((error) => {
      logLine({ level: "ERROR", step: "POLL", msg: error?.message ?? "Poll error" });
    });
  }, POLL_INTERVAL_MS);
}

start();
