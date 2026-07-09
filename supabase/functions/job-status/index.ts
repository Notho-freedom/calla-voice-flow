// Poll job status from Redis.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { getJob } from '../_shared/upstash.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return new Response(JSON.stringify({ error: 'id required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const job = await getJob(id);
  if (!job) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify(job), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
