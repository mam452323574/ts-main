import type { LocaleCode } from '@/i18n/config';
import type { TranslationTree } from '@/i18n/internal/translationTree';

export const APP_TRANSLATION_OVERRIDES: Record<LocaleCode, TranslationTree> = {
  fr: {
    common: {
      error_config: 'Erreur de configuration',
    },
    auth: {
      or_divider: 'ou',
      password_show: 'Afficher le mot de passe',
      password_hide: 'Masquer le mot de passe',
    },
    settings: {
      danger_zone_desc:
        'Vous pouvez fermer votre session sur cet appareil a tout moment et vous reconnecter quand vous le souhaitez.',
      delete_account_button: 'Supprimer le compte',
      delete_account_desc:
        'Supprime definitivement votre compte, vos scans et vos donnees associees.',
      delete_account_loading: 'Suppression du compte...',
      delete_account_confirm_title: 'Supprimer votre compte ?',
      delete_account_confirm_msg:
        'Cette action supprimera votre profil, vos scans, vos images et vos donnees associees. Elle est definitive. Un abonnement App Store actif doit etre annule depuis vos abonnements Apple.',
      delete_account_continue: 'Continuer',
      delete_account_final_title: 'Derniere confirmation',
      delete_account_final_msg:
        'Votre compte sera supprime maintenant. Cette operation ne peut pas etre annulee. La suppression du compte n annule pas un abonnement App Store actif.',
      delete_account_error_title: 'Suppression impossible',
      delete_account_error_msg:
        'Nous n avons pas pu supprimer votre compte pour le moment. Reessayez dans quelques instants.',
    },
    social: {
      errors: {
        unavailable_title: 'Social indisponible',
      },
    },
    components: {
      feature_gate: {
        hint: 'Debloquez cette fonctionnalite et bien plus encore avec Premium.',
      },
      error_boundary: {
        message: "Une erreur inattendue s'est produite.",
      },
    },
    coach: {
      scan_result_cta: {
        eyebrow: 'Suite du scan',
        title: 'Ton prochain conseil est pret',
        body_fallback: 'Transformer ce point en plan concret.',
        body_suffix:
          'Ton coach peut te proposer un plan simple a appliquer tout de suite.',
        question_label: 'Question prete',
        action: 'Demander au coach',
        action_direct: 'Obtenir mon conseil',
        final: {
          eyebrow: 'Ton coach personnel',
          title_lead: 'Le plan qui te correspond,',
          title_highlight: 'en 30 secondes.',
          subtitle: 'Ton scan a parle. Passe a l\'action.',
          question_label: 'Ta question prete',
          benefit_1: 'Plan personnalise selon ton scan',
          benefit_2: 'Reponses instantanees, sans attente',
          benefit_3: 'Sans engagement, tu testes c\'est tout',
          cta: 'Demarrer mon coaching',
          footnote: 'Gratuit · prend 30 secondes',
        },
      },
    },
  },
  en: {
    common: {
      error_config: 'Configuration error',
    },
    auth: {
      or_divider: 'or',
      password_show: 'Show password',
      password_hide: 'Hide password',
    },
    settings: {
      danger_zone_desc:
        'You can safely sign out on this device at any time and come back whenever you want.',
      delete_account_button: 'Delete account',
      delete_account_desc:
        'Permanently deletes your account, scans, and associated data.',
      delete_account_loading: 'Deleting account...',
      delete_account_confirm_title: 'Delete your account?',
      delete_account_confirm_msg:
        'This will delete your profile, scans, images, and associated data. This action is permanent. Active App Store subscriptions must be cancelled in your Apple subscriptions.',
      delete_account_continue: 'Continue',
      delete_account_final_title: 'Final confirmation',
      delete_account_final_msg:
        'Your account will be deleted now. This operation cannot be undone. Deleting your account does not cancel an active App Store subscription.',
      delete_account_error_title: 'Could not delete account',
      delete_account_error_msg:
        'We could not delete your account right now. Please try again in a moment.',
    },
    social: {
      errors: {
        unavailable_title: 'Social unavailable',
      },
    },
    components: {
      feature_gate: {
        hint: 'Unlock this feature and much more with Premium.',
      },
      error_boundary: {
        message: 'An unexpected error occurred.',
      },
    },
    coach: {
      scan_result_cta: {
        eyebrow: 'After the scan',
        title: 'Your next advice is ready',
        body_fallback: 'Turn this point into a concrete plan.',
        body_suffix:
          'Your coach can suggest a simple plan you can start right away.',
        question_label: 'Ready question',
        action: 'Ask coach',
        action_direct: 'Get my advice',
        final: {
          eyebrow: 'Your personal coach',
          title_lead: 'The plan made for you,',
          title_highlight: 'in 30 seconds.',
          subtitle: 'Your scan spoke. Now take action.',
          question_label: 'Your question is ready',
          benefit_1: 'Personalized plan based on your scan',
          benefit_2: 'Instant answers, no waiting',
          benefit_3: 'No commitment, just try it',
          cta: 'Start my coaching',
          footnote: 'Free · takes 30 seconds',
        },
      },
    },
  },
  it: {
    common: {
      error_config: 'Errore di configurazione',
    },
    auth: {
      or_divider: 'oppure',
      password_show: 'Mostra password',
      password_hide: 'Nascondi password',
    },
    home: {
      coach_card_eyebrow: 'Coach',
      coach_card_title: "Ogni scan diventa un piano d'azione chiaro",
      coach_card_body:
        'Scegli lo stile di coaching piu adatto a te e ricevi indicazioni precise, motivanti e facili da mettere in pratica.',
      coach_card_cta: 'Scopri Coach',
    },
    settings: {
      admin_moderation: 'Moderazione social',
      admin_moderation_subtitle: 'Rivedi e modera i contenuti social',
      danger_zone_desc:
        'Puoi disconnetterti da questo dispositivo in qualsiasi momento e tornare quando vuoi.',
      delete_account_button: 'Elimina account',
      delete_account_desc:
        'Elimina definitivamente account, scan e dati associati.',
      delete_account_loading: 'Eliminazione account...',
      delete_account_confirm_title: 'Eliminare il tuo account?',
      delete_account_confirm_msg:
        'Questa azione eliminera profilo, scan, immagini e dati associati. E definitiva. Gli abbonamenti App Store attivi devono essere annullati negli abbonamenti Apple.',
      delete_account_continue: 'Continua',
      delete_account_final_title: 'Conferma finale',
      delete_account_final_msg:
        'Il tuo account verra eliminato ora. L operazione non puo essere annullata. Eliminare l account non annulla un abbonamento App Store attivo.',
      delete_account_error_title: 'Eliminazione non riuscita',
      delete_account_error_msg:
        'Non siamo riusciti a eliminare il tuo account ora. Riprova tra poco.',
    },
    social: {
      feed_title: 'Feed della community',
      feed_subtitle:
        'Condividi i tuoi progressi, i tuoi pasti e le tue trasformazioni nel feed pubblico di SelfLens.',
      empty: {
        title: 'Qui non c e ancora nulla',
        body: 'Sii il primo a pubblicare un prima/dopo, un pasto o un aggiornamento fisico.',
      },
      errors: {
        unavailable_title: 'Social non disponibile',
        share_title: 'Condivisione non disponibile',
        share_failed: 'Questo post social non puo essere condiviso in questo momento.',
        compose_title: 'Pubblicazione non riuscita',
        compose_failed: 'Il tuo post non puo essere pubblicato in questo momento.',
      },
      categories: {
        all: 'Tutti',
        before_after: 'Prima / Dopo',
        food: 'Cibo',
        physique: 'Fisico',
      },
      moderation: {
        pending: 'In attesa di revisione',
        approved: 'Approvato',
        rejected: 'Rifiutato',
        flagged: 'Segnalato per revisione',
        hidden: 'Nascosto dalla moderazione',
        removed: 'Rimosso dalla moderazione',
      },
      report: {
        reasons: {
          harassment: 'Molestie',
          hate_speech: "Incitamento all'odio",
          sexual_content: 'Contenuto sessuale',
          graphic_gore: 'Contenuto grafico o cruento',
          spam_repeat: 'Spam o contenuto ripetuto',
          self_harm: 'Autolesionismo o contenuto di crisi',
          illegal_activity: 'Attivita illegale',
          misinformation: 'Informazioni false o fuorvianti',
          other: 'Altro',
        },
      },
      admin: {
        toolbar: {
          search_placeholder: 'Cerca per autore o contenuto',
        },
        sort: {
          urgent: 'Urgente',
          recent: 'Recenti',
          oldest: 'Piu vecchi',
        },
        hero: {
          active_queue: 'Coda attiva',
          last_sync: 'Aggiornato {{date}}',
        },
        menu: {
          title: 'Altre azioni',
        },
        details: {
          show: 'Mostra dettagli',
          hide: 'Nascondi dettagli',
        },
        empty: {
          search_title: 'Nessun contenuto corrispondente',
          search_body:
            'Prova con un altro nome autore o con una parola chiave diversa.',
        },
        actions: {
          adjust_reactions: 'Regola le reazioni',
          moderate_author: "Modera l'autore",
          more: 'Altro',
        },
        pending_action: '{{action}} in corso...',
        user_moderation: {
          title: "Modera l'autore",
          body: "Scegli l'azione a livello account da applicare.",
          ban_posts: 'Blocca la pubblicazione',
          ban_comments: 'Blocca i commenti',
          remove_avatar: 'Rimuovi avatar',
          eradicate_content: "Elimina i contenuti dell'account",
          revoke_all: 'Revoca tutti i blocchi attivi',
        },
        meta: {
          reports_compact: '{{count}} segnalazioni',
          unique_reporters_compact: '{{count}} segnalanti',
          unique_views_compact: '{{count}} visualizzazioni',
          likes_snapshot: 'Mi piace grezzi/effettivi: {{raw}} / {{effective}}',
          dislikes_snapshot:
            'Non mi piace grezzi/effettivi: {{raw}} / {{effective}}',
          admin_adjustments:
            'Correzioni admin mi piace/non mi piace: {{likes}} / {{dislikes}}',
        },
        errors: {
          author_missing:
            "Non e stato possibile risolvere l'account autore per questo elemento.",
          user_action_title: 'Moderazione utente non riuscita',
          user_action_failed:
            "L'azione di moderazione a livello account non puo essere applicata in questo momento.",
        },
        reaction_adjustment: {
          title: 'Regola le reazioni',
          body:
            'Usa offset assoluti di amministrazione. I conteggi pubblici restano bloccati a zero minimo.',
          likes_label: 'Correzione Mi piace',
          dislikes_label: 'Correzione Non mi piace',
          current_value: 'Attuale: {{count}}',
          preview_value: 'Anteprima: {{count}}',
          note_label: 'Nota (facoltativa)',
          input_placeholder: '0',
          note_placeholder: 'Perche stai forzando questi contatori?',
          errors: {
            invalid_title: 'Correzione non valida',
            invalid_body:
              'Le correzioni di Mi piace e Non mi piace devono essere numeri interi.',
            submit_title: 'Correzione non riuscita',
            submit_failed:
              'La correzione delle reazioni non puo essere applicata in questo momento.',
          },
        },
      },
    },
    entry_offer: {
      eyebrow: 'Regalo di benvenuto',
      title: 'Ti aspetta un offerta privata di benvenuto',
      body:
        'Fai girare la ruota una sola volta per svelare il tuo regalo premium. Prezzo e idoneita restano gestiti da RevenueCat e dal tuo stato di crescita.',
      reveal_title: 'Svela il tuo sconto segreto',
      reveal_body:
        "La ruota serve solo a rivelare l'offerta. Il piano reale viene caricato in diretta da RevenueCat.",
      reveal_caption: 'Tocca la ruota per svelare il tuo regalo di benvenuto',
      revealing_caption: 'Stiamo svelando il tuo regalo...',
      spin_label: 'GIRA',
      spinning_label: '...',
      reward_badge: 'Offerta segreta',
      reward_title: 'La tua offerta premium di benvenuto e sbloccata',
      reward_body:
        'Controlla il piano reale supportato dallo store prima di continuare.',
      claim_cta: 'Vedi questo piano',
      dismiss_cta: 'Continua senza il regalo',
      unavailable_title: 'Questa offerta non e disponibile al momento',
      unavailable_body:
        "Non siamo riusciti a trovare un'offerta RevenueCat valida per questa esperienza. L'app continuera in sicurezza con il flusso standard.",
      error_title: 'Offerta non disponibile',
      purchase_error:
        'Non e stato possibile completare questo acquisto in questo momento. Riprova tra poco.',
      open_paywall_error:
        'Non e stato possibile aprire i piani premium in questo momento. Riprova tra poco.',
      open_standard_paywall_cta: 'Apri i piani premium',
      fallback_price: 'Prezzo live non disponibile',
      duration_label: '{{count}} {{unit}}',
      unit: {
        day_one: 'giorno',
        day_other: 'giorni',
        week_one: 'settimana',
        week_other: 'settimane',
        month_one: 'mese',
        month_other: 'mesi',
        year_one: 'anno',
        year_other: 'anni',
      },
      billing: {
        weekly: 'Fatturato ogni settimana',
        monthly: 'Fatturato ogni mese',
        two_month: 'Fatturato ogni 2 mesi',
        three_month: 'Fatturato ogni 3 mesi',
        six_month: 'Fatturato ogni 6 mesi',
        annual: "Fatturato ogni anno",
      },
      intro: {
        free_trial: 'Prova gratuita di {{duration}}',
        free_trial_if_eligible: 'Prova gratuita di {{duration}} se idoneo',
        discounted_period: '{{duration}} a {{price}}',
        discounted_period_if_eligible: '{{duration}} a {{price}} se idoneo',
      },
      wheel_label_1: 'Glow',
      wheel_label_2: 'Reset',
      wheel_label_3: 'Focus',
      wheel_label_4: 'Boost',
      wheel_label_5: 'Segreto',
      wheel_label_6: 'Regalo',
    },
    components: {
      feature_gate: {
        hint: 'Sblocca questa funzionalita e molto altro con Premium.',
      },
      error_boundary: {
        message: 'Si e verificato un errore imprevisto.',
      },
    },
    coach: {
      scan_result_cta: {
        eyebrow: 'Dopo lo scan',
        title: 'Il tuo prossimo consiglio e pronto',
        body_fallback: 'Trasforma questo punto in un piano concreto.',
        body_suffix:
          'Il coach puo proporti un piano semplice da iniziare subito.',
        question_label: 'Domanda pronta',
        action: 'Chiedi al coach',
        action_direct: 'Ottieni il mio consiglio',
        final: {
          eyebrow: 'Il tuo coach personale',
          title_lead: 'Il piano che fa per te,',
          title_highlight: 'in 30 secondi.',
          subtitle: 'Il tuo scan ha parlato. Ora passa all\'azione.',
          question_label: 'La tua domanda e pronta',
          benefit_1: 'Piano personalizzato sul tuo scan',
          benefit_2: 'Risposte immediate, senza attesa',
          benefit_3: 'Nessun impegno, basta provare',
          cta: 'Inizia il coaching',
          footnote: 'Gratis · richiede 30 secondi',
        },
      },
    },
  },
  pt: {
    common: {
      error_config: 'Erro de configuracao',
    },
    auth: {
      or_divider: 'ou',
      password_show: 'Mostrar palavra-passe',
      password_hide: 'Ocultar palavra-passe',
    },
    home: {
      coach_card_eyebrow: 'Coach',
      coach_card_title: 'Cada scan transforma-se num plano de acao claro',
      coach_card_body:
        'Escolha o estilo de coaching que combina consigo e receba orientacoes precisas, motivadoras e faceis de aplicar.',
      coach_card_cta: 'Descobrir Coach',
    },
    settings: {
      admin_moderation: 'Moderacao social',
      admin_moderation_subtitle: 'Rever e moderar conteudos sociais',
      danger_zone_desc:
        'Pode terminar a sessao neste dispositivo a qualquer momento e voltar quando quiser.',
      delete_account_button: 'Excluir conta',
      delete_account_desc:
        'Exclui permanentemente sua conta, scans e dados associados.',
      delete_account_loading: 'Excluindo conta...',
      delete_account_confirm_title: 'Excluir sua conta?',
      delete_account_confirm_msg:
        'Isso excluira seu perfil, scans, imagens e dados associados. A acao e permanente. Assinaturas ativas da App Store devem ser canceladas nas assinaturas Apple.',
      delete_account_continue: 'Continuar',
      delete_account_final_title: 'Confirmacao final',
      delete_account_final_msg:
        'Sua conta sera excluida agora. Esta operacao nao pode ser desfeita. Excluir a conta nao cancela uma assinatura ativa da App Store.',
      delete_account_error_title: 'Nao foi possivel excluir',
      delete_account_error_msg:
        'Nao conseguimos excluir sua conta agora. Tente novamente em alguns instantes.',
    },
    social: {
      feed_title: 'Feed da comunidade',
      feed_subtitle:
        'Partilhe os seus progressos, as suas refeicoes e as suas transformacoes no feed publico da SelfLens.',
      empty: {
        title: 'Ainda nao ha nada por aqui',
        body: 'Seja a primeira pessoa a publicar um antes/depois, uma refeicao ou uma atualizacao fisica.',
      },
      errors: {
        unavailable_title: 'Social indisponivel',
        share_title: 'Partilha indisponivel',
        share_failed: 'Esta publicacao social nao pode ser partilhada neste momento.',
        compose_title: 'Falha ao publicar',
        compose_failed: 'A sua publicacao nao pode ser publicada neste momento.',
      },
      categories: {
        all: 'Tudo',
        before_after: 'Antes / Depois',
        food: 'Alimentacao',
        physique: 'Fisico',
      },
      moderation: {
        pending: 'Aguardando revisao',
        approved: 'Aprovado',
        rejected: 'Rejeitado',
        flagged: 'Sinalizado para revisao',
        hidden: 'Ocultado pela moderacao',
        removed: 'Removido pela moderacao',
      },
      report: {
        reasons: {
          harassment: 'Assedio',
          hate_speech: 'Discurso de odio',
          sexual_content: 'Conteudo sexual',
          graphic_gore: 'Conteudo grafico ou violento',
          spam_repeat: 'Spam ou conteudo repetido',
          self_harm: 'Automutilacao ou conteudo de crise',
          illegal_activity: 'Atividade ilegal',
          misinformation: 'Informacao falsa ou enganosa',
          other: 'Outro',
        },
      },
      admin: {
        toolbar: {
          search_placeholder: 'Pesquisar por autor ou conteudo',
        },
        sort: {
          urgent: 'Urgente',
          recent: 'Recentes',
          oldest: 'Mais antigos',
        },
        hero: {
          active_queue: 'Fila ativa',
          last_sync: 'Atualizado {{date}}',
        },
        menu: {
          title: 'Mais acoes',
        },
        details: {
          show: 'Mostrar detalhes',
          hide: 'Ocultar detalhes',
        },
        empty: {
          search_title: 'Nenhum conteudo correspondente',
          search_body:
            'Experimente outro nome de autor ou uma palavra-chave diferente.',
        },
        actions: {
          adjust_reactions: 'Ajustar reacoes',
          moderate_author: 'Moderar autor',
          more: 'Mais',
        },
        pending_action: '{{action}} em curso...',
        user_moderation: {
          title: 'Moderar autor',
          body: 'Escolha a acao ao nivel da conta a aplicar.',
          ban_posts: 'Proibir publicacoes',
          ban_comments: 'Proibir comentarios',
          remove_avatar: 'Remover avatar',
          eradicate_content: 'Eliminar conteudo da conta',
          revoke_all: 'Revogar todos os bloqueios ativos',
        },
        meta: {
          reports_compact: '{{count}} denuncias',
          unique_reporters_compact: '{{count}} denunciantes',
          unique_views_compact: '{{count}} visualizacoes',
          likes_snapshot: 'Gostos bruto/efetivo: {{raw}} / {{effective}}',
          dislikes_snapshot:
            'Nao gostos bruto/efetivo: {{raw}} / {{effective}}',
          admin_adjustments:
            'Ajustes admin gostos/nao gostos: {{likes}} / {{dislikes}}',
        },
        errors: {
          author_missing:
            'Nao foi possivel identificar a conta do autor para este item.',
          user_action_title: 'Falha na moderacao do utilizador',
          user_action_failed:
            'A acao de moderacao ao nivel da conta nao pode ser aplicada neste momento.',
        },
        reaction_adjustment: {
          title: 'Ajustar reacoes',
          body:
            'Use offsets absolutos de administracao. As contagens publicas permanecem limitadas a zero.',
          likes_label: 'Ajuste de gostos',
          dislikes_label: 'Ajuste de nao gostos',
          current_value: 'Atual: {{count}}',
          preview_value: 'Pre-visualizacao: {{count}}',
          note_label: 'Nota (opcional)',
          input_placeholder: '0',
          note_placeholder: 'Porque esta a substituir estes contadores?',
          errors: {
            invalid_title: 'Ajuste invalido',
            invalid_body:
              'Os ajustes de gostos e nao gostos devem ser numeros inteiros.',
            submit_title: 'Falha no ajuste',
            submit_failed:
              'O ajuste de reacoes nao pode ser aplicado neste momento.',
          },
        },
      },
    },
    entry_offer: {
      eyebrow: 'Oferta de entrada',
      title: 'Ha uma oferta privada de boas-vindas a sua espera',
      body:
        'Gire a roda uma unica vez para revelar o seu presente premium. O preco e a elegibilidade continuam a ser geridos pela RevenueCat e pelo seu estado de crescimento.',
      reveal_title: 'Revele o seu desconto secreto',
      reveal_body:
        'A roda serve apenas para revelar. A oferta real e carregada em direto pela RevenueCat.',
      reveal_caption: 'Toque na roda para revelar a sua recompensa de boas-vindas',
      revealing_caption: 'A revelar a sua recompensa...',
      spin_label: 'GIRAR',
      spinning_label: '...',
      reward_badge: 'Oferta secreta',
      reward_title: 'A sua oferta premium de boas-vindas foi desbloqueada',
      reward_body:
        'Veja o plano real suportado pela loja antes de continuar.',
      claim_cta: 'Ver este plano',
      dismiss_cta: 'Continuar sem o presente',
      unavailable_title: 'Esta oferta nao esta disponivel neste momento',
      unavailable_body:
        'Nao foi possivel encontrar uma oferta RevenueCat valida para esta experiencia. A app vai continuar em seguranca com o fluxo padrao.',
      error_title: 'Oferta indisponivel',
      purchase_error:
        'Nao foi possivel concluir esta compra neste momento. Tente novamente daqui a instantes.',
      open_paywall_error:
        'Nao foi possivel abrir os planos premium neste momento. Tente novamente daqui a instantes.',
      open_standard_paywall_cta: 'Abrir planos premium',
      fallback_price: 'Preco em tempo real indisponivel',
      duration_label: '{{count}} {{unit}}',
      unit: {
        day_one: 'dia',
        day_other: 'dias',
        week_one: 'semana',
        week_other: 'semanas',
        month_one: 'mes',
        month_other: 'meses',
        year_one: 'ano',
        year_other: 'anos',
      },
      billing: {
        weekly: 'Cobrado semanalmente',
        monthly: 'Cobrado mensalmente',
        two_month: 'Cobrado a cada 2 meses',
        three_month: 'Cobrado a cada 3 meses',
        six_month: 'Cobrado a cada 6 meses',
        annual: 'Cobrado anualmente',
      },
      intro: {
        free_trial: 'Teste gratuito de {{duration}}',
        free_trial_if_eligible: 'Teste gratuito de {{duration}} se elegivel',
        discounted_period: '{{duration}} por {{price}}',
        discounted_period_if_eligible:
          '{{duration}} por {{price}} se elegivel',
      },
      wheel_label_1: 'Brilho',
      wheel_label_2: 'Reset',
      wheel_label_3: 'Foco',
      wheel_label_4: 'Boost',
      wheel_label_5: 'Segredo',
      wheel_label_6: 'Presente',
    },
    components: {
      feature_gate: {
        hint: 'Desbloqueie esta funcionalidade e muito mais com o Premium.',
      },
      error_boundary: {
        message: 'Ocorreu um erro inesperado.',
      },
    },
    coach: {
      scan_result_cta: {
        eyebrow: 'Depois do scan',
        title: 'O teu proximo conselho esta pronto',
        body_fallback: 'Transforma este ponto num plano concreto.',
        body_suffix:
          'O coach pode sugerir um plano simples para comecares ja.',
        question_label: 'Pergunta pronta',
        action: 'Perguntar ao coach',
        action_direct: 'Obter o meu conselho',
        final: {
          eyebrow: 'O teu coach pessoal',
          title_lead: 'O plano feito para ti,',
          title_highlight: 'em 30 segundos.',
          subtitle: 'O teu scan falou. Agora passa a acao.',
          question_label: 'A tua pergunta esta pronta',
          benefit_1: 'Plano personalizado segundo o teu scan',
          benefit_2: 'Respostas instantaneas, sem espera',
          benefit_3: 'Sem compromisso, basta experimentar',
          cta: 'Comecar o coaching',
          footnote: 'Gratuito · demora 30 segundos',
        },
      },
    },
  },
  es: {
    common: {
      error_config: 'Error de configuracion',
    },
    auth: {
      or_divider: 'o',
      password_show: 'Mostrar contrasena',
      password_hide: 'Ocultar contrasena',
    },
    home: {
      coach_card_eyebrow: 'Coach',
      coach_card_title: 'Cada escaneo se convierte en un plan de accion claro',
      coach_card_body:
        'Elige el estilo de coaching que mejor encaja contigo y recibe indicaciones precisas, motivadoras y faciles de aplicar.',
      coach_card_cta: 'Descubrir Coach',
    },
    settings: {
      admin_moderation: 'Moderacion social',
      admin_moderation_subtitle: 'Revisa y modera el contenido social',
      danger_zone_desc:
        'Puedes cerrar sesion en este dispositivo cuando quieras y volver en cualquier momento.',
      delete_account_button: 'Eliminar cuenta',
      delete_account_desc:
        'Elimina definitivamente tu cuenta, escaneos y datos asociados.',
      delete_account_loading: 'Eliminando cuenta...',
      delete_account_confirm_title: 'Eliminar tu cuenta?',
      delete_account_confirm_msg:
        'Esto eliminara tu perfil, escaneos, imagenes y datos asociados. La accion es permanente. Las suscripciones activas de App Store deben cancelarse en las suscripciones de Apple.',
      delete_account_continue: 'Continuar',
      delete_account_final_title: 'Confirmacion final',
      delete_account_final_msg:
        'Tu cuenta se eliminara ahora. Esta operacion no se puede deshacer. Eliminar la cuenta no cancela una suscripcion activa de App Store.',
      delete_account_error_title: 'No se pudo eliminar',
      delete_account_error_msg:
        'No pudimos eliminar tu cuenta ahora. Intentalo de nuevo en unos instantes.',
    },
    social: {
      feed_title: 'Feed de la comunidad',
      feed_subtitle:
        'Comparte tus progresos, tus comidas y tus transformaciones en el feed publico de SelfLens.',
      empty: {
        title: 'Aun no hay nada aqui',
        body: 'Se la primera persona en publicar un antes/despues, una comida o una actualizacion fisica.',
      },
      errors: {
        unavailable_title: 'Social no disponible',
        share_title: 'Compartir no disponible',
        share_failed: 'Esta publicacion social no se puede compartir ahora mismo.',
        compose_title: 'No se pudo publicar',
        compose_failed: 'Tu publicacion no se puede publicar ahora mismo.',
      },
      categories: {
        all: 'Todo',
        before_after: 'Antes / Despues',
        food: 'Comida',
        physique: 'Fisico',
      },
      moderation: {
        pending: 'Pendiente de revision',
        approved: 'Aprobado',
        rejected: 'Rechazado',
        flagged: 'Marcado para revision',
        hidden: 'Oculto por moderacion',
        removed: 'Eliminado por moderacion',
      },
      report: {
        reasons: {
          harassment: 'Acoso',
          hate_speech: 'Discurso de odio',
          sexual_content: 'Contenido sexual',
          graphic_gore: 'Contenido grafico o violento',
          spam_repeat: 'Spam o contenido repetido',
          self_harm: 'Autolesion o contenido de crisis',
          illegal_activity: 'Actividad ilegal',
          misinformation: 'Informacion falsa o enganosa',
          other: 'Otro',
        },
      },
      admin: {
        toolbar: {
          search_placeholder: 'Buscar por autor o contenido',
        },
        sort: {
          urgent: 'Urgente',
          recent: 'Recientes',
          oldest: 'Mas antiguos',
        },
        hero: {
          active_queue: 'Cola activa',
          last_sync: 'Actualizado {{date}}',
        },
        menu: {
          title: 'Mas acciones',
        },
        details: {
          show: 'Mostrar detalles',
          hide: 'Ocultar detalles',
        },
        empty: {
          search_title: 'No hay contenido coincidente',
          search_body:
            'Prueba con otro nombre de autor o una palabra clave diferente.',
        },
        actions: {
          adjust_reactions: 'Ajustar reacciones',
          moderate_author: 'Moderar autor',
          more: 'Mas',
        },
        pending_action: '{{action}} en curso...',
        user_moderation: {
          title: 'Moderar autor',
          body: 'Elige la accion a nivel de cuenta que deseas aplicar.',
          ban_posts: 'Bloquear publicaciones',
          ban_comments: 'Bloquear comentarios',
          remove_avatar: 'Eliminar avatar',
          eradicate_content: 'Eliminar el contenido de la cuenta',
          revoke_all: 'Revocar todos los bloqueos activos',
        },
        meta: {
          reports_compact: '{{count}} denuncias',
          unique_reporters_compact: '{{count}} denunciantes',
          unique_views_compact: '{{count}} visualizaciones',
          likes_snapshot: 'Me gusta bruto/efectivo: {{raw}} / {{effective}}',
          dislikes_snapshot:
            'No me gusta bruto/efectivo: {{raw}} / {{effective}}',
          admin_adjustments:
            'Ajustes admin me gusta/no me gusta: {{likes}} / {{dislikes}}',
        },
        errors: {
          author_missing:
            'No se pudo identificar la cuenta del autor para este elemento.',
          user_action_title: 'No se pudo moderar al usuario',
          user_action_failed:
            'La accion de moderacion a nivel de cuenta no se puede aplicar ahora mismo.',
        },
        reaction_adjustment: {
          title: 'Ajustar reacciones',
          body:
            'Usa offsets absolutos de administracion. Los contadores publicos se mantienen limitados a cero.',
          likes_label: 'Ajuste de Me gusta',
          dislikes_label: 'Ajuste de No me gusta',
          current_value: 'Actual: {{count}}',
          preview_value: 'Vista previa: {{count}}',
          note_label: 'Nota (opcional)',
          input_placeholder: '0',
          note_placeholder: 'Por que estas reemplazando estos contadores?',
          errors: {
            invalid_title: 'Ajuste no valido',
            invalid_body:
              'Los ajustes de Me gusta y No me gusta deben ser numeros enteros.',
            submit_title: 'No se pudo aplicar el ajuste',
            submit_failed:
              'El ajuste de reacciones no se puede aplicar ahora mismo.',
          },
        },
      },
    },
    entry_offer: {
      eyebrow: 'Regalo de entrada',
      title: 'Te espera una oferta privada de bienvenida',
      body:
        'Haz girar la rueda una sola vez para revelar tu regalo premium. El precio y la elegibilidad siguen controlados por RevenueCat y por tu estado de crecimiento.',
      reveal_title: 'Descubre tu descuento secreto',
      reveal_body:
        'La rueda solo sirve para revelar la oferta. El plan real se carga en directo desde RevenueCat.',
      reveal_caption: 'Toca la rueda para descubrir tu recompensa de bienvenida',
      revealing_caption: 'Revelando tu recompensa...',
      spin_label: 'GIRAR',
      spinning_label: '...',
      reward_badge: 'Oferta secreta',
      reward_title: 'Tu oferta premium de bienvenida esta desbloqueada',
      reward_body:
        'Revisa el plan real respaldado por la tienda antes de continuar.',
      claim_cta: 'Ver este plan',
      dismiss_cta: 'Continuar sin el regalo',
      unavailable_title: 'Esta oferta no esta disponible en este momento',
      unavailable_body:
        'No hemos podido resolver una oferta RevenueCat valida para esta experiencia. La app continuara con seguridad con el flujo estandar.',
      error_title: 'Oferta no disponible',
      purchase_error:
        'No hemos podido completar esta compra en este momento. Vuelve a intentarlo en un instante.',
      open_paywall_error:
        'No hemos podido abrir los planes premium en este momento. Vuelve a intentarlo en un instante.',
      open_standard_paywall_cta: 'Abrir planes premium',
      fallback_price: 'Precio en tiempo real no disponible',
      duration_label: '{{count}} {{unit}}',
      unit: {
        day_one: 'dia',
        day_other: 'dias',
        week_one: 'semana',
        week_other: 'semanas',
        month_one: 'mes',
        month_other: 'meses',
        year_one: 'ano',
        year_other: 'anos',
      },
      billing: {
        weekly: 'Facturado semanalmente',
        monthly: 'Facturado mensualmente',
        two_month: 'Facturado cada 2 meses',
        three_month: 'Facturado cada 3 meses',
        six_month: 'Facturado cada 6 meses',
        annual: 'Facturado anualmente',
      },
      intro: {
        free_trial: 'Prueba gratis de {{duration}}',
        free_trial_if_eligible:
          'Prueba gratis de {{duration}} si cumples los requisitos',
        discounted_period: '{{duration}} por {{price}}',
        discounted_period_if_eligible:
          '{{duration}} por {{price}} si cumples los requisitos',
      },
      wheel_label_1: 'Brillo',
      wheel_label_2: 'Reset',
      wheel_label_3: 'Foco',
      wheel_label_4: 'Impulso',
      wheel_label_5: 'Secreto',
      wheel_label_6: 'Regalo',
    },
    components: {
      feature_gate: {
        hint: 'Desbloquea esta funcion y mucho mas con Premium.',
      },
      error_boundary: {
        message: 'Se ha producido un error inesperado.',
      },
    },
    coach: {
      scan_result_cta: {
        eyebrow: 'Despues del escaneo',
        title: 'Tu proximo consejo esta listo',
        body_fallback: 'Convierte este punto en un plan concreto.',
        body_suffix:
          'El coach puede proponerte un plan simple para empezar ahora mismo.',
        question_label: 'Pregunta lista',
        action: 'Preguntar al coach',
        action_direct: 'Obtener mi consejo',
        final: {
          eyebrow: 'Tu coach personal',
          title_lead: 'El plan que es para ti,',
          title_highlight: 'en 30 segundos.',
          subtitle: 'Tu escaneo hablo. Ahora pasa a la accion.',
          question_label: 'Tu pregunta esta lista',
          benefit_1: 'Plan personalizado segun tu escaneo',
          benefit_2: 'Respuestas instantaneas, sin espera',
          benefit_3: 'Sin compromiso, solo prueba',
          cta: 'Empezar mi coaching',
          footnote: 'Gratis · toma 30 segundos',
        },
      },
    },
  },
  de: {
    common: {
      error_config: 'Konfigurationsfehler',
    },
    auth: {
      or_divider: 'oder',
      password_show: 'Passwort anzeigen',
      password_hide: 'Passwort ausblenden',
    },
    home: {
      coach_card_eyebrow: 'Coach',
      coach_card_title: 'Jeder Scan wird zu einem klaren Aktionsplan',
      coach_card_body:
        'Wahle den Coaching-Stil, der zu dir passt, und erhalte prazise, motivierende und leicht umsetzbare Empfehlungen.',
      coach_card_cta: 'Coach entdecken',
    },
    settings: {
      admin_moderation: 'Social-Moderation',
      admin_moderation_subtitle: 'Soziale Inhalte prufen und moderieren',
      danger_zone_desc:
        'Du kannst dich auf diesem Gerat jederzeit sicher abmelden und jederzeit zuruckkehren.',
      delete_account_button: 'Konto loeschen',
      delete_account_desc:
        'Loescht dein Konto, deine Scans und zugehoerige Daten dauerhaft.',
      delete_account_loading: 'Konto wird geloescht...',
      delete_account_confirm_title: 'Dein Konto loeschen?',
      delete_account_confirm_msg:
        'Dadurch werden Profil, Scans, Bilder und zugehoerige Daten geloescht. Diese Aktion ist dauerhaft. Aktive App Store Abos muessen in den Apple Abonnements gekuendigt werden.',
      delete_account_continue: 'Weiter',
      delete_account_final_title: 'Letzte Bestaetigung',
      delete_account_final_msg:
        'Dein Konto wird jetzt geloescht. Dieser Vorgang kann nicht rueckgaengig gemacht werden. Das Loeschen des Kontos kuendigt kein aktives App Store Abo.',
      delete_account_error_title: 'Loeschen fehlgeschlagen',
      delete_account_error_msg:
        'Wir konnten dein Konto gerade nicht loeschen. Bitte versuche es gleich noch einmal.',
    },
    social: {
      feed_title: 'Community-Feed',
      feed_subtitle:
        'Teile deine Fortschritte, Mahlzeiten und Veranderungen im offentlichen SelfLens-Feed.',
      empty: {
        title: 'Hier gibt es noch nichts',
        body: 'Sei die erste Person, die ein Vorher/Nachher, eine Mahlzeit oder ein Physique-Update veroffentlicht.',
      },
      errors: {
        unavailable_title: 'Social nicht verfugbar',
        share_title: 'Teilen nicht verfugbar',
        share_failed: 'Dieser Social-Post kann gerade nicht geteilt werden.',
        compose_title: 'Veroffentlichen fehlgeschlagen',
        compose_failed:
          'Dein Beitrag kann im Moment nicht veroffentlicht werden.',
      },
      categories: {
        all: 'Alle',
        before_after: 'Vorher / Nachher',
        food: 'Essen',
        physique: 'Physique',
      },
      moderation: {
        pending: 'Zur Prufung ausstehend',
        approved: 'Genehmigt',
        rejected: 'Abgelehnt',
        flagged: 'Zur Prufung markiert',
        hidden: 'Durch Moderation ausgeblendet',
        removed: 'Durch Moderation entfernt',
      },
      report: {
        reasons: {
          harassment: 'Belastigung',
          hate_speech: 'Hassrede',
          sexual_content: 'Sexuelle Inhalte',
          graphic_gore: 'Grafische oder brutale Inhalte',
          spam_repeat: 'Spam oder wiederholte Inhalte',
          self_harm: 'Selbstverletzung oder Kriseninhalte',
          illegal_activity: 'Illegale Aktivitat',
          misinformation: 'Irrefuhrende oder falsche Aussagen',
          other: 'Sonstiges',
        },
      },
      admin: {
        toolbar: {
          search_placeholder: 'Nach Autor oder Inhalt suchen',
        },
        sort: {
          urgent: 'Dringend',
          recent: 'Neueste',
          oldest: 'Alteste',
        },
        hero: {
          active_queue: 'Aktive Warteschlange',
          last_sync: 'Aktualisiert {{date}}',
        },
        menu: {
          title: 'Weitere Aktionen',
        },
        details: {
          show: 'Details anzeigen',
          hide: 'Details ausblenden',
        },
        empty: {
          search_title: 'Keine passenden Inhalte',
          search_body:
            'Versuche es mit einem anderen Autorennamen oder einem anderen Stichwort.',
        },
        actions: {
          adjust_reactions: 'Reaktionen anpassen',
          moderate_author: 'Autor moderieren',
          more: 'Mehr',
        },
        pending_action: '{{action}} wird ausgefuhrt...',
        user_moderation: {
          title: 'Autor moderieren',
          body: 'Wahle die Aktion auf Kontoebene aus, die angewendet werden soll.',
          ban_posts: 'Beitrage sperren',
          ban_comments: 'Kommentare sperren',
          remove_avatar: 'Avatar entfernen',
          eradicate_content: 'Kontoinhalte entfernen',
          revoke_all: 'Alle aktiven Sperren aufheben',
        },
        meta: {
          reports_compact: '{{count}} Meldungen',
          unique_reporters_compact: '{{count}} Meldende',
          unique_views_compact: '{{count}} Aufrufe',
          likes_snapshot: 'Likes roh/effektiv: {{raw}} / {{effective}}',
          dislikes_snapshot: 'Dislikes roh/effektiv: {{raw}} / {{effective}}',
          admin_adjustments:
            'Admin-Anpassungen Likes/Dislikes: {{likes}} / {{dislikes}}',
        },
        errors: {
          author_missing:
            'Das Autorenkonto fur dieses Element konnte nicht ermittelt werden.',
          user_action_title: 'Nutzermoderation fehlgeschlagen',
          user_action_failed:
            'Die Moderationsaktion auf Kontoebene kann im Moment nicht angewendet werden.',
        },
        reaction_adjustment: {
          title: 'Reaktionen anpassen',
          body:
            'Verwende absolute Admin-Offsets. Offentliche Werte bleiben auf mindestens null begrenzt.',
          likes_label: 'Likes-Anpassung',
          dislikes_label: 'Dislikes-Anpassung',
          current_value: 'Aktuell: {{count}}',
          preview_value: 'Vorschau: {{count}}',
          note_label: 'Notiz (optional)',
          input_placeholder: '0',
          note_placeholder: 'Warum uberschreibst du diese Zahler?',
          errors: {
            invalid_title: 'Ungultige Anpassung',
            invalid_body:
              'Likes- und Dislikes-Anpassungen mussen ganze Zahlen sein.',
            submit_title: 'Anpassung fehlgeschlagen',
            submit_failed:
              'Die Reaktionsanpassung kann im Moment nicht angewendet werden.',
          },
        },
      },
    },
    entry_offer: {
      eyebrow: 'Willkommensgeschenk',
      title: 'Ein privates Willkommensangebot wartet auf dich',
      body:
        'Drehe das Rad einmal, um dein Premium-Geschenk zu enthullen. Preis und Berechtigung bleiben durch RevenueCat und deinen Growth-Status gesteuert.',
      reveal_title: 'Enthulle deinen geheimen Rabatt',
      reveal_body:
        'Das Rad ist nur die Enthullung. Dein echtes Angebot wird live von RevenueCat geladen.',
      reveal_caption:
        'Tippe auf das Rad, um deine Willkommensbelohnung zu enthullen',
      revealing_caption: 'Deine Belohnung wird enthullt...',
      spin_label: 'DREHEN',
      spinning_label: '...',
      reward_badge: 'Geheimes Angebot',
      reward_title: 'Dein Premium-Willkommensangebot ist freigeschaltet',
      reward_body:
        'Prufe den echten store-gestutzten Plan, bevor du weitermachst.',
      claim_cta: 'Diesen Plan ansehen',
      dismiss_cta: 'Ohne Geschenk fortfahren',
      unavailable_title: 'Dieses Angebot ist derzeit nicht verfugbar',
      unavailable_body:
        'Wir konnten fur dieses Erlebnis kein gultiges RevenueCat-Angebot ermitteln. Die App setzt den Standardfluss sicher fort.',
      error_title: 'Angebot nicht verfugbar',
      purchase_error:
        'Dieser Kauf konnte im Moment nicht abgeschlossen werden. Bitte versuche es gleich noch einmal.',
      open_paywall_error:
        'Die Premium-Plane konnten im Moment nicht geoffnet werden. Bitte versuche es gleich noch einmal.',
      open_standard_paywall_cta: 'Premium-Plane offnen',
      fallback_price: 'Live-Preis nicht verfugbar',
      duration_label: '{{count}} {{unit}}',
      unit: {
        day_one: 'Tag',
        day_other: 'Tage',
        week_one: 'Woche',
        week_other: 'Wochen',
        month_one: 'Monat',
        month_other: 'Monate',
        year_one: 'Jahr',
        year_other: 'Jahre',
      },
      billing: {
        weekly: 'Wochentlich abgerechnet',
        monthly: 'Monatlich abgerechnet',
        two_month: 'Alle 2 Monate abgerechnet',
        three_month: 'Alle 3 Monate abgerechnet',
        six_month: 'Alle 6 Monate abgerechnet',
        annual: 'Jahrlich abgerechnet',
      },
      intro: {
        free_trial: 'Kostenlose Testphase uber {{duration}}',
        free_trial_if_eligible:
          'Kostenlose Testphase uber {{duration}}, falls berechtigt',
        discounted_period: '{{duration}} fur {{price}}',
        discounted_period_if_eligible:
          '{{duration}} fur {{price}}, falls berechtigt',
      },
      wheel_label_1: 'Glow',
      wheel_label_2: 'Reset',
      wheel_label_3: 'Fokus',
      wheel_label_4: 'Boost',
      wheel_label_5: 'Geheim',
      wheel_label_6: 'Geschenk',
    },
    components: {
      feature_gate: {
        hint: 'Schalte diese Funktion und vieles mehr mit Premium frei.',
      },
      error_boundary: {
        message: 'Es ist ein unerwarteter Fehler aufgetreten.',
      },
    },
    coach: {
      scan_result_cta: {
        eyebrow: 'Nach dem Scan',
        title: 'Dein naechster Rat ist bereit',
        body_fallback: 'Diesen Punkt in einen konkreten Plan verwandeln.',
        body_suffix:
          'Dein Coach kann dir einen einfachen Plan vorschlagen, den du sofort starten kannst.',
        question_label: 'Fertige Frage',
        action: 'Coach fragen',
        action_direct: 'Meinen Rat holen',
        final: {
          eyebrow: 'Dein persoenlicher Coach',
          title_lead: 'Der Plan fuer dich,',
          title_highlight: 'in 30 Sekunden.',
          subtitle: 'Dein Scan hat gesprochen. Jetzt handle.',
          question_label: 'Deine Frage ist bereit',
          benefit_1: 'Personalisierter Plan nach deinem Scan',
          benefit_2: 'Sofortige Antworten, ohne warten',
          benefit_3: 'Keine Verpflichtung, einfach testen',
          cta: 'Coaching starten',
          footnote: 'Kostenlos · dauert 30 Sekunden',
        },
      },
    },
  },
};
