# Audit Apple Guidelines SelfLens - 2026-07-02

## Verdict executif

SelfLens est proche d'une resoumission defendable, surtout sur Sign in with Apple et les icones, mais je ne recommanderais pas une soumission iOS tant que les points P0/P1 ci-dessous ne sont pas fermes ou explicitement verifies en production.

Les risques de rejet les plus probables ne sont pas des crashes visibles, mais des sujets App Review classiques: securite reseau iOS, legal/terms, synchronisation privacy, moderation UGC, claims sante/IA, suppression de compte Apple, privacy labels SDK, et coherence des notes reviewer.

Cet audit couvre le repo local `C:\Users\maloh\OneDrive\Bureau\ts-main-main\ts-main-main`, l'introspection Expo iOS, les Edge Functions Supabase, les workflows n8n versionnes, les ecrans RN/Expo, les tests existants, et les obligations App Store Connect a verifier manuellement.

## Correctifs appliques sans changement fonctionnel/design

- APL-002: ajout de `app.config.js` pour retirer `expo-dev-client` hors profil development et forcer `NSAllowsArbitraryLoads=false` en production iOS; introspection production verifiee le 2026-07-02.
- APL-003: ajout d'un ecran `app/terms-of-use.tsx`, contenu Terms/EULA, route partagee `terms-of-use`, et correction du lien Terms dans le paywall.
- APL-004: dates privacy synchronisees sur 26 avril 2026 entre `PRIVACY_POLICY.md`, `constants/privacyPolicy.ts` et `website/privacy-policy/index.html`.
- APL-006: flux deletion enrichi avec mention abonnement App Store; le code Apple natif stocke le `authorizationCode` en SecureStore et `delete-account` tente une revocation Apple best-effort cote serveur si `APPLE_SIGN_IN_CLIENT_ID` et `APPLE_SIGN_IN_CLIENT_SECRET` sont configures.
- APL-008: `.easignore` exclut maintenant les backups/env (`.env*`, `*.cloud-backup`, `*.backup`, `*.bak`) et credentials App Store Connect (`credentials*.json`, `AuthKey_*.p8`) du contexte EAS.
- APL-009: les placeholders `<email> / <password>` ont ete retires des notes repo; les vrais comptes reviewer doivent etre ajoutes uniquement dans App Store Connect.
- APL-010: `EX_DEV_CLIENT_NETWORK_INSPECTOR=false` cote Gradle et dev client gate par profil.
- APL-013: les prompts permissions iOS camera/photos/micro/speech sont neutralises en anglais, sans claim medical.
- APL-014: le hook notifications ne demande plus le push token automatiquement apres login; l'enregistrement push est declenche depuis l'enregistrement des preferences notifications.
- APL-015: decision utilisateur du 2026-07-02: conserver `contact@selflens.org` pour l'ecran rare `StartupConfigGate`.
- APL-019: tests ajoutes/mis a jour pour hygiene EAS, config Expo production, routes legales, paywall Terms/Privacy, privacy, deletion Apple, notifications.

Exclusions demandees par l'utilisateur:
- APL-001 / moderation pre-publication UGC: pas de changement fonctionnel qui ferait passer posts/commentaires en pending.
- APL-005 / wording sante-IA visible: pas de renommage visible type "Detected Conditions".

## Sources Apple utilisees

- App Review Guidelines, version officielle consultee le 2026-07-02, page marquee "Last Updated: June 8, 2026": https://developer.apple.com/app-store/review/guidelines/
- User Privacy and Data Use: https://developer.apple.com/app-store/user-privacy-and-data-use/
- App Privacy Details: https://developer.apple.com/app-store/app-privacy-details/
- Offering Account Deletion in Your App: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Auto-renewable Subscriptions: https://developer.apple.com/app-store/subscriptions/

## Echelle de severite

- P0: risque bloquant probable si la condition est vraie en production ou dans App Store Connect.
- P1: risque de rejet eleve ou correction a faire avant resoumission.
- P2: risque moyen, coherence review/metadata/UX a renforcer.
- P3: durcissement, tests, documentation, dette non bloquante.

## Matrice priorisee

