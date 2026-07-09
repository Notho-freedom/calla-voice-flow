// Shared Upstash clients (Redis REST + QStash) for edge functions.
// Env vars are read lazily so missing config degrades gracefully.

const REDIS_URL = Deno.env.get('UPSTASH_REDIS_REST_URL') || '';
const REDIS_TOKEN = Deno.env.get('UPSTASH_REDIS_REST_TOKEN') || '';
const QSTASH_TOKEN = Deno.env.get('QSTASH_TOKEN') || '';
const QSTASH_WORKER_URL = Deno.env.get('QSTASH_WORKER_URL') || '';

export const redisEnabled = () => Boolean(REDIS_URL && REDIS_TOKEN);
export const qstashEnabled = () => Boolean(QSTASH_TOKEN && QSTASH_WORKER_URL);

async function redisCmd(cmd: (string | number)[]): Promise<unknown> {
  if (!redisEnabled()) return null;
  try {
    const res = await fetch(REDIS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cmd),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.result ?? null;
  } catch {
    return null;
  }
}

export async function cacheGet<T = unknown>(key: string): Promise<T | null> {
  const raw = await redisCmd(['GET', key]);
  if (raw == null || typeof raw !== 'string') return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
  await redisCmd(['SET', key, JSON.stringify(value), 'EX', ttlSeconds]);
}

export async function cacheDel(key: string): Promise<void> {
  await redisCmd(['DEL', key]);
}

// FNV-1a hash for cache keys (non-cryptographic).
export function hashKey(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}

// ─── QStash: async job publishing ───
export interface EnqueueOptions {
  delaySeconds?: number;
  retries?: number;
  deduplicationId?: string;
  callback?: string;
}

export async function enqueueJob(payload: unknown, opts: EnqueueOptions = {}): Promise<
  { ok: true; messageId: string } | { ok: false; reason: string }
> {
  if (!qstashEnabled()) return { ok: false, reason: 'qstash_not_configured' };
  const headers: Record<string, string> = {
    Authorization: `Bearer ${QSTASH_TOKEN}`,
    'Content-Type': 'application/json',
  };
  if (opts.delaySeconds) headers['Upstash-Delay'] = `${opts.delaySeconds}s`;
  if (opts.retries != null) headers['Upstash-Retries'] = String(opts.retries);
  if (opts.deduplicationId) headers['Upstash-Deduplication-Id'] = opts.deduplicationId;
  if (opts.callback) headers['Upstash-Callback'] = opts.callback;

  try {
    const res = await fetch(`https://qstash.upstash.io/v2/publish/${encodeURIComponent(QSTASH_WORKER_URL)}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, reason: `qstash_${res.status}` };
    const json = await res.json().catch(() => ({}));
    return { ok: true, messageId: json?.messageId || '' };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

// ─── Job status (Redis-backed) ───
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';
export interface JobRecord {
  id: string;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  result?: unknown;
  error?: string;
}

export const jobKey = (id: string) => `job:${id}`;

export async function setJob(record: JobRecord, ttlSeconds = 3600): Promise<void> {
  await cacheSet(jobKey(record.id), record, ttlSeconds);
}

export async function getJob(id: string): Promise<JobRecord | null> {
  return cacheGet<JobRecord>(jobKey(id));
}
