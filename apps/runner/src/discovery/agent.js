/**
 * Job Discovery Agent
 *
 * Runs as a background process that:
 * 1. Polls for pending discovery searches
 * 2. Executes scraping jobs
 * 3. Saves discovered jobs to the backend
 * 4. Triggers matching for new jobs
 */

import { scrapeJobs } from './scraper.js';
import * as api from './api.js';
import { getAdapter } from './adapters/base.js';
import { logLine } from '../logger.js';

// Configuration
const POLL_INTERVAL_MS = parseInt(process.env.DISCOVERY_POLL_INTERVAL_MS || '300000', 10); // 5 minutes
const MAX_CONCURRENT_SCRAPES = parseInt(process.env.DISCOVERY_MAX_CONCURRENT || '2', 10);
const DEFAULT_MAX_PAGES = parseInt(process.env.DISCOVERY_MAX_PAGES || '5', 10);
const DEFAULT_MAX_JOBS = parseInt(process.env.DISCOVERY_MAX_JOBS || '50', 10);

let isRunning = false;
let activeScrapesCount = 0;

/**
 * Start the discovery agent
 */
export async function start() {
  if (isRunning) {
    logLine({ level: 'WARN', step: 'DISCOVERY', msg: 'Already running' });
    return;
  }

  isRunning = true;
  logLine({ level: 'INFO', step: 'DISCOVERY', msg: 'Starting...' });
  logLine({ level: 'INFO', step: 'DISCOVERY', msg: `Poll interval: ${POLL_INTERVAL_MS}ms` });
  logLine({ level: 'INFO', step: 'DISCOVERY', msg: `Max concurrent scrapes: ${MAX_CONCURRENT_SCRAPES}` });

  // Initial run
  await tick();

  // Schedule periodic runs
  const interval = setInterval(async () => {
    if (!isRunning) {
      clearInterval(interval);
      return;
    }
    await tick();
  }, POLL_INTERVAL_MS);
}

/**
 * Stop the discovery agent
 */
export function stop() {
  logLine({ level: 'INFO', step: 'DISCOVERY', msg: 'Stopping...' });
  isRunning = false;
}

/**
 * Single tick of the discovery agent
 */
export async function tick() {
  if (activeScrapesCount >= MAX_CONCURRENT_SCRAPES) {
    logLine({ level: 'DEBUG', step: 'DISCOVERY', msg: `Skipping tick, ${activeScrapesCount} scrapes active` });
    return;
  }

  try {
    // Get pending searches
    const searches = await api.getPendingSearches();

    if (searches.length === 0) {
      logLine({ level: 'DEBUG', step: 'DISCOVERY', msg: 'No pending searches' });
      return;
    }

    logLine({ level: 'INFO', step: 'DISCOVERY', msg: `Found ${searches.length} pending searches` });

    // Process searches up to concurrency limit
    const toProcess = searches.slice(0, MAX_CONCURRENT_SCRAPES - activeScrapesCount);

    for (const search of toProcess) {
      // Don't await - run in parallel
      processSearch(search).catch(err => {
        logLine({ level: 'ERROR', step: 'DISCOVERY', msg: `Error processing search ${search.id}: ${err.message}` });
      });
    }
  } catch (error) {
    logLine({ level: 'ERROR', step: 'DISCOVERY', msg: `Tick error: ${error.message}` });
  }
}

/**
 * Process a single discovery search
 * @param {import('./types.js').DiscoverySearch} search
 */