| ID | Sev | Zone Apple | Risque | Statut | Correctif court |
| --- | --- | --- | --- | --- | --- |
| APL-001 | P0 | 1.2 UGC | Si `social_enabled=true` avec `moderation_enabled=false`, du contenu utilisateur peut etre publie sans filtrage avant publication. | Exclu du fix code par decision utilisateur; a verifier sur VPS prod. | En prod, desactiver social ou activer moderation pre-publication + worker/admin SLA. |
| APL-002 | P1 | 1.6 / 5.1 Data Security | L'Info.plist genere contenait `NSAllowsArbitraryLoads: true`. | Fix local applique; introspection production OK. | Garder le test de config et verifier le binaire TestFlight. |
| APL-003 | P1 | 3.1.2 Subscriptions / 2.3 Metadata | Le lien "Terms of Use" du paywall pointait vers `/privacy-policy`; aucun vrai Terms/EULA route n'avait ete trouve. | Fix local applique. | Publier/valider le contenu Terms public si App Store Connect demande une URL externe. |
| APL-004 | P1 | 5.1.1 Privacy | La privacy policy etait desynchronisee: `PRIVACY_POLICY.md` date du 26 avril 2026, l'in-app/public website restaient au 18 mars 2026. | Fix local applique. | Maintenir une source unique ou un test de parite plus strict. |
| APL-005 | P1 | 1.4.1 Health / 5.1.2 AI data sharing | Scans visage/corps/nutrition + IA peuvent etre lus comme claims medical/diagnostic si le wording n'est pas resserre. | Exclu du fix par decision utilisateur. | Renommer claims sensibles plus tard, ajouter methodology/limitations, expliciter third-party AI/analysis infra. |
| APL-006 | P1 | Account deletion | Suppression de compte existait, mais aucune revocation Sign in with Apple visible, et le texte n'expliquait pas clairement la gestion de l'abonnement. | Fix local applique; config serveur Apple a fournir. | Configurer `APPLE_SIGN_IN_CLIENT_ID` + `APPLE_SIGN_IN_CLIENT_SECRET` sur l'Edge Function prod. |
| APL-007 | P1 | 5.1 Privacy labels / ATT | App Store Connect doit declarer toutes les donnees collectees par Supabase, RevenueCat, AppLovin MAX, Aptabase, Expo push et n8n/IA. | A verifier dans ASC. | Refaire un data inventory et aligner labels + Tracking = No uniquement si SDKs le permettent. |
| APL-008 | P1 | Build hygiene | `.easignore` n'excluait pas `.env.cloud-backup`, alors que le fichier existe. | Fix local applique. | Garder le test de garde et verifier le contexte EAS avant build. |
| APL-009 | P1 | 2.1 App Completeness | Les notes reviewer contenaient encore `<email> / <password>` placeholders. | Repo nettoye; ASC a remplir. | Remplir comptes review premium actif + expire dans App Store Connect seulement. |
| APL-010 | P1 | 2.5 / Security / Review quality | `expo-dev-client` etait dans les plugins, et l'introspection montrait `EX_DEV_CLIENT_NETWORK_INSPECTOR=true`. | Fix local applique; introspection production OK. | Verifier TestFlight: aucun dev menu/network inspector. |
| APL-011 | P1 | 1.2 UGC | Report/hide/admin existent, mais le report webhook est optionnel; sans webhook/SLA, "timely response" reste non prouve. | A verifier prod. | Configurer n8n report workflow ou une file admin documentee. |
| APL-012 | P1 | 3.1.2 Subscriptions | RevenueCat fonctionne cote app, mais l'etat App Store Connect/IAP group/products/sandbox accounts n'est pas prouve par le repo. | A verifier ASC. | Verifier produits visibles reviewer, subscription group, review submission IAP. |
| APL-013 | P2 | Permissions / HIG privacy | Usage descriptions iOS etaient en francais uniquement et utilisaient "analyse sante". | Fix local applique. | QA device des prompts systeme iOS. |
| APL-014 | P2 | Notifications / 5.1.2 | La permission push etait demandee automatiquement apres login si runtime eligible. | Fix local applique. | QA device: le prompt doit apparaitre depuis les preferences notifications. |
| APL-015 | P2 | Developer contact | StartupConfigGate affiche `contact@selflens.org`, alors que privacy/support utilisent `healthscan.cloud`. | Decision: conserver. | Verifier que ce contact est bien joignable et coherent avec Support URL ASC. |
| APL-016 | P2 | Age rating / Safety | App traite sante, visage, ads, UGC/social, et privacy dit "not under 16"; age rating ASC doit matcher. | A verifier ASC. | Verifier age rating, UGC, medical/health, ads, unrestricted web links. |
| APL-017 | P2 | Accessibility / HIG | Beaucoup de roles/labels existent, mais plusieurs flows camera/social/loading doivent etre verifies VoiceOver/Dynamic Type/Reduce Motion. | Audit partiel. | QA device accessibilite + tests sur boutons camera et paywall. |
| APL-018 | P2 | Metadata / Store screenshots | Les screenshots et descriptions doivent refleter AI scans, social, IAP, account deletion, privacy. | Hors repo. | Faire rehearsal metadata avant upload. |
| APL-019 | P3 | CI App Review guardrails | Des tests `noTracking`, `appIcon`, `OAuthButton` existaient, mais pas encore de garde Terms/privacy/ATS/dev-client. | Fix local applique. | Etendre ensuite a une parite privacy plus stricte. |

