# Audit Sécurité — Zone Réglages / Paramètres + Compte Admin

**Date :** 2026-04-26
**Périmètre :** écrans `app/settings.tsx`, `app/notification-settings.tsx`, `screens/AdminSocialModerationScreen.tsx`, composants `components/social/admin/*`, Edge Functions `social-admin-*`, migrations RLS `user_profiles` / `account_tier`.
**Complément à :** [BACKEND_SECURITY_AUDIT.md](BACKEND_SECURITY_AUDIT.md), [FRONTEND_SECURITY_AUDIT.md](FRONTEND_SECURITY_AUDIT.md), [SECURITY_AUDIT_SUPABASE.md](SECURITY_AUDIT_SUPABASE.md), [TRUST_BOUNDARIES.md](TRUST_BOUNDARIES.md).

---

## Résumé exécutif

Audit ciblé sur la zone settings utilisateur et les fonctions du compte admin (modération sociale), suite au retrait de la MFA (2026-04-25). **Un finding P0 critique exploitable en production** : la migration de désactivation de la MFA a recréé la policy RLS UPDATE de `user_profiles` sans la clause de protection contre l'auto-promotion en `account_tier='admin'`, permettant à n'importe quel utilisateur authentifié de devenir admin avec un seul UPDATE. 4 findings additionnels P1/P2/P3 documentent des défauts de defense-in-depth (admin gate frontend, rate limit absent, audit trail partiel, flows compte manquants).

### Actions prioritaires

1. **P0 — S-01** : restaurer la protection `account_tier` dans la policy RLS UPDATE de `user_profiles` + ajouter un trigger BEFORE UPDATE qui survit aux régressions futures. **Fix appliqué** dans [20260426120000_restore_account_tier_protection.sql](supabase/migrations/20260426120000_restore_account_tier_protection.sql).
2. **P1 — S-02** : remplacer le `useEffect` redirect par un guard bloquant dans `AdminSocialModerationScreen` pour ne jamais rendre l'arbre admin avant confirmation du tier. **Fix appliqué**.
3. **P2 — S-03** : ajouter un rate limit glissant aux 3 Edge Functions `social-admin-*` (eradicate=5/h, moderate=30/h, adjust=60/h). **Fix appliqué**.
4. **P2 — S-04** : compléter l'audit trail admin via `admin_audit_events` à chaque action destructrice. **Fix appliqué**.
5. **P2 — S-05 à S-09** : backlog (delete account, change password, JWT custom claim, etc.) — détaillé en fin de rapport.

---

## Findings détaillés

### S-01 — Auto-promotion en admin via UPDATE direct sur `user_profiles` [P0 — Critique]

**Fichier (origine de la régression) :** [supabase/migrations/20260425220000_disable_mfa_aal2.sql:31-36](supabase/migrations/20260425220000_disable_mfa_aal2.sql:31)

```sql
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);
```

**Description.**

Le `WITH CHECK` ne contient **aucune protection sur `account_tier`**. La constraint de table `user_profiles_account_tier_check CHECK (account_tier IN ('free','premium','admin'))` ([20260305161200_add_admin_tier.sql:7](supabase/migrations/20260305161200_add_admin_tier.sql:7)) accepte la valeur `'admin'`. Le client supabase-js peut donc envoyer un UPDATE direct qui mute son propre tier.

Régression vs. la migration originale [20251015155634:115-122](supabase/migrations/20251015155634_add_user_profiles_enhancements.sql:115) qui avait :

```sql
WITH CHECK (
  auth.uid() = id AND
  account_tier = (SELECT account_tier FROM user_profiles WHERE id = auth.uid())
)
```

Chronologie de la régression (4 réécritures successives) :

| Date | Migration | État de la protection |
|------|-----------|----------------------|
| 2025-10-15 | [20251015155634:115](supabase/migrations/20251015155634_add_user_profiles_enhancements.sql:115) | ✅ Protection présente (`account_tier = (SELECT …)`) |
| 2025-10-16 | [20251016135828:132-136](supabase/migrations/20251016135828_fix_rls_performance_and_security_issues.sql:132) | ❌ Protection retirée (commentaire "consolidate duplicate policies"). Masquée tant que les tables sensibles étaient gatées par AAL2. |
| 2026-04-24 | [20260424090000:185-211](supabase/migrations/20260424090000_security_hardening.sql:185) | ❌ Protection toujours absente, mais accès gaté par `auth.jwt()->>'aal' = 'aal2'`. |
| 2026-04-25 | [20260425220000:31-36](supabase/migrations/20260425220000_disable_mfa_aal2.sql:31) | ❌ **MFA retirée → vulnérabilité exploitable depuis aujourd'hui**. |

