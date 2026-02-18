/**
 * Lever Feed Adapter
 *
 * Fetches job postings from Lever-hosted career pages.
 * No auth required. One endpoint returns all listings with descriptions.
 * https://api.lever.co/v0/postings/{company}?mode=json
 */

import { registerAdapter, normalizeJob, fetchJSON } from './base.js';
import { logLine } from '../../logger.js';

const adapter = {
  name: 'lever',
  type: 'feed',

  /**
   * @param {import('../types.js').JobSource} source
   * @param {import('../types.js').AdapterSearchConfig} searchConfig
   * @returns {Promise<import('../types.js').DiscoveredJob[]>}
   */
  async fetchJobs(source, searchConfig = {}) {
    const { company, maxJobs = 50 } = searchConfig;

    if (!company) {
      logLine({ level: 'WARN', step: 'ADAPTER', msg: '[lever] Missing required "company" parameter' });
      return [];
    }

    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`;
    logLine({ level: 'INFO', step: 'ADAPTER', msg: `[lever] Fetching postings for: ${company}` });

    const postings = await fetchJSON(url);

    if (!Array.isArray(postings)) {
      logLine({ level: 'WARN', step: 'ADAPTER', msg: `[lever] Unexpected response format for ${company}` });
      return [];
    }

    logLine({ level: 'INFO', step: 'ADAPTER', msg: `[lever] Got ${postings.length} postings for ${company}` });

    const jobs = [];
    for (const posting of postings) {
      if (jobs.length >= maxJobs) break;

      const locationName = (posting.categories && posting.categories.location) || undefined;
      const team = (posting.categories && posting.categories.team) || undefined;
      const commitment = (posting.categories && posting.categories.commitment) || undefined;

      let title = posting.text;
      if (team && !title.includes(team)) {
        title = `${title} (${team})`;
      }

      const normalized = normalizeJob({
        external_id: posting.id,
        source_name: 'lever',
        url: posting.hostedUrl,
        title,
        company,
        location: locationName,
        posted_at: posting.createdAt ? new Date(posting.createdAt).toISOString() : undefined,
        description_text: posting.descriptionPlain || undefined,
        description_html: posting.description || undefined,
      });

      if (normalized) jobs.push(normalized);
    }

    logLine({ level: 'INFO', step: 'ADAPTER', msg: `[lever] Normalized ${jobs.length} jobs for ${company}` });
    return jobs;
  }
};

registerAdapter('lever', adapter);
export default adapter;