## Constats detailles et correctifs

### APL-001 - UGC: moderation pre-publication a prouver en production

Preuve repo:
- `services/appConfig.ts:30-45` definit `social_enabled=false` et `moderation_enabled=false` par defaut.
- `supabase/functions/_shared/phase2Config.ts:5-17` definit aussi `moderation_enabled=false` par defaut cote Edge Functions.
- `supabase/functions/_shared/phase2Moderation.ts:410-423` publie directement si moderation desactivee, et garde `pending/published=false` si elle est activee.
- `supabase/functions/social-create-post/index.ts:113-115` applique ce plan au moment de creer un post.

Risque Apple:
- Guideline 1.2 exige un filtrage du contenu objectionnable avant publication, un mecanisme de report, une reponse rapide, la capacite de bloquer les abusifs, et des coordonnees publiees.
- Le repo montre une architecture capable de moderer, mais ne prouve pas l'etat prod. Si `social_enabled=true` et `moderation_enabled=false` sur le VPS, c'est un P0.

Correctif precis:
- Sur la prod VPS `supabase.basedjew.com`, verifier `app_feature_flags` pour `scope='mobile'`.
- Si social doit etre visible dans le build reviewer: imposer `social_enabled=true`, `social_comments_enabled=true` uniquement avec `moderation_enabled=true`.
- Si la moderation n'est pas prete: mettre `social_enabled=false` pour la submission iOS.
- Documenter dans les notes reviewer: "All social posts/comments are held pending until moderation or admin approval; users can report content and hide/block authors."
- Ajouter un test backend qui echoue si `social_enabled=true` et `moderation_enabled=false` dans une config de seed prod/review.

### APL-002 - ATS iOS: `NSAllowsArbitraryLoads: true`

Preuve repo/config:
- Avant correctif, `npx expo config --type introspect --json` generait `ios.infoPlist.NSAppTransportSecurity.NSAllowsArbitraryLoads=true`.
- L'app indique pourtant dans `PRIVACY_POLICY.md` que les communications utilisent HTTPS.

Risque Apple:
- Apple scrutinise securite et confidentialite; un arbitrary load global est un signal faible pour une app de sante/visage.
- Meme si le trafic reel est HTTPS, le binaire autorise des connexions non chiffrees globales.

Correctif precis:
- Retirer l'arbitrary load global pour les builds production.
- Si Expo ou un plugin le reinjecte, ajouter un config plugin execute en dernier qui supprime `NSAllowsArbitraryLoads` et ne conserve que les exceptions strictement necessaires en debug.
- Verifier apres fix avec `npx expo config --type introspect --json` et un test CI qui fail si `NSAllowsArbitraryLoads` reapparait.

Etat local:
- `app.config.js` force `NSAllowsArbitraryLoads=false` hors profil development.
- `EAS_BUILD_PROFILE=production-ios npx expo config --type introspect --json` retourne `AllowsArbitraryLoads=false`.
- Verrouille par `__tests__/config/expoProductionConfig.test.ts`.

### APL-003 - Paywall: Terms of Use route vers Privacy Policy

Preuve repo:
- Avant correctif, `screens/PremiumUpgradeScreen.tsx:951-963` faisait pointer `privacy_link` et `terms_link` vers `/privacy-policy`.
- Avant correctif, aucun ecran Terms/EULA n'etait trouve.

Risque Apple:
- Pour les abonnements, Apple attend une information claire avant l'achat: prix, renouvellement, annulation, privacy, terms.
- Un lien "Terms of Use" qui ouvre la privacy policy peut etre considere comme metadata/UI inexacte.

Correctif precis:
- Ajouter `app/terms-of-use.tsx` ou ouvrir une URL publique Terms/EULA.
- Ajouter une constante `PUBLIC_TERMS_OF_USE_URL`.
- Choisir une base claire: Apple Standard EULA + conditions SelfLens, ou Terms SelfLens complets.
- Modifier le paywall pour router vers Terms, pas Privacy.
- Ajouter/mettre a jour les tests `PremiumUpgradeScreen` pour verifier les deux liens separent bien privacy et terms.

