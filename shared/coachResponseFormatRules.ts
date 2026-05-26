/**
 * Suffixe append au `tone_instructions` persona dans
 * `supabase/functions/coach-generate-response/handler.ts` pour cadrer le FORMAT
 * de la réponse coach.
 *
 * Vit dans `shared/` (pas dans `supabase/functions/_shared/`) parce que ce
 * fichier ne dépend d'aucun runtime Deno et doit pouvoir être testé / lu
 * depuis Node (Jest) sans setup particulier.
 *
 * Le LLM coach (via le workflow n8n) reçoit ces règles dans son system prompt
 * APRES le ton de persona et APRES le préfixe medical referral éventuel.
 * Cela aligne le format de réponse avec les nouvelles questions plus
 * attractives sélectionnées dans `shared/scanCoachIntent.ts` (top 3,
 * action n°1, 10 minutes, ce soir, plan 24h, routine simple) sans
 * nécessiter de redéploiement du workflow n8n.
 */

export const COACH_RESPONSE_FORMAT_INSTRUCTIONS =
  '\n\nResponse format rules (always follow):' +
  ' (1) Stay concise — at most 3 to 5 action_steps, each one ≤ 1 sentence and concrete.' +
  ' (2) If the user question mentions "top 3", "3 actions", "3 gestes", or "3 choses", return EXACTLY 3 action_steps.' +
  ' (3) If the user question mentions "10 minutes", "maintenant", "right now", "n°1" or "action n°1", lead with ONE immediate action the user can do in under 10 minutes; cap action_steps at 1-2.' +
  ' (4) If the user question mentions "ce soir", "tonight", "demain matin", or "tomorrow morning", anchor each action_step to that exact time window.' +
  ' (5) If the user question mentions "routine", "plan 24h", "plan", or "planning", prefer micro_routine or daily_schedule over a flat action_steps list.' +
  ' (6) Always include a short summary (1-2 sentences) AND one short encouragement line at the end.' +
  ' (7) Stay strictly in wellness self-improvement. NEVER give medical, diagnostic, or treatment advice. NEVER mention a pathology, a drug, or a clinical condition by name.' +
  ' (8) Avoid generic platitudes and long preambles. Every action_step must be doable today by the user.';

/**
 * Décore un persona en suffixant ses `toneInstructions` avec les règles
 * de format. Utilisé par le handler edge AVANT d'envoyer le payload à n8n.
 *
 * Convention d'ordre dans le pipeline complet :
 *   [MEDICAL_REFERRAL_PREFIX si urgence]  →  persona.toneInstructions  →  [FORMAT_RULES]
 *
 * Le format est append (pas prepend) pour que le préfixe medical reste en
 * tête du system prompt vu par le LLM.
 */
export function applyResponseFormatToPersona<
  T extends { toneInstructions: string },
>(persona: T): T {
  return {
    ...persona,
    toneInstructions: `${persona.toneInstructions}${COACH_RESPONSE_FORMAT_INSTRUCTIONS}`,
  };
}
