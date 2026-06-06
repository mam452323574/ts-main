# Audit cybersécurité Supabase - SelfLens

Date: 2026-04-25  
Périmètre: backend Supabase uniquement, incluant Edge Functions, SQL/RLS/RPC, Storage, webhooks, secrets serveur, rate limits, logs et configuration dashboard.

## Executive summary

Aucun P0 exploitable n'a été identifié pendant cette revue. Le backend a déjà de bonnes bases: usage centralisé du `service_role` côté Edge Functions, vérification admin côté serveur, RLS activée sur les tables clés, RPC exposées explicitement, callbacks frigo signés en HMAC, webhook RevenueCat authentifié et idempotent, et sanitisation des logs d'erreur.

> **Mise à jour 2026-04-26 (F-01 audit home)** — MFA et AAL2 ont été retirés (commits `1efd1b7`, `214323a`, migrations `20260425220000` à `20260425240000`). L'app tourne désormais en **AAL1 uniquement**. Les mentions "MFA AAL2" ci-dessous sont historiques. Compensating controls actifs : HIBP password check au signup (`before-user-created`, voir [`SETUP_AUTH_HOOK_HIBP.md`](SETUP_AUTH_HOOK_HIBP.md)), blacklist statique (`utils/passwordBlacklist.ts`), email verification, inactivity timeout 15 min, rate limit signup IP (`check-ip-signup`). Détails complets dans [`TRUST_BOUNDARIES.md`](TRUST_BOUNDARIES.md) section "Authentication Posture".

Les risques à traiter en priorité sont moins des failles "open door" que des points de durcissement production: protection contre mots de passe compromis à confirmer/activer dans Supabase Auth, limite de payload manquante sur `coach-generate-response`, configuration de déploiement Edge Functions non versionnée, jeton worker de modération statique, et endpoint admin de modération trop large. Les anciens résultats `tmp_supabase_advisors_final.json` signalent aussi 31 warnings `auth_rls_initplan` et 1 warning `multiple_permissive_policies`; le `db lint` distant lancé pendant cet audit est clean, donc ces warnings doivent être réconciliés avec le dashboard actuel.

## Checks exécutés

| Check | Résultat |
| --- | --- |
| `npx supabase db lint --linked --level warning` | OK, aucun schema error retourné. |
| `npx supabase functions list` | 30 Edge Functions actives, cohérentes avec `supabase/functions/active-edge-functions.json`. |
| `npx supabase advisors security/performance --linked --output json` | Non disponible dans le CLI local: `unknown command "advisors"`. |
| `npm audit --json` dans `supabase/` | OK, 0 vulnérabilité. |
| `npm audit --json --omit=dev` à la racine | 18 vulnérabilités modérées, principalement chaîne Expo, hors périmètre backend Supabase strict. |
| `npm test -- --runInBand __tests__/supabase` | 29 suites passées, 1 suite échouée, 149 tests passés, 1 test échoué. |
| `tmp_supabase_advisors_final.json` | 33 warnings historiques: leaked password protection, RLS initplan, multiple permissive policies. |

Limites: audit statique et checks CLI. Pas de pentest destructif, pas de dump de données, pas d'impression de secrets.

## Matrice de risques

| ID | Priorité | Statut | Risque |
| --- | --- | --- | --- |
| F-01 | P1 | À corriger | Protection Supabase contre mots de passe compromis non confirmée/indiquée désactivée. |
| F-02 | P2 | À corriger | Payload non borné sur `coach-generate-response`. |
| F-03 | P2 | À corriger | Configuration de déploiement Edge Functions non versionnée. |
| F-04 | P2 | À durcir | Jeton worker statique pour la modération asynchrone. |
| F-05 | P2 | À durcir | Endpoint admin de modération retourne une queue complète via `select('*')`. |
| F-06 | P3 | À réconcilier | Warnings Advisor RLS initplan et policies permissives présents dans le rapport temporaire. |
| F-07 | P3 | À durcir | Validation CORS incohérente entre fonctions. |
| F-08 | P3 | À corriger | Contrat de payload d'erreur en dérive dans les tests Supabase. |
| F-09 | P3 | À durcir | Hygiène repo: `supabase/.temp` non ignoré explicitement. |

## Findings détaillés

### F-01 - P1 - Leaked password protection non confirmée/indiquée désactivée

Preuve:
- `tmp_supabase_advisors_final.json` contient `auth_leaked_password_protection` avec le titre `Leaked Password Protection Disabled`.
- `SUPABASE_SECURITY_CONFIG.md:7` à `SUPABASE_SECURITY_CONFIG.md:29` marque cette protection comme configuration manuelle critique à activer.