Etat local:
- `app/terms-of-use.tsx` et `constants/termsOfUse.ts` ajoutes.
- `constants/routes.ts` rend `terms-of-use` accessible comme route partagee.
- `screens/PremiumUpgradeScreen.tsx` route Terms vers `/terms-of-use`.
- Verrouille par `__tests__/screens/PremiumUpgradeScreen.test.tsx` et `__tests__/constants/routes.test.ts`.

### APL-004 - Privacy policy desynchronisee entre repo, app et site

Preuve repo:
- `PRIVACY_POLICY.md:7` et `:80` indiquent 26 avril 2026.
- Avant correctif, `constants/privacyPolicy.ts:29` et `:133` indiquaient 18 mars 2026.
- Avant correctif, `website/privacy-policy/index.html:291` et `:476` indiquaient aussi 18 mars 2026.
- `app/privacy-policy.tsx` lit `getPrivacyPolicyContent()` depuis `constants/privacyPolicy.ts`.

Risque Apple:
- Apple demande des informations privacy exactes et a jour, y compris pour les partenaires tiers et les donnees collectees.
- App Review peut comparer l'app, l'URL publique, les notes reviewer et App Store Connect.

Correctif precis:
- Faire de `PRIVACY_POLICY.md` la source canonique ou generer `constants/privacyPolicy.ts` + `website/privacy-policy/index.html` depuis une source unique.
- Synchroniser dates, sections Face data, n8n/analysis infrastructure, retention, deletion, support/privacy emails.
- Ajouter un test de parite qui compare au minimum les dates et phrases critiques face data / AI training / retention.

Etat local:
- Dates in-app et website alignees sur 26 avril 2026.
- Test privacy italien mis a jour dans `__tests__/app/PrivacyPolicyScreen.test.tsx`.

### APL-005 - Sante/IA: claims, methodologie et wording medical

Preuve repo:
- `n8n/workflows/analyse_1.json` demande des estimations visage comme hydration, collagen, stress, sleep quality, perceived age/sex.
- `i18n/locales/en.ts:2111` et `i18n/locales/fr.ts:2143` utilisent "Detected Conditions" / "Conditions detectees".
- `supabase/functions/_shared/scanAnalysis.ts` conserve des champs comme `diagnosis`, `medical_disclaimer`, `detected_conditions`.
- Des disclaimers existent: `shared/coachCopy.ts`, `i18n/results/en.ts`, `components/fridge/ChefResultCard.tsx`, `supabase/functions/coach-generate-response/handler.ts`.

Risque Apple:
- Guideline 1.4.1: les apps medicales ou assimilables doivent expliquer donnees/methodologie pour les claims d'exactitude et rappeler de consulter un medecin avant decisions medicales.
- Les mots "health scan", "conditions", "detected", "urgent", "collagen", "hydration", "stress", "sleep quality" peuvent etre lus comme evaluation medicale si l'UI n'encadre pas fortement.

Correctif precis:
- Remplacer dans l'UI store-facing et result-facing les libelles "Detected Conditions" par "Visual findings", "Wellness signals", "Signaux visuels" ou equivalent.
- Ajouter une page/section "How analysis works" accessible depuis scanner/resultats/privacy: estimations visuelles, non diagnostiques, limites, pas dispositif medical, pas validation clinique.
- Afficher le disclaimer non medical pres des resultats, pas seulement dans le coach.
- Dans n8n prompts et normalizers, interdire explicitement pathologies/diagnoses/treatment et forcer uncertainty/visual heuristic.
- Dans App Review notes, expliquer que les scores sont wellness heuristics et non medical device.

### APL-006 - Suppression de compte: Apple token revoke et abonnements

Preuve repo:
- `app/settings.tsx:208-245` expose une suppression avec deux confirmations.
- `contexts/AuthContext.tsx:2118-2136` appelle la fonction `delete-account`.
- `supabase/functions/delete-account/index.ts:95-153` supprime assets sociaux, scans, avatar, profile et auth user.
- Avant correctif, aucun appel de revocation Apple n'apparaissait dans `supabase/functions/delete-account/index.ts`.
- Avant correctif, les textes `i18n/locales/appOverrides.ts` ne mentionnaient pas clairement que la suppression du compte n'annule pas forcement l'abonnement App Store.

