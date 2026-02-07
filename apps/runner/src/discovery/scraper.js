/**
 * Intelligent Job Board Scraper
 *
 * Uses Playwright to scrape job listings from various job boards.
 * Handles infinite scroll, pagination, and dynamic content loading.
 */

import { chromium } from 'playwright';
import { logLine } from '../logger.js';

/** @type {import('./types.js').ScraperConfig} */
const DEFAULT_CONFIG = {
  maxPages: 10,
  maxJobs: 100,
  scrollDelay: 1000,
  pageTimeout: 30000,
  headless: true,
  fetchDescriptions: false,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

/**
 * Main scraper class for job discovery
 */
export class JobScraper {
  /**
   * @param {import('./types.js').JobSource} source
   * @param {Partial<import('./types.js').ScraperConfig>} config
   */
  constructor(source, config = {}) {
    this.source = source;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.browser = null;
    this.context = null;
    this.page = null;
    this.jobsCollected = [];
    this.seenIds = new Set();
  }

  /**
   * Initialize the browser
   */
  async init() {
    logLine({ level: 'INFO', step: 'SCRAPER', msg: `Initializing browser for ${this.source.name}` });

    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox'
      ]
    });

    this.context = await this.browser.newContext({
      userAgent: this.config.userAgent,
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York'
    });

    // Add stealth scripts to avoid detection
    await this.context.addInitScript(() => {
      // Override navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });

      // Override plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });

      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en']
      });
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.pageTimeout);

    logLine({ level: 'INFO', step: 'SCRAPER', msg: 'Browser initialized' });
  }

  /**
   * Close the browser
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  /**
   * Scrape jobs from a search URL
   * @param {string} searchUrl - The search results URL
   * @returns {Promise<import('./types.js').DiscoveryRunResult>}
   */
  async scrape(searchUrl) {
    const startTime = Date.now();
    let pagesScraped = 0;
    let errorMessage = null;

    try {
      await this.init();

      logLine({ level: 'INFO', step: 'SCRAPER', msg: `Navigating to ${searchUrl}` });
      await this.page.goto(searchUrl, { waitUntil: 'networkidle' });

      // Wait for job cards to appear
      const selectors = this.source.selectors;
      await this.page.waitForSelector(selectors.job_cards, { timeout: 10000 })
        .catch(() => logLine({ level: 'WARN', step: 'SCRAPER', msg: 'Job cards selector not found immediately' }));

      // Handle different pagination types
      const loadMoreType = selectors.load_more_type || 'pagination';

      while (
        pagesScraped < this.config.maxPages &&
        this.jobsCollected.length < this.config.maxJobs
      ) {
        // Extract jobs from current view
        const newJobs = await this.extractJobsFromPage();
        logLine({ level: 'INFO', step: 'SCRAPER', msg: `Page ${pagesScraped + 1}: Found ${newJobs} new jobs (total: ${this.jobsCollected.length})` });

        pagesScraped++;

        // Check if we should continue
        if (this.jobsCollected.length >= this.config.maxJobs) {
          logLine({ level: 'INFO', step: 'SCRAPER', msg: `Reached max jobs limit (${this.config.maxJobs})` });
          break;
        }

        // Load more content based on pagination type
        let hasMore = false;

        if (loadMoreType === 'infinite_scroll') {
          hasMore = await this.handleInfiniteScroll();
        } else if (loadMoreType === 'load_more') {
          hasMore = await this.handleLoadMore(selectors.next_page);
        } else {
          hasMore = await this.handlePagination(selectors.next_page);
        }

        if (!hasMore) {
          logLine({ level: 'INFO', step: 'SCRAPER', msg: 'No more pages available' });
          break;
        }

        // Rate limiting
        await this.sleep(this.config.scrollDelay);
      }

      // Optionally fetch full descriptions
      if (this.config.fetchDescriptions && this.jobsCollected.length > 0) {
        await this.fetchJobDescriptions();
      }

    } catch (error) {
      errorMessage = error.message;
      logLine({ level: 'ERROR', step: 'SCRAPER', msg: `Error during scraping: ${error.message}` });
    } finally {
      await this.close();
    }

    const duration = Date.now() - startTime;
    logLine({ level: 'INFO', step: 'SCRAPER', msg: `Completed in ${duration}ms. Found ${this.jobsCollected.length} jobs across ${pagesScraped} pages` });

    return {
      run_id: null, // Set by caller
      status: errorMessage ? 'FAILED' : 'COMPLETED',
      jobs_found: this.jobsCollected.length,
      jobs_new: 0, // Calculated by API when saving
      jobs_updated: 0,
      pages_scraped: pagesScraped,
      error_message: errorMessage,
      jobs: this.jobsCollected
    };
  }

  /**
   * Extract all job listings from the current page state
   * @returns {Promise<number>} Number of new jobs found
   */
  async extractJobsFromPage() {
    const selectors = this.source.selectors;
    let newCount = 0;

    const jobs = await this.page.$$eval(
      selectors.job_cards,
      (cards, sel, sourceName) => {
        return cards.map(card => {
          const getTextContent = (selector) => {
            const el = card.querySelector(selector);
            return el ? el.textContent?.trim() : null;
          };

          const getHref = (selector) => {
            const el = card.querySelector(selector);
            if (!el) return null;
            return el.getAttribute('href') || el.closest('a')?.getAttribute('href');
          };

          const getAttr = (attr) => {
            // Try the card itself first
            let val = card.getAttribute(attr);
            if (!val) {
              // Try finding an element with this attribute
              const el = card.querySelector(`[${attr}]`);
              val = el?.getAttribute(attr);
            }
            return val;
          };

          // Extract job ID from various sources
          let externalId = getAttr(sel.job_id_attr);
          if (!externalId) {
            // Try to extract from URL
            const href = getHref(sel.job_link);
            if (href) {
              // LinkedIn: /jobs/view/123456
              const linkedinMatch = href.match(/\/jobs\/view\/(\d+)/);
              if (linkedinMatch) externalId = linkedinMatch[1];

              // Indeed: jk=abc123
              const indeedMatch = href.match(/jk=([a-f0-9]+)/i);
              if (indeedMatch) externalId = indeedMatch[1];

              // Glassdoor: /job-listing/-JL123456
              const glassdoorMatch = href.match(/JL(\d+)/);
              if (glassdoorMatch) externalId = glassdoorMatch[1];
            }
          }

          const title = getTextContent(sel.job_title);
          const company = getTextContent(sel.job_company);
          const location = getTextContent(sel.job_location);
          const salary = sel.job_salary ? getTextContent(sel.job_salary) : null;
          const posted = sel.job_posted ? getTextContent(sel.job_posted) : null;

          let url = getHref(sel.job_link);
          // Make URL absolute if relative
          if (url && !url.startsWith('http')) {
            url = new URL(url, window.location.origin).href;
          }

          return {
            external_id: externalId,
            source_name: sourceName,
            url,
            title,
            company,
            location,
            salary,
            posted_at: posted,
            description_text: null,
            description_html: null
          };
        });
      },
      selectors,
      this.source.name
    );

    // Filter and add unique jobs
    for (const job of jobs) {
      if (!job.external_id && !job.url) continue;

      const uniqueKey = job.external_id || job.url;
      if (this.seenIds.has(uniqueKey)) continue;

      this.seenIds.add(uniqueKey);
      this.jobsCollected.push(job);
      newCount++;
    }

    return newCount;
  }

  /**
   * Handle infinite scroll pagination (LinkedIn style)
   * @returns {Promise<boolean>} Whether more content was loaded
   */
  async handleInfiniteScroll() {
    const previousHeight = await this.page.evaluate(() => document.body.scrollHeight);
    const previousCount = this.jobsCollected.length;

    // Scroll to bottom
    await this.page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    // Wait for potential new content
    await this.sleep(this.config.scrollDelay);

    // Check for "Show more" button (LinkedIn has this)
    const loadMoreBtn = this.source.selectors.next_page;
    if (loadMoreBtn) {
      try {
        const btn = await this.page.$(loadMoreBtn);
        if (btn) {
          await btn.click();
          await this.sleep(this.config.scrollDelay);
        }
      } catch (e) {
        // Button might not exist or be clickable
      }
    }

    // Check if page height increased or new jobs appeared
    const newHeight = await this.page.evaluate(() => document.body.scrollHeight);
    const newJobs = await this.extractJobsFromPage();

    return newHeight > previousHeight || newJobs > 0;
  }

  /**
   * Handle "Load More" button pagination
   * @param {string} buttonSelector
   * @returns {Promise<boolean>}
   */
  async handleLoadMore(buttonSelector) {
    if (!buttonSelector) return false;

    try {
      const btn = await this.page.$(buttonSelector);
      if (!btn) return false;

      const isVisible = await btn.isVisible();
      const isEnabled = await btn.isEnabled();

      if (!isVisible || !isEnabled) return false;

      await btn.click();
      await this.page.waitForLoadState('networkidle');

      return true;
    } catch (e) {
      logLine({ level: 'DEBUG', step: 'SCRAPER', msg: `Load more button not available: ${e.message}` });
      return false;
    }
  }

  /**
   * Handle traditional pagination (Indeed, Glassdoor style)
   * @param {string} nextSelector
   * @returns {Promise<boolean>}
   */
  async handlePagination(nextSelector) {
    if (!nextSelector) return false;

    try {
      const nextBtn = await this.page.$(nextSelector);
      if (!nextBtn) return false;

      const isVisible = await nextBtn.isVisible();
      const isEnabled = await nextBtn.isEnabled();
      const isDisabled = await nextBtn.getAttribute('disabled');

      if (!isVisible || !isEnabled || isDisabled !== null) return false;

      await nextBtn.click();
      await this.page.waitForLoadState('networkidle');

      // Wait for new job cards
      await this.page.waitForSelector(this.source.selectors.job_cards, { timeout: 10000 })
        .catch(() => {});

      return true;
    } catch (e) {
      logLine({ level: 'DEBUG', step: 'SCRAPER', msg: `Pagination failed: ${e.message}` });
      return false;
    }
  }

  /**
   * Fetch full job descriptions for collected jobs
   * This opens each job in a new tab to get the full description
   */
  async fetchJobDescriptions() {
    logLine({ level: 'INFO', step: 'SCRAPER', msg: `Fetching descriptions for ${this.jobsCollected.length} jobs` });

    const descriptionSelectors = {
      linkedin: '.description__text, .show-more-less-html__markup',
      indeed: '#jobDescriptionText, .jobsearch-jobDescriptionText',
      glassdoor: '[data-test="jobDescription"], .desc'
    };

    const selector = descriptionSelectors[this.source.name] || 'body';
    let fetched = 0;

    for (const job of this.jobsCollected) {
      if (!job.url) continue;
      if (fetched >= 20) break; // Limit description fetches

      try {
        const descPage = await this.context.newPage();
        descPage.setDefaultTimeout(15000);

        await descPage.goto(job.url, { waitUntil: 'domcontentloaded' });
        await descPage.waitForSelector(selector, { timeout: 5000 }).catch(() => {});

        const description = await descPage.$eval(selector, el => ({
          text: el.textContent?.trim(),
          html: el.innerHTML
        })).catch(() => ({ text: null, html: null }));

        job.description_text = description.text;
        job.description_html = description.html;
        fetched++;

        await descPage.close();
        await this.sleep(500); // Small delay between fetches
      } catch (e) {
        logLine({ level: 'DEBUG', step: 'SCRAPER', msg: `Failed to fetch description for ${job.url}: ${e.message}` });
      }
    }

    logLine({ level: 'INFO', step: 'SCRAPER', msg: `Fetched ${fetched} job descriptions` });
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a scraper for a specific source
 * @param {import('./types.js').JobSource} source
 * @param {Partial<import('./types.js').ScraperConfig>} config
 * @returns {JobScraper}
 */
export function createScraper(source, config = {}) {
  return new JobScraper(source, config);
}

/**
 * Scrape jobs from a URL
 * @param {import('./types.js').JobSource} source
 * @param {string} searchUrl
 * @param {Partial<import('./types.js').ScraperConfig>} config
 * @returns {Promise<import('./types.js').DiscoveryRunResult>}
 */
export async function scrapeJobs(source, searchUrl, config = {}) {
  const scraper = createScraper(source, config);
  return scraper.scrape(searchUrl);
}
