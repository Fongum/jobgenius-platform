/**
 * Adzuna Adapter
 *
 * Job aggregator API. Requires API key (free tier available).
 * https://developer.adzuna.com/
 */

import { registerAdapter, normalizeJob, fetchJSON, buildSearchUrl } from './base.js';
import { logLine } from '../../logger.js';

const adapter = {
  name: 'adzuna',
  type: 'api',

  /**
   * @param {import('../types.js').JobSource} source
   * @param {import('../types.js').AdapterSearchConfig} searchConfig
   * @returns {Promise<import('../types.js').DiscoveredJob[]>}
   */
  async fetchJobs(source, searchConfig = {}) {
    const { keywords, location, maxJobs = 50 } = searchConfig;
    const adapterConfig = source.adapter_config || {};
    const country = adapterConfig.country || 'us';

    const appId = (source.auth_config && source.auth_config.app_id) || process.env.ADZUNA_APP_ID;
    const appKey = (source.auth_config && source.auth_config.app_key) || process.env.ADZUNA_APP_KEY;

    if (!appId || !appKey) {
      logLine({ level: 'WARN', step: 'ADAPTER', msg: '[adzuna] Missing API credentials (ADZUNA_APP_ID / ADZUNA_APP_KEY)' });
      return [];
    }

    const resultsPerPage = Math.min(maxJobs, 50);
    const jobs = [];
    let page = 1;
    const maxPages = Math.ceil(maxJobs / resultsPerPage);

    while (jobs.length < maxJobs && page <= maxPages) {
      const baseUrl = `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}`;
      const params = {
        app_id: appId,
        app_key: appKey,
        results_per_page: resultsPerPage,
      };

      if (keywords) {
        params.what = Array.isArray(keywords) ? keywords.join(' ') : keywords;
      }
      if (location) {
        params.where = location;
      }

      const url = buildSearchUrl(baseUrl, params);
      logLine({ level: 'INFO', step: 'ADAPTER', msg: `[adzuna] Fetching page ${page}` });

      const data = await fetchJSON(url);
      const results = data.results || [];

      if (results.length === 0) break;

      for (const result of results) {
        if (jobs.length >= maxJobs) break;

        // Build salary string
        let salary;
        if (result.salary_min || result.salary_max) {
          const parts = [];
          if (result.salary_min) parts.push(`$${Math.round(result.salary_min).toLocaleString()}`);
          if (result.salary_max) parts.push(`$${Math.round(result.salary_max).toLocaleString()}`);
          salary = parts.join(' - ');
        }

        const normalized = normalizeJob({
          external_id: String(result.id),
          source_name: 'adzuna',
          url: result.redirect_url,
          title: result.title,
          company: result.company && result.company.display_name,
          location: result.location && result.location.display_name,
          salary,
          posted_at: result.created || undefined,
          description_text: result.description || undefined,
        });

        if (normalized) jobs.push(normalized);
      }

      page++;
    }

    logLine({ level: 'INFO', step: 'ADAPTER', msg: `[adzuna] Fetched ${jobs.length} jobs over ${page - 1} pages` });
    return jobs;
  }
};

registerAdapter('adzuna', adapter);
export default adapter;
