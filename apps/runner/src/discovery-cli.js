#!/usr/bin/env node
/**
 * Job Discovery CLI
 *
 * Runs job discovery from the command line.
 *
 * Usage:
 *   node src/discovery-cli.js <source> <search_url> [options]
 *
 * Examples:
 *   node src/discovery-cli.js linkedin "https://www.linkedin.com/jobs/search?keywords=react&location=Remote"
 *   node src/discovery-cli.js indeed "https://www.indeed.com/jobs?q=software+engineer&l=San+Francisco" --max-pages=3
 *   node src/discovery-cli.js glassdoor "https://www.glassdoor.com/Job/san-francisco-software-engineer-jobs" --save
 *
 * Options:
 *   --max-pages=N     Maximum pages to scrape (default: 5)
 *   --max-jobs=N      Maximum jobs to collect (default: 50)
 *   --no-headless     Run browser in visible mode (for debugging)
 *   --no-descriptions Don't fetch full job descriptions
 *   --save            Save jobs to the backend database
 *   --output=FILE     Save results to a JSON file
 */

import { scrapeJobs } from './discovery/scraper.js';
import fs from 'fs';

// Default job source configurations
const DEFAULT_SOURCES = {
  linkedin: {
    id: 'linkedin',
    name: 'linkedin',
    base_url: 'https://www.linkedin.com/jobs/search',
    enabled: true,
    rate_limit_per_minute: 5,
    requires_auth: false,
    auth_config: {},
    selectors: {
      job_cards: '.jobs-search__results-list > li, .job-search-card',
      job_title: '.base-search-card__title, .job-search-card__title',
      job_company: '.base-search-card__subtitle, .job-search-card__subtitle',
      job_location: '.job-search-card__location',
      job_link: '.base-card__full-link, a.base-search-card__full-link',
      job_id_attr: 'data-entity-urn',
      next_page: 'button[aria-label="See more jobs"], button.infinite-scroller__show-more-button',
      load_more_type: 'infinite_scroll'
    }
  },
  indeed: {
    id: 'indeed',
    name: 'indeed',
    base_url: 'https://www.indeed.com/jobs',
    enabled: true,
    rate_limit_per_minute: 10,
    requires_auth: false,
    auth_config: {},
    selectors: {
      job_cards: '.job_seen_beacon, .resultContent, [data-jk]',
      job_title: '.jobTitle span[title], h2.jobTitle, [data-testid="jobTitle"]',
      job_company: '[data-testid="company-name"], .companyName, .company_location .companyName',
      job_location: '[data-testid="text-location"], .companyLocation',
      job_link: '.jcs-JobTitle, a.jcs-JobTitle',
      job_salary: '.salary-snippet-container, [data-testid="attribute_snippet_testid"]',
      job_id_attr: 'data-jk',
      next_page: '[data-testid="pagination-page-next"], a[aria-label="Next Page"]',
      load_more_type: 'pagination'
    }
  },
  glassdoor: {
    id: 'glassdoor',
    name: 'glassdoor',
    base_url: 'https://www.glassdoor.com/Job',
    enabled: true,
    rate_limit_per_minute: 5,
    requires_auth: false,
    auth_config: {},
    selectors: {
      job_cards: '[data-test="jobListing"], .react-job-listing',
      job_title: '[data-test="job-title"], .job-title',
      job_company: '[data-test="employer-name"], .employer-name',
      job_location: '[data-test="emp-location"], .location',
      job_link: '[data-test="job-title"], a[data-test="job-link"]',
      job_salary: '[data-test="detailSalary"]',
      job_id_attr: 'data-id',
      next_page: '[data-test="pagination-next"], button[data-test="load-more"]',
      load_more_type: 'pagination'
    }
  }
};

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(args.length < 2 ? 1 : 0);
  }

  const sourceName = args[0].toLowerCase();
  const searchUrl = args[1];

  // Parse options
  const options = {
    maxPages: 5,
    maxJobs: 50,
    headless: true,
    fetchDescriptions: true,
    save: false,
    output: null
  };

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--max-pages=')) {
      options.maxPages = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--max-jobs=')) {
      options.maxJobs = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--no-headless') {
      options.headless = false;
    } else if (arg === '--no-descriptions') {
      options.fetchDescriptions = false;
    } else if (arg === '--save') {
      options.save = true;
    } else if (arg.startsWith('--output=')) {
      options.output = arg.split('=')[1];
    }
  }

  // Get source config
  const source = DEFAULT_SOURCES[sourceName];
  if (!source) {
    console.error(`Unknown source: ${sourceName}`);
    console.error(`Available sources: ${Object.keys(DEFAULT_SOURCES).join(', ')}`);
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('JOB DISCOVERY CLI');
  console.log('='.repeat(60));
  console.log(`Source:       ${sourceName}`);
  console.log(`URL:          ${searchUrl}`);
  console.log(`Max Pages:    ${options.maxPages}`);
  console.log(`Max Jobs:     ${options.maxJobs}`);
  console.log(`Headless:     ${options.headless}`);
  console.log(`Descriptions: ${options.fetchDescriptions}`);
  console.log('='.repeat(60));
  console.log('');

  try {
    const result = await scrapeJobs(source, searchUrl, {
      maxPages: options.maxPages,
      maxJobs: options.maxJobs,
      headless: options.headless,
      fetchDescriptions: options.fetchDescriptions
    });

    console.log('');
    console.log('='.repeat(60));
    console.log('RESULTS');
    console.log('='.repeat(60));
    console.log(`Status:        ${result.status}`);
    console.log(`Jobs Found:    ${result.jobs_found}`);
    console.log(`Pages Scraped: ${result.pages_scraped}`);
    if (result.error_message) {
      console.log(`Error:         ${result.error_message}`);
    }
    console.log('');

    // Print job summaries
    if (result.jobs.length > 0) {
      console.log('JOBS:');
      console.log('-'.repeat(60));
      for (const job of result.jobs.slice(0, 10)) {
        console.log(`  ${job.title}`);
        console.log(`    Company:  ${job.company || 'N/A'}`);
        console.log(`    Location: ${job.location || 'N/A'}`);
        console.log(`    URL:      ${job.url || 'N/A'}`);
        console.log('');
      }
      if (result.jobs.length > 10) {
        console.log(`  ... and ${result.jobs.length - 10} more jobs`);
      }
    }

    // Save to file if requested
    if (options.output) {
      fs.writeFileSync(options.output, JSON.stringify(result, null, 2));
      console.log(`\nResults saved to: ${options.output}`);
    }

    // Save to backend if requested
    if (options.save && result.jobs.length > 0) {
      console.log('\nSaving to backend...');
      await saveToBackend(result.jobs);
    }

    process.exit(result.status === 'COMPLETED' ? 0 : 1);

  } catch (error) {
    console.error(`\nFatal error: ${error.message}`);
    process.exit(1);
  }
}