**Exploitation.**

Une seule ligne JavaScript depuis n'importe quel client authentifié (mobile ou web) :

```js
const { data, error } = await supabase
  .from('user_profiles')
  .update({ account_tier: 'admin' })
  .eq('id', user.id)
  .select();
// data[0].account_tier === 'admin'
```

L'UPDATE passe la RLS (`auth.uid() = id`), passe la check constraint, et l'attaquant relit immédiatement son nouveau tier.

**Impact en cascade.**

1. **Edge Functions admin débloquées.** [phase2Auth.ts:441-457](supabase/functions/_shared/phase2Auth.ts:441) — `requireAdminUserProfile` lookup la DB et accepte tout user dont `account_tier='admin'`. L'attaquant peut alors appeler :
   - [social-admin-eradicate-user](supabase/functions/social-admin-eradicate-user/index.ts) → suppression cascade des posts/comments d'un utilisateur ciblé + ban permanent + suppression avatar/assets.
   - [social-admin-moderate-user](supabase/functions/social-admin-moderate-user/index.ts) → ban/unban arbitraire, retrait avatars.
   - [social-admin-adjust-post-reactions](supabase/functions/social-admin-adjust-post-reactions/index.ts) → manipulation des compteurs publics like/dislike.
2. **Quotas scans débloqués.** [20260424090000:412-414](supabase/migrations/20260424090000_security_hardening.sql:412) — `WHEN v_account_tier = 'admin' THEN 20` → 20 scans IA gratuits/jour (vs 3 pour premium, 1 pour free).
3. **Politique `user_bans`.** [20260418141300_add_user_bans.sql:33-42](supabase/migrations/20260418141300_add_user_bans.sql:33) — `Admins can manage user bans … FOR ALL` → l'attaquant peut ban/unban arbitrairement n'importe qui.
4. **UI admin moderation.** [app/settings.tsx:350](app/settings.tsx:350) — entrée "modération admin" devient visible.

**Recommandation.**

Double protection, appliquée dans la migration [20260426120000_restore_account_tier_protection.sql](supabase/migrations/20260426120000_restore_account_tier_protection.sql) :

1. **Policy RLS UPDATE** restaurée avec la clause `account_tier = (SELECT account_tier …)` qui force l'égalité OLD vs DB.
2. **Trigger BEFORE UPDATE OF account_tier** qui RAISE EXCEPTION si `auth.uid() = OLD.id`. Les service_role clients (Edge Functions, RevenueCat webhook, scripts d'admin manuel) ont `auth.uid() IS NULL` donc passent. Defense-in-depth qui survit à toute régression future de la policy.

**Statut :** ✅ Corrigé.

---

### S-02 — Admin gate frontend repose sur `useEffect` redirect [P1 — Haut]

**Fichier :** [screens/AdminSocialModerationScreen.tsx:124-128](screens/AdminSocialModerationScreen.tsx:124) (avant fix)

```tsx
useEffect(() => {
  if (!loading && userProfile && !isAdmin) {
    router.replace('/(tabs)' as any);
  }
}, [isAdmin, loading, router, userProfile]);
```

**Description.**

Le composant montait l'arbre admin complet (toolbar, queue de modération, boutons d'eradicate/ban) puis redirigeait via `useEffect` au cycle suivant. Un utilisateur non-admin pouvait voir brièvement la liste des targets et copier un `target_user_id` avant la navigation. Le RLS Supabase reste autoritaire (les requêtes mutation reviennent en 403 `admin_required`), mais c'était un défaut UX/info-disclosure et un signal de fragilité du gate côté client.

Le hook global [useProtectedRoute.ts:350-353](hooks/useProtectedRoute.ts:350) couvre déjà les routes admin via `isAdminRoute(currentSegment)`, donc le redirect du composant lui-même est redondant mais utile en defense-in-depth.

**Exploitation.**

