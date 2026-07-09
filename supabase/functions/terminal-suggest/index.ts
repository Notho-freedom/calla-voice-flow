// Terminal AI backend — modes: suggest, agent, explain, chat.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { cacheGet, cacheSet, hashKey, redisEnabled } from '../_shared/upstash.ts';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'content-type': 'application/json' },
    status,
  });
}

async function callAI(system: string, user: string, opts: { json?: boolean } = { json: true }) {
  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Lovable-API-Key': LOVABLE_API_KEY!,
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      ...(opts.json !== false ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`gateway ${res.status}: ${txt.slice(0, 240)}`);
  }
  const payload = await res.json();
  return payload?.choices?.[0]?.message?.content || '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) return jsonResponse({ error: 'LOVABLE_API_KEY missing' }, 500);

    const body = await req.json();
    const {
      mode = 'suggest',
      history = [],
      lastCommand = '',
      lastOutput = '',
      lastCode = 0,
      cwd = '',
      profile = 'powershell',
      prompt = '',
      goal = '',
      iteration = 0,
      projectContext = '',
      messages = [],
    } = body;

    // ── AGENT MODE ──────────────────────────────────────────────
    if (mode === 'agent') {
      const shellRules = profile === 'powershell'
        ? `SHELL ACTIF : PowerShell (Windows). Syntaxe OBLIGATOIRE :
- Listing : Get-ChildItem (alias ls, dir OK) — JAMAIS "dir /ad", "dir /s" (syntaxe cmd, échoue en PS).
- Filtrer dossiers : Get-ChildItem -Directory. Fichiers : Get-ChildItem -File. Récursif : -Recurse.
- Chaînage : ";" ou "|" — JAMAIS "&&" ni "||" (PowerShell <7 les rejette avec "n'est pas un séparateur d'instruction valide").
- Test existence : Test-Path. Créer dossier : New-Item -ItemType Directory -Path X -Force. Supprimer : Remove-Item -Recurse -Force.
- Trouver fichiers : Get-ChildItem -Recurse -Filter *.ext, ou Get-ChildItem -Recurse -Include *.json.
- Variables d'env : $env:USERPROFILE, $HOME. Chemin courant : Get-Location ou $PWD.Path.
- Encodage : ajoute -Encoding UTF8 pour Out-File / Set-Content.`
        : profile === 'cmd'
        ? `SHELL ACTIF : cmd.exe. Utilise dir, cd, mkdir, del, findstr. Chaînage & ou &&. Pas de PowerShell (pas de Get-ChildItem).`
        : `SHELL ACTIF : ${profile} (bash-like). Utilise ls, find, mkdir -p, rm -rf, grep -r. Chaînage && / ||. Pas de Get-ChildItem.`;

      const system = `Tu es un AGENT TERMINAL AUTONOME expert, opérant sur la machine RÉELLE de l'utilisateur avec accès complet au shell ${profile}.

PHILOSOPHIE :
- Tu as accès à TOUTE la machine via le terminal. Tu peux explorer, lister, chercher, créer, exécuter — sans jamais demander la permission ni le contexte à l'utilisateur.
- L'utilisateur t'a donné un objectif ; à toi de le décomposer et de l'atteindre par toi-même. INITIATIVE = obligatoire.
- Si tu manques de contexte (où sont les projets ? quel est le CWD ?), EXPLORE : commence par lister le répertoire courant, puis les sous-dossiers, cherche des marqueurs (package.json, .git, *.csproj, requirements.txt, pom.xml, Cargo.toml, go.mod).
- Ne pose JAMAIS de question à l'utilisateur. Chaque itération = une commande d'exploration ou d'action.

${shellRules}

FORMAT DE RÉPONSE (STRICT) :
JSON compact uniquement, aucun texte autour : {"action":"run|done|abort","command":"...","reason":"...","summary":"...","step":"..."}

- action="run" : propose UNE commande shell prête à exécuter (par défaut, presque toujours).
- action="done" : UNIQUEMENT si la dernière sortie prouve que l'objectif est atteint.
- action="abort" : INTERDIT avant l'itération 5 sauf danger réel. Un objectif vague n'est PAS un motif d'abandon — explore d'abord.
- "step" : verbe d'action court (3–6 mots) — "Exploration du CWD", "Recherche de projets", "Correction syntaxe PowerShell".
- "reason" : phrase courte expliquant CE QUE tu fais et POURQUOI.

GESTION DES ERREURS :
- Si la dernière commande a échoué (code ≠ 0), LIS la sortie d'erreur, identifie la cause exacte, et corrige avec une commande différente.
- Erreurs typiques PowerShell : "n'est pas un séparateur d'instruction valide" → tu as utilisé && ou || : remplace par ";" ou sépare en 2 étapes. "ItemNotFoundException C:\\ad" → tu as utilisé "dir /ad" (syntaxe cmd) : utilise "Get-ChildItem -Directory".
- Ne répète JAMAIS deux fois la même commande qui vient d'échouer.

INTERDITS :
- Commandes destructives sans besoin (rm -rf /, format, dd if=..., mkfs, shutdown, > /dev/sd*).
- Commandes interactives bloquantes (nano, vim, top, ssh sans -o BatchMode=yes, npm install sans --yes s'il y a des prompts).
- Poser une question à l'utilisateur.
- Abandonner à l'itération 1, 2, 3 ou 4.

EXEMPLES DE DÉCOMPOSITION :
- "liste mes projets" → itér.1: Get-ChildItem -Directory | Select Name → itér.2: Get-ChildItem -Recurse -Depth 2 -Filter package.json → itér.3: done avec résumé des projets trouvés.
- "crée le dossier test" → itér.1: New-Item -ItemType Directory -Path test -Force → itér.2: done.
- "trouve les gros fichiers" → itér.1: Get-ChildItem -Recurse -File | Sort-Object Length -Descending | Select -First 10 Name,Length → itér.2: done.`;

      const user = `OBJECTIF : ${goal}
CWD : ${cwd}
ITÉRATION : ${iteration}
${projectContext ? `CONTEXTE PROJET :\n${projectContext}\n` : ''}
DERNIÈRE COMMANDE : ${lastCommand || '(aucune)'}
CODE RETOUR : ${lastCode}
SORTIE (fin, tronquée) :
${(lastOutput || '(vide)').slice(-1800)}

Décide de la prochaine action.`;

      const raw = await callAI(system, user);
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(raw); } catch { /* ignore */ }
      let action = ['run', 'done', 'abort'].includes(parsed.action as string) ? (parsed.action as string) : 'abort';
      // Sécurité : ne jamais abort dès l'itération 1 si on peut essayer une commande
      if (action === 'abort' && iteration <= 1 && typeof parsed.command === 'string' && parsed.command.trim()) {
        action = 'run';
      }
      return jsonResponse({
        action,
        command: typeof parsed.command === 'string' ? parsed.command : '',
        reason: typeof parsed.reason === 'string' ? parsed.reason : '',
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        step: typeof parsed.step === 'string' ? parsed.step : '',
      });
    }

    // ── EXPLAIN MODE ────────────────────────────────────────────
    if (mode === 'explain') {
      const cacheKey = `tsg:explain:${profile}:${hashKey(prompt)}`;
      if (redisEnabled()) {
        const hit = await cacheGet<{ explanation: string }>(cacheKey);
        if (hit) return jsonResponse({ ...hit, cached: true });
      }
      const system = `Tu es un expert shell (${profile}). Explique une commande en 3-6 lignes claires en français. Structure : rôle, options clés, effet, risques éventuels. Réponds JSON : {"explanation":"..."}`;
      const raw = await callAI(system, `Commande : ${prompt}`);
      let parsed: { explanation?: string } = {};
      try { parsed = JSON.parse(raw); } catch { /* ignore */ }
      const out = { explanation: parsed.explanation || '' };
      if (out.explanation) await cacheSet(cacheKey, out, 60 * 60 * 24); // 24h
      return jsonResponse(out);
    }

    // ── CHAT MODE (conversationnel, non-agent) ──────────────────
    if (mode === 'chat') {
      const shellHint = profile === 'powershell'
        ? 'PowerShell (Get-ChildItem, New-Item, Test-Path ; PAS de && ni de "dir /ad" — utilise ";" et Get-ChildItem -Directory)'
        : profile === 'cmd' ? 'cmd (dir, mkdir, del, findstr ; chaînage & / &&)'
        : `${profile} (ls, find, mkdir -p, grep -r ; chaînage && / ||)`;
      const system = `Tu es Cognitive Assistant, IA experte intégrée à un terminal ${profile} sur la machine RÉELLE de l'utilisateur avec accès complet.

RÈGLES :
- Réponds en français, concis (2–8 lignes), ton chaleureux mais direct.
- Tu as accès à toute la machine via ce terminal. Ne demande JAMAIS "où sont vos projets ?" ou "dans quel environnement êtes-vous ?" — l'utilisateur est sur SA machine, tu peux tout explorer.
- Si on te pose une question qui exige une exécution ("détermine le rep actuel", "liste mes projets", "trouve X"), donne DIRECTEMENT la commande dans un bloc \`\`\`${profile} et ajoute une ligne "→ tape /run pour l'exécuter, ou 'ia --auto <objectif>' pour que je le fasse moi-même".
- Ne donne JAMAIS "la commande théorique" comme réponse à "détermine le rep" — donne la commande ET dis à l'utilisateur qu'il peut la lancer.
- Syntaxe shell : ${shellHint}.
- Pour tout objectif multi-étapes, suggère "ia --auto <objectif>" au lieu de dérouler manuellement.
- Markdown : blocs de code OK, pas de gros titres, pas de tableaux.`;
      const chatMessages = Array.isArray(messages) && messages.length
        ? messages
        : [{ role: 'user', content: prompt }];
      const conversation = chatMessages
        .map((m: { role: string; content: string }) => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'} : ${m.content}`)
        .join('\n\n');
      const raw = await callAI(system, conversation, { json: false });
      return jsonResponse({ reply: raw });
    }

    // ── SUGGEST MODE (défaut) ───────────────────────────────────
    const system = `Tu es un assistant terminal expert (${profile}). Propose des commandes sûres, concises, prêtes à exécuter. Si l'utilisateur donne un objectif, transforme-le en 1 à 5 commandes candidates. Sinon, déduis la prochaine commande utile depuis la dernière sortie. Réponds STRICTEMENT en JSON : {"suggestions":["cmd1","cmd2"]}. Pas d'explication.`;

    const user = `cwd: ${cwd}
historique récent : ${history.slice(-5).join(' | ')}
dernière commande : ${lastCommand}
objectif utilisateur : ${prompt}
sortie tronquée :
${(lastOutput || '').slice(-1000)}

Propose la ou les commandes suivantes utiles.`;

    const raw = await callAI(system, user);
    let suggestions: string[] = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.suggestions)) {
        suggestions = parsed.suggestions.filter((s: unknown) => typeof s === 'string').slice(0, 5);
      }
    } catch { /* ignore */ }

    // Cache suggestions when input is stable (no dynamic lastOutput noise).
    if (suggestions.length && !lastOutput && prompt) {
      const key = `tsg:suggest:${profile}:${hashKey(`${cwd}|${prompt}`)}`;
      await cacheSet(key, { suggestions }, 60 * 10); // 10 min
    }
    return jsonResponse({ suggestions });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message, suggestions: [] }, 200);
  }
});
