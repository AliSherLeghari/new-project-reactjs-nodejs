import { browseIssuesUrl, issueFilters, type IssueFilter } from './api';
import { makeRepository } from '../search/testFixtures';
export const detailFixture = makeRepository();
export function issueFixture(label: IssueFilter = 'good-first-issue') {
  return {
    issues: [
      {
        number: 42,
        title: 'Clarify the getting started guide',
        state: 'open',
        labels: [issueFilters[label], 'documentation'],
        url: 'https://github.com/octocat/project-0/issues/42',
      },
    ],
    label,
    label_name: issueFilters[label],
    limit: 10,
    browse_url: browseIssuesUrl('octocat', 'project-0', label),
  };
}
