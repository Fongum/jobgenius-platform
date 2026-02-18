/**
 * Hacker News "Who's Hiring" Adapter
 *
 * Parses the monthly "Ask HN: Who is Hiring?" thread via the Algolia API.
 * No auth required.
 */

import { registerAdapter, normalizeJob, fetchJSON, stripHtml } from './base.js';
import { logLine } from '../../logger.js';

// Common format: "Company | Role | Location | Remote | URL"
const PIPE_PATTERN = /^([^|]+)\|([^|]+)\|?([^|]*)\|?([^|]*)/;
const URL_PATTERN = /https?:\/\/[^\s<)]+/;

const adapter = {
  name: 'hn-hiring',
  type: 'api',

  /**
   * @param {import('../types.js').JobSource} source
   * @param {import('../types.js').AdapterSearchConfig} searchConfig
   * @returns {Promise<import('../types.js').DiscoveredJob[]>}
   */
  async fetchJobs(source, searchConfig = {}) {
    const { maxJobs = 50 } = searchConfig;

    // Step 1: Find the most recent "Who is Hiring" thread
    logLine({ level: 'INFO', step: 'ADAPTER', msg: '[hn-hiring] Searching for latest "Who is Hiring" thread' });

    const searchUrl = 'https://hn.algolia.com/api/v1/search?query=%22who%20is%20hiring%22&tags=story,ask_hn&hitsPerPage=1';
    const searchResult = await fetchJSON(searchUrl);

    const hits = searchResult.hits || [];
    if (hits.length === 0) {
      logLine({ level: 'WARN', step: 'ADAPTER', msg: '[hn-hiring] No "Who is Hiring" thread found' });
      return [];
    }

    const storyId = hits[0].objectID;
    const storyTitle = hits[0].title;
    logLine({ level: 'INFO', step: 'ADAPTER', msg: `[hn-hiring] Found thread: "${storyTitle}" (${storyId})` });

    // Step 2: Fetch all top-level comments
    const itemUrl = `https://hn.algolia.com/api/v1/items/${storyId}`;
    const story = await fetchJSON(itemUrl, { timeout: 30000 });

    const children = story.children || [];
    logLine({ level: 'INFO', step: 'ADAPTER', msg: `[hn-hiring] Got ${children.length} top-level comments` });

    // Step 3: Parse each comment into a job posting
    const jobs = [];
    for (const comment of children) {
      if (jobs.length >= maxJobs) break;
      if (!comment.text || comment.text.length < 20) continue;

      const parsed = parseComment(comment);
      if (!parsed) continue;

      const normalized = normalizeJob({
        external_id: String(comment.id),
        source_name: 'hn-hiring',
        url: parsed.url || `https://news.ycombinator.com/item?id=${comment.id}`,
        title: parsed.title,
        company: parsed.company,
        location: parsed.location,
        description_text: parsed.description,
      });

      if (normalized) jobs.push(normalized);
    }

    logLine({ level: 'INFO', step: 'ADAPTER', msg: `[hn-hiring] Parsed ${jobs.length} job postings` });
    return jobs;
  }
};

/**
 * Parse a HN comment into structured job data.
 * Handles both pipe-delimited format and freeform text.
 *
 * @param {Object} comment
 * @returns {{ title: string, company?: string, location?: string, url?: string, description: string } | null}
 */
function parseComment(comment) {
  const text = stripHtml(comment.text);
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  if (lines.length === 0) return null;

  const firstLine = lines[0];

  // Try pipe-delimited format: "Company | Role | Location | Remote"
  const pipeMatch = firstLine.match(PIPE_PATTERN);
  if (pipeMatch) {
    const company = pipeMatch[1].trim();
    const role = pipeMatch[2].trim();
    const location = pipeMatch[3] ? pipeMatch[3].trim() : undefined;

    // Find URL in the full text
    const urlMatch = text.match(URL_PATTERN);
    const url = urlMatch ? urlMatch[0] : undefined;

    return {
      title: role,
      company,
      location: location || undefined,
      url,
      description: text,
    };
  }

  // Fallback: heuristic extraction
  // First line is usually company name or company + role
  const company = firstLine.length < 100 ? firstLine : firstLine.substring(0, 100);

  // Try to find a role keyword in first few lines
  let title = company;
  for (const line of lines.slice(0, 5)) {
    const lower = line.toLowerCase();
    if (lower.includes('hiring') || lower.includes('engineer') || lower.includes('developer') ||
        lower.includes('designer') || lower.includes('manager') || lower.includes('looking for')) {
      title = line.length < 120 ? line : line.substring(0, 120);
      break;
    }
  }

  const urlMatch = text.match(URL_PATTERN);
  const url = urlMatch ? urlMatch[0] : undefined;

  return {
    title,
    company: company !== title ? company : undefined,
    url,
    description: text,
  };
}

registerAdapter('hn-hiring', adapter);
export default adapter;