export async function processSearch(search) {
  activeScrapesCount++;
  logLine({ level: 'INFO', step: 'DISCOVERY', msg: `Processing search: ${search.search_name} (${search.id})` });

  let runId = null;

  try {
    // Get source configuration
    const source = search.source || await api.getJobSourceByName(search.source_id);
    if (!source) {
      throw new Error(`Source not found: ${search.source_id}`);
    }

    // Start the run
    const { run_id } = await api.startDiscoveryRun(search.id);
    runId = run_id;

    // Dispatch by source_type
    const sourceType = source.source_type || 'scraper';
    let result;

    if (sourceType === 'scraper') {
      // Existing Playwright path
      result = await scrapeJobs(source, search.search_url, {
        maxPages: DEFAULT_MAX_PAGES,
        maxJobs: DEFAULT_MAX_JOBS,
        headless: true,
        fetchDescriptions: true
      });
    } else {
      // API/Feed adapter path
      const adapter = getAdapter(source.name);
      if (!adapter) {
        throw new Error(`No adapter for source: ${source.name}`);
      }

      const jobs = await adapter.fetchJobs(source, {
        searchUrl: search.search_url,
        keywords: search.keywords,
        location: search.location,
        ...search.filters,
        maxJobs: DEFAULT_MAX_JOBS,
      });

      result = {
        status: 'COMPLETED',
        jobs_found: jobs.length,
        jobs_new: 0,
        jobs_updated: 0,
        pages_scraped: 0,
        jobs,
      };
    }

    result.run_id = runId;

    // Save discovered jobs
    if (result.jobs.length > 0) {
      const saveResult = await api.saveDiscoveredJobs(runId, result.jobs);
      result.jobs_new = saveResult.saved;
      result.jobs_updated = 0; // Could track updates in the future
      logLine({ level: 'INFO', step: 'DISCOVERY', msg: `Saved ${saveResult.saved} new jobs, ${saveResult.duplicates} duplicates` });
    }

    // Complete the run
    await api.completeDiscoveryRun(runId, result);
    logLine({ level: 'INFO', step: 'DISCOVERY', msg: `Completed search ${search.search_name}: ${result.jobs_found} jobs found` });

  } catch (error) {
    logLine({ level: 'ERROR', step: 'DISCOVERY', msg: `Search failed: ${error.message}` });

    // Mark run as failed if we have a run ID
    if (runId) {
      await api.completeDiscoveryRun(runId, {
        run_id: runId,
        status: 'FAILED',
        jobs_found: 0,
        jobs_new: 0,
        jobs_updated: 0,
        pages_scraped: 0,
        error_message: error.message,
        jobs: []
      }).catch(() => {});
    }
  } finally {
    activeScrapesCount--;
  }
}

/**
 * Run a one-off discovery for a specific URL or adapter source
 * @param {string} sourceName - 'linkedin', 'indeed', 'glassdoor', 'remotive', etc.
 * @param {string} searchUrl - Full search URL (for scraper sources)
 * @param {Object} options - Scraping/adapter options
 * @returns {Promise<import('./types.js').DiscoveryRunResult>}
 */
export async function runOnce(sourceName, searchUrl, options = {}) {
  logLine({ level: 'INFO', step: 'DISCOVERY', msg: `Running one-off discovery for ${sourceName}` });

  // Get source configuration
  const sources = await api.getJobSources();
  const source = sources.find(s => s.name === sourceName);

  if (!source) {
    throw new Error(`Unknown source: ${sourceName}. Available: ${sources.map(s => s.name).join(', ')}`);
  }

  const sourceType = source.source_type || 'scraper';
  let result;

  if (sourceType === 'scraper') {
    // Existing Playwright path
    result = await scrapeJobs(source, searchUrl, {
      maxPages: options.maxPages || DEFAULT_MAX_PAGES,
      maxJobs: options.maxJobs || DEFAULT_MAX_JOBS,
      headless: options.headless !== false,
      fetchDescriptions: options.fetchDescriptions !== false
    });
  } else {
    // API/Feed adapter path
    const adapter = getAdapter(source.name);
    if (!adapter) {
      throw new Error(`No adapter for source: ${source.name}`);
    }

    const jobs = await adapter.fetchJobs(source, {
      searchUrl,
      maxJobs: options.maxJobs || DEFAULT_MAX_JOBS,
      ...options,
    });

    result = {
      status: 'COMPLETED',
      jobs_found: jobs.length,
      jobs_new: 0,
      jobs_updated: 0,
      pages_scraped: 0,
      jobs,
    };
  }

  // Save jobs if requested
  if (options.save !== false && result.jobs.length > 0) {
    const saveResult = await api.saveDiscoveredJobs(null, result.jobs);
    result.jobs_new = saveResult.saved;
    logLine({ level: 'INFO', step: 'DISCOVERY', msg: `Saved ${saveResult.saved} jobs` });
  }

  return result;
}