Risque Apple:
- Apple indique que les apps avec creation de compte doivent permettre d'initier la suppression in-app, supprimer compte/donnees, rendre l'option facile a trouver, informer les utilisateurs sur billing/cancellation, et recommande de revoquer les tokens Sign in with Apple.

Correctif precis:
- Dans le flux Apple natif, capturer `authorizationCode` quand disponible et prevoir une voie serveur pour revoquer le token Apple avec le client secret Apple, sans logguer le token.
- Si la revocation ne peut pas etre garantie pour les anciens comptes, documenter le comportement et verifier avec App Review notes.
- Ajouter dans les deux confirmations: "Deleting your account does not cancel an active App Store subscription. Manage/cancel it in Apple subscriptions."
- Ajouter un lien "Manage subscription" dans le flow deletion pour les comptes premium.

Etat local:
- `contexts/AuthContext.tsx` stocke le `authorizationCode` Apple en SecureStore apres login Apple natif, l'envoie a `delete-account`, puis le supprime au sign-out/deletion.
- `supabase/functions/delete-account/index.ts` tente l'echange Apple token puis revoke best-effort et renvoie `apple_revoke`.
- Les textes deletion mentionnent l'annulation separee des abonnements App Store.
- A configurer cote serveur: `APPLE_SIGN_IN_CLIENT_ID` et `APPLE_SIGN_IN_CLIENT_SECRET`.

### APL-007 - Privacy labels App Store Connect et SDKs tiers

Preuve repo:
- SDKs pertinents dans `package.json`: Supabase, RevenueCat, AppLovin MAX, Aptabase, Expo Notifications, Expo Camera/Image Picker/Speech Recognition, WebView.
- `contexts/AdsContext.tsx` initialise AppLovin MAX uniquement en runtime natif, configure le flow terms/privacy, et garde le gate rewarded fail-open.
- `__tests__/config/noTracking.test.ts` verifie absence ATT/AdMob et presence de la configuration AppLovin MAX.
- `services/analytics.ts` initialise Aptabase si une cle publique est configuree et envoie des evenements.

Risque Apple:
- Les privacy labels doivent inclure les pratiques de l'app et des partenaires tiers. Apple precise que le developpeur reste responsable du code tiers et du tracking/fingerprinting.
- "Tracking = No" est defendable seulement si aucun SDK ne lie les donnees SelfLens avec des donnees tierces pour ads/measurement, et si AppLovin MAX/Aptabase/RevenueCat sont configures en consequence.

Correctif precis:
- Refaire un inventaire App Store Connect avec au minimum: email/user ID, photos/scans, social posts/comments/reports, health/fitness or sensitive data, purchase/subscription info, product interaction, diagnostics, push token/device identifiers, coarse country/language si collectes.
- Declarer les usages: app functionality, analytics, ads uniquement si necessaire.
- Verifier AppLovin MAX privacy manifest, SKAdNetwork IDs, ATT/no tracking, IDFA behavior, mediation desactivee pour AdMob, et absence de fingerprinting.
- Conserver une capture/export ASC des privacy answers dans un dossier de release non secret.

### APL-008 - `.easignore` laissait passer `.env.cloud-backup`

Preuve repo:
- `.easignore` ignore `.env` et `.env*.local`, mais pas `.env.cloud-backup`.
- Un fichier `.env.cloud-backup` existe a la racine.
- `.easignore` remplace completement `.gitignore` pour EAS.

Risque Apple/EAS:
- Le contexte EAS peut uploader des backups/env inutiles. Meme si ces valeurs ne finissent pas dans le bundle, c'est une mauvaise hygiene de build.

Correctif precis:
- Remplacer les patterns par `*.env`, `.env*`, `*.cloud-backup`, `*.backup`, `*.bak`, `*.tmp`, `credentials*.json`, `AuthKey_*.p8`, `*.p8`.
- Verifier avec `eas build:inspect` ou un dry-run EAS local si disponible.

Etat local:
- Corrige dans `.easignore` pour les backups/env et credentials App Store Connect.
- Verrouille par `__tests__/config/appReviewBuildHygiene.test.ts`.

### APL-009 - Notes reviewer avec placeholders

Preuve repo:
- Avant correctif, `APP_REVIEW_BUILD_20_NOTES.md` contenait `<email> / <password>` pour les comptes premium actif et expired.

Risque Apple:
- Guideline 2.1(a): si login ou IAP/account features existent, Apple doit avoir acces complet avec demo account ou mode demo. Des placeholders dans Review Notes peuvent bloquer la review.