Impact: un utilisateur peut choisir un mot de passe déjà présent dans des fuites publiques. Cela augmente le risque de credential stuffing et de prise de compte, surtout si l'application accepte email/mot de passe.

Scénario d'abus: un attaquant réutilise une liste d'emails/mots de passe compromis et tente les connexions Supabase Auth. Sans rejet des mots de passe compromis au moment de l'inscription ou du changement de mot de passe, les comptes utilisant ces secrets restent faibles.

Correctif recommandé:
- Vérifier dans le dashboard Supabase actuel: Authentication > Providers > Email > Security.
- Activer leaked password protection si l'offre Supabase du projet le permet.
- Renforcer aussi la longueur minimale et les classes de caractères.
- Documenter la date d'activation et ajouter une capture/trace d'audit interne.

Test de non-régression:
- Tenter une inscription ou un changement de mot de passe avec un mot de passe faible connu, par exemple `password123`, et confirmer le rejet.
- Relancer l'advisor sécurité depuis le dashboard Supabase, puisque le CLI local ne fournit pas la commande `advisors`.

### F-02 - P2 - Payload non borné sur `coach-generate-response`

Preuve:
- `supabase/functions/_shared/phase2Utils.ts:167` à `supabase/functions/_shared/phase2Utils.ts:174` définit `readJsonBody` avec `maxBytes` optionnel et `Infinity` par défaut.
- `supabase/functions/coach-generate-response/handler.ts:404` à `supabase/functions/coach-generate-response/handler.ts:413` crée un client service-role, authentifie l'utilisateur puis appelle `readJsonBody(req)` sans `maxBytes`.
- La plupart des autres fonctions sensibles utilisent une borne explicite, par exemple `analyze-scan` à 8 KB ou les fonctions sociales à `PHASE2_SOCIAL_REQUEST_MAX_BYTES`.

Impact: un utilisateur authentifié AAL2 peut envoyer un très gros body JSON. Même si l'authentification est correcte, cela peut consommer mémoire/CPU dans l'Edge Runtime, augmenter les coûts et dégrader la disponibilité du service coach.

Scénario d'abus: un compte valide envoie plusieurs requêtes `POST` avec des bodies de plusieurs Mo. La fonction lit entièrement le body avant parsing et validation métier, ce qui peut provoquer une pression mémoire et ralentir les traitements légitimes.

Correctif recommandé:
- Définir une constante, par exemple `COACH_GENERATE_REQUEST_MAX_BYTES = 32 * 1024` ou `64 * 1024`.
- Remplacer `readJsonBody(req)` par `readJsonBody(req, { maxBytes: COACH_GENERATE_REQUEST_MAX_BYTES })`.
- Ajouter un contrôle `Content-Type: application/json` si l'API veut refuser les formats inattendus.
- Garder la borne alignée avec la taille réelle maximale du payload coach attendu.

Test de non-régression:
- Ajouter un test Supabase qui envoie un body au-dessus de la limite et attend `413 payload_too_large`.
- Ajouter un test happy path sous la limite pour éviter un plafond trop strict.

### F-03 - P2 - Configuration Edge Functions non versionnée

Preuve:
- `supabase/config.toml` est absent.
- `supabase/functions/active-edge-functions.json:2` à `supabase/functions/active-edge-functions.json:33` liste 30 fonctions actives.
- `npx supabase functions list` confirme 30 fonctions actives côté projet distant.

Impact: les décisions de déploiement sensibles ne sont pas reviewables dans le repo: `verify_jwt`, import map, flags par fonction, et différence entre webhooks publics et fonctions utilisateur. Les fonctions implémentent beaucoup de contrôles en code, mais une configuration dashboard/CLI divergente reste difficile à auditer et à reproduire.

Scénario d'abus ou d'incident: une fonction utilisateur est déployée avec un réglage inattendu, ou une fonction webhook exige/rejette un JWT Supabase par erreur. Cela peut créer une panne silencieuse, contourner une défense en profondeur, ou rendre une revue de sécurité incomplète.

Correctif recommandé:
- Ajouter `supabase/config.toml`.
- Déclarer explicitement chaque fonction avec son choix `verify_jwt`.
- Conserver `verify_jwt = true` pour les fonctions utilisateur lorsque compatible, et `verify_jwt = false` uniquement pour les webhooks qui ont une authentification applicative robuste, comme RevenueCat ou callback HMAC.
- Ajouter un test ou script de contrôle qui compare `active-edge-functions.json`, `supabase/config.toml` et `supabase functions list`.

