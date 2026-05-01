require('react-native-gesture-handler/jestSetup');

// Mock @react-navigation/native
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
  }),
}));

// Mock expo-localization
jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [
    {
      languageTag: 'en-US',
      languageCode: 'en',
      regionCode: 'US',
      textDirection: 'ltr',
    },
  ]),
  locale: 'en-US',
}));

// Mock LanguageContext
const { FR_TRANSLATIONS } = require('./i18n/locales/fr');
const { FR_RESULT_TRANSLATIONS } = require('./i18n/results/fr');
const { APP_TRANSLATION_OVERRIDES } = require('./i18n/locales/appOverrides');

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const cloneTree = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => cloneTree(item));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, cloneTree(nestedValue)]),
  );
};

const mergeTree = (target, source) => {
  Object.entries(source).forEach(([key, value]) => {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      mergeTree(target[key], value);
      return;
    }

    target[key] = value;
  });
};

const flattenTree = (source, prefix = '', output = {}) => {
  Object.entries(source).forEach(([key, value]) => {
    const nextPath = prefix ? `${prefix}.${key}` : key;

    if (isPlainObject(value)) {
      flattenTree(value, nextPath, output);
      return;
    }

    output[nextPath] = value;
  });

  return output;
};

const runtimeFrTranslations = cloneTree(FR_TRANSLATIONS);
mergeTree(runtimeFrTranslations, FR_RESULT_TRANSLATIONS);
mergeTree(runtimeFrTranslations, APP_TRANSLATION_OVERRIDES.fr);
const mockRuntimeTranslations = flattenTree(runtimeFrTranslations);

