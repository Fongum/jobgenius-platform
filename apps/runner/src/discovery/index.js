/**
 * Job Discovery Module
 *
 * Provides intelligent job board scraping and API/feed adapter capabilities.
 *
 * Usage:
 *   import * as discovery from './discovery/index.js';
 *
 *   // Run as background agent
 *   discovery.agent.start();
 *
 *   // Or run one-off discovery
 *   const result = await discovery.agent.runOnce('linkedin', 'https://linkedin.com/jobs/search?...');
 *
 *   // Or use scraper directly
 *   const scraper = discovery.createScraper(source, config);
 *   const jobs = await scraper.scrape(url);
 *
 *   // Or use an adapter directly
 *   const adapter = discovery.getAdapter('remotive');
 *   const jobs = await adapter.fetchJobs(source, { keywords: 'react' });
 *
 *   // List all registered adapters
 *   console.log(discovery.listAdapters());
 */

import * as agent from './agent.js';
import { JobScraper, createScraper, scrapeJobs } from './scraper.js';
import * as api from './api.js';
import { getAdapter, listAdapters } from './adapters/base.js';

// Import adapters to trigger self-registration
import './adapters/adzuna.js';
import './adapters/remotive.js';
import './adapters/themuse.js';
import './adapters/arbeitnow.js';
import './adapters/greenhouse-feed.js';
import './adapters/lever-feed.js';
import './adapters/ashby-feed.js';
import './adapters/hn-hiring.js';

export {
  agent,
  JobScraper,
  createScraper,
  scrapeJobs,
  api,
  getAdapter,
  listAdapters
};
