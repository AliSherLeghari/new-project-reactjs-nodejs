import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { App } from './App';
import { BackendStatus } from './BackendStatus';
import { checkHealth } from './health';

const healthy = () =>
  Promise.resolve(
    new Response(
      JSON.stringify({ status: 'ok', service: 'opensource-explorer-api' }),
    ),
  );
describe('foundation UI', () => {
  it('labels search controls and renders the real connection result', async () => {
    const fetchMock = vi.fn(healthy);
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    expect(screen.getAllByRole('status')[0]).toHaveTextContent(
      'Checking backend',
    );
    expect(screen.getByLabelText('Repository or topic')).toBeVisible();
    expect(screen.getByLabelText('Language')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled();
    expect(await screen.findByText('Backend connected')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith('/api/health', {
      signal: expect.any(AbortSignal),
    });
  });
  it('recovers from a failed connection on retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockImplementationOnce(healthy),
    );
    render(<BackendStatus />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Retry connection' }),
    );
    expect(await screen.findByText('Backend connected')).toBeVisible();
  });
  it('aborts a stalled request after five seconds and shows an error', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, { signal }: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) =>
            signal.addEventListener('abort', () =>
              reject(new Error('aborted')),
            ),
          ),
      ),
    );
    render(<BackendStatus />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getAllByRole('status')[0]).toHaveTextContent(
      'Backend unavailable',
    );
  });
  it('aborts the request when unmounted', () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, options) => {
        signal = options.signal;
        return new Promise(() => {});
      }),
    );
    const { unmount } = render(<BackendStatus />);
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
describe('health response validation', () => {
  it.each([
    new Response('{}', { status: 503 }),
    new Response('not json'),
    new Response(JSON.stringify({ status: 'ok', service: 'wrong-api' })),
    new Response('null'),
  ])('rejects an invalid response', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(checkHealth(new AbortController().signal)).rejects.toThrow();
  });
});
