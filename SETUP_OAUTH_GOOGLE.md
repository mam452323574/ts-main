# Configuration OAuth Google pour Health Scan

Ce guide vous accompagne dans la configuration complète de l'authentification Google OAuth pour permettre aux utilisateurs de se connecter avec leur compte Google.

## Prérequis

- Un compte Google Cloud Platform
- L'application Health Scan (package: `com.healthscan.app`)
- Accès à votre projet Supabase

## Étape 1: Créer ou Sélectionner un Projet Google Cloud

1. Connectez-vous à [Google Cloud Console](https://console.cloud.google.com/)
2. En haut de la page, cliquez sur le sélecteur de projet
3. Deux options:
   - **Option A:** Cliquez sur **"Nouveau projet"**, nommez-le "Health Scan" et créez-le
   - **Option B:** Sélectionnez un projet existant si vous en avez déjà un

## Étape 2: Activer l'API Google Identity

1. Dans le menu latéral, allez dans **"API et services"** → **"Bibliothèque"**
2. Recherchez **"Google Identity"** ou **"Google+ API"**
3. Cliquez sur **"Google Identity Services"**
4. Cliquez sur **"Activer"**
5. Attendez quelques secondes que l'activation se termine

## Étape 3: Configurer l'Écran de Consentement OAuth

1. Dans **"API et services"**, cliquez sur **"Écran de consentement OAuth"**
2. Sélectionnez **"Externe"** (pour permettre n'importe quel utilisateur Google de se connecter)
3. Cliquez sur **"Créer"**

### Page 1: Informations sur l'application

4. Remplissez les champs obligatoires:
   - **Nom de l'application:** Health Scan
   - **E-mail d'assistance utilisateur:** Votre email
   - **Logo de l'application:** (optionnel pour l'instant)
   - **Domaine de l'application:** Laissez vide pour le moment
   - **Liens:** Vous pouvez ajouter les liens plus tard
   - **E-mail du développeur:** Votre email

5. Cliquez sur **"Enregistrer et continuer"**

### Page 2: Champs d'application

6. Cliquez sur **"Ajouter ou supprimer des champs d'application"**
7. Cochez les scopes suivants:
   - `userinfo.email`
   - `userinfo.profile`
   - `openid`
8. Cliquez sur **"Mettre à jour"** puis **"Enregistrer et continuer"**

### Page 3: Utilisateurs test (si mode test)

9. Si vous êtes en mode test, ajoutez votre email Google
10. Cliquez sur **"Enregistrer et continuer"**
11. Sur la page de résumé, cliquez sur **"Retour au tableau de bord"**

## Étape 4: Créer les Identifiants OAuth 2.0

### Pour l'Application Web (Supabase)

1. Allez dans **"API et services"** → **"Identifiants"**
2. Cliquez sur **"+ Créer des identifiants"** → **"ID client OAuth"**
3. Sélectionnez **"Application Web"**
4. Remplissez:
   - **Nom:** Health Scan Web Client
   - **URI de redirection autorisés:**
     Cliquez sur **"+ Ajouter un URI"** et ajoutez:
     ```
     https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback
     ```
     ⚠️ Remplacez `YOUR_PROJECT_ID` par l'ID de votre projet Supabase
     (trouvez-le dans les paramètres Supabase ou dans l'URL de votre dashboard)

5. Cliquez sur **"Créer"**
6. Une popup s'affiche avec:
   - **Client ID:** Copiez-le et sauvegardez-le (vous en aurez besoin!)
   - **Client Secret:** Copiez-le également
7. Cliquez sur **"OK"**

### Pour l'Application Android (Optionnel mais recommandé)

8. Cliquez à nouveau sur **"+ Créer des identifiants"** → **"ID client OAuth"**
9. Sélectionnez **"Android"**
10. Remplissez:
    - **Nom:** Health Scan Android Client
    - **Nom du package:** `com.healthscan.app`
    - **Empreinte numérique du certificat SHA-1:**

      Pour obtenir votre SHA-1, exécutez cette commande dans votre terminal:

      **Pour le certificat de debug:**
      ```bash
      keytool -keystore ~/.android/debug.keystore -list -v
      ```
      Mot de passe par défaut: `android`

      **Pour le certificat de production:**
      ```bash
      keytool -keystore votre-keystore.jks -list -v
      ```

      Copiez la ligne qui commence par `SHA1:` (sans le préfixe)

11. Cliquez sur **"Créer"**

## Étape 5: Configuration dans Supabase

1. Connectez-vous à votre [projet Supabase](https://supabase.com/dashboard)
2. Dans le menu latéral, allez dans **"Authentication"** → **"Providers"**
3. Recherchez **"Google"** dans la liste des providers
4. Activez le toggle **"Enable Sign in with Google"**
5. Remplissez les champs:

   **Client ID (for OAuth):**
   Collez le Client ID que vous avez copié à l'étape 4.6

   **Client Secret (for OAuth):**
   Collez le Client Secret que vous avez copié à l'étape 4.6

6. Dans la section **"Redirect URLs"**, vous verrez une URL comme:
   ```
   https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback
   ```
   C'est cette URL que vous avez déjà ajoutée dans Google Cloud Console

7. Cliquez sur **"Save"**

## Étape 6: Obtenir l'URL de Redirection Supabase

Dans votre dashboard Supabase, dans Authentication → URL Configuration, vous trouverez:

**Site URL:**
```
com.healthscan.app://
```

**Redirect URLs:**
Ajoutez ces URLs (séparées par des virgules):
```
com.healthscan.app://oauth/callback,
http://localhost:19006/oauth/callback
```

La première est pour l'app mobile, la seconde pour le développement web local.

## Étape 7: Configurer Deep Linking dans l'App

Vérifiez que dans votre `app.json`, vous avez:

```json
{
  "expo": {
    "scheme": "healthscan",
    "ios": {
      "bundleIdentifier": "com.healthscan.app"
    },
    "android": {
      "package": "com.healthscan.app"
    }
  }
}
```

## Étape 8: Tester l'Authentification Google

1. Lancez votre application en développement
2. Cliquez sur **"Continuer avec Google"**
3. Vous serez redirigé vers la page de connexion Google
4. Sélectionnez votre compte Google
5. Acceptez les permissions demandées
6. Vous devriez être redirigé vers l'application et connecté automatiquement

## Résolution de Problèmes

### "Error 400: redirect_uri_mismatch"
- Vérifiez que l'URI de redirection dans Google Cloud Console correspond EXACTEMENT à celle fournie par Supabase
- Pas d'espace, pas de slash final supplémentaire
- Attendez 5 minutes après avoir modifié les URIs

### "Access blocked: Authorization Error"
- Votre écran de consentement est probablement en mode test
- Ajoutez votre email dans les utilisateurs test (Étape 3.9)
- OU publiez votre écran de consentement en production

### "OAuth client not found"
- Vérifiez que le Client ID et Secret sont correctement copiés dans Supabase
- Pas d'espaces au début ou à la fin
- Vérifiez qu'ils correspondent au client créé pour "Application Web"

### La redirection ne fonctionne pas
- Vérifiez que le scheme `healthscan` est bien configuré dans app.json
- Vérifiez que l'URL de redirection Supabase inclut `com.healthscan.app://oauth/callback`
- Testez d'abord sur un navigateur web avant de tester sur mobile

### "L'utilisateur ne peut pas se connecter"
- Si l'écran de consentement est en mode test, seuls les utilisateurs test peuvent se connecter
- Allez dans Google Cloud Console → OAuth consent screen
- Cliquez sur "Publier l'application" pour permettre à tous les utilisateurs Google de se connecter

## Configuration pour Apple OAuth (Guide Rapide)

Pour Apple OAuth, vous aurez besoin de:

1. Un compte Apple Developer
2. Créer un Service ID dans [Apple Developer Portal](https://developer.apple.com)
3. Configurer le domaine et les redirect URLs
4. Obtenir le Service ID, Team ID et Key ID
5. Générer et télécharger une clé privée (.p8)
6. Configurer tout cela dans Supabase Authentication → Providers → Apple

⚠️ Apple OAuth nécessite un domaine vérifié et est plus complexe que Google

## Notes Importantes

- Les changements dans Google Cloud Console peuvent prendre 5-10 minutes pour se propager
- En mode test, seuls les utilisateurs explicitement ajoutés peuvent se connecter
- Pour publier en production, vous devez passer par un processus de vérification Google si vous demandez des scopes sensibles
- Gardez vos Client Secret en sécurité, ne les commitez jamais dans Git

## Liens Utiles

- [Documentation Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [Documentation Supabase Auth](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Guide Deep Linking Expo](https://docs.expo.dev/guides/deep-linking/)

---

✅ Une fois ces étapes complétées, l'authentification Google OAuth est configurée et fonctionnelle!
