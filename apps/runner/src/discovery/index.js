/**
 * Job Discovery Module
 *
 * Provides intelligent job board scraping capabilities.
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
 */

import * as agent from './agent.js';
import { JobScraper, createScraper, scrapeJobs } from './scraper.js';
import * as api from './api.js';

export {
  agent,
  JobScraper,
  createScraper,
  scrapeJobs,
  api
};
