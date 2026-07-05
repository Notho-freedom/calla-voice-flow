import { useCallback, useEffect, useState } from 'react';
import type { ExplorerSource, ExplorerSourceListResult } from '@/types/explorerSources';
import { api } from '@/lib/apiClient';

const SOURCES_CACHE_KEY = 'explorer.sources.cache.v2';
const LIST_CACHE_PREFIX = 'explorer.source.list.v2:';
const SOURCES_TTL = 30_000;
const LIST_TTL = 120_000;

function readCache<T>(key: string, ttl: number): T | null {
  try {
    const cached = JSON.parse(localStorage.getItem(key) || 'null') as { time: number; data: T } | null;
    if (!cached || Date.now() - cached.time > ttl) return null;
    return cached.data;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, data: T) {
  try { localStorage.setItem(key, JSON.stringify({ time: Date.now(), data })); } catch { /* ignore cache storage */ }
}

export function useExplorerSources() {
  const [sources, setSources] = useState<ExplorerSource[]>(() => readCache<ExplorerSource[]>(SOURCES_CACHE_KEY, SOURCES_TTL) || []);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await api.get<{ success: boolean; sources: ExplorerSource[]; error?: string }>('/api/sources');
      if (!payload.success) throw new Error(payload.error || 'API unavailable');
      const nextSources = Array.isArray(payload.sources) ? payload.sources : [];
      setSources(nextSources);
      writeCache(SOURCES_CACHE_KEY, nextSources);
      setIsAvailable(true);
      setError(null);
    } catch (err) {
      setSources([]);
      setIsAvailable(false);
      setError(err instanceof Error ? err.message : 'API unavailable');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const list = useCallback(async (sourceId: string, path = '/', opts: { force?: boolean } = {}): Promise<ExplorerSourceListResult> => {
    const cacheKey = `${LIST_CACHE_PREFIX}${sourceId}:${path}`;
    if (!opts.force) {
      const cached = readCache<ExplorerSourceListResult>(cacheKey, LIST_TTL);
      if (cached) return cached;
    }
    const payload = await api.get<ExplorerSourceListResult>(`/api/sources/${encodeURIComponent(sourceId)}/list?path=${encodeURIComponent(path)}`);
    if (payload.success) writeCache(cacheKey, payload);
    return payload;
  }, []);

  const test = useCallback(async (sourceId: string): Promise<{ success: boolean; error?: string }> => {
    return api.post<{ success: boolean; error?: string }>(`/api/sources/${encodeURIComponent(sourceId)}/test`);
  }, []);

  return { sources, isAvailable, isLoading, error, refresh, list, test };
}
