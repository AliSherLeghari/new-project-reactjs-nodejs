import {
  requestJson,
  object,
  count,
  invalidResponse,
  parseRepository,
} from '../search/api';
import type { Repository } from '../search/types';

export const issueFilters = {
  'good-first-issue': 'good first issue',
  'help-wanted': 'help wanted',
} as const;
export type IssueFilter = keyof typeof issueFilters;
export interface ContributionIssue {
  number: number;
  title: string;
  state: 'open';
  labels: string[];
  url: string;
}
export interface IssuesResult {
  issues: ContributionIssue[];
  label: IssueFilter;
  label_name: string;
  limit: number;
}
export function browseIssuesUrl(
  owner: string,
  repo: string,
  label: IssueFilter,
) {
  const url = new URL(`https://github.com/${owner}/${repo}/issues`);
  url.searchParams.set('q', `is:issue is:open label:"${issueFilters[label]}"`);
  return url.href;
}
function endpoint(owner: string, repo: string) {
  return `/api/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}
export function getRepository(
  owner: string,
  repo: string,
  signal: AbortSignal,
): Promise<Repository> {
  return requestJson(
    endpoint(owner, repo),
    signal,
    (body) => {
      const item = parseRepository(object(body).repository);
      if (
        item.owner.toLowerCase() !== owner.toLowerCase() ||
        item.name.toLowerCase() !== repo.toLowerCase()
      )
        invalidResponse();
      return item;
    },
    'details',
  );
}
export function getIssues(
  owner: string,
  repo: string,
  label: IssueFilter,
  signal: AbortSignal,
): Promise<IssuesResult> {
  return requestJson(
    `${endpoint(owner, repo)}/issues?${new URLSearchParams({ label })}`,
    signal,
    (value) => {
      const body = object(value);
      if (
        body.label !== label ||
        body.label_name !== issueFilters[label] ||
        body.limit !== 10 ||
        body.browse_url !==
          browseIssuesUrl(owner.toLowerCase(), repo.toLowerCase(), label) ||
        !Array.isArray(body.issues) ||
        body.issues.length > 10
      )
        invalidResponse();
      const issues = body.issues.map((value): ContributionIssue => {
        const item = object(value);
        const number = count(item.number);
        if (
          !number ||
          item.state !== 'open' ||
          typeof item.title !== 'string' ||
          !item.title.trim() ||
          !Array.isArray(item.labels) ||
          !item.labels.every(
            (name) => typeof name === 'string' && name.length > 0,
          ) ||
          !item.labels.some(
            (name: string) => name.toLowerCase() === issueFilters[label],
          ) ||
          typeof item.url !== 'string'
        )
          invalidResponse();
        let url: URL;
        try {
          url = new URL(item.url);
        } catch {
          return invalidResponse();
        }
        if (
          url.origin !== 'https://github.com' ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          url.pathname.toLowerCase() !==
            `/${owner}/${repo}/issues/${number}`.toLowerCase()
        )
          invalidResponse();
        return {
          number,
          title: item.title,
          state: 'open',
          labels: item.labels,
          url: url.href,
        };
      });
      return { issues, label, label_name: issueFilters[label], limit: 10 };
    },
    'issues',
  );
}
