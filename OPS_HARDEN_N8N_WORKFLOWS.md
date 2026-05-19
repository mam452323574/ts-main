# OPS — Hardening des workflows n8n coach (N-A / N-B)

**Statut audit :** [COACH_SECURITY_AUDIT_2026_05.md](COACH_SECURITY_AUDIT_2026_05.md) N-A, N-B (P1).
**Workflows concernés :** [n8n/workflows/coach.json](n8n/workflows/coach.json), [n8n/workflows/coach-conversation.json](n8n/workflows/coach-conversation.json).

## Résumé de l'état actuel (audit 2026-05-19)

| Finding | Statut | Détail |
|---|---|---|
| **N-A** — Whitelist `persona.style_guide` | ✅ Appliqué dans `coach-conversation.json` (lookup table hardcodée dans le nœud "Normalize Coach Conversation Input", cf. `tmp/coach-conversation-normalize-CURRENT.js:17-21`). À **vérifier dans `coach.json`** — voir §1. |
| **N-B (retries)** — Resilience LLM | ✅ Présent — `retryOnFail: true`, `maxTries: 2`, `waitBetweenTries: 1000` sur 12 nœuds dans chaque workflow. |
| **N-B (timeouts)** — Plafond temps LLM | ⏳ **Manquant** — aucun `timeout` explicite sur les nœuds DeepSeek/LLM. Le runtime n8n par défaut peut tolérer plusieurs minutes par appel, créant un risque de saturation pool. Voir §2. |

## §1 — Vérifier N-A dans `coach.json`

Le workflow `coach-conversation.json` applique correctement la défense N-A via une lookup `PERSONA_STYLE_GUIDES` keyée par `persona_key` (jamais issue du payload). À vérifier dans `coach.json` (workflow `coach-generate-response`) :

### Procédure

1. Importer `coach.json` dans n8n UI (ou ouvrir le JSON).
2. Identifier le ou les nœuds Code "Build system prompt" / "Normalize input" qui construisent le `coach_prompt_system_text`.
3. Confirmer qu'**aucun de ces nœuds ne lit `$json.payload.persona.style_guide`** depuis le body du webhook.
4. Si une lecture existe, la remplacer par un mirror de la table `PERSONA_STYLE_GUIDES` (cf. [tmp/coach-conversation-normalize-CURRENT.js:22-59](tmp/coach-conversation-normalize-CURRENT.js:22)).

### Code à coller (si correction nécessaire)

```javascript
// Hard-coded mirror of shared/coachPersonas.ts COACH_PERSONAS.styleGuide.
// NEVER trust payload.persona.style_guide — that field is attacker-controlled
// if the webhook is reached directly (cf. C-04 HMAC ops). Keep in sync when
// adding a new persona.
const PERSONA_STYLE_GUIDES = {
  gentle_supportive: { opening: '...', cadence: '...', avoid: [...], emphasize: [...] },
  strict_tough: { opening: '...', cadence: '...', avoid: [...], emphasize: [...] },
  motivational_energetic: { opening: '...', cadence: '...', avoid: [...], emphasize: [...] },
  patient_calm: { opening: '...', cadence: '...', avoid: [...], emphasize: [...] },
  analytical_precise: { opening: '...', cadence: '...', avoid: [...], emphasize: [...] },
  playful_light: { opening: '...', cadence: '...', avoid: [...], emphasize: [...] },
};

const personaKey = typeof $json.persona_key === 'string'
  ? $json.persona_key
  : 'gentle_supportive';
const personaStyleGuide = PERSONA_STYLE_GUIDES[personaKey]
  ?? PERSONA_STYLE_GUIDES.gentle_supportive;

// Use `personaStyleGuide` for the prompt construction — never $json.payload.persona.style_guide.
```

Copier les valeurs exactes depuis [shared/coachPersonas.ts](shared/coachPersonas.ts) lignes 50, 72, 96, 116, 136, 160 (`styleGuide` blocks).

## §2 — Ajouter timeouts sur les nœuds LLM (N-B)

### Pourquoi

Sans `timeout`, un appel DeepSeek bloqué (réseau dégradé, API surchargée) garde un worker n8n occupé pendant le timeout par défaut (souvent 5 min). Avec 12 nœuds LLM par workflow × 2 workflows × utilisateurs concurrents, le pool peut saturer rapidement.

L'audit recommande **30 s timeout** comme valeur initiale (DeepSeek répond généralement en 2-8 s ; 30s capture la longue queue sans laisser traîner les vrais hangs).

### Procédure

Pour chaque workflow (`coach.json`, `coach-conversation.json`) :

1. Importer le JSON dans n8n UI.
2. Pour **chaque nœud DeepSeek / LangChain LLM** (12 nœuds par workflow — un par combinaison `persona × prompt_type`) :
   - Ouvrir le nœud → onglet "Settings" (icône engrenage).
   - Section "Workflow / Node settings".
   - Définir **`Execution Timeout`** = `30000` (millisecondes).
   - Conserver `retryOnFail = true`, `maxTries = 2`, `waitBetweenTries = 1000` (déjà en place).
3. Sauvegarder le workflow.
4. Exporter le JSON modifié et le committer dans `n8n/workflows/`.

### Alternative bulk : modifier le JSON directement

```bash
# Backup
cp n8n/workflows/coach.json n8n/workflows/coach.json.bak

# Patch : ajouter "executionTimeout": 30000 dans chaque nœud LangChain LLM
# (à automatiser via un script Node ou jq selon la structure exacte du JSON)
```

Pseudo-jq (à adapter aux noms de propriétés exacts de la version n8n) :

```jq
.nodes |= map(
  if .type == "@n8n/n8n-nodes-langchain.chainLlm"
  then . + { "executionTimeout": 30000 }
  else .
  end
)
```

### Validation

```bash
# Avant patch
grep -c '"executionTimeout":\s*30000' n8n/workflows/coach.json
# → 0

# Après patch
grep -c '"executionTimeout":\s*30000' n8n/workflows/coach.json
# → 12 (ou égal au nombre de nœuds LLM)
```

Tester en bloquant temporairement DeepSeek (firewall ou faux endpoint) :
- Appel coach via l'app → attendre 30s → l'Edge Function reçoit une erreur webhook → status `coach_provider_timeout` propagé à l'utilisateur.

Sans timeout, l'attente est de plusieurs minutes (workflow continue d'occuper le pool).

## Statut à mettre à jour après application

Une fois N-A vérifié et N-B appliqué en prod :

1. Éditer [COACH_SECURITY_AUDIT_2026_05.md](COACH_SECURITY_AUDIT_2026_05.md) — passer N-A et N-B de `🆕 Nouveau` à `✅ Corrigé YYYY-MM-DD`.
2. Éditer [SCANNER_COACH_AUDIT_2026_05.md](SCANNER_COACH_AUDIT_2026_05.md) annexes — référencer ces correctifs.

## Liens

- Normalisateur conversation (référence N-A) : [tmp/coach-conversation-normalize-CURRENT.js](tmp/coach-conversation-normalize-CURRENT.js)
- Personas server-side autoritaires : [shared/coachPersonas.ts](shared/coachPersonas.ts)
- Activation HMAC (préalable à la dégradation gracieuse N-A si webhook accessible direct) : [OPS_ACTIVATE_COACH_HMAC.md](OPS_ACTIVATE_COACH_HMAC.md)
- Audit complet : [COACH_SECURITY_AUDIT_2026_05.md §N-A, §N-B](COACH_SECURITY_AUDIT_2026_05.md)
