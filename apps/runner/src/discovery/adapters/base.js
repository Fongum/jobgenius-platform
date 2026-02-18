/**
 * Adapter Base
 *
 * Shared interface, registry, and helpers for all job source adapters.
 */

import { logLine } from '../../logger.js';

// ---------------------------------------------------------------------------
// Adapter registry
// ---------------------------------------------------------------------------

const ADAPTERS = {};

/**
 * Register an adapter by source name.
 * @param {string} name
 * @param {{ name: string, type: string, fetchJobs: Function }} adapter
 */
export function registerAdapter(name, adapter) {
  ADAPTERS[name] = adapter;
}

/**
 * Get a registered adapter by source name.
 * @param {string} name
 * @returns {{ name: string, type: string, fetchJobs: Function } | null}
 */
export function getAdapter(name) {
  return ADAPTERS[name] || null;
}

/**
 * List all registered adapter names.
 * @returns {string[]}
 */
export function listAdapters() {
  return Object.keys(ADAPTERS);
}

// ---------------------------------------------------------------------------
// normalizeJob — validates & trims a DiscoveredJob candidate
// ---------------------------------------------------------------------------

/**
 * Normalize and validate a discovered job object.
 * Returns null if required fields are missing.
 *
 * @param {Object} raw
 * @returns {import('../types.js').DiscoveredJob | null}
 */
export function normalizeJob(raw) {
  const external_id = String(raw.external_id ?? '').trim();
  const source_name = String(raw.source_name ?? '').trim();
  const url = String(raw.url ?? '').trim();
  const title = String(raw.title ?? '').trim();

  if (!external_id || !source_name || !url || !title) {
    return null;
  }

  return {
    external_id,
    source_name,
    url,
    title,
    company: raw.company ? String(raw.company).trim() : undefined,
    location: raw.location ? String(raw.location).trim() : undefined,
    salary: raw.salary ? String(raw.salary).trim() : undefined,
    posted_at: raw.posted_at ? String(raw.posted_at).trim() : undefined,
    description_text: raw.description_text ? String(raw.description_text).trim() : undefined,
    description_html: raw.description_html ? String(raw.description_html).trim() : undefined,
  };
}

// ---------------------------------------------------------------------------
// fetchJSON — fetch wrapper with retry, timeout, and rate-limit delay
// ---------------------------------------------------------------------------

const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT = 15000;
const DEFAULT_RATE_DELAY = 200; // ms between requests

/**
 * Fetch JSON with retry, timeout, and rate-limit delay.
 *
 * @param {string} url
 * @param {Object} [options]
 * @param {Object} [options.headers]
 * @param {string} [options.method]
 * @param {string|Object} [options.body]
 * @param {number} [options.retries]
 * @param {number} [options.timeout]
 * @param {number} [options.rateDelay]
 * @returns {Promise<any>}
 */
export async function fetchJSON(url, options = {}) {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const rateDelay = options.rateDelay ?? DEFAULT_RATE_DELAY;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const fetchOpts = {
        method: options.method || 'GET',
        headers: { 'Accept': 'application/json', ...options.headers },
        signal: controller.signal,
      };

      if (options.body) {
        fetchOpts.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
        fetchOpts.headers['Content-Type'] = fetchOpts.headers['Content-Type'] || 'application/json';
      }

      const response = await fetch(url, fetchOpts);
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Rate-limit delay
      if (rateDelay > 0) {
        await sleep(rateDelay);
      }

      return data;
    } catch (err) {
      logLine({ level: 'WARN', step: 'ADAPTER', msg: `fetchJSON attempt ${attempt}/${retries} failed for ${url}: ${err.message}` });

      if (attempt === retries) {
        throw err;
      }

      // Exponential backoff
      await sleep(1000 * attempt);
    }
  }
}

// ---------------------------------------------------------------------------
// buildSearchUrl — URL builder with query param encoding
// ---------------------------------------------------------------------------

/**
 * Build a URL with query parameters.
 * @param {string} base
 * @param {Record<string, string|number|undefined>} params
 * @returns {string}
 */
export function buildSearchUrl(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Strip HTML tags from a string.
 * @param {string} html
 * @returns {string}
 */
export function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
