/**
 * The Muse Adapter
 *
 * Startup/tech job board API. Optional API key.
 * https://www.themuse.com/developers/api/v2
 */

import { registerAdapter, normalizeJob, fetchJSON, buildSearchUrl, stripHtml } from './base.js';
import { logLine } from '../../logger.js';

const adapter = {
  name: 'themuse',
  type: 'api',

  /**
   * @param {import('../types.js').JobSource} source
   * @param {import('../types.js').AdapterSearchConfig} searchConfig
   * @returns {Promise<import('../types.js').DiscoveredJob[]>}
   */
  async fetchJobs(source, searchConfig = {}) {
    const { category, level, location, maxJobs = 50 } = searchConfig;
    const baseUrl = source.base_url || 'https://www.themuse.com/api/public/jobs';

    const apiKey = (source.auth_config && source.auth_config.api_key) || process.env.THEMUSE_API_KEY;

    const jobs = [];
    let page = 0;
    const maxPages = 10;

    while (jobs.length < maxJobs && page < maxPages) {
      const params = { page };
      if (category) params.category = category;
      if (level) params.level = level;
      if (location) params.location = location;
      if (apiKey) params.api_key = apiKey;

      const url = buildSearchUrl(baseUrl, params);
      logLine({ level: 'INFO', step: 'ADAPTER', msg: `[themuse] Fetching page ${page}` });

      const data = await fetchJSON(url);
      const results = data.results || [];

      if (results.length === 0) break;

      for (const job of results) {
        if (jobs.length >= maxJobs) break;

        const jobUrl = (job.refs && job.refs.landing_page) || '';
        const locationName = (job.locations && job.locations[0] && job.locations[0].name) || undefined;

        const normalized = normalizeJob({
          external_id: String(job.id),
          source_name: 'themuse',
          url: jobUrl,
          title: job.name,
          company: job.company && job.company.name,
          location: locationName,
          posted_at: job.publication_date || undefined,
          description_text: job.contents ? stripHtml(job.contents) : undefined,
          description_html: job.contents || undefined,
        });

        if (normalized) jobs.push(normalized);
      }

      // Check if there are more pages
      const pageCount = data.page_count || 0;
      if (page >= pageCount - 1) break;

      page++;
    }

    logLine({ level: 'INFO', step: 'ADAPTER', msg: `[themuse] Fetched ${jobs.length} jobs over ${page + 1} pages` });
    return jobs;
  }
};

registerAdapter('themuse', adapter);
export default adapter;
