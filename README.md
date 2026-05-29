# SelfLens

Application mobile (Expo / React Native) de coaching santé & bien-être : analyse de scans (visage, corps, nutrition), coach conversationnel et fil social. Backend Supabase (Edge Functions Deno) + workflows n8n.

## Stack
- Expo SDK 54 · React Native 0.81 · expo-router (routing par fichiers) · Hermes + New Architecture
- Supabase (auth, Postgres, Edge Functions) · RevenueCat (achats) · n8n (workflows IA)
- TanStack Query · i18n (6 langues)

## Démarrage
```bash
npm install
npm run dev          # Expo (Metro)
npm run dev:client   # build dev client (modules natifs)
```

## Qualité
```bash
npm run typecheck    # tsc --noEmit
npm test             # jest
npm run lint         # expo lint
npm run check:encoding
```

## Build de production
```bash
eas build --platform android --profile production
eas build --platform ios --profile production
```

## Documentation
- Sécurité : fichiers `*_AUDIT*.md`, `SECURITY_AUDIT_SUPABASE.md`
- Mise en place : fichiers `SETUP_*.md`
- Webhooks n8n : `n8n/RESPONSE_SIGNING_REGISTRY.md`, `n8n/WEBHOOK_RESPONSE_SIGNING.md`, `n8n/FASTFOLLOW_RESPONSE_SIGNING.md`
- Confidentialité : `PRIVACY_POLICY.md`
