/**
 * Greenhouse Feed Adapter
 *
 * Fetches job postings from Greenhouse-hosted career boards.
 * No auth required. List endpoint + per-job detail endpoint for descriptions.
 * https://boards-api.greenhouse.io/v1/boards/{company}/jobs
 */

import { registerAdapter, normalizeJob, fetchJSON, stripHtml } from './base.js';
import { logLine } from '../../logger.js';

const MAX_DETAIL_FETCHES = 50;

const adapter = {
  name: 'greenhouse',
  type: 'feed',

  /**
   * @param {import('../types.js').JobSource} source
   * @param {import('../types.js').AdapterSearchConfig} searchConfig
   * @returns {Promise<import('../types.js').DiscoveredJob[]>}
   */
  async fetchJobs(source, searchConfig = {}) {
    const { company, maxJobs = 50 } = searchConfig;

    if (!company) {
      logLine({ level: 'WARN', step: 'ADAPTER', msg: '[greenhouse] Missing required "company" parameter' });
      return [];
    }

    const listUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(company)}/jobs`;
    logLine({ level: 'INFO', step: 'ADAPTER', msg: `[greenhouse] Fetching job list for: ${company}` });

    const data = await fetchJSON(listUrl);
    const rawJobs = data.jobs || [];

    logLine({ level: 'INFO', step: 'ADAPTER', msg: `[greenhouse] Got ${rawJobs.length} jobs for ${company}` });

    const jobs = [];
    const detailLimit = Math.min(maxJobs, MAX_DETAIL_FETCHES);

    for (const job of rawJobs) {
      if (jobs.length >= maxJobs) break;

      const locationName = (job.location && job.location.name) || undefined;

      // Fetch job detail for description (rate-limited)
      let descriptionText;
      let descriptionHtml;
      if (jobs.length < detailLimit) {
        try {
          const detailUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(company)}/jobs/${job.id}`;
          const detail = await fetchJSON(detailUrl, { rateDelay: 500 });
          descriptionHtml = detail.content || undefined;
          descriptionText = descriptionHtml ? stripHtml(descriptionHtml) : undefined;
        } catch (err) {
          logLine({ level: 'WARN', step: 'ADAPTER', msg: `[greenhouse] Failed to fetch detail for job ${job.id}: ${err.message}` });
        }
      }

      const normalized = normalizeJob({
        external_id: String(job.id),
        source_name: 'greenhouse',
        url: job.absolute_url,
        title: job.title,
        company,
        location: locationName,
        posted_at: job.updated_at || undefined,
        description_text: descriptionText,
        description_html: descriptionHtml,
      });

      if (normalized) jobs.push(normalized);
    }

    logLine({ level: 'INFO', step: 'ADAPTER', msg: `[greenhouse] Normalized ${jobs.length} jobs for ${company}` });
    return jobs;
  }
};

registerAdapter('greenhouse', adapter);
export default adapter;