Test de non-régression:
- Exécuter le script de comparaison en CI.
- Vérifier qu'une fonction webhook sans son secret applicatif retourne `401/500` attendu, et qu'une fonction utilisateur sans JWT retourne `401`.

### F-04 - P2 - Jeton worker statique pour la modération asynchrone

Preuve:
- `supabase/functions/_shared/phase2Auth.ts:192` à `supabase/functions/_shared/phase2Auth.ts:204` accepte `PHASE2_SOCIAL_MODERATION_WORKER_TOKEN` comme acteur `system`.
- `supabase/functions/social-process-moderation-queue/index.ts:225` à `supabase/functions/social-process-moderation-queue/index.ts:227` utilise ce mécanisme avec un client service-role.
- Le même endpoint traite ensuite la queue et applique des décisions de modération, par exemple `social-process-moderation-queue/index.ts:270` à `social-process-moderation-queue/index.ts:288`.

Impact: si ce token fuit, un attaquant peut déclencher le worker de modération comme acteur système. Même si le scope est plus restreint qu'un compte admin, l'effet métier est fort: décisions de modération, visibilité de contenus, états de rapports.

Scénario d'abus: fuite du token depuis un environnement CI, un poste local, une erreur de log ou un partage de secrets. L'attaquant appelle `social-process-moderation-queue` et force des traitements ou des dry-runs à répétition.

Correctif recommandé:
- Rotater immédiatement le token si son historique de diffusion n'est pas certain.
- Remplacer le bearer statique par une signature HMAC avec timestamp, nonce et fenêtre de validité courte, sur le modèle du callback frigo.
- Ajouter un plafond serveur strict sur `limit` et sur la fréquence des runs worker.
- Journaliser les appels worker avec `request_id`, type d'acteur, nombre d'items, `dry_run`, sans contenu sensible.

Test de non-régression:
- Appel sans token: `401`.
- Appel avec token/signature expirée: `401`.
- Appel avec signature valide: succès contrôlé.
- Rejeu du même nonce: rejet.

### F-05 - P2 - Endpoint admin de modération trop large

Preuve:
- `supabase/functions/social-list-moderation-queue/index.ts:85` à `supabase/functions/social-list-moderation-queue/index.ts:87` exige AAL2 et admin, ce qui est bon.
- `supabase/functions/social-list-moderation-queue/index.ts:96` à `supabase/functions/social-list-moderation-queue/index.ts:98` fait ensuite `.from('social_moderation_queue').select('*')`.
- `supabase/functions/social-list-moderation-queue/index.ts:117` à `supabase/functions/social-list-moderation-queue/index.ts:122` normalise et renvoie la réponse sans pagination DB.

Impact: l'endpoint est admin-only, donc ce n'est pas une exposition publique directe. Mais un JWT admin compromis permet de récupérer toute la queue de modération en une requête. Le `select('*')` augmente aussi le risque de fuite future si la vue/table gagne de nouvelles colonnes sensibles.

Scénario d'abus: un attaquant obtient une session admin AAL2 et appelle l'endpoint pour exporter contenus signalés, métadonnées d'auteurs, rapports et champs ajoutés ultérieurement.

Correctif recommandé:
- Remplacer `select('*')` par une liste de colonnes minimale.
- Ajouter pagination serveur: `limit`, `cursor`, plafond maximal, filtre obligatoire ou défaut raisonnable.
- Ajouter audit log admin pour consultation de la queue.
- Éviter de renvoyer les champs non nécessaires au tri/affichage, notamment payloads provider ou données brutes si ajoutées plus tard.

Test de non-régression:
- Non-admin AAL2: `403`.
- Admin AAL2: réponse paginée avec plafond.
- Requête sans pagination: limite par défaut appliquée.
- Colonnes sensibles ajoutées à la table/vue: test snapshot vérifie qu'elles ne sortent pas dans l'API.

### F-06 - P3 - Warnings Advisor à réconcilier

Preuve:
- `tmp_supabase_advisors_final.json` contient 31 warnings `auth_rls_initplan`, dont `health_scores`, `purchases`, `verification_codes`, `scan_metrics`, `scans`, `social_comments`, `user_bans`, `social_upload_reservations`, `user_profiles`, `coach_entries`, `fridge_scans`, `oauth_connections`, `social_comment_likes` et `social_posts`.
- Le même fichier signale `multiple_permissive_policies` sur `public.user_bans`.
- Le code historique de `user_bans` montre deux policies permissives de SELECT/ALL: `supabase/migrations/20260418141300_add_user_bans.sql:27` à `supabase/migrations/20260418141300_add_user_bans.sql:42`.
- Pendant cet audit, `npx supabase db lint --linked --level warning` retourne `No schema errors found`.

