import {
  DEFAULT_LOCALE,
  USER_DEFAULT_LOCALE,
  type LocaleCode,
} from '@/i18n/config';

export interface TermsSection {
  title: string;
  paragraphs: string[];
}

export interface TermsLocaleContent {
  locale: LocaleCode;
  label: string;
  title: string;
  lastUpdated: string;
  intro: string;
  sections: TermsSection[];
}

const APPLE_STANDARD_EULA_URL =
  'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

const EN_TERMS: TermsLocaleContent = {
  locale: 'en',
  label: 'EN',
  title: 'Terms of Use',
  lastUpdated: 'Last updated: July 2, 2026',
  intro:
    'These terms govern your use of SelfLens and the auto-renewable subscriptions offered in the app.',
  sections: [
    {
      title: '1. App Store terms',
      paragraphs: [
        `SelfLens is licensed under Apple's Standard End User License Agreement (${APPLE_STANDARD_EULA_URL}) unless a separate written agreement applies.`,
        'Your App Store account is charged for purchases made through Apple in-app purchase.',
      ],
    },
    {
      title: '2. Subscriptions',
      paragraphs: [
        'Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period.',
        'You can manage or cancel an App Store subscription in your Apple account subscription settings.',
        'Deleting your SelfLens account does not cancel an active App Store subscription.',
      ],
    },
    {
      title: '3. Use of SelfLens',
      paragraphs: [
        'SelfLens provides wellness scan, history, coaching, and social features. It is not a medical device and does not replace professional medical advice.',
        'You are responsible for the content you submit and must not upload unlawful, harmful, or objectionable content.',
      ],
    },
    {
      title: '4. Account and deletion',
      paragraphs: [
        'You can delete your account in the app from Settings > Danger zone > Delete account.',
        'Account deletion removes your SelfLens account data as described in the Privacy Policy, but Apple subscription cancellation must be handled through Apple.',
      ],
    },
    {
      title: '5. Contact',
      paragraphs: [
        'For product support or legal questions, contact contact@selflens.org.',
      ],
    },
  ],
};

const FR_TERMS: TermsLocaleContent = {
  locale: 'fr',
  label: 'FR',
  title: "Conditions d'utilisation",
  lastUpdated: 'Derniere mise a jour : 2 juillet 2026',
  intro:
    "Ces conditions regissent votre utilisation de SelfLens et des abonnements auto-renouvelables proposes dans l'application.",
  sections: [
    {
      title: '1. Conditions App Store',
      paragraphs: [
        `SelfLens est concu sous la licence Apple Standard End User License Agreement (${APPLE_STANDARD_EULA_URL}), sauf accord ecrit separe.`,
        'Votre compte App Store est facture pour les achats effectues via les achats integres Apple.',
      ],
    },
    {
      title: '2. Abonnements',
      paragraphs: [
        "Les abonnements se renouvellent automatiquement sauf annulation au moins 24 heures avant la fin de la periode en cours.",
        'Vous pouvez gerer ou annuler un abonnement App Store dans les reglages des abonnements de votre compte Apple.',
        "Supprimer votre compte SelfLens n'annule pas un abonnement App Store actif.",
      ],
    },
    {
      title: '3. Utilisation de SelfLens',
      paragraphs: [
        "SelfLens fournit des fonctionnalites de scans bien-etre, historique, coaching et social. L'application n'est pas un dispositif medical et ne remplace pas un avis medical professionnel.",
        'Vous etes responsable du contenu que vous envoyez et ne devez pas televerser de contenu illegal, dangereux ou objectionnable.',
      ],
    },
    {
      title: '4. Compte et suppression',
      paragraphs: [
        "Vous pouvez supprimer votre compte dans l'application depuis Reglages > Zone de danger > Supprimer le compte.",
        'La suppression du compte efface vos donnees SelfLens comme decrit dans la Politique de confidentialite, mais l annulation d un abonnement Apple doit etre effectuee via Apple.',
      ],
    },
    {
      title: '5. Contact',
      paragraphs: [
        'Pour le support produit ou les questions legales, contactez contact@selflens.org.',
      ],
    },
  ],
};

export const TERMS_OF_USE_CONTENT: Record<LocaleCode, TermsLocaleContent> = {
  fr: FR_TERMS,
  en: EN_TERMS,
  it: { ...EN_TERMS, locale: 'it', label: 'IT' },
  pt: { ...EN_TERMS, locale: 'pt', label: 'PT' },
  es: { ...EN_TERMS, locale: 'es', label: 'ES' },
  de: { ...EN_TERMS, locale: 'de', label: 'DE' },
};

export function getTermsOfUseContent(locale?: string): TermsLocaleContent {
  const normalized = locale === USER_DEFAULT_LOCALE ? DEFAULT_LOCALE : locale;
  if (normalized && normalized in TERMS_OF_USE_CONTENT) {
    return TERMS_OF_USE_CONTENT[normalized as LocaleCode];
  }
  return TERMS_OF_USE_CONTENT[DEFAULT_LOCALE];
}