const mockLegacyTranslations = {
  'scanner.camera_permission_msg': "Nous avons besoin d'accÃ©der Ã  votre camÃ©ra",
  'scanner.authorize_camera': 'Autoriser',
  'scanner.type_required_title': 'Type de scan requis',
  'scanner.type_required_msg': 'Veuillez sélectionner un type de scan.',
  'scanner.eligibility_error_title': 'Vérification du scan impossible',
  'scanner.eligibility_auth_msg': 'Votre session a expiré. Reconnectez-vous puis réessayez.',
  'scanner.eligibility_unavailable_msg': 'La vérification de disponibilité du scan a échoué. Réessayez dans un instant.',
  'scan_types.health': 'Visage',
  'scan_types.body': 'Corps',
  'scan_types.nutrition': 'Nutrition',
  'scan_types.super': 'Super Scan',
  'scan_limit.limit_reached': 'Limite atteinte',
  'scan_limit.available': 'disponible',
  'scan_limit.loading': 'Chargement...',
  'scan_limit.unavailable': 'Indispo.',
  'scan_limit.auth_unready': 'Connexion...',
  'scan_limit.query_error': 'Erreur quota',
  'scan_limit.backend_unavailable': 'Service indispo.',
  'scan_limit.missing_payload': 'Données indispo.',
  'scan_limit.recharge': 'Recharge',
  'common.day': 'jour',
  'common.days': 'jours',
  'common.years_short': 'ans',
  'common.hour': 'heure',
  'common.hours': 'heures',
  'common.minute': 'minute',
  'common.minutes': 'minutes',
  'common.available': 'Disponible',
  'common.in': 'dans',
  'common.time.d': 'j',
  'common.time.h': 'h',
  'common.time.min': 'min',
  'common.time.s': 's',
  'scan_limits.msg_weekly_reached_with_time': 'Limite hebdomadaire atteinte. Prochain scan disponible dans {{time}}',
  'scan_limits.msg_monthly_reached_with_time': 'Limite mensuelle atteinte. Prochain scan disponible dans {{time}}',
  'scan_limits.msg_days_3_reached_with_time': 'Limite atteinte. Prochain scan disponible dans {{time}}',
  'scan_limits.msg_daily_reached_3_with_time': 'Limite quotidienne atteinte (3 scans). Prochain scan disponible dans {{time}}',
  'scan_limits.msg_daily_reached_1_with_time': 'Limite quotidienne atteinte (1 scan). Prochain scan disponible dans {{time}}',
  'scan_limits.msg_premium_only': 'RÃ©servÃ© aux membres Premium',
  'scan_limits.next_scan_available_title': 'Votre prochain scan est disponible dans {{time}}',
  'scan_limits.upgrade_unlimited_subtitle': 'Passez en Premium pour scanner sans limite',
  'common.account_free': 'Compte Gratuit',
  'common.account_premium': 'Compte Premium',
  'common.password': 'Mot de passe',
  'common.error': 'Erreur',
  'common.ok': 'OK',
  'common.cancel': 'Annuler',
  'common.back': 'Retour',
  'common.retry': 'Réessayer',
  'common.later': 'Plus tard',
  'common.next': 'Suivant',
  'common.error_config': 'Erreur de configuration',
  'share_story.title': 'Apercu',
  'share_story.share_action': 'Partager',
  'share_story.preview_caption': 'Apercu 9:16 pret a partager.',
  // Auth
  'auth.login_title': 'Health Scan',
  'auth.login_subtitle': 'Connectez-vous à votre compte',
  'auth.login_btn': 'Se Connecter',
  'auth.email_label': 'Email',
  'auth.email_placeholder': 'Votre email',
  'auth.password_placeholder': 'Votre mot de passe',
  'auth.password_min_placeholder': 'Minimum 6 caracteres',
  'auth.password_confirm': 'Confirmer le mot de passe',
  'auth.password_confirm_placeholder': 'Retapez votre mot de passe',
  'auth.no_account': 'Pas de compte ?',
  'auth.signup_link': "S'inscrire",
  'auth.errors.fill_all': 'Veuillez remplir tous les champs',
  'auth.errors.invalid_credentials': 'Identifiants invalides',
  'auth.errors.general_error': 'Erreur gÃ©nÃ©rale',
  'auth.signup_title': 'Health Scan',
  'auth.signup_subtitle': 'Creez votre compte',
  'auth.signup_btn': 'Continuer',
  'auth.has_account': 'Deja un compte ?',
  'auth.login_link': 'Se connecter',
  'auth.signup_info': 'Un email de vÃ©rification vous sera envoyÃ©',
  'auth.verification_note': 'Un code de verification sera envoye a votre adresse email.',
  'auth.error_account_creation': 'Erreur lors de la creation du compte',
  'auth.error_ip_limit_reached': 'Limite atteinte pour ce rÃ©seau',
  'auth.error_username_taken': 'Ce nom d\'utilisateur est dÃ©jÃ  pris',
  'auth.error_session_invalid': 'Session invalide',
  'auth.error_auth_cancelled': 'Authentification annulÃ©e',
  'auth.error_disposable_email': 'Les emails jetables ne sont pas autorisÃ©s',
  'auth.error_email_verification_required': 'VÃ©rification de l\'email requise',
  'auth.error_verification_send': 'Erreur lors de l\'envoi du code',
  'auth.error_verification_code': 'Code de vÃ©rification invalide',
  'auth.or_divider': 'ou',
  // Email verification (used by tests)
  'email_verification.title': 'Verifiez votre email',
  'email_verification.subtitle': 'Un code a ete envoye',
  'email_verification.verify_btn': 'Verifier',
  'email_verification.resend_btn': 'Renvoyer le code',
  'email_verification.resend_cooldown': 'Renvoyer dans',
  'email_verification.cancel_btn': 'Annuler',
  // Email verification (used by component)
  'auth.verify_title': 'Verifiez votre email',
  'auth.verify_subtitle': 'Un code a ete envoye a votre adresse email',
  'auth.verify_btn': 'Verifier',
  'auth.verifying': 'Verification...',
  'auth.resend_code': 'Renvoyer le code',
  'auth.resend_in': 'Renvoyer dans {{seconds}}s',
  'auth.code_incomplete': 'Code incomplet',
  'auth.code_invalid': 'Code invalide',
  'auth.code_expired': 'Le code expire dans',
  'auth.remember_device': 'Se souvenir de cet appareil',
  'auth.verification_sent_title': 'Email verifie !',
  'auth.verification_sent_subtitle_signup': 'Redirection...',
  'auth.verification_sent_subtitle_login': 'Connexion...',
  'auth.error_login_generic': 'Erreur de connexion',
  // Premium
  'premium.title': 'Health Scan Premium',
  'premium.subtitle': 'DÃ©bloquez tout le potentiel de votre santÃ©',
  'premium.feature_title': 'FonctionnalitÃ© Premium',
  'premium.upgrade_btn': 'Passer Ã  Premium',
  'premium.hint': 'DÃ©bloquez cette fonctionnalitÃ© et bien plus encore',
  'premium.price': '9,99â‚¬/mois',
  'premium.period': '/mois',
  'premium.cancel_anytime': 'Annulable a tout moment',
  'premium.subscribe_btn': "S'abonner maintenant",
  'premium.benefits_title': 'Avantages Premium',
  'premium.back_btn': 'Retour',
  'premium.features_title': 'FonctionnalitÃ©s incluses',
  'premium.benefits.instant': 'AccÃ¨s instantanÃ©',
  'premium.benefits.tracking': 'Suivi avancÃ©',
  'premium.benefits.support': 'Support prioritaire',
  'premium.web_unavailable_title': 'Non disponible',
  'premium.web_disclaimer': 'Les achats ne sont disponibles que sur mobile',
  'premium.web_note': 'Disponible sur mobile uniquement',
  'premium.restore_btn': 'Restaurer les achats',
  'premium.restoring': 'Restauration...',
  'premium.restore_success_title': 'Restauration reussie',
  'premium.restore_success_msg': 'Vos achats ont ete restaures',
  'premium.restore_empty_title': 'Aucun achat',
  'premium.restore_empty': 'Aucun achat premium trouve',
  'super_scan_features.premium_badge': 'Premium',
  'super_scan_features.connection_reconnecting': 'Reconnexion en cours...',
  'super_scan_features.connection_unstable': 'Connexion instable. Appuyez pour réessayer.',
  'premium.restore_error_default': 'Erreur lors de la restauration',
  'premium.restore_error_generic': 'Erreur lors de la restauration',
  'premium.validation_title': 'Validation',
  'premium.processing': 'Traitement en cours...',
  'premium.purchase_success_title': 'Felicitations !',
  'premium.purchase_success_msg': 'Vous etes maintenant Premium',
  'premium.purchase_error_default': 'Erreur lors de l\'achat',
  'premium.purchase_error_generic': 'Erreur lors de l\'achat',
  'premium.already_premium_title': 'Vous etes Premium',
  'premium.already_premium_desc': 'Vous avez deja acces a toutes les fonctionnalites',
  // Avatar
  'components.avatar.hint': 'Appuyez pour modifier',
  'components.avatar.error_title': 'Erreur',
  'components.avatar.error_size': 'Image trop volumineuse (max 5MB)',
  'components.avatar.error_download': 'Erreur lors du telechargement',
  'components.avatar.error_picker_launch': 'Impossible d\'ouvrir le selecteur de photo pour le moment.',
  'components.avatar.error_camera_unavailable': 'La camera n\'est pas disponible sur cet appareil.',
  'components.avatar.perm_title': 'Permissions requises',
  'components.avatar.perm_gallery': 'Acces a la galerie requis',
  'components.avatar.perm_camera': 'Acces a la camera requis',
  'components.avatar.options_title': 'Photo de profil',
  'components.avatar.options_msg': 'Choisissez une source',
  'components.avatar.take_photo': 'Prendre une photo',
  'components.avatar.choose_gallery': 'Choisir de la galerie',
  'components.avatar.open_settings': 'Ouvrir les parametres',
  'components.avatar.crop_title': 'Recadrer la photo',
  'components.avatar.crop_confirm': 'Valider',
  // FeatureGate
  'components.feature_gate.title': 'Fonctionnalité Premium',
  'components.feature_gate.upgrade_btn': 'Passer Premium',
  'components.feature_gate.hint': 'Débloquez cette fonctionnalité et bien plus encore',
  // FeatureComparisonList
  'components.feature_list.free': 'Gratuit',
  'components.feature_list.premium': 'Premium',
  // FeatureComparisonTable
  'components.table.header_feature': 'Fonctionnalité',
  'components.table.header_free': 'Gratuit',
  'components.table.header_premium': 'Premium',
  // Onboarding / UsernameSetup
  'onboarding.welcome_title': 'Bienvenue !',
  'onboarding.setup_profile': 'Configurez votre profil',
  'onboarding.choose_style': 'Choisissez votre style',
  'onboarding.theme_step_title': 'Choisissez votre ambiance',
  'onboarding.theme_step_subtitle': 'Votre choix s applique tout de suite.',
  'onboarding.username_step_title': 'Comment doit-on vous appeler ?',
  'onboarding.username_step_subtitle': 'Choisissez un pseudo simple.',
  'onboarding.avatar_title': 'Ajoutez une photo de profil',
  'onboarding.avatar_subtitle': "C'est optionnel pour l'instant.",
  'onboarding.avatar_pre_auth_title': 'Ajoutez une photo',
  'onboarding.avatar_pre_auth_subtitle': 'Elle reste sur votre appareil.',
  'onboarding.avatar_change_title': 'Photo de profil',
  'onboarding.avatar_change_subtitle': 'Gardez-la ou changez-la plus tard.',
  'onboarding.avatar_skip': 'Passer pour le moment',
  'onboarding.avatar_selected': 'Photo selectionnee',
  'onboarding.avatar_take_photo': 'Prendre une photo',
  'onboarding.avatar_choose_gallery': 'Choisir dans la galerie',
  'onboarding.avatar_upload_retry': 'Reessayer l upload',
  'onboarding.avatar_upload_continue': 'Continuer sans photo',
  'onboarding.account_step_title': 'Creez votre compte',
  'onboarding.account_step_subtitle': 'Derniere etape avant le code.',
  'onboarding.username_label': 'Nom d\'utilisateur',
  'onboarding.username_placeholder': 'pseudo123',
  'onboarding.next_btn': 'Suivant',
  'onboarding.start_btn': 'Commencer l\'aventure',
  'onboarding.enter_app': 'Ouvrir l\'app',
  'onboarding.slide_1_title': 'La balance ment. Le miroir improvise.',
  'onboarding.slide_1_subtitle': 'Sans scan, vous lisez une impression. Pas un signal.',
  'onboarding.slide_2_title': 'Le scan lit. La donnÃ©e tranche.',
  'onboarding.slide_2_subtitle': 'Visage, corps, nutrition. Une lecture nette. Sans approximation.',
  'onboarding.slide_3_title': 'Suivez la trajectoire. Pas l\'humeur.',
  'onboarding.slide_3_subtitle': 'Mesurez ce qui bouge. Ne roulez plus a l\'aveugle.',
  'onboarding.error_session': 'Session invalide',
  'onboarding.error_email': 'Email non verifie',
  'onboarding.error_username_empty': 'Nom d\'utilisateur requis',
  'onboarding.error_username_taken': 'Ce nom est deja pris',
  'onboarding.username_status.checking': 'Verification...',
  'onboarding.username_status.available': 'Disponible',
  'onboarding.username_status.taken': 'Deja pris',
  'onboarding.username_status.invalid': 'Format invalide',
  'onboarding.username_status.ready': 'Pseudo pret',
  'onboarding.error_avatar_upload': 'La photo n a pas pu etre envoyee.',
  'onboarding.theme.dark': 'Sombre',
  'onboarding.theme.dark_desc': 'Mode sombre pour un confort visuel',
  'onboarding.theme.light': 'Clair',
  'onboarding.theme.light_desc': 'Mode clair classique',
  'social.composer.identity_meta': 'Publication avec votre profil public',
  'social.composer.draft_loading': 'Chargement du brouillon...',
  'social.composer.draft_missing': 'Brouillon introuvable',
  // Recipes
  'recipes.title': 'Nos Recettes',
  'recipes.no_results': 'Aucune recette trouvée',
  'recipes.search_placeholder': 'Rechercher une recette...',
  'recipes.prep_time': 'min',
  'recipes.difficulty.easy': 'Facile',
  'recipes.difficulty.medium': 'Moyen',
  'recipes.difficulty.hard': 'Difficile',
  // Exercises
  'exercises.title': 'Nos Exercices',
  'exercises.no_results': 'Aucun exercice trouvé',
  'exercises.search_placeholder': 'Rechercher un exercice...',
  'exercises.duration': 'min',
  'exercises.difficulty.easy': 'Facile',
  'exercises.difficulty.medium': 'Moyen',
  'exercises.difficulty.hard': 'Difficile',
  // ScanPreview
  'scan_preview.type_label': 'Type de scan',
  'scan_preview.confirm_button': 'Confirmer',
  'scan_preview.confirm_loading': 'Analyse en cours...',
  'scan_preview.error_title_analysis': 'Erreur d\'analyse',
  'scan_preview.error_title_type': 'Type incompatible',
  'scan_preview.error_title_session': 'Session expirée',
  'scan_preview.error_title_network': 'Erreur réseau',
  'scan_preview.error_title_timeout': 'Analyse trop longue',
  'scan_preview.error_title_upload': 'Envoi impossible',
  'scan_preview.error_title_provider': 'Service d\'analyse indisponible',
  'scan_preview.error_title_server': 'Erreur serveur',
  'scan_preview.error_msg_default': 'Oups, l\'image n\'a pas pu être analysée.',
  'scan_preview.error_msg_type': 'Le type d\'analyse retourné ne correspond pas au scan demandé.',
  'scan_preview.error_msg_network': 'Impossible de contacter le serveur d\'analyse.',
  'scan_preview.error_msg_session': 'Votre session a expiré. Reconnectez-vous puis réessayez.',
  'scan_preview.error_msg_timeout': 'L\'analyse prend trop de temps. Réessayez dans un instant.',
  'scan_preview.error_msg_upload': 'L\'image du scan n\'a pas pu être envoyée ou retrouvée côté stockage.',
  'scan_preview.error_msg_provider': 'Le fournisseur d\'analyse est indisponible ou mal configuré pour ce scan.',
  'scan_preview.error_msg_server': 'Le traitement du scan a échoué côté serveur. Réessayez dans un instant.',
  'scan_preview.error_validation': 'Paramètres invalides.',
  'coach.eyebrow': 'Coach guide',
  'coach.title': 'Demandez un conseil bien-etre cible',
  'coach.body': 'Choisissez un prompt et nous reutiliserons vos scans recents pour generer une reponse structuree et mise en cache.',
  'coach.prompt_section_title': 'Demander un nouveau conseil',
  'coach.persona_section_title': 'Ajustez le ton du Coach',
  'coach.persona_section_body': 'Selectionnez le style de coaching avant de generer une reponse.',
  'coach.latest_guidance_label': 'Dernier conseil',
  'coach.recent_badge': 'Recent',
  'coach.cached_badge': 'Enregistre',
  'coach.fallback_badge': 'Secours',
  'coach.active_persona_label': 'Personnalite du Coach',
  'coach.disclaimer_label': 'Rappel non diagnostique',
  'coach.loading_title': 'Conseil en preparation',
  'coach.loading_body': 'Le Coach s\'appuie sur vos derniers scans.',
  'coach.error_title': 'Impossible de rafraichir Coach maintenant',
  'coach.empty_title': 'Pas de scan recent',
  'coach.empty_body': 'Lancez un scan pour debloquer un conseil Coach.',
  'coach.empty_body_compact': 'Un scan recent permet au Coach de personnaliser la prochaine action.',
  'coach.empty_scan_cta': 'Lance un scan pour debloquer ton conseil',
  'coach.empty_scan_types_hint': 'Visage · Corps · Nutrition',
  'coach.first_scan_required_title': 'Premier scan requis',
  'coach.first_scan_required_body': 'Fais au moins un scan pour que ton coach ait des donnees a analyser.',
  'coach.first_scan_required_cta': 'Faire un scan',
  'coach.no_scan_title': 'Fais un scan d’abord',
  'coach.no_scan_body': 'Fais un scan d’abord pour que Coach ait des donnees a analyser.',
  'coach.unavailable_title': 'Coach indisponible',
  'coach.unavailable_body': 'Nouvelles reponses indisponibles pour le moment. Vos conseils deja enregistres restent visibles.',
  'coach.quota.loading': 'Conseils Coach : verification...',
  'coach.quota.unavailable': 'Conseils Coach indisponibles',
  'coach.quota.count': 'Conseils Coach : {{available}}/{{limit}}',
  'coach.quota.unlimited_count': 'Conseils Coach : Illimite',
  'coach.quota.checking': 'Verification du quota...',
  'coach.quota.available': 'Disponible',
  'coach.quota.unlimited_status': 'Illimite',
  'coach.quota.next_recharge_in': 'Prochaine recharge dans {{duration}}',
  'coach.quota.next_request_in': 'Prochaine demande dans {{duration}}',
  'coach.quota.recharge_soon': 'Recharge imminente',
  'coach.quota.verify_error_title': 'Quota indisponible',
  'coach.quota.verify_error': 'Impossible de verifier ton quota pour le moment',
  'coach.quota.exhausted_title': 'Quota Coach atteint',
  'coach.quota.compact_available_one': '{{available}}/{{limit}} disponible',
  'coach.quota.compact_available_many': '{{available}}/{{limit}} conseils',
  'coach.quota.compact_exhausted': '{{available}}/{{limit}} · Recharge {{duration}}',
  'coach.quota.compact_unavailable': 'Quota indisponible',
  'coach.locked_badge': 'Premium',
  'coach.locked_tap_hint': 'Touchez pour debloquer cette personnalite.',
  'coach.persona_unknown_title': 'Coach',
  'coach.error_body': 'Votre dernier conseil sauvegarde reste disponible quand c\'est possible. Reessayez dans un instant.',
  'coach.error_body_provider_unreachable': 'Le service Coach n\'a pas pu repondre pour le moment. Reessayez dans un instant.',
  'coach.error_body_invalid_response': 'Le service Coach a renvoye une reponse inattendue. Reessayez dans un instant.',
  'coach.disclaimer_label': 'Rappel non diagnostique',
  'coach.disclaimer_pill_label': 'Info, pas diagnostic',
  'coach.disclaimer_default': 'Conseil bien-etre uniquement. Ceci ne remplace ni un diagnostic ni un avis medical.',
  'coach.history_empty_title': 'Aucun conseil pour le moment',
  'coach.history_empty_body': 'Demandez un nouveau conseil : les reponses terminees apparaitront ici automatiquement.',
  'coach.action_bar.primary': 'Nouveau conseil',
  'coach.action_bar.primary_with_quota': '{{available}}/{{limit}} · Nouveau conseil',
  'coach.action_bar.primary_exhausted': '{{available}}/{{limit}} · {{cooldown}}',
  'coach.action_bar.primary_unlimited': 'Illimite · Nouveau conseil',
  'coach.action_bar.primary_checking': 'Verification du quota...',
  'coach.action_bar.primary_unavailable': 'Quota indisponible',
  'coach.action_bar.scan_required': 'Fais un scan pour débloquer le coach',
  'coach.result.edit_settings': 'Modifier les réglages',
  'coach.result.edit_settings_a11y': 'Modifier les réglages du coach',
  'coach.result.request_new_advice': 'Demander un nouveau conseil',
  'coach.result.request_new_advice_a11y': 'Demander un nouveau conseil au coach',
  'coach.cta_routes.history': "Voir l'historique",
  'coach.cta_routes.recipes': 'Voir les recettes',
  'coach.cta_routes.exercises': 'Voir les exercices',
  'coach.cta_routes.scan_result': 'Voir les resultats',
  'coach.cta_routes.premium': 'Passer Premium',
  'coach.cta_routes.settings': 'Ouvrir les reglages',
  'coach.cta_routes.notifications': 'Voir les notifications',
  // Settings
  'settings.select_language_title': 'Choisir la langue',
};


jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key, params) => {
      let value = mockRuntimeTranslations[key] ?? mockLegacyTranslations[key];
      if (value === undefined) {
        // Support defaultValue for dynamic keys (e.g. premium_features.categories.X)
        if (params && params.defaultValue !== undefined) {
          return params.defaultValue;
        }
        return key;
      }
      if (params) {
        Object.keys(params).forEach(k => {
          if (k !== 'defaultValue') {
            value = value.replace(`{{${k}}}`, params[k]);
          }
        });
      }
      return value;
    },
    language: 'fr',
    locale: 'fr',
    changeLanguage: jest.fn(),
  }),
  LanguageProvider: ({ children }) => children,
}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      EXPO_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'test-key',
      eas: {
        projectId: 'test-project-id',
      },
    },
  },
}));

// Mock expo-image-manipulator
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(() => Promise.resolve({ uri: 'manipulated-image-uri', width: 100, height: 100, base64: 'test-base-64' })),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));

jest.mock('expo-image-picker', () => ({
  getCameraPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'granted', granted: true, canAskAgain: true })
  ),
  requestCameraPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'granted', granted: true, canAskAgain: true })
  ),
  getMediaLibraryPermissionsAsync: jest.fn(() =>
    Promise.resolve({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      accessPrivileges: 'all',
    })
  ),
  requestMediaLibraryPermissionsAsync: jest.fn(() =>
    Promise.resolve({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      accessPrivileges: 'all',
    })
  ),
  launchCameraAsync: jest.fn(() =>
    Promise.resolve({ canceled: true, assets: [] })
  ),
  launchImageLibraryAsync: jest.fn(() =>
    Promise.resolve({ canceled: true, assets: [] })
  ),
  MediaTypeOptions: {
    Images: 'Images',
  },
}));