Impact: probablement résolu ou non détecté par le lint lancé localement, mais l'écart entre rapport temporaire et lint actuel doit être fermé. Les warnings `auth_rls_initplan` sont surtout performance, mais sous charge ils peuvent dégrader les requêtes RLS. Les policies permissives multiples peuvent rendre l'analyse d'accès plus fragile.

Correctif recommandé:
- Relancer les Advisors depuis le dashboard Supabase actuel.
- Si les warnings existent encore, remplacer `auth.uid()` par `(select auth.uid())` dans les policies concernées et fusionner les policies `user_bans` si nécessaire.
- Si les warnings sont résolus, archiver/supprimer les anciens `tmp_*` pour éviter des faux positifs futurs.

Test de non-régression:
- Advisor dashboard sans warning `auth_rls_initplan`.
- Test SQL/RLS cross-user sur `user_bans`.
- `db lint --linked --level warning` toujours clean.

### F-07 - P3 - Validation CORS incohérente

Preuve:
- `supabase/functions/_shared/cors.ts:15` à `supabase/functions/_shared/cors.ts:25` autorise `*` si présent dans `ALLOWED_ORIGINS`.
- `supabase/functions/_shared/cors.ts:31` à `supabase/functions/_shared/cors.ts:36` retourne `Access-Control-Allow-Origin: *` quand il n'y a pas d'Origin, ce qui est nécessaire pour les clients natifs mais doit rester intentionnel.
- Seules quelques fonctions appellent `validateCorsOrigin`, par exemple `cleanup-orphan-user` à `supabase/functions/cleanup-orphan-user/index.ts:54`, alors que la majorité s'appuie seulement sur les headers de réponse/preflight.

Impact: CORS n'est pas un contrôle d'authentification et les routes sensibles exigent JWT ou secret applicatif. Le risque principal est la dérive: un endpoint browser-callable pourrait exécuter une side effect depuis une origine non attendue si le preflight ne s'applique pas comme prévu, ou si `ALLOWED_ORIGINS=*` arrive en production.

Correctif recommandé:
- Interdire `ALLOWED_ORIGINS=*` en production via check au démarrage ou alerte de configuration.
- Appeler `validateCorsOrigin(req)` de façon homogène sur les fonctions invoquées depuis le web après le `OPTIONS` et avant les side effects.
- Documenter explicitement les fonctions webhook/native-only qui acceptent l'absence d'Origin.

Test de non-régression:
- Origin autorisée: succès.
- Origin non autorisée: `403` avant side effect.
- Pas d'Origin sur client natif/webhook: comportement attendu conservé.

### F-08 - P3 - Contrat de payload d'erreur en dérive

Preuve:
- `npm test -- --runInBand __tests__/supabase` échoue sur `__tests__/supabase/coachProvider.test.ts`.
- Le payload reçu contient `details: undefined` et `status: 503` en plus du contrat attendu.
- `supabase/functions/_shared/phase2Errors.ts:1` à `supabase/functions/_shared/phase2Errors.ts:17` ajoute `status` et `details` au modèle d'erreur.

Impact: faible sécurité directe, mais les contrats d'erreur servent aux clients, logs, alertes et tests d'abus. Une dérive non assumée peut casser des clients ou masquer des régressions de sécurité dans les tests.

Correctif recommandé:
- Décider le contrat canonique: inclure toujours `status` et omettre les champs `undefined`, ou garder l'ancien contrat.
- Mettre à jour `toPhase2ErrorPayload` ou les tests.
- Ajouter un test qui vérifie que les détails sensibles sont filtrés.

Test de non-régression:
- Relancer `npm test -- --runInBand __tests__/supabase`.
- Vérifier que le payload n'inclut jamais `token`, `secret`, `authorization`, `email`, `payload` brut ou body brut.

### F-09 - P3 - Hygiène repo autour de `supabase/.temp`

Preuve:
- `.gitignore:66` à `.gitignore:68` ignore `.env`, mais pas `supabase/.temp/`.
- `supabase/.temp` contient des métadonnées de projet local: project ref, pooler URL, versions de services.

Impact: ces fichiers ne sont pas équivalents à un secret `service_role`, mais ils donnent du contexte d'infrastructure et peuvent polluer un commit. Dans un repo partagé, cela augmente le bruit et la surface de reconnaissance.

Correctif recommandé:
- Ajouter `supabase/.temp/` à `.gitignore`.
- Vérifier qu'aucun fichier `.temp` n'est suivi si le projet redevient un repo Git.
- Supprimer ou régénérer les fichiers temporaires localement si besoin.

