import { count, record } from './mapping.js';
import { invalidUpstream } from './errors.js';

export const contributionLabels = {
  'good-first-issue': 'good first issue',
  'help-wanted': 'help wanted',
} as const;
export type IssueFilter = keyof typeof contributionLabels;
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
  limit: 10;
  browse_url: string;
}
export function issueBrowseUrl(
  owner: string,
  repo: string,
  label: IssueFilter,
): string {
  const url = new URL(`https://github.com/${owner}/${repo}/issues`);
  url.searchParams.set(
    'q',
    `is:issue is:open label:"${contributionLabels[label]}"`,
  );
  return url.href;
}
export function mapIssueList(
  value: unknown,
  owner: string,
  repo: string,
  label: IssueFilter,
): IssuesResult {
  if (!Array.isArray(value) || value.length > 10) invalidUpstream();
  const issues: ContributionIssue[] = [];
  for (const valueItem of value) {
    const item = record(valueItem);
    // GitHub's repository issue-list endpoint returns PRs too; never present those as issues.
    if ('pull_request' in item) continue;
    const number = count(item.number);
    if (
      number < 1 ||
      typeof item.title !== 'string' ||
      !item.title.trim() ||
      item.state !== 'open' ||
      !Array.isArray(item.labels) ||
      typeof item.html_url !== 'string'
    )
      invalidUpstream();
    const labels = item.labels.map((value) => {
      const name = record(value).name;
      if (typeof name !== 'string' || !name) invalidUpstream();
      return name;
    });
    let url: URL;
    try {
      url = new URL(item.html_url);
    } catch {
      return invalidUpstream();
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
      invalidUpstream();
    // Be conservative if a label changed while GitHub assembled its response.
    if (
      !labels.some((name) => name.toLowerCase() === contributionLabels[label])
    )
      continue;
    issues.push({
      number,
      title: item.title,
      state: 'open',
      labels,
      url: url.href,
    });
  }
  return {
    issues,
    label,
    label_name: contributionLabels[label],
    limit: 10,
    browse_url: issueBrowseUrl(owner, repo, label),
  };
}
