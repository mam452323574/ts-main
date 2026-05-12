import { z } from 'zod';

import { isCommonPassword } from '@/utils/passwordBlacklist';

// Schémas Zod pour la validation côté client des formulaires d'authentification
// (P2-E Phase 2 + U2-δ Phase 3). Aucune des règles n'est autoritaire —
// Supabase Auth reste le validateur final. Ces schémas servent à :
//   1. Bornes de longueur (anti-DoS sur password ≥ 128 char).
//   2. Format email RFC 5322 minimal pour échouer vite avant un round-trip.
//   3. Alignement avec la policy signup serveur (8+ chars, minuscule + chiffre).
//   4. Refus immédiat des passwords notoirement compromis (top-80 list locale).
// Toutes les erreurs renvoient un message générique en cas de failure pour
// éviter l'enumeration d'emails (cf. P1-4 Phase 1).

const EMAIL_MAX_LENGTH = 254; // RFC 5321
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const SIGNUP_PASSWORD_POLICY_PATTERN = /^(?=.*[a-z])(?=.*\d).+$/;

export const EmailSchema = z
  .string()
  .trim()
  .min(1)
  .max(EMAIL_MAX_LENGTH)
  .email();

export const LoginCredentialsSchema = z.object({
  email: EmailSchema,
  // Login : on n'impose pas la longueur min stricte (un user peut avoir un
  // ancien mot de passe court qu'on a accepté à la création). Le serveur
  // tranchera. On limite juste le max pour le DoS.
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const SignUpCredentialsSchema = z
  .object({
    email: EmailSchema,
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH)
      .max(PASSWORD_MAX_LENGTH)
      .refine((value) => SIGNUP_PASSWORD_POLICY_PATTERN.test(value), {
        message: 'password_policy',
      })
      // U2-δ Phase 3 — refuse les mots de passe trivialement compromis.
      .refine((value) => !isCommonPassword(value), {
        message: 'password_too_common',
      }),
    confirmPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'passwords_do_not_match',
  });

export type LoginCredentials = z.infer<typeof LoginCredentialsSchema>;
export type SignUpCredentials = z.infer<typeof SignUpCredentialsSchema>;