Correctif precis:
- Creer deux comptes review sur la prod VPS: premium actif et expired subscription.
- Remplir les notes avec identifiants valides, sans les committer si ce fichier est partage.
- Verifier sur TestFlight: login, paywall, restore, manage, expired account.

Etat local:
- Les placeholders ont ete retires du bloc de notes a copier.
- Il reste necessaire d'ajouter les vrais identifiants dans App Store Connect, pas dans git.

### APL-010 - `expo-dev-client` et network inspector en config production

Preuve repo/config:
- `app.json:61` inclut toujours `expo-dev-client` comme dependance de config de base.
- Avant correctif, l'introspection Expo production montrait plugin history `expo-dev-client`, `expo-dev-menu`, `expo-dev-launcher`.
- Avant correctif, `android/gradle.properties:58` contenait `EX_DEV_CLIENT_NETWORK_INSPECTOR=true`.
- `eas.json` production n'a pas `developmentClient:true`, mais le plugin reste dans l'app config.

Risque Apple:
- Un binaire App Store ne doit pas exposer d'interface dev, dev menu, network inspector ou surface de debug.

Correctif precis:
- Migrer `app.json` vers une config dynamique `app.config.js`/`app.config.ts` et inclure `expo-dev-client` uniquement pour profile development.
- Desactiver explicitement `EX_DEV_CLIENT_NETWORK_INSPECTOR` en release.
- Verifier le binaire TestFlight: aucun dev menu, aucun shake dev menu, aucune interface inspector.
- Ajouter un test introspection qui fail si `pluginHistory` production contient dev client ou si `EX_DEV_CLIENT_NETWORK_INSPECTOR=true`.

Etat local:
- `app.config.js` retire le plugin `expo-dev-client` hors profil `development`.
- `android/gradle.properties` met `EX_DEV_CLIENT_NETWORK_INSPECTOR=false`.
- Introspection `EAS_BUILD_PROFILE=production-ios` confirme `HasExpoDevClientPlugin=false`.
- Verrouille par `__tests__/config/expoProductionConfig.test.ts`.

### APL-011 - UGC report response et block abusive users

Preuve repo:
- `components/social/SocialPostActionSheet.tsx:147-164` expose Report.
- `components/social/SocialPostActionSheet.tsx:193-210` expose Hide author.
- `supabase/functions/social-report-content/index.ts:170-217` appelle un webhook n8n seulement si `N8N_SOCIAL_REPORT_WEBHOOK_URL` est configure.
- `supabase/functions/_shared/phase2Moderation.ts:104-111` auto-hide a partir de 3 reporters uniques sur 24h.

Risque Apple:
- Report existe, mais "timely responses" et "block abusive users" doivent etre clairs pour reviewer.
- "Hide author" peut etre acceptable fonctionnellement, mais Apple demande la capacite de bloquer les abuseurs du service.

Correctif precis:
- Renommer ou completer "Hide author" en "Block/Hide author" si cela masque bien tous les contenus et interactions futures de l'auteur.
- Ajouter une moderation admin SLA: file `social-list-moderation-queue`, actions approve/reject/hide/remove, notifications ou runbook.
- Configurer `N8N_SOCIAL_REPORT_WEBHOOK_URL` ou documenter que les reports alimentent la queue admin.
- Mettre dans Review Notes le chemin exact: long press/more -> Report, More -> Block/Hide author, support email.

### APL-012 - Abonnements RevenueCat/App Store Connect a verifier

Preuve repo:
- `screens/PremiumUpgradeScreen.tsx` charge les offerings RevenueCat, affiche les prix `priceString`, restore purchases et manage subscription.
- `screens/PremiumUpgradeScreen.tsx:609-622` ouvre la page de gestion abonnement Apple/Google.
- `i18n/locales/en.ts:1362` et `fr.ts:1921` mentionnent auto-renew/cancel anytime.

Risque Apple:
- App Review verifie les IAP/subscriptions dans App Store Connect, pas seulement le code.
- Si produits pas soumis avec l'app, offering RevenueCat vide, subscription group incorrect, ou review account premium/expired invalide: rejet 2.1/3.1.2.

Correctif precis:
- Verifier dans App Store Connect: tous les produits RevenueCat references sont "Ready to Submit" ou approuves, rattaches au bon subscription group, et soumis avec le build si necessaire.
- Verifier que le paywall affiche prix, duree, renouvellement, restore, manage, privacy, terms avant achat.
- Ajouter screenshot/video interne du flow sandbox pour review rehearsal.

