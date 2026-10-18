import { useEffect, useState } from 'react';
import { checkHealth } from './health';

type Connection = 'loading' | 'connected' | 'error';
export function BackendStatus() {
  const [connection, setConnection] = useState<Connection>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    checkHealth(controller.signal)
      .then(() => {
        if (active) setConnection('connected');
      })
      .catch(() => {
        if (active) setConnection('error');
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);
  return (
    <section className="connection" aria-label="Backend connectivity">
      <p role="status">
        <span className={`status-dot ${connection}`} aria-hidden="true" />
        {connection === 'loading'
          ? 'Checking backend…'
          : connection === 'connected'
            ? 'Backend connected'
            : 'Backend unavailable. Please try again.'}
      </p>
      {connection === 'error' && (
        <button
          className="retry"
          onClick={() => {
            setConnection('loading');
            setAttempt(attempt + 1);
          }}
        >
          Retry connection
        </button>
      )}
    </section>
  );
}