// Mock expo-linking
jest.mock('expo-linking', () => ({
  createURL: jest.fn((path) => `exp://${path}`),
  openURL: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
}));

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: 'test-push-token' })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  removeNotificationSubscription: jest.fn(),
  AndroidImportance: {
    MAX: 5,
  },
  setNotificationChannelAsync: jest.fn(),
  SchedulableTriggerInputTypes: {
    DATE: 'date',
    TIME_INTERVAL: 'timeInterval',
    DAILY: 'daily',
  },
}));

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => { };
  return Reanimated;
});

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  performAndroidHapticsAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
    Soft: 'soft',
  },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
  AndroidHaptics: {
    Confirm: 'confirm',
  },
}));

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useSegments: () => [],
  useLocalSearchParams: () => ({}),
  Link: 'Link',
  Stack: {
    Screen: 'Screen',
  },
}));

// Mock @react-native-async-storage/async-storage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock expo-secure-store — utilisé comme storage Supabase Auth (P0-1).
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    getItemAsync: jest.fn((key) =>
      Promise.resolve(store.has(key) ? store.get(key) : null)
    ),
    setItemAsync: jest.fn((key, value) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key) => {
      store.delete(key);
      return Promise.resolve();
    }),
    __resetSecureStoreMock: () => store.clear(),
  };
});