### APL-013 - Permissions iOS: langue et wording

Preuve repo/config:
- Avant correctif, `app.json` configurait camera/photos/micro/speech en francais.
- Avant correctif, l'introspection iOS generait `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription` en francais.
- Avant correctif, les descriptions camera parlaient d'"analyse sante".

Risque Apple:
- Si le storefront/reviewer est anglophone, des prompts systeme uniquement en francais peuvent sembler non finalises.
- "Health analysis" peut renforcer la lecture medicale de l'app.

Correctif precis:
- Ajouter des localisations InfoPlist.strings ou utiliser une formulation anglaise neutre par defaut.
- Preferer "wellness photo analysis" / "analyse bien-etre" plutot que "analyse sante" dans les prompts systeme.

Etat local:
- `app.json` utilise maintenant des prompts anglais neutres: camera/photo pour wellness scan ou image choisie, micro/speech uniquement pour voice dictation in Coach.

### APL-014 - Notifications: prompt automatique apres login

Preuve repo:
- Avant correctif, `hooks/useNotifications.ts:137-155` lancait l'enregistrement push si `user` existe et runtime eligible.
- `registerForPushNotificationsAsync()` appelle toujours `requestPermissionsAsync()` si permission pas encore accordee, mais seulement apres appel explicite.
- Un ecran `app/notification-settings.tsx` existe pour preferences, mais le prompt systeme peut arriver avant intention claire.

Risque Apple:
- Apple interdit de rendre des fonctionnalites dependantes de push/tracking/location et attend des demandes de permission contextuelles.
- Meme si le code ne bloque pas, un prompt immediat apres login peut paraitre agressif.

Correctif precis:
- Ne demander la permission push qu'apres action utilisateur: toggle notifications, reminder setup, scan-ready reminder.
- Conserver les notifications locales non invasives sans push token si permission refusee.
- Ajouter test pour garantir que `requestPermissionsAsync` n'est pas appele simplement au montage avec user.

Etat local:
- `useNotifications()` expose `registerForPushNotifications` et ne l'appelle plus automatiquement au montage.
- `app/notification-settings.tsx` appelle l'enregistrement uniquement apres sauvegarde de preferences avec au moins une option active.
- Verrouille par `__tests__/hooks/useNotifications.test.tsx`.

### APL-015 - Contact/support incoherent accepte

Preuve repo:
- `PRIVACY_POLICY.md` et `constants/privacyPolicy.ts` utilisent `privacy@healthscan.cloud` et `support@healthscan.cloud`.
- `components/StartupConfigGate.tsx:30-32` affiche `contact@selflens.org`.

Risque Apple:
- Guideline 1.5 demande des informations de contact faciles a trouver et a jour.
- Des emails differents peuvent donner une impression non finale.

Correctif precis:
- Harmoniser tous les contacts vers les adresses officielles.
- Verifier App Store Connect Support URL et Marketing URL.
- Ajouter le support email dans les notes reviewer et privacy page.

Etat local:
- `StartupConfigGate` conserve `contact@selflens.org`, sur demande utilisateur.
- Verrouille par `__tests__/config/appReviewBuildHygiene.test.ts` pour eviter un changement accidentel.

### APL-016 - Age rating, mineurs, UGC, ads

Preuve repo:
- Privacy dit que SelfLens n'est pas destine aux moins de 16 ans.
- Le repo contient UGC/social, rewarded ads, scans visage/corps/nutrition, coach IA.

Risque Apple:
- Age rating App Store Connect doit couvrir UGC, health/wellness, ads, user photos, et tout contenu potentiellement mature.

Correctif precis:
- Repasser le questionnaire age rating dans ASC.
- Si social est active, documenter moderation/age policy.
- Verifier que l'app n'est pas en Kids Category et ne cible pas enfants/ados.

### APL-017 - Accessibilite/HIG a finir sur device

Preuve repo:
- De nombreux boutons ont `accessibilityRole`/`accessibilityLabel`.
- Des mini-jeux/loading et flows camera ont ete touches recemment.
- `hooks/useReducedMotion.ts` existe, mais l'audit statique ne prouve pas la qualite VoiceOver.

Risque Apple:
- Pas toujours un rejet direct, mais Apple peut signaler des UI non finalisees, boutons non clairs ou affordances confuses, surtout apres une rejection precedente sur affordance.

