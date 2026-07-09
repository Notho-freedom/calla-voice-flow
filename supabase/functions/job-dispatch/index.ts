// Enqueue async jobs to QStash. Returns 202 + jobId immediately.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { enqueueJob, setJob, qstashEnabled } from '../_shared/upstash.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json();
    const { type, payload, delaySeconds, deduplicationId } = body ?? {};
    if (!type || typeof type !== 'string') {
      return new Response(JSON.stringify({ error: 'type required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const jobId = crypto.randomUUID();
    const now = Date.now();
    await setJob({ id: jobId, status: 'pending', createdAt: now, updatedAt: now });

    if (!qstashEnabled()) {
      return new Response(JSON.stringify({
        jobId, status: 'pending', warning: 'qstash_not_configured — set QSTASH_TOKEN and QSTASH_WORKER_URL',
      }), { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const result = await enqueueJob({ jobId, type, payload }, { delaySeconds, deduplicationId });
    if (!result.ok) {
      return new Response(JSON.stringify({ jobId, status: 'failed', error: result.reason }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ jobId, status: 'pending', messageId: result.messageId }), {
      status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