Faible. Un utilisateur free naviguant manuellement vers `/admin-social-moderation` voyait pendant ~50 ms (1 frame React) la structure de la page, les compteurs `pending/flagged/reported` (révélés par la query) et les `target_user_id` exposés. Aucune mutation possible (le backend bloque).

**Impact.**

- Disclosure mineur de la structure interne (types, IDs).
- Signal négatif d'audit : un attaquant qui inspecte le bundle JS apprend que le gate frontend est mou.

**Recommandation.**

Bloquer le rendering tant que `loading || !userProfile || !isAdmin`. Patch appliqué :

```tsx
if (loading || !userProfile || !isAdmin) {
  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="admin-social-guard-blocking">
      <View style={styles.guardBlockingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    </SafeAreaView>
  );
}
```

Le `useEffect` redirect reste pour la navigation effective (defense-in-depth). Les hooks `useSocialAdminModeration(selectedFilter, isAdmin)` ne tirent jamais leurs queries quand `isAdmin === false` (cf. paramètre `isAdmin` du hook).

**Statut :** ✅ Corrigé.

---

### S-03 — Pas de rate limit sur les Edge Functions admin destructrices [P2 — Moyen]

**Fichiers :**
- [supabase/functions/social-admin-eradicate-user/index.ts](supabase/functions/social-admin-eradicate-user/index.ts)
- [supabase/functions/social-admin-moderate-user/index.ts](supabase/functions/social-admin-moderate-user/index.ts)
- [supabase/functions/social-admin-adjust-post-reactions/index.ts](supabase/functions/social-admin-adjust-post-reactions/index.ts)

**Description.**

Les 3 Edge Functions admin acceptaient un nombre illimité d'appels par admin authentifié. Le seul filet existant était la file de modération (`social_moderation_queue`) qui sérialise un peu les actions de revue, mais `social-admin-eradicate-user` et `social-admin-moderate-user` peuvent être appelées hors queue avec n'importe quel `target_user_id`.

**Exploitation (admin compromis ou rogue).**

```bash
# Eradique 100 users en boucle
for uid in $(cat targets.txt); do
  curl -X POST https://qpogulljnnacrxdjbwiz.supabase.co/functions/v1/social-admin-eradicate-user \
    -H "Authorization: Bearer $ADMIN_JWT" \
    -d "{\"target_user_id\":\"$uid\"}"
done
```

