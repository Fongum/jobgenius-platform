/**
 * Ashby Feed Adapter
 *
 * Fetches job postings from Ashby-hosted career pages via GraphQL.
 * No auth required.
 * https://jobs.ashbyhq.com/api/non-user-graphql
 */

import { registerAdapter, normalizeJob, fetchJSON } from './base.js';
import { logLine } from '../../logger.js';

const GRAPHQL_QUERY = `
  query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
    jobBoard: jobBoardWithTeams(
      organizationHostedJobsPageName: $organizationHostedJobsPageName
    ) {
      teams {
        id
        name
        parentTeamId
        jobs {
          id
          title
          teamId
          locationId
          locationName
          employmentType
          secondaryLocations {
            locationId
            locationName
          }
        }
      }
    }
  }
`;

const adapter = {
  name: 'ashby',
  type: 'feed',

  /**
   * @param {import('../types.js').JobSource} source
   * @param {import('../types.js').AdapterSearchConfig} searchConfig
   * @returns {Promise<import('../types.js').DiscoveredJob[]>}
   */
  async fetchJobs(source, searchConfig = {}) {
    const { company, maxJobs = 50 } = searchConfig;

    if (!company) {
      logLine({ level: 'WARN', step: 'ADAPTER', msg: '[ashby] Missing required "company" parameter' });
      return [];
    }

    const url = 'https://jobs.ashbyhq.com/api/non-user-graphql';
    logLine({ level: 'INFO', step: 'ADAPTER', msg: `[ashby] Fetching job board for: ${company}` });

    const data = await fetchJSON(url, {
      method: 'POST',
      body: {
        operationName: 'ApiJobBoardWithTeams',
        variables: { organizationHostedJobsPageName: company },
        query: GRAPHQL_QUERY,
      },
    });

    const teams = (data.data && data.data.jobBoard && data.data.jobBoard.teams) || [];

    // Build team name lookup
    const teamNames = {};
    for (const team of teams) {
      teamNames[team.id] = team.name;
    }

    // Flatten all jobs from all teams
    const allJobs = [];
    for (const team of teams) {
      for (const job of (team.jobs || [])) {
        allJobs.push({ ...job, teamName: team.name });
      }
    }

    logLine({ level: 'INFO', step: 'ADAPTER', msg: `[ashby] Got ${allJobs.length} jobs across ${teams.length} teams for ${company}` });

    const jobs = [];
    for (const job of allJobs) {
      if (jobs.length >= maxJobs) break;

      // Build location from primary + secondary locations
      const locations = [job.locationName];
      if (job.secondaryLocations) {
        for (const loc of job.secondaryLocations) {
          if (loc.locationName) locations.push(loc.locationName);
        }
      }
      const locationStr = locations.filter(Boolean).join('; ') || undefined;

      const normalized = normalizeJob({
        external_id: job.id,
        source_name: 'ashby',
        url: `https://jobs.ashbyhq.com/${encodeURIComponent(company)}/${job.id}`,
        title: job.title,
        company,
        location: locationStr,
      });

      if (normalized) jobs.push(normalized);
    }

    logLine({ level: 'INFO', step: 'ADAPTER', msg: `[ashby] Normalized ${jobs.length} jobs for ${company}` });
    return jobs;
  }
};

registerAdapter('ashby', adapter);
export default adapter;
