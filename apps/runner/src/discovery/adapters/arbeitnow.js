/**
 * Arbeitnow Adapter
 *
 * Remote-first job board. No auth required, paginated.
 * https://www.arbeitnow.com/api/job-board-api
 */

import { registerAdapter, normalizeJob, fetchJSON, buildSearchUrl, stripHtml } from './base.js';
import { logLine } from '../../logger.js';

const adapter = {
  name: 'arbeitnow',
  type: 'api',

  /**
   * @param {import('../types.js').JobSource} source
   * @param {import('../types.js').AdapterSearchConfig} searchConfig
   * @returns {Promise<import('../types.js').DiscoveredJob[]>}
   */
  async fetchJobs(source, searchConfig = {}) {
    const { maxJobs = 50 } = searchConfig;
    const baseUrl = source.base_url || 'https://www.arbeitnow.com/api/job-board-api';

    const jobs = [];
    let page = 1;
    const maxPages = 10;

    while (jobs.length < maxJobs && page <= maxPages) {
      const url = buildSearchUrl(baseUrl, { page });
      logLine({ level: 'INFO', step: 'ADAPTER', msg: `[arbeitnow] Fetching page ${page}: ${url}` });

      const data = await fetchJSON(url);
      const rawJobs = data.data || [];

      if (rawJobs.length === 0) break;

      for (const job of rawJobs) {
        if (jobs.length >= maxJobs) break;

        const normalized = normalizeJob({
          external_id: job.slug || String(job.id || ''),
          source_name: 'arbeitnow',
          url: job.url,
          title: job.title,
          company: job.company_name,
          location: job.location,
          description_text: job.description ? stripHtml(job.description) : undefined,
          description_html: job.description || undefined,
        });

        if (normalized) jobs.push(normalized);
      }

      // Check if there are more pages
      if (data.links && !data.links.next) break;

      page++;
    }

    logLine({ level: 'INFO', step: 'ADAPTER', msg: `[arbeitnow] Fetched ${jobs.length} jobs over ${page} pages` });
    return jobs;
  }
};

registerAdapter('arbeitnow', adapter);
export default adapter;