Test de non-régression:
- `git status --ignored` doit montrer `supabase/.temp/` ignoré.
- Scanner le repo avant release pour `.env`, `.temp`, clés privées et rapports temporaires.

## Contrôles positifs observés

- `TRUST_BOUNDARIES.md:5` à `TRUST_BOUNDARIES.md:13` pose clairement que le client n'est pas autoritaire et que les Edge Functions valident auth, ownership, rate limits et chemins de stockage.
- `supabase/functions/_shared/phase2Auth.ts:42` à `supabase/functions/_shared/phase2Auth.ts:50` crée le client service-role sans session persistée.
- `supabase/functions/_shared/phase2Auth.ts:118` à `supabase/functions/_shared/phase2Auth.ts:131` impose AAL2 avant les opérations authentifiées standard.
- `supabase/functions/_shared/phase2Auth.ts:227` à `supabase/functions/_shared/phase2Auth.ts:243` vérifie l'admin côté serveur via `user_profiles.account_tier`.
- `supabase/functions/fridge-scan-complete/index.ts:54` à `supabase/functions/fridge-scan-complete/index.ts:100` vérifie HMAC, timestamp et comparaison constante pour le callback frigo.
- `supabase/functions/revenuecat-webhook/index.ts:53` à `supabase/functions/revenuecat-webhook/index.ts:71` exige une authorization RevenueCat et borne le payload à 64 KB.
- `supabase/functions/revenuecat-webhook/index.ts:84` à `supabase/functions/revenuecat-webhook/index.ts:106` implémente l'idempotence par `event_id`.
- `supabase/functions/_shared/phase2Observability.ts:14` à `supabase/functions/_shared/phase2Observability.ts:60` filtre les clés sensibles des métadonnées de logs.
- `supabase/migrations/20260424190000_security_rpc_grants_and_legacy_cleanup.sql:16` à `supabase/migrations/20260424190000_security_rpc_grants_and_legacy_cleanup.sql:74` révoque l'exécution RPC par défaut puis réaccorde seulement les fonctions publiques voulues.

## Plan de correction priorisé

### Dans la journée

1. Activer/confirmer leaked password protection dans Supabase Auth.
2. Ajouter une limite `maxBytes` à `coach-generate-response`.
3. Corriger le test `coachProvider.test.ts` ou le payload d'erreur canonique.
4. Relancer les Advisors depuis le dashboard Supabase et capturer le résultat actuel.

### Cette semaine

1. Ajouter `supabase/config.toml` avec `verify_jwt` explicite par fonction.
2. Durcir `social-process-moderation-queue` avec signature HMAC timestampée ou rotation stricte du token worker.
3. Paginer et réduire les colonnes de `social-list-moderation-queue`.
4. Standardiser `validateCorsOrigin` sur les fonctions browser-callable et refuser `*` en production.
5. Ajouter `supabase/.temp/` à `.gitignore`.

### Avant production large

1. Intégrer un contrôle CI: `db lint`, tests Supabase ciblés, audit npm backend, comparaison fonctions actives/config.
2. Ajouter tests d'abus: JWT absent, JWT AAL1 sur routes AAL2, non-admin sur routes admin, webhook sans/mauvais secret, HMAC expiré, upload social hors réservation, RLS cross-user.
3. Mettre une alerte sur pics `401/403/413`, erreurs webhook, appels worker, consultation admin de la queue et quotas scan/social.
4. Définir une politique de rétention pour payloads webhook et contenus de modération.

## Checklist de validation

- [ ] Dashboard Supabase Auth: leaked password protection activée ou exception documentée.
- [ ] `coach-generate-response` refuse les payloads au-dessus de la limite avec `413`.
- [ ] `supabase/config.toml` versionne toutes les fonctions actives.
- [ ] `social-process-moderation-queue` n'accepte plus un bearer statique non timestampé, ou le token est rotaté et surveillé.
- [ ] `social-list-moderation-queue` est paginé, limité et sans `select('*')`.
- [ ] Dashboard Advisors actuel exporté et sans warnings critiques non triés.
- [ ] `npm test -- --runInBand __tests__/supabase` passe entièrement.
- [ ] `npx supabase db lint --linked --level warning` reste clean.
- [ ] `supabase/.temp/` est ignoré par le repo.

## Références primaires consultées

- Supabase Auth password security: https://supabase.com/docs/guides/auth/password-security
- Supabase RLS helper functions et initPlan: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Supabase Edge Functions CORS: https://supabase.com/docs/guides/functions/cors
- Supabase Edge Function secrets: https://supabase.com/docs/guides/functions/secrets
- RevenueCat webhooks: https://www.revenuecat.com/docs/integrations/webhooks
