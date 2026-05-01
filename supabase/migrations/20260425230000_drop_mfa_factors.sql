-- 20260425230000_drop_mfa_factors.sql
--
-- Decision produit : la MFA TOTP est retiree de l'app HealthScan/TSE.
-- Cette migration supprime les facteurs MFA enroles, les challenges en cours
-- et les claims AMR associes pour eviter des sessions zombies cote serveur.
--
-- Le frontend ne demande plus l'enrollment ni le challenge MFA (cf. retrait
-- des ecrans MfaEnroll/MfaChallenge et des fonctions enrollTotp/verifyTotp).
-- La migration precedente 20260425220000_disable_mfa_aal2 avait deja unwrapped
-- les policies RLS qui exigeaient aal=aal2 ; cette migration ferme la boucle
-- en nettoyant l'etat des donnees auth.
--
-- Idempotente : si les tables sont vides, les DELETE sont no-op.

DELETE FROM auth.mfa_amr_claims
WHERE authentication_method LIKE 'totp%';

DELETE FROM auth.mfa_challenges;
DELETE FROM auth.mfa_factors;
