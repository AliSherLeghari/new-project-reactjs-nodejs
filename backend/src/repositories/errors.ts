export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfterSeconds?: number,
    public readonly rateLimitReset?: number,
  ) {
    super(message);
  }
}

export function invalidInput(message: string): never {
  throw new ApiError(400, 'INVALID_INPUT', message);
}

export function invalidUpstream(): never {
  throw new ApiError(
    502,
    'INVALID_UPSTREAM_RESPONSE',
    'GitHub returned an unexpected response.',
  );
}