Sans rate limit, un attaquant qui a obtenu un compte admin (via S-01, ou phishing d'un admin légitime) peut détruire massivement le contenu social et bannir des utilisateurs en série avant qu'un humain ne puisse révoquer le tier admin.

**Impact.**

- Suppression cascade massive (posts + commentaires + assets storage) non triviale à réparer.
- Bans en chaîne perturbent la communauté.
- Manipulation du feed (S-09) si reactions adjustment spammé.

**Recommandation.**

Helper `enforceAdminRateLimit` ajouté dans [phase2Auth.ts](supabase/functions/_shared/phase2Auth.ts), qui compte les actions du même `actor_id` matchant un `actionPattern` LIKE dans la fenêtre glissante (utilise la table `admin_audit_events` déjà existante depuis [20260425143000](supabase/migrations/20260425143000_edge_worker_and_admin_queue_hardening.sql)). Limites configurées :

| Edge Function | Limite | Fenêtre | Justification |
|---------------|--------|---------|---------------|
| `social-admin-eradicate-user` | 5 | 1 h glissante | Action la plus destructrice (cascade + ban + storage). |
| `social-admin-moderate-user` | 30 | 1 h glissante | Ban/revoke/remove-avatar — opérations sensibles mais souvent légitimes en vague de modération. |
| `social-admin-adjust-post-reactions` | 60 | 1 h glissante | Non destructeur, mais évite le spam de manipulation feed. |

Pattern fail-open en cas d'erreur lecture compteur (logging + laisser passer) : préfère la disponibilité légitime à un blocage de modérateur sur incident réseau.

**Statut :** ✅ Corrigé.

---

### S-04 — Audit trail admin partiel [P2 — Moyen]

**Fichier :** [supabase/functions/_shared/phase2Auth.ts:441-457](supabase/functions/_shared/phase2Auth.ts:441) (avant fix)

**Description.**

Avant le fix, seules les actions de modération produisaient un événement dans `social_moderation_events` (table métier dédiée modération sociale). Aucune action n'était enregistrée dans la table générique `admin_audit_events` ([20260425143000:26-43](supabase/migrations/20260425143000_edge_worker_and_admin_queue_hardening.sql:26)) — pourtant créée précisément pour ça. Conséquence :

- Pas de timeline `(actor_id, created_at, action, metadata)` pour incident response.
- Pas de mécanisme de rate limit (S-03 dépendait de cette table).
- Pas de signal d'audit pour un admin compromis qui agirait en dehors de la file de modération.

**Exploitation.**

Un admin malveillant qui exécute des `social_admin_eradicate_user` n'apparaît dans aucune table consultable hors `social_moderation_events.metadata.source = 'social_admin_eradicate_user'`. Pour un incident response, les requêtes nécessaires sont éclatées sur plusieurs tables sans jointure stable.

**Impact.**

- Forensics post-incident plus lent.
- Pas de tableau de bord centralisé "actions admin par jour/par actor".
- Empêche l'implémentation efficace de S-03 (rate limit).

**Recommandation.**

Helper `logAdminAuditEvent(client, { actorId, action, requestId, metadata })` ajouté dans [phase2Auth.ts](supabase/functions/_shared/phase2Auth.ts). Câblé dans les 3 Edge Functions admin avec :

- `action` ∈ `{social_admin_eradicate_user, social_admin_moderate_user_ban_user, social_admin_moderate_user_revoke_ban, social_admin_moderate_user_remove_avatar, social_admin_adjust_post_reactions}`
- `metadata` jsonb : target_user_id / post_id / event_id / scope / counts → assez pour reconstituer l'action sans relire les RPC.

Le logger est fail-open (log console + continue) pour ne jamais bloquer une action admin légitime sur un incident DB.

**Statut :** ✅ Corrigé.

---

### S-05 — Absence de change password / change email / delete account [P2 — Moyen]

**Fichier :** [app/settings.tsx](app/settings.tsx) — section dangereuse limitée à "Sign out".

**Description.**

L'écran settings n'expose aucun flow de gestion du compte au-delà de l'avatar / locale / notifications :

- Pas de change password in-app → en cas de mot de passe compromis, l'utilisateur dépend du flow magic link reset, qui implique un round-trip email.
- Pas de change email → impossible de migrer un email perdu sans contacter le support.
- Pas de delete/désactivation de compte → **non-conformité GDPR Art. 17 (droit à l'effacement) et CCPA**.

**Exploitation.**

Pas une faille de sécurité directe, mais :
- **Compliance** : obligation légale GDPR/CCPA de fournir un mécanisme de delete account self-service.
- **UX sécurité** : un user qui sait son mot de passe compromis n'a aucun moyen rapide de le changer dans l'app.

**Impact.**

- Risque légal (amendes GDPR jusqu'à 4% CA mondial).
- Friction support (chaque demande de delete arrive par email/Slack).
- Posture sécurité dégradée pour les compromissions de mot de passe.

**Recommandation.**

Backlog dédié (hors scope de cet audit) :
- Ajouter `app/account-management.tsx` avec sections :
  - Change password (re-auth requis avec mot de passe actuel via `supabase.auth.signInWithPassword`).
  - Change email (re-auth + envoi email confirmation via `supabase.auth.updateUser({ email })`).
  - Delete account (re-auth + double confirmation + appel d'une Edge Function `account-delete` qui : révoque tous les bans actifs, anonymise les posts, supprime les scans, supprime user_profiles row, appelle `auth.admin.deleteUser`).
- Documenter le flow dans `PRIVACY_POLICY.md`.

**Statut :** ⏳ Non corrigé — backlog produit + compliance.

---

### S-06 — Mutations settings sans re-auth [P3 — Faible]

**Fichier :** [app/settings.tsx:183-196](app/settings.tsx:183), [contexts/AuthContext.tsx:1572-1627](contexts/AuthContext.tsx:1572)

**Description.**

Les mutations exposées dans settings (avatar, locale, notification settings, coach persona) sont toutes faites sans re-vérification du mot de passe. C'est cohérent avec l'usage (changements bénins, pas de PII), mais la liste blanche `upsertSafeProfile` ([AuthContext.tsx:864-882](contexts/AuthContext.tsx:864)) inclut `username` et `avatar_url` — un attaquant ayant volé un device déverrouillé pourrait modifier l'identité visible (déguisement social). Avec la suppression de la MFA, le mot de passe est désormais le seul facteur de protection.

**Exploitation.**

Cible : device déverrouillé ou session AsyncStorage exfiltrée (cf. [FRONTEND_SECURITY_AUDIT.md](FRONTEND_SECURITY_AUDIT.md) P0-1 — fixé en SecureStore depuis 2026-04-25). Un attaquant changerait `username` + `avatar_url` pour usurper visuellement un autre utilisateur du feed social.

**Impact.**

Faible (avatar / username changes sont visibles, réversibles, et l'historique se trouve dans `social_moderation_queue` via `author_username`).

**Recommandation.**

- Pour les changes sensibles futurs (S-05), exiger re-auth via `supabase.auth.reauthenticate()` ou prompt password.
- Optionnel : ajouter un cooldown 24 h après change username pour éviter le whiplash.

**Statut :** ⏳ Defense-in-depth — backlog.

---

### S-07 — `account_tier` pas en JWT custom claim [P3 — Faible]

**Fichier :** [supabase/functions/_shared/phase2Auth.ts:441-457](supabase/functions/_shared/phase2Auth.ts:441)

**Description.**

`requireAdminUserProfile` fait un lookup DB à chaque appel d'Edge Function admin pour vérifier le tier. C'est correct (la DB est la source de vérité), mais :
- Dépendance dure à la disponibilité DB pour chaque action admin.
- Pas de mécanisme de révocation immédiate du tier (un JWT issued à un admin reste valide jusqu'à son expiration ; la révocation se fait par UPDATE DB qui sera lue au prochain appel — donc OK en pratique).

L'alternative (custom JWT claim `role: 'admin'` injecté via Supabase Auth Hooks) éviterait le lookup mais nécessiterait une logique de refresh token sur changement de tier.

**Exploitation.**

Aucune faille directe — au contraire, le lookup DB est plus sûr qu'un claim figé dans le JWT. Mention en defense-in-depth pour future migration vers custom claims si performance pose problème.

**Impact.**

Performance (1 round-trip DB par appel admin) plus que sécurité.

**Recommandation.**

Pas de changement immédiat. Garder le pattern actuel jusqu'à preuve d'un bottleneck mesurable.

**Statut :** ⏳ Hardening optionnel — backlog faible priorité.

---

### S-08 — Menu admin expose l'existence du rôle admin [P3 — Faible]

**Fichier :** [app/settings.tsx:350-366](app/settings.tsx:350)

```tsx
{userProfile.account_tier === 'admin' && (
  <TouchableOpacity ...>
    <ShieldAlert color={colors.primary} size={20} />
    <Text style={styles.menuItemText}>{t('settings.admin_moderation')}</Text>
    <Text style={styles.menuItemSubtext}>{t('settings.admin_moderation_subtitle')}</Text>
  </TouchableOpacity>
)}
```

**Description.**

UX classique mais légèrement bavarde : un admin compromis (phishé, device volé) sait immédiatement qu'il dispose de privilèges élevés et où les exercer. Pour un attaquant moins motivé, voir le bouton "modération admin" est un signal explicite.

**Exploitation.**

Réduit le temps entre compromission et exploitation (l'attaquant n'a pas à chercher).

**Impact.**

Très faible. La présence du tier admin se détecte aussi via les quotas (20 scans/jour) ou les Edge Functions accessibles.

**Recommandation.**

Pas de changement nécessaire. Note : si un jour l'application a plusieurs rôles fins (modérateur posts seul, modérateur comments seul, etc.), le menu devra les distinguer plutôt que d'afficher un blob "admin".

**Statut :** ⏳ UX hardening — pas d'action immédiate.

---

### S-09 — Pas de beacon serveur sur tentative d'accès non-admin [P3 — Faible]

**Fichier :** [screens/AdminSocialModerationScreen.tsx:124-128](screens/AdminSocialModerationScreen.tsx:124)

**Description.**

Le redirect non-admin dans `useEffect` (et le guard du fix S-02) ne loggue rien côté serveur. Un attaquant peut tester l'URL `/admin-social-moderation` autant qu'il veut, aucune trace ne remonte côté observabilité.

**Exploitation.**

Aucune (le backend bloque toute mutation), mais perte d'un signal IDS/SIEM utile pour détecter un compte qui a été compromis et que l'attaquant teste les routes privilégiées avant d'exfiltrer.

**Impact.**

Faible — relèvement de signaux pour la surveillance.

**Recommandation.**

Backlog : envoyer un beacon vers une nouvelle Edge Function `report-suspicious-access` avec `(user_id, route, timestamp, segment)`. Stocker dans une table `suspicious_access_log` consultée par les admins. Threshold : 3 tentatives admin/heure d'un même non-admin → email warning à l'utilisateur (peut-être hijacké) + log SIEM.

**Statut :** ⏳ Backlog observabilité.

---

## Récapitulatif

| ID | Titre | Sévérité | Statut |
|----|-------|----------|--------|
| S-01 | Auto-promotion admin via UPDATE direct user_profiles | **P0** | ✅ Corrigé |
| S-02 | Admin gate frontend `useEffect` redirect | P1 | ✅ Corrigé |
| S-03 | Pas de rate limit Edge Functions admin | P2 | ✅ Corrigé |
| S-04 | Audit trail admin partiel | P2 | ✅ Corrigé |
| S-05 | Absence change password / email / delete account | P2 | ⏳ Backlog |
| S-06 | Mutations settings sans re-auth | P3 | ⏳ Backlog |
| S-07 | `account_tier` pas en JWT custom claim | P3 | ⏳ Hardening |
| S-08 | Menu admin expose le rôle admin | P3 | ⏳ Note UX |
| S-09 | Pas de beacon serveur sur accès non-admin | P3 | ⏳ Backlog |

## Vérification

### Test du fix P0 (S-01)

Local Supabase recommandé (cf. [feedback pentest tooling](C:/Users/maloh/.claude/projects/C--Users-maloh-Desktop-TSE-main-TSE-main/memory/feedback_pentest_tooling.md)) :

```bash
supabase start
supabase db reset  # applique toutes les migrations
```

Test manuel via psql avec un user authentifié :

```sql
-- Simuler un user authentifié (anon JWT mock)
SET request.jwt.claims TO '{"sub":"<UUID-test-user>","role":"authenticated"}';
SET ROLE authenticated;

-- Doit échouer (RLS WITH CHECK + trigger)
UPDATE public.user_profiles
SET account_tier = 'admin'
WHERE id = '<UUID-test-user>';
-- ERROR: Self-promotion of account_tier is not allowed

-- Doit passer (champ safe)
UPDATE public.user_profiles
SET avatar_url = 'avatar:nova'
WHERE id = '<UUID-test-user>';
-- OK
```

### Test du guard frontend (S-02)

```bash
npm test -- __tests__/hooks/useProtectedRoute.admin.test.tsx
```

Test manuel : se connecter en `account_tier='free'` → naviguer vers `/admin-social-moderation` → loader visible jusqu'au redirect, aucune queue/action admin rendue.

### Test rate limit (S-03)

```bash
ADMIN_JWT="<jwt>"
URL="https://qpogulljnnacrxdjbwiz.supabase.co/functions/v1"

for i in {1..10}; do
  curl -sS -X POST "$URL/social-admin-eradicate-user" \
    -H "Authorization: Bearer $ADMIN_JWT" \
    -H "Content-Type: application/json" \
    -d '{"target_user_id":"00000000-0000-0000-0000-000000000000"}' \
  | jq -r '.error.code // .success'
  sleep 0.2
done
```

Attendu : appels 1–5 retournent une erreur métier (`post_not_found` ou `social_user_eradication_failed`), appels 6–10 retournent `admin_rate_limit_exceeded` (HTTP 429).

### Audit trail (S-04)

Après tests :

```sql
SELECT actor_id, action, request_id, metadata, created_at
FROM public.admin_audit_events
ORDER BY created_at DESC
LIMIT 20;
```

Doit lister une entrée par appel admin avec `metadata` non vide.

### Non-régression

```bash
npm test                                    # Jest mobile
supabase db lint                            # nouveau migration sans warning
# Supabase Studio → Advisors → Security → vérifier pas de nouveau warning RLS
```

---

**Auteur :** audit automatisé (Claude) — 2026-04-26.
**Référence dans memory :** `project_healthscan.md` (audits sécurité progressifs).