async function saveToBackend(jobs) {
  const apiBaseUrl = process.env.JOBGENIUS_API_BASE_URL || 'http://localhost:3000';
  const opsApiKey = process.env.OPS_API_KEY || '';

  try {
    const response = await fetch(`${apiBaseUrl}/api/discovery/jobs/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ops-key': opsApiKey
      },
      body: JSON.stringify({
        run_id: null,
        jobs
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to save jobs: ${error}`);
      return;
    }

    const result = await response.json();
    console.log(`Saved: ${result.saved} new, ${result.duplicates} duplicates, ${result.errors} errors`);
  } catch (error) {
    console.error(`Failed to save jobs: ${error.message}`);
  }
}

function printUsage() {
  console.log(`
Job Discovery CLI - Scrape jobs from job boards

Usage:
  node src/discovery-cli.js <source> <search_url> [options]

Sources:
  linkedin    LinkedIn Jobs
  indeed      Indeed
  glassdoor   Glassdoor

Options:
  --max-pages=N       Maximum pages to scrape (default: 5)
  --max-jobs=N        Maximum jobs to collect (default: 50)
  --no-headless       Run browser in visible mode (for debugging)
  --no-descriptions   Don't fetch full job descriptions
  --save              Save jobs to the backend database
  --output=FILE       Save results to a JSON file

Examples:
  # Scrape LinkedIn for React jobs in Remote
  node src/discovery-cli.js linkedin "https://www.linkedin.com/jobs/search?keywords=react&location=Remote"

  # Scrape Indeed for Software Engineer jobs in San Francisco
  node src/discovery-cli.js indeed "https://www.indeed.com/jobs?q=software+engineer&l=San+Francisco" --max-pages=3

  # Scrape Glassdoor and save to backend
  node src/discovery-cli.js glassdoor "https://www.glassdoor.com/Job/san-francisco-software-engineer-jobs" --save

  # Debug mode with visible browser
  node src/discovery-cli.js linkedin "https://linkedin.com/jobs/search?keywords=python" --no-headless

Environment Variables:
  JOBGENIUS_API_BASE_URL   Backend API URL (for --save)
  OPS_API_KEY              API key for backend authentication
`);
}

main();
