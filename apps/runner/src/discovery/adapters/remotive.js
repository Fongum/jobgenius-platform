/**
 * Remotive Adapter
 *
 * Remote-only job board. No auth required, single endpoint.
 * https://remotive.com/api/remote-jobs
 */

import { registerAdapter, normalizeJob, fetchJSON, buildSearchUrl } from './base.js';
import { logLine } from '../../logger.js';

const adapter = {
  name: 'remotive',
  type: 'api',

  /**
   * @param {import('../types.js').JobSource} source
   * @param {import('../types.js').AdapterSearchConfig} searchConfig
   * @returns {Promise<import('../types.js').DiscoveredJob[]>}
   */
  async fetchJobs(source, searchConfig = {}) {
    const { keywords, category, maxJobs = 50 } = searchConfig;

    const params = {};
    if (category) params.category = category;
    if (keywords && keywords.length) params.search = Array.isArray(keywords) ? keywords.join(' ') : keywords;
    if (maxJobs) params.limit = maxJobs;

    const url = buildSearchUrl(source.base_url || 'https://remotive.com/api/remote-jobs', params);

    logLine({ level: 'INFO', step: 'ADAPTER', msg: `[remotive] Fetching: ${url}` });

    const data = await fetchJSON(url);
    const rawJobs = data.jobs || [];

    logLine({ level: 'INFO', step: 'ADAPTER', msg: `[remotive] Got ${rawJobs.length} raw jobs` });

    const jobs = [];
    for (const job of rawJobs) {
      if (jobs.length >= maxJobs) break;

      const normalized = normalizeJob({
        external_id: String(job.id),
        source_name: 'remotive',
        url: job.url,
        title: job.title,
        company: job.company_name,
        location: job.candidate_required_location,
        salary: job.salary || undefined,
        posted_at: job.publication_date || undefined,
        description_text: job.description ? undefined : undefined,
        description_html: job.description || undefined,
      });

      if (normalized) jobs.push(normalized);
    }

    logLine({ level: 'INFO', step: 'ADAPTER', msg: `[remotive] Normalized ${jobs.length} jobs` });
    return jobs;
  }
};

registerAdapter('remotive', adapter);
export default adapter;
