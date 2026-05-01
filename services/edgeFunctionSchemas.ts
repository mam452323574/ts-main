import { z } from 'zod';

// Schémas Zod pour valider les réponses des Edge Functions critiques (P2-B Phase 2).
//
// Pourquoi ce fichier existe :
// `invokeAuthedEdgeFunction` retournait jusqu'à présent `responsePayload as TResponse`
// — un cast brut qui faisait confiance aveuglément au serveur. En cas de MITM,
// proxy hostile ou Edge Function compromise, l'app traitait le payload sans
// validation. On fournit ici des schémas pour les endpoints qui retournent des
// décisions d'autorisation ou des actions d'admin.
//
// Les call sites passent désormais le schéma via l'option `responseSchema`. Si
// le payload ne matche pas, `invokeAuthedEdgeFunction` lance une erreur
// `edge_function_invalid_response` au lieu de propager des données malformées.

// ---- Champs communs ----

const ISO_DATETIME = z.string().datetime({ offset: true });

const ModerationStateSchema = z.enum([
  'visible',
  'pending',
  'flagged',
  'reported',
  'hidden',
  'removed',
]);

const SocialCategorySchema = z.enum(['before_after', 'food', 'physique']);

// ---- social-moderate-content ----

export const SocialModerateContentResponseSchema = z.object({
  success: z.boolean(),
  content_id: z.string().min(1),
  moderation_state: ModerationStateSchema.nullable().optional(),
  moderation_reason: z.string().nullable().optional(),
  moderated_at: ISO_DATETIME.nullable().optional(),
});

// ---- social-reclassify-post ----

export const SocialReclassifyPostResponseSchema = z.object({
  success: z.boolean(),
  post_id: z.string().min(1),
  category: SocialCategorySchema,
});

// ---- social-moderate-user ----

export const SocialModerateUserResponseSchema = z.object({
  success: z.boolean(),
  target_user_id: z.string().min(1),
  action: z.string().min(1),
  affected_count: z.number().int().nonnegative().optional(),
});

// ---- social-eradicate-user-content ----

export const SocialEradicateUserResponseSchema = z.object({
  success: z.boolean(),
  target_user_id: z.string().min(1),
  removed_posts: z.number().int().nonnegative().optional(),
  removed_comments: z.number().int().nonnegative().optional(),
});

// ---- social-adjust-post-reactions ----

export const SocialAdjustPostReactionsResponseSchema = z.object({
  success: z.boolean(),
  post_id: z.string().min(1),
  admin_like_adjustment: z.number().int(),
  admin_dislike_adjustment: z.number().int(),
});

// ---- coach-generate-response (réponse partielle minimale) ----

export const CoachGenerateResponseSchema = z.object({
  entry_id: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  guidance: z.unknown().optional(),
  cached: z.boolean().optional(),
}).passthrough();

// Helper : enveloppe schéma de succès dans un union avec un payload d'erreur
// minimal pour les endpoints qui peuvent renvoyer { error: ..., code: ... } en
// 200. La plupart de nos Edge Functions throw HTTP != 200 sur erreur, donc ce
// helper n'est utilisé que si nécessaire.
export function withEdgeFunctionErrorEnvelope<T extends z.ZodTypeAny>(success: T) {
  return z.union([
    success,
    z.object({
      error: z.string(),
      code: z.string().optional(),
      details: z.unknown().optional(),
    }),
  ]);
}
