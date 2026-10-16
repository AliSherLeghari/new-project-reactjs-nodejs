// Process-local FIFO cache; reads do not extend TTL. Only the service inserts successful results.
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();
  constructor(
    private readonly ttlMs = 60_000,
    private readonly maxEntries = 100,
    private readonly now: () => number = Date.now,
  ) {
    if (
      !Number.isFinite(ttlMs) ||
      ttlMs < 1 ||
      !Number.isSafeInteger(maxEntries) ||
      maxEntries < 1
    )
      throw new Error('Invalid cache configuration.');
  }
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }
  set(key: string, value: T): void {
    const now = this.now();
    for (const [entryKey, entry] of this.entries)
      if (entry.expiresAt <= now) this.entries.delete(entryKey);
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries)
      this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
  }
}
