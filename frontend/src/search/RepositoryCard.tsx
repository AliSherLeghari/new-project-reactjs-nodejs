import { AppLink, repositoryPath } from '../routing';
import type { Repository } from './types';

export function RepositoryCard({ repository }: { repository: Repository }) {
  return (
    <li className="repository-card">
      <article>
        <p className="repository-owner">{repository.owner}</p>
        <h3>
          <a
            href={repository.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`View ${repository.owner}/${repository.name} on GitHub (opens in a new tab)`}
          >
            {repository.name}
          </a>
        </h3>
        <p className="repository-description">
          {repository.description || 'No description provided.'}
        </p>
        <RepositoryMetadata repository={repository} />
        <AppLink
          className="details-link"
          href={repositoryPath(repository.owner, repository.name)}
          aria-label={`View details for ${repository.owner}/${repository.name}`}
        >
          View details
        </AppLink>
      </article>
    </li>
  );
}

export function RepositoryMetadata({ repository }: { repository: Repository }) {
  return (
    <>
      {' '}
      <p className="repository-language">
        {repository.language || 'Language not specified'}
      </p>
      <dl className="repository-stats">
        <div>
          <dt>Stars</dt>
          <dd>{repository.stars.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Forks</dt>
          <dd>{repository.forks.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Open issues &amp; PRs</dt>
          <dd>{repository.open_issues.toLocaleString()}</dd>
        </div>
      </dl>
    </>
  );
}
