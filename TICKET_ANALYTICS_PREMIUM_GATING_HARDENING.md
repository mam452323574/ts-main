# Hardening Analytics Premium Gating côté serveur

- **Priorité :** P1 — hardening, à faire avant release publique
- **Type :** Sécurité / défense en profondeur
- **Domaine :** Analytics gating
- **Créé suite à :** QA Home / Analytics / Premium (2026-05-26)

## Contexte

Le gating Analytics actuel est cohérent et testé côté client/service, mais
il dépend du client pour le filtrage des métriques premium. Un client
modifié pourrait théoriquement appeler directement `scan_metrics` via
`supabase-js` et lire les colonnes premium, car la RLS Postgres ne filtre
pas colonne-par-colonne.

État actuel (preuves) :

- Source unique gating UI ↔ sanitation : `constants/premiumFields.ts`
  (`PREMIUM_LOCKED_ANALYTICS_METRIC_MAP`)
- Gating period serveur fail-closed : `services/api.ts:932-939` refuse
  `3months` / `1year` pour comptes gratuits
- Fail-closed tier resolution : `services/api.ts:807-825`
  (`loadAccountTierForAnalytics`)
- Sanitation client : `services/api.ts:836-862`
  (`sanitizeAnalyticsForFreeTier`) — zéroïse les champs premium et vide
  `superScanHistory`
- Limitation documentée en code : `services/api.ts:921-928`

## Objectif

Déplacer le vrai gating Analytics côté serveur pour qu'un compte gratuit
ne puisse jamais récupérer de métriques premium exploitables, même avec
un client modifié.

## Tâches techniques

1. **Créer une RPC Postgres `get_analytics_trends(period text)`** (ou
   Edge Function équivalente) qui agrège `scan_metrics` côté serveur.
2. **Résoudre le tier utilisateur** dans la RPC via
   `user_profiles.account_tier` (en utilisant `auth.uid()`, pas un
   paramètre client).
3. **Refuser les périodes premium** (`3months`, `1year`) pour les
   comptes gratuits — retourner une erreur typée équivalente à
   `analytics.premium_period_locked`.
4. **Filtrer les colonnes premium côté serveur** selon une source de
   vérité partagée avec `PREMIUM_LOCKED_FIELDS` (option : table de
   config `analytics_premium_fields`, ou hardcoder dans la RPC avec un
   commentaire pointant vers `constants/premiumFields.ts`).
5. **Retourner uniquement** les métriques autorisées pour le tier
   courant (jamais de zéros placeholder côté serveur).
6. **Restreindre l'accès direct à `scan_metrics`** :
   - Soit RLS qui interdit `SELECT` direct côté client et n'autorise
     que la RPC `SECURITY DEFINER`.
   - Soit revoke des droits `SELECT` sur la table aux rôles `anon` /
     `authenticated`.
7. **Migrer `services/api.ts:getAnalytics`** pour appeler la RPC à la
   place du `select` direct sur `scan_metrics`.
8. **Garder la sanitation client actuelle** (`sanitizeAnalyticsForFreeTier`)
   comme défense secondaire — ne pas la retirer.

## Critères d'acceptation

- Un compte gratuit ne peut pas lire `scan_metrics` directement
  (RLS / revoke).
- Un appel client modifié forçant `period = '3months'` est rejeté
  côté serveur avec une erreur typée.
- Un compte gratuit reçoit uniquement les champs non-premium dans la
  réponse de la RPC.
- Un compte premium reçoit l'intégralité du payload (parité fonctionnelle
  avec l'implémentation actuelle).
- Migration sans régression UI : `AnalyticsScreen` continue de
  fonctionner sans changement.

## Tests à ajouter

- **RPC unit / integration tests** (Supabase) :
  - free user → période standard → payload filtré, pas de colonnes
    premium
  - free user → période premium (`3months` / `1year`) → erreur
  - premium user → période standard → payload complet
  - premium user → période premium → payload complet
  - tier `admin` → traité comme premium
  - tier corrompu / null → fail-closed (free)
- **RLS / accès direct** :
  - `SELECT` direct sur `scan_metrics` depuis un JWT free → refus
  - `SELECT` direct depuis un JWT premium → refus (seule la RPC doit
    être autorisée)
- **Régression service `getAnalytics`** :
  - tests existants dans `__tests__/services/analyticsGating.test.ts`
    doivent continuer à passer (sanitation client reste défense
    secondaire)

## Hors scope

- Modifications UI dans `AnalyticsScreen` ou composants enfants.
- Refonte de la structure de `scan_metrics`.
- Changement du modèle d'agrégation côté client (`aggregateData` /
  bucket logic).
- Modification du flow purchases / RevenueCat.

## Références

- `services/api.ts:780-1141` — implémentation actuelle de `getAnalytics`
- `constants/premiumFields.ts` — source unique de vérité gating
- `__tests__/services/analyticsGating.test.ts` — tests gating actuels
- `REPORT_PREMIUM_LOGIC.md` — règles de gating produit
- QA report (2026-05-26) — Home / Analytics / Premium