// Polyfill silencieux de crypto.getRandomValues pour les tests (équivalent du
// polyfill react-native-get-random-values importé en prod via app/_layout.tsx).
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.getRandomValues) {
  const { webcrypto } = require('crypto');
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
}

// Mock expo-linear-gradient
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

jest.mock('expo-image', () => {
  const { Image } = require('react-native');

  return {
    Image,
  };
});

jest.mock('expo-font', () => ({
  useFonts: jest.fn(() => [true]),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: {
    Base64: 'base64',
  },
  downloadAsync: jest.fn(() =>
    Promise.resolve({ uri: 'file:///cache/social-post-test.jpg' })
  ),
  getInfoAsync: jest.fn(() =>
    Promise.resolve({ exists: true, size: 1024 })
  ),
  readAsStringAsync: jest.fn(() =>
    Promise.resolve('dGVzdA==')
  ),
}));

jest.mock('@aptabase/react-native', () => ({
  __esModule: true,
  default: {
    init: jest.fn(),
    trackEvent: jest.fn(),
    dispose: jest.fn(),
  },
  init: jest.fn(),
  trackEvent: jest.fn(),
  dispose: jest.fn(),
}));

jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(() => Promise.resolve('file:///tmp/share-story.png')),
}));

jest.mock('react-native-svg', () => {
  const React = require('react');
  const mockComponent = (name) => {
    return ({ children, ...props }) =>
      React.createElement(name, props, children);
  };

  return {
    __esModule: true,
    default: mockComponent('Svg'),
    Svg: mockComponent('Svg'),
    Circle: mockComponent('Circle'),
    G: mockComponent('G'),
    Path: mockComponent('Path'),
    Rect: mockComponent('Rect'),
    Text: mockComponent('SvgText'),
    Defs: mockComponent('Defs'),
    LinearGradient: mockComponent('SvgLinearGradient'),
    RadialGradient: mockComponent('SvgRadialGradient'),
    Stop: mockComponent('Stop'),
  };
});