Correctif precis:
- QA VoiceOver: login, Apple button, scanner, fridge scanner, paywall, settings deletion, social report/hide.
- QA Dynamic Type Large/Extra Large: pas de texte coupe sur paywall/legal/delete confirmations.
- QA Reduce Motion: mini-jeux/animations ne doivent pas bloquer.

## Points forts constates

- Sign in with Apple utilise le bouton natif: `components/OAuthButton.tsx:54-72`.
- Le flux Apple iOS utilise `expo-apple-authentication` + nonce/state + `signInWithIdToken`: `contexts/AuthContext.tsx:1672-1739`.
- Tests Apple natif presents: `__tests__/components/OAuthButton.test.tsx:44-62`.
- Test no tracking existant: `__tests__/config/noTracking.test.ts:10-21`.
- App icon final opaque 1024px teste: `__tests__/config/appIcon.test.ts`.
- Suppression de compte in-app presente et profonde: settings + Edge Function `delete-account`.
- Rewarded ads passent par un opt-in custom, AppLovin MAX, et un fail-open quand la regie n'est pas disponible.
- Privacy policy contient deja des sections face data, no biometric ID, no ads, no AI training, retention et deletion.
- Startup crash precedent 2.1(a) a un garde-fou avec `StartupConfigGate` et config publique dans `app.json`.

## Checklist pre-soumission App Review

### Code/config avant build

- `npx expo config --type introspect --json`: verifier absence de `NSAllowsArbitraryLoads`, absence dev client/network inspector, permissions iOS correctes, `usesAppleSignIn=true`, privacy manifest aggregation active.
- `npm test -- __tests__/config/noTracking.test.ts __tests__/config/appIcon.test.ts __tests__/components/OAuthButton.test.tsx __tests__/screens/PremiumUpgradeScreen.test.tsx __tests__/app/PrivacyPolicyScreen.test.tsx __tests__/app/SettingsScreen.test.tsx`
- `npm run typecheck`
- Verifier `.easignore` avec un dry-run/inspect: pas de `.env*`, `.p8`, backups, credentials, logs.

### Backend prod VPS

- Verifier que `https://supabase.basedjew.com` est live pendant review.
- Verifier `app_feature_flags` sur le VPS: social/moderation/entry offer/coach alignes avec le build.
- Verifier `delete-account`, `social-report-content`, `social-process-moderation-queue`, `sync-subscription-status`, `revenuecat-webhook`.
- Verifier n8n workflows actifs pour scan/coach/social report si actives.
- Verifier purge orphan uploads 24h et deletion cascade.

### App Store Connect

- Privacy labels: aligner data inventory + SDKs tiers + Tracking answer.
- Abonnements: produits visibles, subscription group, descriptions/prix, submission avec build.
- Review Notes: comptes premium actif et expired remplis, backend live, explication IA/wellness/non-medical, social moderation, account deletion, no ATT.
- Age rating: UGC, ads, health/wellness, user content.
- Screenshots/description: pas de claims medical/diagnostic, pas de promesse non supportee.
- Support URL et privacy URL fonctionnels.

### TestFlight physique

- Fresh install iPhone + iPad.
- Cold launch sans crash.
- Apple login natif, Google login, email login.
- Camera/photos/micro/speech prompts contextuels.
- Scanner, Super Scan, Chef scan, coach.
- Paywall: prix reels, purchase sandbox, restore, manage subscription, Terms, Privacy.
- Compte expired: montre free/paywall/restore/purchase.
- Social: post/comment/report/hide/block/admin queue, moderation pending non visible publiquement.
- Delete account: confirmations, billing warning, deletion effective, re-login impossible.
- Aucun ATT popup si Tracking = No.

## Ordre de correction recommande

1. Fermer APL-002, APL-003, APL-004, APL-008, APL-009, APL-010: correctifs rapides et tres visibles.
2. Verifier prod pour APL-001, APL-011, APL-012: ce sont des preuves de review, pas seulement du code.
3. Durcir APL-005, APL-006, APL-007: sante/IA/privacy/account deletion, les plus sensibles pour SelfLens.
4. Passer APL-013 a APL-018 en QA finale et metadata rehearsal.

## Hypotheses et limites

- Audit realise sans modifier les flux metier existants et sans acceder a App Store Connect.
- Audit realise sans appliquer de migration ni changer la prod VPS.
- Les valeurs publiques lues dans `app.json`/`eas.json` ne sont pas recopies ici.
- Ceci n'est pas un avis juridique; c'est un audit technique App Review base sur les guidelines Apple publiques et l'etat du repo.
