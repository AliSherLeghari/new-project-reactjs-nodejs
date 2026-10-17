import { useState } from 'react';
import { AppLink } from '../routing';
import {
  getRepository,
  getIssues,
  issueFilters,
  browseIssuesUrl,
  type IssueFilter,
} from './api';
import { useCooldown, useResource } from './useResource';
import { RepositoryMetadata } from '../search/RepositoryCard';

type Cooldown = ReturnType<typeof useCooldown>;
function ResourceError({
  message,
  retry,
  disabled,
}: {
  message: string;
  retry: () => void;
  disabled: boolean;
}) {
  return (
    <div className="resource-error">
      <p role="status">{message}</p>
      <button className="retry" onClick={retry} disabled={disabled}>
        Retry request
      </button>
    </div>
  );
}
function ContributionIssues({
  owner,
  repo,
  cooldown,
}: {
  owner: string;
  repo: string;
  cooldown: Cooldown;
}) {
  const [label, setLabel] = useState<IssueFilter>('good-first-issue');
  const { state, retry } = useResource(
    `${owner}/${repo}/${label}`,
    (signal) => getIssues(owner, repo, label, signal),
    cooldown,
  );
  const browse = browseIssuesUrl(owner, repo, label);
  return (
    <section className="contribution-section" aria-labelledby="issues-title">
      <div className="section-heading">
        <h2 id="issues-title">Contribution opportunities</h2>
        <div className="issue-filter">
          <label htmlFor="issue-label">Contribution label</label>
          <select
            id="issue-label"
            value={label}
            disabled={cooldown.blocked}
            onChange={(event) => setLabel(event.target.value as IssueFilter)}
          >
            <option value="good-first-issue">Good first issue</option>
            <option value="help-wanted">Help wanted</option>
          </select>
        </div>
      </div>
      <p className="help-text">
        Maintainers apply these labels. They do not guarantee difficulty,
        availability, or that a contribution will be accepted. Read the issue
        and contribution guidelines before starting.
      </p>
      <p className="help-text">
        Up to 10 recently updated matching entries are checked. Pull requests
        are excluded, so fewer than 10 issues may appear. This is not a complete
        list.
      </p>
      {state.status === 'loading' && (
        <p role="status">Loading contribution issues…</p>
      )}
      {state.status === 'paused' && (
        <ResourceError
          message="Issue requests are paused during the cooldown. Retry when it ends."
          retry={retry}
          disabled={cooldown.blocked}
        />
      )}
      {state.status === 'error' && (
        <ResourceError
          message={state.error.message}
          retry={retry}
          disabled={cooldown.blocked}
        />
      )}
      {state.status === 'success' && (
        <>
          <p role="status">
            {state.value.issues.length
              ? `${state.value.issues.length} open contribution ${state.value.issues.length === 1 ? 'issue' : 'issues'} shown.`
              : `No open “${issueFilters[label]}” issues were found in this sample. Browse GitHub or try the other label.`}
          </p>
          <ul className="issue-list">
            {state.value.issues.map((issue) => (
              <li key={issue.number}>
                <article>
                  <p className="help-text">#{issue.number} · Open issue</p>
                  <h3>
                    <a
                      href={issue.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Issue #${issue.number}: ${issue.title} on GitHub (opens in a new tab)`}
                    >
                      {issue.title}
                    </a>
                  </h3>
                  <ul
                    className="issue-labels"
                    aria-label={`Labels for issue ${issue.number}`}
                  >
                    {issue.labels.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </article>
              </li>
            ))}
          </ul>
        </>
      )}
      <a
        className="external-link"
        href={browse}
        target="_blank"
        rel="noopener noreferrer"
      >
        Browse all matching issues on GitHub (opens in a new tab)
      </a>
    </section>
  );
}
export function RepositoryDetails({
  owner,
  repo,
}: {
  owner: string;
  repo: string;
}) {
  const cooldown = useCooldown();
  const { state, retry } = useResource(
    `${owner}/${repo}`,
    (signal) => getRepository(owner, repo, signal),
    cooldown,
  );
  return (
    <div className="detail-page">
      <AppLink className="back-link" href="/">
        Back to search
      </AppLink>
      <h1 id="detail-title" tabIndex={-1}>
        {owner} / {repo}
      </h1>
      {cooldown.blocked && (
        <p role="status" className="notice">
          Requests paused until{' '}
          <time dateTime={new Date(cooldown.until).toISOString()}>
            {new Date(cooldown.until).toLocaleString()}
          </time>
          . Retry manually after the cooldown; no automatic requests will be
          sent.
        </p>
      )}
      {state.status === 'loading' && (
        <p role="status" className="search-message">
          Loading repository details…
        </p>
      )}
      {state.status === 'paused' && (
        <ResourceError
          message="Repository requests are paused. Retry when the cooldown ends."
          retry={retry}
          disabled={cooldown.blocked}
        />
      )}
      {state.status === 'error' && (
        <ResourceError
          message={state.error.message}
          retry={retry}
          disabled={cooldown.blocked}
        />
      )}
      {state.status === 'success' && (
        <>
          <section
            className="detail-summary"
            aria-label="Repository information"
          >
            <p className="repository-owner">Owner: {state.value.owner}</p>
            <p>{state.value.description || 'No description provided.'}</p>
            <RepositoryMetadata repository={state.value} />
            <a
              className="external-link"
              href={state.value.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              View {state.value.owner}/{state.value.name} on GitHub (opens in a
              new tab)
            </a>
          </section>
          <ContributionIssues
            key={`${owner}/${repo}`}
            owner={owner.toLowerCase()}
            repo={repo.toLowerCase()}
            cooldown={cooldown}
          />
        </>
      )}
    </div>
  );
}