jest.mock('expo-navigation-bar', () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
  setBorderColorAsync: jest.fn(() => Promise.resolve()),
  setButtonStyleAsync: jest.fn(() => Promise.resolve()),
  setStyle: jest.fn(),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#F5F6FA',
      cardBackground: '#FFFFFF',
      surfaceMuted: '#F7F8FC',
      surfaceAccent: '#EAF3FF',
      primaryText: '#1C1C1E',
      secondaryText: '#6E6E73',
      textMuted: '#6E6E73',
      accentGreen: '#34C759',
      accent: '#007AFF',
      lightGray: '#E3E7EF',
      gray: '#6E6E73',
      grayLight: '#F7F8FC',
      grayMedium: '#D5DBE7',
      darkGray: '#3B3F4A',
      borderSubtle: '#E3E7EF',
      borderStrong: '#D5DBE7',
      primary: '#007AFF',
      primaryLight: '#EAF3FF',
      primaryDark: '#0056B3',
      secondary: '#5856D6',
      white: '#FFFFFF',
      error: '#FF3B30',
      success: '#34C759',
      successLight: '#E8F9ED',
      warning: '#FF9500',
      gold: '#FFD700',
      goldLight: '#FFF8E1',
    },
    isDark: false,
    toggleTheme: jest.fn(),
    setTheme: jest.fn(),
  }),
}));

const mockUser = { id: 'test-user', email: 'test@example.com' };
const mockSession = { access_token: 'test-token' };
const mockUseAuth = jest.fn(() => ({
  user: mockUser,
  session: mockSession,
  userProfile: {
    id: 'test-user',
    account_tier: 'free',
    avatar_url: null,
    has_seen_tutorial: false,
  },
  isLoading: false,
  loading: false,
  signOut: jest.fn(),
  refreshUserProfile: jest.fn(),
  updateUserProfile: jest.fn(),
  updateAvatarUrl: jest.fn(),
  markTutorialSeen: jest.fn(),
}));

jest.mock('expo-device', () => ({
  isDevice: true,
  modelName: 'Test Device',
  osVersion: '14.0',
  brand: 'Test Brand',
  manufacturer: 'Test Manufacturer',
}));

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }) => children,
  SafeAreaView: ({ children }) => children,
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }) => children,
}));

// Mock Supabase
jest.mock('@/services/supabase', () => ({
  supabase: {
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    })),
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        })),
        order: jest.fn(() => ({
          order: jest.fn(() => ({
            limit: jest.fn().mockResolvedValue({ data: [], error: null }),
          })),
          limit: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      })),
      order: jest.fn(() => ({
        order: jest.fn(() => ({
          limit: jest.fn().mockResolvedValue({ data: [], error: null }),
        })),
        limit: jest.fn(() => ({
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
      upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
      update: jest.fn(() => ({
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      })),
      insert: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
      getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null }),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
      signInWithPassword: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user' }, session: { access_token: 'test-token' } }, error: null }),
      signUp: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user' }, session: null }, error: null }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
      verifyOtp: jest.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null }),
    },
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ data: { path: 'test' }, error: null }),
        getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://test.com/image.jpg' } }),
        createSignedUrl: jest.fn().mockResolvedValue({ data: { signedUrl: 'https://test.com/signed-image.jpg' }, error: null }),
        remove: jest.fn().mockResolvedValue({ data: null, error: null }),
      })),
    },
  },
}));

// Mock lucide-react-native - return simple string components
jest.mock('lucide-react-native', () => {
  return new Proxy({}, {
    get: function (target, prop) {
      if (prop === '__esModule') return true;
      // Return a simple mock component (string) for React
      return prop;
    }
  });
});

// Mock LanguageSelector component directly to avoid lucide rendering issues
jest.mock('@/components/LanguageSelector', () => ({
  LanguageSelector: () => 'LanguageSelector',
}));

// Mock expo-blur
jest.mock('expo-blur', () => ({
  BlurView: 'BlurView',
}));
