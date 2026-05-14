export const DE_TRANSLATIONS = {
  tabs: {
    home: 'Startseite',
    analytics: 'Analysen',
    coach: 'Coach',
    scanner: 'Scannen',
    social: 'Social',
  },
  common: {
    back: 'Zurück',
    retry: 'Wiederholen',
    error: 'Fehler',
    ok: 'OK',
    cancel: 'Abbrechen',
    password: 'Passwort',
    loading: 'Laden...',
    success: 'Erfolg',
    unknown_user: 'Benutzer',
    account_free: 'Kostenloses Konto',
    account_premium: 'Premium-Konto',
    home_back: 'Zurück zum Start',
    save: 'Speichern',
    later: 'Später',
    next: 'Weiter',
    skip: 'Überspringen',
    finish: 'Fertig',
    available: 'Verfügbar',
    in: 'in',
    time: {
      d: 't',
      h: 'std',
      min: 'min',
      s: 's',
    },
    day: 'Tag',
    days: 'Tage',
    years_short: 'J.',
    hour: 'Stunde',
    hours: 'Stunden',
    minute: 'Minute',
    minutes: 'Minuten',
    time_ago: {
      just_now: 'Gerade eben',
      minutes_ago: 'vor {{count}} Min',
      hours_ago: 'vor {{count}} Std',
      yesterday: 'Gestern',
      days_ago: 'vor {{count}} Tagen',
    },
    yesterday: 'Gestern',
    days_ago: 'Vor {{count}} Tagen',
  },
  scan_limits: {
    week_1: '1 Scan alle 24 Stunden',
    month_1: '1 Scan alle 24 Stunden',
    days_3_1: '1 Scan alle 24 Stunden',
    premium_only: 'Nur Premium',
    day_3: '3 Scans pro Tag',
    day_1: '1 Scan pro Tag',
    msg_weekly_reached: 'Tageslimit erreicht (1 Scan)',
    msg_monthly_reached: 'Tageslimit erreicht (1 Scan)',
    msg_days_3_reached: 'Tageslimit erreicht (1 Scan)',
    msg_premium_only: 'Reserviert für Premium-Mitglieder',
    msg_daily_reached_3: 'Tageslimit erreicht (3 Scans)',
    msg_daily_reached_1: 'Tageslimit erreicht (1 Scan)',
    msg_weekly_reached_with_time:
      'Tageslimit erreicht (1 Scan). Nächster Scan verfügbar in {{time}}',
    msg_monthly_reached_with_time:
      'Tageslimit erreicht (1 Scan). Nächster Scan verfügbar in {{time}}',
    msg_days_3_reached_with_time:
      'Tageslimit erreicht (1 Scan). Nächster Scan verfügbar in {{time}}',
    msg_daily_reached_3_with_time:
      'Tageslimit erreicht (3 Scans). Nächster Scan verfügbar in {{time}}',
    msg_daily_reached_1_with_time:
      'Tageslimit erreicht (1 Scan). Nächster Scan verfügbar in {{time}}',
    next_scan_available_title: 'Dein nächster Scan ist in {{time}} verfügbar',
    upgrade_unlimited_subtitle:
      'Wechsle zu Premium fuer hoehere Quoten und Super Scan',
  },
  home: {
    items_available: 'Verfügbare Scans',
    items_advised: 'Empfohlene Ergänzungsmittel',
    global_score: 'Gesamtpunktzahl',
    hero_title: 'Global Score',
    companion_title: 'Begleiter',
    companion_subtitle: 'Entwickelt sich mit deinen Scans',
    fox_evolution: {
      eyebrow: 'Evolutionsfuchs',
      scan_total: '{{count}} Scans',
      stage_label: 'Stage {{stage}}',
      stage_range: '{{start}} -> {{end}} Scans',
      stage_range_max: '{{start}}+ Scans',
      stage_progress: '{{current}} / {{total}}',
      scans_remaining: '{{count}} Scans bis zur naechsten Evolution',
      max_stage: 'Finale Evolution erreicht',
    },
    analytics_card_eyebrow: 'Analysen',
    analytics_card_title: 'Meine Analysen',
    analytics_card_subtitle:
      'Finde deine Ergebnisse, deine Trends und deinen Fortschritt.',
    analytics_card_cta: 'Meine Analysen ansehen',
    analytics_card_empty: 'Scanne einmal, um dein Tracking zu starten.',
    analytics_card_scan_label: 'Scans analysiert',
    analytics_card_scan_count: '{{count}} Scans analysiert',
    fridge_scan: {
      eyebrow: 'Premium',
      title: 'Chef',
      body: 'Unsere Köche bereiten dir dein Wunschgericht zu.',
      limit_primary: '5 Chef-Anfragen',
      limit_secondary: 'pro Tag',
      cta: 'Chef oeffnen',
    },
    premium_banner_title: 'Alle Funktionen freischalten',
    premium_banner_subtitle: 'Coach, Super Scan, Chef und vollstaendige Analysen',
    error: {
      generic: 'Etwas ist schiefgelaufen. Bitte versuche es gleich erneut.',
    },
  },
  scan_limit: {
    limit_reached: 'Limit erreicht',
    available: 'verfügbar',
    loading: 'Lädt...',
    unavailable: 'Nicht verf.',
    auth_unready: 'Verbindung...',
    query_error: 'Quota-Fehler',
    backend_unavailable: 'Dienst nicht verfügbar',
    missing_payload: 'Daten nicht verfügbar',
    upgrade: 'Premium werden',
    recharge: 'Aufladung',
    next_scan: 'Nächster Scan',
    next_scan_in: 'Nächster Scan in',
  },
  scan_preview: {
    title: 'Analyse wählen',
    type_label: 'Scan-Typ',
    confirm_button: 'Bestätigen und Speichern',
    confirm_loading: 'Speichern...',
    loading_text: 'Ihr Scan kommt bald, dies kann einige Sekunden dauern...',
    loading: {
      insights_label: 'Analysen laufen',
      scan: {
        health: {
          eyebrow: 'Gesichtsanalyse',
          insights: {
            hydration: 'Hydration',
            symmetry: 'Symmetrie',
            glow: 'Ausstrahlung',
          },
        },
        body: {
          eyebrow: 'Körperanalyse',
          insights: {
            posture: 'Haltung',
            composition: 'Zusammensetzung',
            balance: 'Balance',
          },
        },
        nutrition: {
          eyebrow: 'Ernährungsanalyse',
          insights: {
            calories: 'Kalorien',
            macros: 'Makros',
            quality: 'Qualität',
          },
        },
        super: {
          eyebrow: 'Premium-Synthese',
          insights: {
            synthesis: 'Synthese',
            zones: 'Schlüsselzonen',
            score: 'Gesamtwert',
          },
        },
      },
      phases: {
        verification: {
          headline: 'Foto wird gepruft',
          subtext:
            'Wir prufen Scharfe, Licht und Ausschnitt, bevor wir fortfahren.',
        },
        upload: {
          headline: 'Sicherer Upload',
          subtext:
            'Das Foto wird vor der Verarbeitung uber einen sicheren Upload gesendet.',
        },
        analysis: {
          headline: 'Health-Scan-Analyse',
          subtext:
            'Sichtbare Signale werden in eine klare, strukturierte Auswertung verwandelt.',
        },
        preparing: {
          headline: 'Ergebnis wird vorbereitet',
          subtext:
            'Wir fugen Scores, Marker und letzte Konsistenzprufungen zusammen.',
        },
      },
    },
    error_title_type: 'Falscher Typ',
    error_title_analysis: 'Analyse unmöglich',
    error_title_session: 'Sitzung abgelaufen',
    error_title_network: 'Netzwerkfehler',
    error_title_timeout: 'Analyse dauert zu lange',
    error_title_upload: 'Upload fehlgeschlagen',
    error_title_provider: 'Analysedienst nicht verfügbar',
    error_title_server: 'Serverfehler',
    error_msg_default: 'Hoppla, das Bild konnte nicht analysiert werden.',
    error_msg_type:
      'Der vom Backend zurückgegebene Analysetyp passt nicht zum angeforderten Scan.',
    error_msg_network: 'Analyseserver nicht erreichbar.',
    error_msg_session:
      'Ihre Sitzung ist abgelaufen. Melden Sie sich erneut an und versuchen Sie es noch einmal.',
    error_msg_timeout:
      'Die Analyse dauert zu lange. Bitte versuchen Sie es gleich noch einmal.',
    error_msg_upload:
      'Das Scanbild konnte nicht hochgeladen oder im Speicher gefunden werden.',
    error_msg_provider:
      'Der Analyseanbieter ist für diesen Scan nicht verfügbar oder falsch konfiguriert.',
    error_msg_server:
      'Die Verarbeitung des Scans ist auf dem Server fehlgeschlagen. Bitte versuchen Sie es gleich noch einmal.',
    error_validation: 'Ungültige Parameter.',
    error_session: 'Sitzung abgelaufen.',
  },
  copilot: {
    analytics_step:
      'Überprüfen Sie Ihre Statistiken und verfolgen Sie Ihren Fortschritt.',
    scanner_step:
      'Scannen Sie Ihr Essen und Fotos, um Ihre Gesundheit zu analysieren!',
    settings_step: 'Greifen Sie auf Ihre Konto- und App-Einstellungen zu.',
    notifications_step:
      'Hier finden Sie Ihre Benachrichtigungen und freigeschalteten Erfolge!',
  },
  scan_result: {
    title: 'Ergebnisse',
    no_data: 'Keine Analyse verfügbar',
    analysis_face: 'Gesichtsanalyse',
    analysis_body: 'Körperanalyse',
    analysis_nutrition: 'Ernährungsanalyse',
    ai_complete: 'Analyse abgeschlossen',
    details_title: 'Analysedetails',
    score_face: 'Gesundheits-/Ästhetik-Score',
    score_body: 'Fitness-Score',
    score_nutrition: 'Tellergesundheits-Score',
    perceived_age: 'Geschätztes Alter',
    face_shape: 'Gesichtsform',
    symmetry: 'Symmetrie',
    fatigue: 'Müdigkeitslevel',
    hydration: 'Hydratation',
    photogenic: 'Fotogen-Score',
    skin_quality: 'Hautqualität',
    glow: 'Ausstrahlung (Glow)',
    collagen: 'Kollagen (gesch.)',
    body_type: 'Körpertyp',
    muscle_mass: 'Muskelmasse',
    waist: 'Taille (gesch.)',
    strength: 'Kraft-Score',
    bmi: 'BMI (gesch.)',
    metabolic_age: 'Stoffwechselalter',
    body_fat: 'Körperfett (gesch.)',
    posture: 'Haltung',
    body_symmetry: 'Symmetrie',
    calories: 'Kalorien (kcal)',
    verdict: 'Urteil',
    satiety: 'Sättigungsindex',
    ingredients: 'Zutatenqualität',
    glycemic: 'Glykämischer Index',
    vitamins: 'Hauptvitamine',
    macros_title: 'Makros (gesch. Gramm)',
    proteins: 'Proteine',
    carbs: 'Kohlenhydrate',
    fats: 'Fette',
    coach_action: {
      title: 'Ins Handeln kommen',
      button: 'Coach fragen',
      fallback_priority:
        'Dein Coach kann dir einen einfachen Plan vorschlagen, um den wichtigsten Punkt aus diesem Scan zu verbessern.',
      fallback_generic:
        'Dein Coach kann dir helfen, diesen Scan in konkrete Schritte fuer die naechsten Tage zu uebersetzen.',
      fallback_stable:
        'Deine Ergebnisse wirken insgesamt stabil. Dein Coach kann dir helfen, diesen Fortschritt zu halten.',
    },
    trajectory_preview: {
      title: '30-Tage-Projektion',
      locked_headline: 'Schalte deine motivierende 30-Tage-Projektion frei.',
      locked_subtitle:
        'Premium zeigt eine positive, glaubwürdige Projektion passend zu diesem Scan.',
      unlocked_headline:
        'Wenn du dranbleibst, könnte dein %{label} in 30 Tagen %{score} erreichen.',
      unlocked_subtitle_with_history:
        'Projektion auf Basis dieses Scans und deines jüngsten Trends, wenn Daten vorhanden sind.',
      unlocked_subtitle_without_history:
        'Projektion auf Basis dieses Scans und eines positiven Fortschrittsmodells.',
      note: 'Hinweisende Projektion, keine medizinische Vorhersage.',
      cta: 'Meine 30-Tage-Projektion freischalten',
      badge_unlocked: 'AKTIV',
      day_10: 'Tag 10',
      day_20: 'Tag 20',
      day_30: 'Tag 30',
    },
  },
  share_story: {
    header: {
      title: 'Vorschau',
    },
    actions: {
      share: 'Teilen',
      preparing: 'Wird vorbereitet...',
      share_score: 'Score teilen',
      share_report: 'Bericht teilen',
      post_to_social: 'In Social posten',
    },
    score: {
      global: 'Score',
      risk: 'Risiko',
    },
    dialog: {
      title: 'Health Scan teilen',
    },
    unavailable: {
      title: 'Teilen nicht verfügbar',
      message: 'Teilen ist auf diesem Gerät nicht verfügbar.',
    },
    unsupported_super_message:
      'Teilen ist für dieses neue Super-Scan-Format noch nicht verfügbar.',
    error: {
      title: 'Export fehlgeschlagen',
      message: 'Das Bild kann gerade nicht exportiert werden.',
    },
    empty: {
      title: 'Keine Karte zum Teilen',
      message: 'Öffne diese Vorschau aus einem aktuellen Scan.',
    },
    variant: {
      face: 'Gesicht',
      body: 'Körper',
      nutrition: 'Ernährung',
      super: 'Super Scan',
    },
    urgency: {
      high: 'Erhöht',
      normal: 'Stabil',
    },
    badge: {
      attention: 'Achtung',
      report: 'Bericht',
    },
    metrics: {
      perceived_age: 'Gefühltes Alter',
      symmetry: 'Symmetrie',
      energy: 'Energie',
      metabolic_age: 'Metabol. Alter',
      strength: 'Kraft',
      calories: 'Kalorien',
      satiety: 'Sättigung',
      quality: 'Qualität',
      risk: 'Risiko',
      urgency: 'Dringlichkeit',
      conditions: 'Befunde',
    },
  },
  social: {
    placeholder_eyebrow: 'Phase 1',
    placeholder_title: 'Social kommt bald',
    placeholder_body:
      'Shell, Hooks und Routing laufen jetzt hinter Feature Flags. Der echte Feed, Composer und die Moderation folgen spaeter.',
    placeholder_feed_title: 'Feed bereit fuer die Integration',
    placeholder_feed_body:
      'Der Supabase-Service und der React-Query-Hook liefern derzeit einen sicheren leeren Zustand.',
    actions: {
      compose: 'Post erstellen',
      share: 'Teilen',
      share_short: 'Senden',
      like: 'Liken',
      comment: 'Kommentieren',
      more: 'Mehr',
      not_interested: 'Nicht interessiert',
      not_interested_remove: 'Nicht interessiert rueckgaengig',
      not_interested_applied: 'Nicht interessiert',
      report: 'Melden',
      edit: 'Bearbeiten',
      delete: 'Entfernen',
      deleting: 'Wird entfernt...',
    },
    report: {
      title: 'Post melden',
      message: 'Warum moechtest du diesen Post melden?',
      error_title: 'Melden fehlgeschlagen',
      error_submit: 'Diese Meldung konnte gerade nicht gesendet werden.',
    },
    delete: {
      confirm_title: 'Post entfernen',
      confirm_message:
        'Dieser Post verschwindet aus dem Feed und offene Meldungen werden geschlossen. Diese Aktion kann nicht rueckgaengig gemacht werden.',
      error_title: 'Entfernen fehlgeschlagen',
      error_submit: 'Dieser Post konnte gerade nicht entfernt werden.',
    },
    post_actions: {
      title: 'Post-Optionen',
      not_interested_hint: 'Nutze das als leichtes Feedback fuer diesen Post.',
      report_hint: 'Sende diesen Post zur Pruefung an die Moderation.',
      delete_hint: 'Entferne diesen Post aus dem offentlichen Feed.',
    },
    errors: {
      reaction_title: 'Reaktion nicht gespeichert',
      reaction_failed: 'Deine Reaktion konnte nicht gespeichert werden.',
      reaction_route_label: 'Route',
      reaction_code_label: 'Code',
      reaction_status_label: 'Status',
      reaction_request_id_label: 'Anfrage-ID',
    },
    comments: {
      title: 'Kommentare',
      subtitle: 'In dieser Version nur flache Antworten.',
      placeholder: 'Schreibe einen Kommentar...',
      post_button: 'Posten',
      guideline:
        'Behandle andere respektvoll. Mobbing und verletzende Sprache sind hier nicht willkommen.',
      quick_reaction_label: 'Schnelle Reaktion {{emoji}}',
      edit_placeholder: 'Kommentar bearbeiten...',
      empty_title: 'Noch keine Kommentare',
      empty_body: 'Starte das Gespraech mit einem respektvollen Kommentar.',
      error_title: 'Kommentar fehlgeschlagen',
      error_submit: 'Dein Kommentar konnte nicht gesendet werden.',
      edit_title: 'Kommentar bearbeiten',
      editing_body: 'Passe deinen Text an und speichere ihn dann.',
      edit_error: 'Dein Kommentar konnte gerade nicht aktualisiert werden.',
      manage_title: 'Kommentar verwalten',
      manage_message: 'Waehle aus, was du mit diesem Kommentar tun moechtest.',
      manage_label: 'Verwalten',
      report_title: 'Kommentar melden',
      report_message: 'Warum moechtest du diesen Kommentar melden?',
      report_error: 'Diese Meldung konnte gerade nicht gesendet werden.',
      delete_confirm_title: 'Kommentar entfernen',
      delete_confirm_message:
        'Dieser Kommentar wird aus dem Verlauf entfernt. Diese Aktion kann nicht rueckgaengig gemacht werden.',
      delete_error: 'Dein Kommentar konnte gerade nicht geloescht werden.',
      read_only_title: 'Kommentare gesperrt',
      read_only_body:
        'Du kannst diesen Verlauf weiter lesen, aber neue Kommentare sind fuer diesen Post deaktiviert.',
      missing_title: 'Post nicht verfuegbar',
      missing_body: 'Dieser Kommentarverlauf konnte nicht geoeffnet werden.',
      load_previous: 'Vorherige Kommentare laden',
      load_more: 'Weitere Kommentare laden',
    },
    post_detail: {
      title: 'Beitrag',
      subtitle: 'Der komplette Beitrag mit Kommentaren darunter.',
      comments_title: 'Kommentare',
      comments_count: '{{count}} Kommentare',
    },
    profile: {
      title: 'Offentliches Profil',
      loading: 'Profil wird geladen...',
      missing_title: 'Profil nicht verfuegbar',
      missing_body: 'Diese offentliche Profilvorschau ist gerade nicht verfuegbar.',
      created_label: 'Erstellt',
      member_since_label: 'Mitglied seit',
      scans_label: 'Scans',
      created_on: 'Konto erstellt am {{date}}',
      member_since_today: 'Mitglied seit heute',
      member_since_days: 'Mitglied seit {{count}} Tagen',
      scans_completed: '{{count}} Scans abgeschlossen',
    },
    composer: {
      title: 'Post erstellen',
      subtitle:
        'Starte mit dem Bild und schreibe nur noch ein paar Worte dazu.',
      identity_meta: 'Offentliches Profil',
      draft_loading: 'Dein gespeicherter Social-Entwurf wird geladen...',
      draft_missing:
        'Dieser geteilte Entwurf ist nicht mehr verfugbar. Stattdessen wurde ein leerer Composer geoffnet.',
      category_label: 'Kategorie',
      caption_label: 'Caption',
      caption_placeholder:
        'Fuge Kontext, Fortschritt oder einen kurzen Gedanken hinzu.',
      caption_count: '{{count}} / {{max}} Zeichen',
      asset_label: 'Foto',
      pick_library: 'Fotomediathek',
      pick_camera: 'Kamera',
      remove_asset: 'Entfernen',
      prefill_label: 'Aus deiner Ergebnis-Karte ubernommen',
      generated_preview: 'Ergebnis-Karte bereit',
      generated_helper: 'Veroffentlicht ein stabil exportiertes Bild.',
      generating_asset: 'Dein Social-Asset wird vorbereitet...',
      asset_ready: 'Foto bereit',
      placeholder_title: 'Starte mit einem Foto',
      placeholder_body:
        'Wahle ein Foto oder nutze deine Ergebnis-Karte erneut.',
      hashtags: 'Hashtags',
      mention: 'Erwaehnung',
      visibility_title: 'Alle koennen diesen Post sehen',
      visibility_body:
        'Er wird nach Freigabe durch die Moderation oeffentlich.',
      submit: 'Post veroffentlichen',
      submitting: 'Wird veroffentlicht...',
      helper: 'Posts bleiben verborgen, bis die Moderation sie freigibt.',
      error_title: 'Veroffentlichen fehlgeschlagen',
      error_submit: 'Dein Post konnte gerade nicht veroffentlicht werden.',
      error_asset: 'Das Bild konnte nicht fur den Upload vorbereitet werden.',
    },
    admin: {
      title: 'Social Moderation',
      subtitle:
        'Admin-Konsole fur Inhalte mit Moderationsbedarf und gemeldete Inhalte.',
      summary: {
        pending: 'Ausstehend',
        flagged: 'Markiert',
        reported: 'Gemeldet',
        needs_review: 'Zu pruften',
        processed: 'Bearbeitet',
      },
      filters: {
        needs_review: 'Zu pruften',
        reported: 'Gemeldet',
        processed: 'Bearbeitet',
      },
      sections: {
        review_title: 'Zu moderieren',
        review_body:
          'Ausstehende oder markierte Inhalte, die noch eine Admin-Entscheidung brauchen.',
        reported_title: 'Gemeldet',
        reported_body:
          'Inhalte mit offenen Meldungen, die nicht mehr in pending oder flagged stehen.',
        processed_title: 'Bearbeitet',
        processed_body:
          'Bereits freigegebene, abgelehnte, verborgene oder entfernte Inhalte, die weiterhin uberpruft werden konnen.',
      },
      empty: {
        review_title: 'Nichts zu moderieren',
        review_body: 'Die pending- und flagged-Warteschlange ist gerade leer.',
        reported_title: 'Keine weiteren Meldungen',
        reported_body:
          'Es gibt aktuell keine zusaetzlichen Inhalte mit offenen Meldungen.',
        processed_title: 'Noch nichts bearbeitet',
        processed_body:
          'Es gibt aktuell keine freigegebenen, abgelehnten, verborgenen oder entfernten Inhalte fur diesen Filter.',
      },
      types: {
        post: 'Post',
        comment: 'Kommentar',
      },
      actions: {
        approve: 'Freigeben',
        reject: 'Ablehnen',
        hide: 'Verbergen',
        remove: 'Entfernen',
        restore: 'Wiederherstellen',
        change_category: 'Kategorie andern',
      },
      bulk: {
        selected_count: '{{count}} ausgewahlt',
        clear_selection: 'Auswahl leeren',
        approve_selection: 'Auswahl freigeben',
        approving_selection: 'Freigabe laeuft...',
        confirm_title: 'Auswahl freigeben',
        confirm_body: '{{count}} ausgewaehlte Inhalte freigeben?',
        confirm_action: 'Alle freigeben',
        partial_title: 'Teilweise freigegeben',
        partial_body: '{{approved}} / {{total}} Inhalte freigegeben.',
        failure_title: 'Sammelfreigabe fehlgeschlagen',
        failure_body:
          'Keiner der {{total}} ausgewaehlten Inhalte konnte freigegeben werden.',
      },
      category_change: {
        title: 'Kategorie andern',
        message: 'Aktuelle Kategorie: {{category}}',
      },
      meta: {
        reports: '{{count}} offene Meldungen',
        created_at: 'Erstellt',
        reported_24h: 'Meldungen in 24h: {{count}}',
        unique_reporters: 'Eindeutige Melder in 24h: {{count}}',
        unique_views: 'Eindeutige Aufrufe: {{count}}',
        last_reported_at: 'Zuletzt gemeldet',
        completed_at: 'Letzte Moderation',
        reason: 'Grund',
        provider: 'Provider',
        last_error: 'Letzter Fehler',
      },
      errors: {
        load_title: 'Moderationsliste konnte nicht geladen werden',
        load_route_missing:
          'Die Admin-Moderation ist in dieser Umgebung noch nicht verfugbar. Uberprufe das Supabase-Backend-Deployment und versuche es erneut.',
        load_authentication:
          'Deine Admin-Sitzung ist abgelaufen. Melde dich erneut an und versuche es noch einmal.',
        load_admin_access:
          'Dieses Konto hat keinen Zugriff auf die Admin-Moderationskonsole.',
        load_invalid_payload:
          'Das Moderations-Backend hat eine ungueltige Antwort zuruckgegeben. Bitte versuche es in einem Moment erneut.',
        load_backend_unavailable:
          'Die Admin-Social-Moderation ist vorubergehend nicht verfugbar. Bitte versuche es in einem Moment erneut.',
        action_title: 'Moderationsaktion fehlgeschlagen',
        action_failed:
          'Die Moderationsentscheidung konnte gerade nicht angewendet werden.',
        category_change_title: 'Kategorie konnte nicht geandert werden',
        category_change_failed:
          'Die Post-Kategorie konnte gerade nicht aktualisiert werden.',
      },
    },
  },
  coach: {
    eyebrow: 'Gefuehrter Coach',
    title: 'Dein Coach',
    body: 'Ein fokussierter Blick auf deine letzten Scans. Nur Hinweise — niemals eine Diagnose.',
    persona_section_title: 'Dein Team',
    persona_section_body:
      'Waehle den Coaching-Stil, bevor du Guidance erzeugst. Gratis-Mitglieder behalten den sanften Coach und koennen die Premium-Persoenlichkeiten unten trotzdem sehen.',
    prompt_section_title: 'Worauf willst du schauen?',
    latest_guidance_label: 'Letzte Guidance',
    recent_badge: 'Neu',
    response_label: 'Neue Guidance',
    cached_badge: 'Gespeicherte Guidance',
    fallback_badge: 'Fallback',
    disclaimer_label: 'Nicht-diagnostischer Hinweis',
    disclaimer_pill_label: 'Info, keine Diagnose',
    disclaimer_default:
      'Nur Wellness-Hinweise. Das ist weder eine Diagnose noch ein medizinischer Rat.',
    locked_badge: 'Premium',
    locked_tap_hint: 'Tippe, um diese Persoenlichkeit freizuschalten.',
    free_persona_hint:
      'Sanft und unterstuetzend ist im Gratis-Tarif enthalten.',
    active_persona_label: 'Coach-Persoenlichkeit',
    selected_persona_label: 'Ausgewaehlter Coach',
    next_persona_label: 'Naechster Coach',
    other_personas_label: 'Weitere Coaches',
    used_persona_label: 'Verwendeter Coach',
    persona_detail_hint: 'Tippe, um die Persoenlichkeit zu sehen.',
    persona_modal_title: 'Coach-Persoenlichkeit',
    persona_detail_voice_label: 'So spricht er mit dir',
    persona_detail_energy_label: 'Energie',
    persona_detail_motivation_label: 'Motivationsstil',
    persona_detail_best_for_label: 'Ideal, wenn...',
    persona_current_badge: 'Aktueller Coach',
    persona_current_cta: 'Diesen Coach behalten',
    persona_choose_cta: 'Diesen Coach waehlen',
    persona_unlock_cta: 'Diesen Coach freischalten',
    persona_locked_title: 'Mit Health Scan Premium verfuegbar',
    persona_locked_body:
      'Du kannst diese Persoenlichkeit ansehen und sie freischalten, wenn du mit ihr coachen moechtest.',
    persona_unknown_title: 'Coach',
    loading_title: 'Analyse laeuft...',
    loading_body:
      'Coach bereitet deine Guidance aus deinen letzten Ergebnissen vor.',
    loading_hint: 'Das kann ein paar Sekunden dauern.',
    error_title: 'Coach kann gerade nicht aktualisiert werden',
    error_body:
      'Deine zuletzt gespeicherte Guidance bleibt wenn moeglich verfuegbar. Bitte versuche es gleich noch einmal.',
    error_body_provider_unreachable:
      'Coach konnte seinen Antwort-Provider gerade nicht erreichen. Bitte versuche es gleich noch einmal.',
    error_body_invalid_response:
      'Coach hat ein unerwartetes Antwortformat zurueckgegeben. Bitte versuche es gleich noch einmal.',
    unavailable_title: 'Coach ist voruebergehend nicht verfuegbar',
    unavailable_body:
      'Coach bleibt auf diesem Server deaktiviert, bis der Backend-Provider konfiguriert ist. Deine bereits gespeicherte Guidance kann unten weiter erscheinen, aber neue Coach-Antworten sind im Moment nicht verfuegbar.',
    empty_title: 'Noch keine aktuellen Scans',
    empty_body:
      'Starte zuerst einen Scan, damit Coach deine letzten Ergebnisse in einen Wochenplan oder einen gezielten Wellness-Hinweis verwandeln kann.',
    empty_body_compact:
      'Ein aktueller Scan hilft Coach, die naechste Aktion zu personalisieren.',
    empty_scan_cta: 'Starte einen Scan fuer deinen Hinweis',
    empty_scan_types_hint: 'Gesicht · Koerper · Ernaehrung',
    first_scan_required_title: 'Erster Scan erforderlich',
    first_scan_required_body:
      'Starte mindestens einen Scan, damit dein Coach Daten analysieren kann.',
    first_scan_required_cta: 'Scan starten',
    no_scan_title: 'Starte zuerst einen Scan',
    no_scan_body:
      'Starte zuerst einen Scan, damit Coach Daten analysieren kann.',
    history_title: 'Fruhere Guidance',
    view_history_cta: 'Verlauf ansehen',
    history_cta_count: '{{count}} fruehere Hinweise',
    history_cta_latest: 'Zuletzt gespeichert {{date}}',
    history_load_more: '10 weitere anzeigen',
    history_loading_more: 'Wird geladen...',
    history_screen_body:
      'Sieh fruehere Hinweise an, ohne den Hauptscreen zu ueberladen.',
    history_empty_title: 'Noch keine Hinweise',
    history_empty_body:
      'Fordere einen neuen Hinweis an. Fertige Coach-Antworten erscheinen dann automatisch hier.',
    no_active_guidance_title: 'Noch keine aktive Guidance',
    no_active_guidance_body:
      'Waehle unten einen Guidance-Typ, um mit dieser Coach-Persoenlichkeit eine neue Antwort zu erzeugen.',
    prompt_selection_hint: 'Waehle eine kurze, konkrete Coach-Frage.',
    generate_cta: 'Diese Guidance anfragen',
    expand_cta: 'Mehr lesen',
    collapse_cta: 'Weniger',
    continuation_hint: 'Vorschau gekurzt, tippe fur mehr',
    cta_routes: {
      history: 'Verlauf ansehen',
      recipes: 'Rezepte ansehen',
      exercises: 'Uebungen ansehen',
      scan_result: 'Ergebnisse ansehen',
      premium: 'Premium freischalten',
      settings: 'Einstellungen oeffnen',
      notifications: 'Benachrichtigungen ansehen',
    },
    personas: {
      gentle_supportive: {
        title: 'Sanft Unterstuetzend',
        subtitle: 'Warmherzige, beruhigende Guidance mit sanftem Ton.',
        tone_badge: 'Sanft',
        summary:
          'Ein warmer Coach, der beruhigt, ohne dich kleinzureden, und dich sanft wieder auf Kurs bringt.',
        voice: 'Spricht mit Takt, Klarheit und Wohlwollen.',
        energy: 'Ruhig, stabil und ohne unnoetigen Druck.',
        motivation: 'Motiviert durch Vertrauen und kleine, machbare Schritte.',
        best_for:
          'Ideal, wenn du vorankommen willst, ohne dich beurteilt zu fuehlen.',
      },
      strict_tough: {
        title: 'Streng Direkt',
        subtitle: 'Klare Verantwortung und naechste Schritte ohne Ausreden.',
        tone_badge: 'Streng',
        summary:
          'Ein direkter Coach, der Ausreden stoppt und dich schnell wieder in Aktion bringt.',
        voice: 'Spricht offen, klar und ohne Umwege.',
        energy: 'Hoch, strukturiert und fordernd.',
        motivation:
          'Motiviert durch Anspruch, Disziplin und Verantwortung.',
        best_for:
          'Ideal, wenn du gut auf einen klaren Rahmen reagierst.',
      },
      motivational_energetic: {
        title: 'Motivierend Energetisch',
        subtitle: 'Viel Energie und Momentum fuer konsequentes Handeln.',
        tone_badge: 'Energie',
        summary:
          'Ein Coach, der dich schnell anschiebt und Motivation in echtes Momentum verwandelt.',
        voice: 'Spricht mit Drive, Zuversicht und Lust auf Handlung.',
        energy: 'Schnell, hell und aktionsorientiert.',
        motivation:
          'Motiviert durch Schwung, Erfolge und ein klares Fortschrittsgefuehl.',
        best_for:
          'Ideal, wenn du einen echten Energieschub brauchst.',
      },
      patient_calm: {
        title: 'Geduldig Ruhig',
        subtitle: 'Ruhiges, stabiles Coaching fuer schrittweisen Fortschritt.',
        tone_badge: 'Ruhig',
        summary:
          'Ein gelassener Coach, der Ordnung schafft, ohne Druck aufzubauen.',
        voice: 'Spricht ruhig, geduldig und mit viel Abstand.',
        energy: 'Gelassen, stabil und regelmaessig.',
        motivation:
          'Bringt dich ueber Wiederholung, Sanftheit und Stabilitaet voran.',
        best_for:
          'Ideal, wenn du weniger Stress und mehr Konstanz willst.',
      },
      analytical_precise: {
        title: 'Analytisch Praezise',
        subtitle: 'Strukturierte Guidance, sauber aus deinen Daten abgeleitet.',
        tone_badge: 'Praezise',
        summary:
          'Ein Coach, der Ordnung in deine Daten bringt und klar erklaert, was du tun solltest und warum.',
        voice: 'Spricht logisch, detailreich und strukturiert.',
        energy: 'Fokussiert, ruhig und methodisch.',
        motivation:
          'Motiviert durch Klarheit, Begruendung und saubere Prioritaeten.',
        best_for:
          'Ideal, wenn du erst verstehen willst, bevor du umsetzt.',
      },
      playful_light: {
        title: 'Locker Spielerisch',
        subtitle:
          'Leichter, freundlicher Stil, der dich trotzdem auf Kurs haelt.',
        tone_badge: 'Locker',
        summary:
          'Ein leichterer Coach, der nuetzlich bleibt, ohne schwer zu wirken.',
        voice: 'Spricht locker, freundlich und mit natuerlichem Rhythmus.',
        energy: 'Leicht, positiv und entspannt.',
        motivation:
          'Haelt dich ueber Leichtigkeit und einfache Impulse bei der Stange.',
        best_for:
          'Ideal, wenn dir ein lockerer Ton hilft, dranzubleiben.',
      },
    },
    prompts: {
      latest_scan: {
        title: 'Plan fuer heute',
        subtitle:
          'Aus meinem letzten Scan: Welche 3 Aktionen helfen mir heute am meisten?',
      },
      latest_scan_issue_resolution: {
        title: 'Aktion nach dem Scan',
        subtitle:
          'Hilf mir, die Prioritaet aus diesem Scan mit einfachen Schritten anzugehen.',
      },
      weekly_plan: {
        title: '7-Tage-Plan',
        subtitle:
          'Erstelle mir einen realistischen Plan fuer Essen und Bewegung fuer die naechsten 7 Tage.',
      },
      nutrition_focus: {
        title: 'Kluger Teller',
        subtitle:
          'Welches einfache Essen passt heute, und was soll ich fuer die naechsten 2-3 Tage einkaufen?',
      },
      body_focus: {
        title: 'Besser bewegen',
        subtitle:
          'Erstelle mir fuer diese Woche einen kleinen Sport- oder Mobilitaetsplan passend zu meinem Niveau.',
      },
      face_focus: {
        title: 'Gesichtsroutine',
        subtitle:
          'Welche einfache Morgen- und Abendroutine soll ich diese Woche fuer ein erholteres Aussehen machen?',
      },
      hydration_focus: {
        title: 'Einfach trinken',
        subtitle:
          'Plane meine Getraenke ueber den Tag mit einem Rhythmus, den ich wirklich durchhalte.',
      },
      sleep_coach: {
        title: 'Abend-Erholung',
        subtitle:
          'Erstelle mir eine einfache Abendroutine, die mir diese Woche bei der Erholung hilft.',
      },
      risk_watch: {
        title: 'Im Blick behalten',
        subtitle:
          'Welche Signale sollte ich diese Woche ruhig beobachten, und wann sollte ich Profi-Rat holen?',
      },
      trend_review: {
        title: 'Was funktioniert',
        subtitle:
          'Sag mir, was sich verbessert, was blockiert und was ich diese Woche beibehalten sollte.',
      },
      recovery_plan: {
        title: '48h Reset',
        subtitle:
          'Gib mir einen einfachen 2-Tage-Plan, um ohne Uebertreibung wieder in die Spur zu kommen.',
      },
    },
    prompt_categories: {
      today: 'Heute',
      plan: 'Plaene',
      focus: 'Fokus',
      vigilance: 'Beobachten',
      trend: 'Trends',
    },
    sections: {
      context_notes: 'Was mir auffaellt',
      priorities: 'Im Blick behalten',
      action_steps: 'Jetzt tun',
      warnings: 'Aufpassen',
      data_gaps: 'Bereiche ohne ausreichende Daten',
      meal_template: 'Naechste Mahlzeit',
      meal_swaps: 'Clevere Alternativen',
      shopping_list: 'Einkaufsliste',
      quick_recipe: 'Schnelles Rezept',
      daily_schedule: 'Plan',
      micro_routine: 'Kurze Routine',
      habit_tracker: 'Gewohnheiten beibehalten',
      reminders: 'Erinnerungen',
      knowledge_card: 'Gut zu wissen',
      next_scan_suggestion: 'Naechster Scan',
      signal_watch: 'Signale beobachten',
      streak_celebration: 'Aktuelle Serie',
      today: 'heute',
      in_days: 'in {{count}}T',
      days_per_week: '{{count}}T/7',
      minutes: '{{count}} Min.',
      shopping_fresh: 'Frisch',
      shopping_dry: 'Trockenware',
      shopping_drinks: 'Getraenke',
      shopping_snacks: 'Snacks',
      shopping_other: 'Sonstiges',
      scan_face: 'Gesicht',
      scan_body: 'Koerper',
      scan_nutrition: 'Ernaehrung',
      scan_super: 'Super-Scan',
      scan_health: 'Gesundheit',
      recurrence_today: 'heute',
      recurrence_daily: 'taeglich',
      recurrence_weekly: 'woechentlich',
    },
    metric_direction: {
      up: 'steigend',
      down: 'fallend',
      stable: 'stabil',
    },
    categories: {
      today: 'Heute',
      plan: 'Plaene',
      focus: 'Gezielter Fokus',
      vigilance: 'Wachsamkeit',
      trend: 'Trends',
    },
    status: {
      ready: 'Rat verfuegbar',
      fresh: 'Ganz frisch',
      generating: 'Wird erstellt…',
      error: 'Konnte nicht erstellt werden',
      empty: 'Noch kein Rat',
    },
    context_strip: {
      persona_prefix: 'Mit',
      mode_prefix: 'Frage',
      status_prefix: 'Status',
    },
    selection_summary: {
      eyebrow: 'Naechster Rat',
      with_persona: 'Mit {{persona}}',
      tap_to_change_persona: 'Coach wechseln',
      tap_to_change_mode: 'Anderen Modus waehlen',
    },
    history_preview: {
      eyebrow: 'Dein Verlauf',
      empty: 'Noch keine archivierten Ratgeber.',
      cta: 'Alle ansehen',
    },
    quota: {
      loading: 'Coach-Tipps: ...',
      unavailable: 'Coach-Tipps: nicht verfügbar',
      count: 'Coach-Tipps: {{available}}/{{limit}}',
      unlimited_count: 'Coach-Tipps: unbegrenzt',
      checking: 'Quota wird geprüft...',
      available: 'Verfügbar',
      unlimited_status: 'Unbegrenzt',
      next_recharge_in: 'Nächste Aufladung in {{duration}}',
      next_request_in: 'Nächste Anfrage in {{duration}}',
      recharge_soon: 'Aufladung bald',
      verify_error_title: 'Coach-Quota nicht verfügbar',
      verify_error: 'Dein Quota kann gerade nicht geprüft werden',
      exhausted_title: 'Coach-Quota erreicht',
      compact_available_one: '{{available}}/{{limit}} verfügbar',
      compact_available_many: '{{available}}/{{limit}} Tipps',
      compact_exhausted: '{{available}}/{{limit}} · Aufladung {{duration}}',
      compact_unavailable: 'Quota nicht verfügbar',
    },
    action_bar: {
      primary: 'Neuer Rat',
      cta_request: 'Fragen',
      cta_scan: 'Scannen',
      cta_generating: 'Erstellt…',
      primary_with_quota: '{{available}}/{{limit}} · Neuer Rat',
      primary_exhausted: '{{available}}/{{limit}} · {{cooldown}}',
      primary_unlimited: 'Unbegrenzt · Neuer Rat',
      primary_checking: 'Quota wird geprüft...',
      primary_unavailable: 'Coach-Quota nicht verfügbar',
      status_available: '{{available}}/{{limit}} verfügbar',
      status_unlimited: 'Unbegrenzt',
      status_exhausted: '{{available}}/{{limit}} · {{cooldown}}',
      status_checking: 'Quota wird geprüft…',
      status_unavailable: 'Quota nicht verfügbar',
      status_scan_required: 'Scan erforderlich',
      status_result: 'Letzter Rat angezeigt',
      status_question_required: 'Frage erforderlich',
      scan_required: 'Scannen, um Coach freizuschalten',
      secondary: 'Einstellungen',
      history: 'Frühere Ratschläge',
      history_a11y: 'Frühere Ratschläge ansehen',
    },
    result: {
      edit_settings: 'Einstellungen ändern',
      edit_settings_a11y: 'Coach-Einstellungen ändern',
      request_new_advice: 'Neuen Rat anfordern',
      request_new_advice_a11y: 'Neuen Coach-Rat anfordern',
    },
    settings: {
      title: 'Einstellungen',
      subtitle: 'Schreibe deine Frage, passe Coach und Fokus bei Bedarf an.',
    },
    questions: {
      section_label: 'Nutzliche Vorschlaege',
      custom_label: 'Deine Frage an den Coach',
      custom_placeholder:
        'Frage etwas zu Haut, Ernaehrung, Training oder Schlaf...',
      empty_summary: 'Frage an den Coach',
      counter: '{{count}}/{{max}}',
    },
    options_sheet: {
      persona_label: 'Coach',
      mode_label: 'Coach-Frage',
      apply_label: 'Uebernehmen',
      close_a11y: 'Einstellungen schliessen',
    },
    history_button_a11y: 'Verlauf ansehen',
  },
  entry_offer: {},
  notification_settings: {
    title: 'Benachrichtigungseinstellungen',
    types: 'Benachrichtigungstypen',
    types_desc: 'Wählen Sie, welche Benachrichtigungen Sie erhalten möchten',
    reminders: 'Erinnerungen',
    reminders_desc: 'Scan-Erinnerungen und tägliches Tracking',
    achievements: 'Erfolge',
    achievements_desc: 'Meilensteine und Errungenschaften',
    new_content: 'Neuer Inhalt',
    new_content_desc: 'Neue Rezepte, Übungen und Funktionen',
    info: '💡 Benachrichtigungen helfen Ihnen, motiviert zu bleiben. Sie können sie jederzeit deaktivieren.',
    save: 'Einstellungen speichern',
    saved_title: 'Gespeichert',
    saved_message: 'Ihre Einstellungen wurden aktualisiert.',
    error_save: 'Speichern fehlgeschlagen.',
  },
  premium: {
    title: 'Health Scan Premium',
    subtitle: 'Entfalten Sie Ihr volles Potenzial',
    already_premium_title: 'Du bist Premium!',
    already_premium_desc: 'Du hast Zugriff auf alle Premium-Funktionen.',
    price_per_month: '/Monat',
    cancel_anytime: 'Jederzeit kündbar',
    features_title: 'Premium-Funktionen',
    subscribe_btn: 'Jetzt abonnieren',
    processing: 'Verarbeitung...',
    restore_btn: 'Käufe wiederherstellen',
    restoring: 'Wiederherstellung...',
    store_disclaimer: 'Via App Store / Google Play',
    web_disclaimer: 'In-App-Käufe nur auf dem Handy verfügbar.',
    purchase_success_title: 'Willkommen bei Premium!',
    purchase_success_msg: 'Abonnement aktiviert.',
    restore_success_title: 'Wiederhergestellt',
    restore_success_msg: 'Abonnement erfolgreich wiederhergestellt.',
    restore_empty: 'Keine Käufe gefunden.',
    benefits: {
      instant: 'Sofortiger Zugriff',
      tracking: 'Erweitertes Tracking',
      support: 'Priorisierter Support',
    },
    upgrade_title: 'Premium upgraden',
    upgrade_premium: 'Auf Premium upgraden',
    upgrade_btn: 'Upgrade auf Premium',
    subtitle_premium: 'Ihr Abonnement ist aktiv.',
    subtitle_upgrade: 'Entfalten Sie Ihr volles Gesundheitspotenzial',
    compare_plans: 'Pläne vergleichen',
    button_upgrade: 'Abonnieren',
    button_later: 'Vielleicht später',
    price: '9,99 €',
    period: '/Monat',
    web_unavailable_title: 'Nicht im Web verfügbar',
    native_unavailable:
      'In-App-Käufe sind in diesem Build nicht verfügbar. Bitte verwenden Sie ein natives Entwicklungs-Build oder die Store-App.',
    validation_title: 'Überprüfung läuft',
    purchase_error_default:
      'Ein Fehler ist beim Kauf aufgetreten. Bitte versuchen Sie es erneut.',
    purchase_error_generic:
      'Kauf konnte nicht verarbeitet werden. Bitte überprüfen Sie Ihre Verbindung.',
    restore_empty_title: 'Info',
    restore_error_default: 'Käufe konnten nicht wiederhergestellt werden.',
    restore_error_generic: 'Fehler bei der Wiederherstellung.',
    web_note:
      'Hinweis: In-App-Käufe sind nur in den nativen mobilen Apps verfügbar. Nutzen Sie die Android- oder iOS-App zum Abonnieren.',
    store_note:
      'Das Abonnement wird über Ihr %{store}-Konto abgerechnet. Verwalten Sie es in den Einstellungen Ihres %{store}-Kontos.',
    already_premium_intro: 'Sie sind Premium-Mitglied.',
    already_premium_active: 'Du hast ein aktives Abonnement.',
    renewal_date: 'Verlaengert sich am: %{date}',
    manage_subscription: 'Abo verwalten',
    subscription_page: {
      hero_title: 'Schalte das komplette HealthScan-Erlebnis frei',
      hero_subtitle:
        'Erweiterter Coach, Super Scan, Premium Chef und tiefere Analysen.',
      free_title: 'Gratis',
      free_price: '0 €',
      weekly_title: 'Premium Woche',
      monthly_title: 'Premium',
      two_month_title: 'Premium 2 Monate',
      three_month_title: 'Premium 3 Monate',
      six_month_title: 'Premium 6 Monate',
      monthly_price: '9,99 €/Monat',
      annual_title: 'Premium Jahresabo',
      premium_title: 'Premium',
      annual_price: '79,99 €/Jahr',
      annual_monthly: 'entspricht 6,67 €/Monat',
      annual_crossed: '119,88 €',
      annual_badge: 'Bestes Angebot',
      annual_coming_soon: 'Das Jahresabo ist bald verfuegbar.',
      entry_offer_badge: 'Willkommensangebot',
      entry_offer_cta: 'Mit diesem Plan fortfahren',
      entry_offer_subtitle:
        'Ihr Willkommensangebot entspricht dem hier angezeigten Live-Store-Produkt.',
      cta_generic: 'Mit diesem Plan fortfahren',
      contextual_cta: 'Angebote ansehen',
      contextual_analytics_title: 'Verfolge deinen Gesundheitsfortschritt',
      contextual_analytics_body:
        'Schalte 3-Monats- und 1-Jahres-Diagramme frei, um deine Entwicklung komplett zu verfolgen.',
      price_per_month: '{{price}} / Monat',
      packages_unavailable: 'Premium-Pläne sind derzeit nicht verfügbar.',
      cta_monthly: 'Abonnieren - 9,99 €/Monat',
      cta_annual: 'Abonnieren - 79,99 €/Jahr',
      legal: 'Das Abo verlaengert sich automatisch. Jederzeit kuendbar.',
      terms_link: 'Nutzungsbedingungen',
      privacy_link: 'Datenschutz',
      free_feat_face: 'Gesichts-Scan: 1 gratis alle 24 Stunden',
      free_feat_body: 'Koerper-Scan: 1 gratis alle 24 Stunden',
      free_feat_nutrition: 'Ernaehrungs-Scan: 1 gratis alle 24 Stunden',
      free_feat_partial: 'Teilweise Ergebnisse (einige Werte gesperrt)',
      free_feat_no_super: 'Kein Zugriff auf Super Scan',
      free_feat_no_history: 'Kein Verlauf und keine Diagramme',
      prem_feat_face: '3 Gesichts-Scans pro Tag',
      prem_feat_body: '3 Koerper-Scans pro Tag',
      prem_feat_nutrition: '3 Ernaehrungs-Scans pro Tag',
      prem_feat_super: 'Super Scan: 1 vollstaendige Analyse alle 24h',
      prem_feat_unlocked: 'Alle Ergebnisse freigeschaltet',
      prem_feat_history: 'Voller Verlauf + Diagramme',
      prem_feat_ai: 'Personalisierte Tipps',
      prem_feat_coach_quota: 'Erweiterter Coach: bis zu 8 Tipps alle 24h',
      prem_feat_coach_modes:
        'Alle Premium-Coaches und Modi: Ernaehrung, Koerper, Schlaf, Risiko, Trends, Wochenplan',
      prem_feat_chef: 'Premium Chef: bis zu 5 Anfragen alle 24h',
      prem_feat_complete_analysis:
        'Komplette Analysen: gesperrte Ergebnisse, Verlauf und Diagramme frei',
    },
  },
  privacy: {
    title: 'Datenschutzerklärung',
    last_updated: 'Zuletzte Aktualisierung: 15. Oktober 2025',
    intro_title: '1. Einleitung',
    intro_content:
      'Willkommen bei Health Scan. Wir schützen Ihre Privatsphäre.',
    data_title: '2. Gesammelte Daten',
    usage_title: '3. Datennutzung',
    storage_title: '4. Speicherung & Sicherheit',
    sharing_title: '5. Datenweitergabe',
    rights_title: '6. Ihre Rechte',
    contact_title: '10. Kontakt',
    data_content: 'Wir erheben die folgenden Kategorien von Daten:',
    data_account: 'Kontoinformationen: E-Mail, Benutzername, Profilfoto',
    data_scans:
      'Scandaten: analysierte Bilder (Gesicht, Körper, Mahlzeiten), Analyseergebnisse und Gesundheitswerte',
    data_device:
      'Technische Informationen: Gerätekennung zur Anmeldesicherheit',
    data_usage: 'Nutzungsdaten: Scanverlauf, Präferenzen, Nutzungsstatistiken',
    camera_title: '3. Verwendung der Kamera',
    camera_content:
      'Health Scan verwendet die Kamera Ihres Geräts ausschließlich zur Aufnahme von Bildern zur Analyse (Gesicht, Körper, Ernährung). Die Fotos werden von unserer Analyse-Infrastruktur verarbeitet, um Gesundheitsanalysen zu erstellen. Bilder werden sicher über HTTPS übertragen und niemals an Dritte weitergegeben. Sie können Ihre Daten jederzeit löschen.',
    usage_content: 'Ihre Daten werden verwendet, um:',
    usage_analysis:
      'Personalisierte Gesundheitsanalysen bereitstellen',
    usage_improve:
      'Verbessern Sie unsere Algorithmen und die Qualität unserer Dienstleistungen',
    usage_personalize: 'Personalisieren Sie Ihre Erfahrungen und Empfehlungen',
    storage_content:
      'Ihre Daten werden sicher auf Supabase gespeichert, einer Cloud-Plattform, die höchste Sicherheitsstandards erfüllt. Die gesamte Kommunikation wird über TLS/SSL verschlüsselt. Ihre Passwörter werden mit robusten kryptografischen Algorithmen gehasht. Wir setzen Sicherheitsrichtlinien (RLS) auf Datenbankebene durch, um sicherzustellen, dass nur Sie auf Ihre Daten zugreifen können.',
    sharing_content:
      'Wir verkaufen Ihre persönlichen Daten niemals. Eine Weitergabe Ihrer Daten erfolgt ausschließlich an technische Dienstleister, die für den Betrieb des Dienstes unbedingt erforderlich sind (Hosting, E-Mail-Versand) und nur im dafür erforderlichen Umfang. Im Falle einer gesetzlichen Verpflichtung können wir verpflichtet sein, bestimmte Informationen an die zuständigen Behörden weiterzugeben.',
    rights_content: 'Gemäß der DSGVO haben Sie folgende Rechte:',
    rights_access: 'Zugriffsrecht: Alle Ihre persönlichen Daten einsehen',
    rights_delete:
      'Recht auf Löschung: Löschen Sie Ihr Konto und alle Ihre Daten',
    rights_export:
      'Recht auf Portabilität: Exportieren Sie Ihre Daten in ein Standardformat',
    rights_withdraw:
      'Widerrufsrecht: Widerrufen Sie Ihre Einwilligung jederzeit',
    children_title: '8. Jugendschutz',
    children_content:
      'Health Scan ist nicht für Personen unter 16 Jahren bestimmt. Wir erfassen wissentlich keine Daten von Minderjährigen. Wenn Sie ein Elternteil sind und glauben, dass Ihr Kind uns Informationen zur Verfügung gestellt hat, kontaktieren Sie uns, um diese zu löschen.',
    updates_title: '9. Änderungen',
    updates_content:
      'Wir können diese Datenschutzrichtlinie aktualisieren. Bei wesentlichen Änderungen benachrichtigen wir Sie über den Antrag oder per E-Mail. Das Datum der letzten Aktualisierung wird oben auf dieser Seite angezeigt.',
    contact_content:
      'Wenn Sie Fragen zu Ihren Daten oder dieser Richtlinie haben, kontaktieren Sie uns:',
  },
  components: {
    feature_gate: {
      title: 'Premium-Funktion',
      upgrade_btn: 'Upgrade auf Premium',
    },
    table: {
      header_feature: 'Funktion',
      header_free: 'Kostenlos',
      header_premium: 'Premium',
    },
    error_boundary: {
      title: 'Hoppla!',
      retry: 'Wiederholen',
      logout: 'Abmelden',
    },
    condition_card: {
      probability: 'Wahrscheinlichkeit',
      explanation: 'Erklärung',
      tip: 'Tipp',
      unlock: 'Freischalten',
    },
    metric_card: {
      premium_label: 'PREMIUM',
      blurred_text: '••••••',
    },
    avatar: {
      error_title: 'Fehler',
      error_download: 'Foto konnte nicht heruntergeladen werden',
      error_picker_launch:
        'Der Fotoauswahler kann gerade nicht geöffnet werden.',
      error_camera_unavailable:
        'Die Kamera ist auf diesem Gerät nicht verfügbar.',
      error_size: 'Bild zu groß. Maximal 5MB.',
      perm_title: 'Erlaubnis erforderlich',
      perm_gallery: 'Bitte Zugriff auf Fotogalerie erlauben',
      perm_camera: 'Bitte Zugriff auf Kamera erlauben',
      options_title: 'Profilbild',
      options_msg: 'Option wählen',
      take_photo: 'Foto aufnehmen',
      choose_gallery: 'Aus Galerie wählen',
      open_settings: 'Einstellungen öffnen',
      crop_title: 'Foto zuschneiden',
      crop_confirm: 'Bestätigen',
      hint: 'Zum Bearbeiten tippen',
    },
    urgency: {
      title: 'Achtung',
      message:
        'Visuelle Indikatoren erfordern Ihre Aufmerksamkeit.\n\nDies ist keine medizinische Diagnose.',
      dismiss: 'Verstanden',
    },
    feature_list: {
      free: 'Kostenlos',
      premium: 'Premium',
    },
    super_scan: {
      title: 'Super Scan',
      subtitle_locked: 'Komplette Körper- & Gesichtsanalyse',
      subtitle_used: 'Kommen Sie morgen für einen neuen Scan wieder',
      subtitle_available: 'Detaillierte Analyse verfügbar',
      status_locked: 'Mit Premium freischalten',
      status_used: 'Reset um Mitternacht',
      status_available: 'Bereit zum Scannen',
    },
  },
  scan_types: {
    body: 'Körper',
    health: 'Gesicht',
    nutrition: 'Ernährung',
    super: 'Super Scan',
  },
  notifications: {
    title: 'Benachrichtigungen',
    empty_title: 'Keine Benachrichtigungen',
    empty_unread: 'Alles gelesen! Verfolgen Sie Ihre Gesundheit weiter.',
    empty_all: 'Sie haben noch keine Benachrichtigungen.',
    loading: 'Lade Benachrichtigungen...',
    filter_all: 'Alle',
    filter_unread: 'Ungelesen',
    filter_read: 'Gelesen',
    scan_health_title: 'Gesundheitsscan verfügbar',
    scan_health_body:
      'Ihr wöchentlicher Gesundheitsscan ist verfügbar. Bleiben Sie gesund!',
    scan_body_title: 'Körperscan verfügbar',
    scan_body_body:
      'Ihr monatlicher Körperscan ist verfügbar. Verfolgen Sie Ihren Fortschritt!',
    scan_nutrition_title: 'Ernährungs-Scan verfügbar',
    scan_nutrition_body: 'Ihr Ernährungs-Scan ist verfügbar.',
    scan_super_title: 'Super Scan verfügbar',
    scan_super_body: 'Ihr täglicher Super Scan ist verfügbar.',
    achievements: {
      title: 'Neuer Meilenstein!',
      one_week: 'Herzlichen Glückwunsch! Eine Woche Gesundheits-Tracking!',
      one_month:
        'Herzlichen Glückwunsch! 🎉 Sie kümmern sich seit einem Monat mit Health Scan um Ihre Gesundheit.',
      three_months: 'Gut gemacht! 3 Monate Gesundheits-Tracking!',
      six_months: 'Unglaublich! 6 Monate Gesundheits-überwachung. Weiter so!',
      one_year: 'Außergewöhnlich! Ein Jahr mit Health Scan! 🏆',
    },
    daily_reminders: {
      '1': {
        title: 'Hey, es ist Zeit!',
        body: 'Ein kleiner Scan heute? Ihre Gesundheit wird es Ihnen danken!',
      },
      '2': {
        title: 'Wir vermissen dich!',
        body: 'Nehmen Sie sich 30 Sekunden Zeit, um Ihre Tagesform zu überprüfen.',
      },
      '3': {
        title: 'Bereit für den Check-up?',
        body: 'Starten Sie einen schnellen Scan und bleiben Sie fit!',
      },
      '4': {
        title: 'Hallo du!',
        body: 'Vergiss deinen täglichen Scan nicht, es dauert 2 Minuten.',
      },
      '5': {
        title: 'Wir warten auf dich!',
        body: 'Dein Körper hat dir heute vielleicht etwas zu sagen.',
      },
      '6': {
        title: 'Gesundheits-Erinnerung',
        body: 'Ein Foto, eine Analyse, und du weißt, wo du stehst!',
      },
    },
    super_scan_ready: {
      '1': {
        title: 'Super Scan aufgeladen!',
        body: 'Ihr täglicher Super Scan ist bereit. Genießen Sie es!',
      },
      '2': {
        title: 'Es geht wieder los!',
        body: 'Neuer Tag, neuer Super Scan zu Ihrer Verfügung!',
      },
      '3': {
        title: 'Ihr Super Scan wartet',
        body: 'Die vollständige Analyse ist wieder verfügbar!',
      },
    },
    motivational: {
      '1': {
        title: 'Weiter so!',
        body: 'Jeder Scan bringt Sie Ihren Zielen näher.',
      },
      '2': {
        title: 'Du rockst das!',
        body: 'Deine Regelmäßigkeit zahlt sich aus, die Ergebnisse folgen.',
      },
      '3': {
        title: 'Kleine Erinnerung',
        body: 'Sich um sich selbst zu kümmern, bedeutet auch, auf seinen Körper zu hören.',
      },
      '4': {
        title: 'Toller Fortschritt!',
        body: 'Du leistest gute Arbeit, behalte diesen Schwung bei.',
      },
      '5': {
        title: 'Du bist auf dem richtigen Weg',
        body: 'Konsistenz ist der Schlüssel zum Erfolg. Bravo!',
      },
      '6': {
        title: 'Stolz auf dich?',
        body: 'Das solltest du sein! Seine Gesundheit zu verfolgen ist bereits ein großer Schritt.',
      },
    },
  },
  not_found: {
    text: 'Diese Seite existiert nicht.',
    link: 'Zur Startseite',
  },
  api_errors: {
    network: 'Netzwerkfehler. Überprüfen Sie Ihre Verbindung.',
    unauthorized: 'Sitzung abgelaufen. Bitte erneut anmelden.',
    server: 'Serverfehler. Bitte versuchen Sie es später erneut.',
    scan_limit: 'Scan-Limit erreicht.',
    payment_failed: 'Zahlung fehlgeschlagen.',
  },
  navigation: {
    session_expired_title: 'Sitzung abgelaufen',
    session_expired_msg:
      'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.',
    loop_error_title: 'Navigationsfehler',
    loop_error_msg:
      'Eine Umleitungsschleife wurde erkannt. Bitte melden Sie sich ab und versuchen Sie es erneut.',
    logout_btn: 'Abmelden',
  },
  auth: {
    login_title: 'Health Scan',
    login_subtitle: 'Melden Sie sich an',
    email_placeholder: 'E-Mail',
    password_placeholder: 'Passwort',
    password_confirm: 'Passwort bestätigen',
    login_btn: 'Anmelden',
    no_account: 'Kein Konto?',
    signup_link: 'Registrieren',
    signup_title: 'Konto erstellen',
    signup_subtitle: 'Werden Sie Teil von Health Scan',
    password_min_placeholder: 'Passwort (8+ Zeichen, Kleinbuchstabe + Zahl)',
    password_confirm_placeholder: 'Passwort bestätigen',
    verification_note: 'Wir senden Ihnen einen Bestätigungscode.',
    signup_btn: 'Registrieren',
    has_account: 'Bereits ein Konto?',
    login_link: 'Anmelden',
    error_email_required: 'E-Mail ist erforderlich',
    error_password_required: 'Passwort ist erforderlich',
    error_passwords_match: 'Passwörter stimmen nicht überein',
    error_password_length:
      'Passwort muss mindestens 8 Zeichen lang sein und einen Kleinbuchstaben und eine Zahl enthalten',
    error_login_generic: 'Anmeldung fehlgeschlagen',
    error_ip_limit_reached:
      'Kontoerstellungslimit für dieses Netzwerk erreicht. Bitte versuchen Sie es später erneut.',
    error_signup_generic: 'Registrierung fehlgeschlagen',
    error_account_creation: 'Fehler beim Erstellen des Kontos',
    error_username_taken:
      'Dieser Benutzername ist bereits vergeben. Bitte wählen Sie einen anderen.',
    error_session_invalid: 'Ungültige Sitzung',
    error_email_verification_required:
      'Bitte verifizieren Sie Ihre E-Mail bevor Sie fortfahren.',
    error_disposable_email: 'Wegwerf-E-Mail-Adressen sind nicht erlaubt',
    error_verification_send: 'Fehler beim Senden des Bestätigungscodes',
    cancel_verification_title: 'Verifizierung abbrechen?',
    cancel_verification_message:
      'Sie werden abgemeldet und können später über die Anmeldung fortfahren.',
    cancel_verification_confirm: 'Abmelden',
    error_verification_code: 'Falscher Code',
    error_auth_cancelled: 'Authentifizierung abgebrochen',
    verify_btn: 'Überprüfen',
    verifying: 'Überprüfung...',
    verification_sent_title: 'E-Mail verifiziert!',
    verification_sent_subtitle_signup: 'Dein erster Scan wird vorbereitet...',
    verification_sent_subtitle_login: 'Anmeldung läuft...',
    verify_title: 'Noch ein Schritt bis zu deinem ersten Scan',
    verify_subtitle:
      'Gib den Code aus deiner E-Mail ein, um dein Konto zu aktivieren.',
    code_expired: 'Code läuft ab in',
    resend_code: 'Code erneut senden',
    resend_in: 'Erneut senden in {{seconds}}s',
    code_incomplete: 'Bitte geben Sie den vollständigen Code ein',
    code_invalid: 'Falscher oder abgelaufener Code',
    remember_device: 'Dieses Gerät merken',
    email_label: 'E-Mail',
    errors: {
      fill_all: 'Bitte alle Felder ausfüllen',
      invalid_email: 'Ungültige E-Mail',
      password_mismatch: 'Passwörter stimmen nicht überein',
      password_short:
        'Passwort muss mindestens 8 Zeichen lang sein und einen Kleinbuchstaben und eine Zahl enthalten',
      disposable_email: 'Wegwerf-E-Mails sind nicht erlaubt',
      email_in_use: 'Diese E-Mail wird bereits verwendet',
      general_error: 'Ein Fehler ist aufgetreten',
      invalid_credentials: 'Ungültige Anmeldedaten',
      oauth_login: 'Fehler bei der Anmeldung mit {{provider}}',
      password_too_common:
        'Dieses Passwort ist zu einfach zu erraten. Bitte waehlen Sie ein staerkeres.',
      signup_followup:
        'Wenn die Registrierung erfolgreich war, wurde ein Bestaetigungscode an Ihre E-Mail gesendet.',
    },
    code_incorrect: 'Falscher Code',
    code_not_found:
      'Kein Bestätigungscode gefunden. Bitte fordern Sie ein neues an.',
    code_expired_error:
      'Dieser Code ist abgelaufen. Bitte fordern Sie ein neues an.',
    too_many_attempts:
      'Zu viele Fehlversuche. Bitte fordern Sie einen neuen Code an.',
    attempts_remaining: '{{count}}-Testversion(en) verbleibend',
    general_error: 'Es ist ein Fehler aufgetreten',
  },
  scanner: {
    authorize_camera: 'Kamera zulassen',
    camera_permission_msg:
      'Wir benötigen Zugriff auf Ihre Kamera, um zu scannen.',
    camera_permission_detail:
      'Gesichts-, Koerper- und Essensfotos werden verwendet, um eine Gesundheitsanalyse in der App auszufuehren.',
    camera_permission_backend:
      'Bilder werden sicher an unser Backend uebertragen und von unserer Analyse-Infrastruktur verarbeitet. Sie koennen die Datenschutzerklaerung vor der Freigabe lesen.',
    error_taking_photo: 'Foto konnte nicht aufgenommen werden',
    error_loading_image: 'Bild konnte nicht geladen werden',
    eligibility_error_title: 'Scan-Verfügbarkeit konnte nicht geprüft werden',
    eligibility_auth_msg:
      'Ihre Sitzung ist abgelaufen. Melden Sie sich erneut an und versuchen Sie es noch einmal.',
    eligibility_unavailable_msg:
      'Die Verfügbarkeitsprüfung für den Scan ist fehlgeschlagen. Bitte versuchen Sie es gleich noch einmal.',
    type_required_title: 'Erforderlicher Scantyp',
    type_required_msg: 'Bitte wählen Sie einen Scantyp aus.',
    super_unavailable_title: 'Super Scan nicht verfügbar',
    super_unavailable_msg: 'Bitte wählen Sie einen anderen Scantyp.',
    scan_hints: {
      health: 'Richten Sie Ihr Gesicht mittig im Rahmen aus.',
      body: 'Halten Sie den ganzen Körper im Bild.',
      nutrition: 'Halten Sie die gesamte Mahlzeit von oben im Bild.',
      super: 'Bleiben Sie ruhig und halten Sie Ihr Gesicht gut beleuchtet.',
    },
  },
  fridge_scan: {
    title: 'Chef',
    subtitle:
      'Mach ein Foto von deinen Lebensmitteln und dein Chef schlaegt dir vor, was du essen kannst.',
    overlay_title: 'Richte deine Lebensmittel aus',
    overlay_hint:
      'Halte die sichtbaren Lebensmittel in einem einzigen Rahmen.',
    permission_title: 'Kamerazugriff wird fuer Chef benoetigt',
    permission_body:
      'Mach ein Foto von deinen Lebensmitteln. Das Bild wird erst gesendet, wenn du die Analyse bestaetigst.',
    permission_denied_title: 'Kamerazugriff ist noch blockiert',
    permission_denied_body:
      'Erlaube den Kamerazugriff, um Chef zu starten. Du kannst vorher auch die Datenschutzrichtlinie ansehen.',
    permission_cta: 'Kamera erlauben',
    camera_unavailable_title: 'Kamera nicht verfuegbar',
    camera_unavailable_body:
      'Die Kamera fuer Chef konnte gerade nicht starten. Versuch es erneut oder geh zur Startseite zurueck.',
    feedback_title: 'Waehle deinen Chef',
    feedback_body:
      'Stil waehlen, dann Mahlzeit anfragen.',
    feedback_primary_cta: 'Chef fragen',
    feedback_secondary_cta: 'Neu aufnehmen',
    feedback_cta: 'Neu aufnehmen',
    feedback_camera_badge: 'Kamerafoto',
    feedback_gallery_badge: 'Galeriefoto',
    submission_queued_badge: 'In Warteschlange',
    submission_queued_title: 'Anfrage gesendet',
    submission_queued_body:
      'Dein Foto ist gespeichert. Dein Chef bereitet einen passenden Vorschlag vor. Du hast heute noch {{remaining}} Anfrage(n) uebrig.',
    submission_queued_cta: 'Noch ein Foto aufnehmen',
    submission_queued_message: 'Chef-Anfrage gespeichert',
    available_message: 'Chef verfuegbar',
    premium_required_message:
      'Chef ist Premium-Mitgliedern vorbehalten',
    paywall_title: 'Premium Chef',
    paywall_subtitle:
      'Ein Chef passend zu deinem Ziel schlaegt dir eine Idee mit dem vor, was du hast',
    paywall_body:
      'Wechsle zu Premium, damit dein Chef deine Lebensmittel analysiert und dir eine passende Mahlzeit vorschlaegt.',
    paywall_bullet_identify: 'Prueft sichtbare Lebensmittel',
    paywall_bullet_meal:
      'Schlaegt eine Mahlzeit passend zu deinem Ziel vor',
    paywall_bullet_limit: 'Bis zu 5 Chef-Anfragen pro Tag',
    limit_reached_title: 'Chef-Kontingent erreicht',
    limit_reached_with_time:
      'Chef-Kontingent erreicht (5 Anfragen). Naechste Anfrage verfuegbar in {{time}}',
    limit_reached_fallback:
      'Dein Chef-Kontingent ist im Moment erreicht.',
    capture_error: 'Das Foto konnte gerade nicht aufgenommen werden.',
    gallery_error:
      'Das Bild aus der Galerie konnte gerade nicht geladen werden.',
    submission_auth_error:
      'Deine Sitzung ist vor dem Senden der Chef-Anfrage abgelaufen. Melde dich erneut an und versuche es noch einmal.',
    submission_network_error:
      'Chef konnte den Server nicht erreichen. Pruefe deine Verbindung und versuche es erneut.',
    submission_image_error:
      'Chef konnte dieses Foto nicht vorbereiten. Nimm es erneut auf und versuche es noch einmal.',
    submission_service_error:
      'Chef konnte die Anfrage im Moment nicht annehmen. Versuche es gleich noch einmal.',
    submission_error:
      'Die Chef-Anfrage konnte gerade nicht gesendet werden.',
    back_accessibility: 'Zurueck',
    gallery_accessibility: 'Ein Lebensmittelfoto aus der Galerie waehlen',
    capture_accessibility: 'Ein Lebensmittelfoto aufnehmen',
    flip_accessibility: 'Kamera wechseln',
    mode_labels: {
      diet: 'Diät-Chef',
      muscle_gain: 'Sport-Chef',
      gourmand: 'Genuss-Chef',
    },
    mode_short_labels: {
      diet: 'Balance',
      muscle_gain: 'Performance',
      gourmand: 'Genuss',
    },
    mode_descriptions: {
      diet: 'Balance, Ernährung und gesunde Mahlzeiten.',
      muscle_gain: 'Proteine, Performance und Regeneration.',
      gourmand: 'Genuss, Komfort und clevere Balance.',
    },
  },
  fridge_scan_result: {
    title: 'Chef',
    queued_badge: 'In Vorbereitung',
    ready_badge: 'Chef-Vorschlag',
    failed_badge: 'Fehler',
    queued_title: 'Dein Chef bereitet eine Idee vor',
    queued_body:
      'Dein Chef analysiert die sichtbaren Lebensmittel und passt den Vorschlag an dein gewaehltes Profil an.',
    error_title: 'Ergebnis nicht verfuegbar',
    error_body:
      'Der Chef konnte gerade keine Mahlzeit vorschlagen. Bitte mach ein klareres Foto.',
    sections: {
      why: 'Warum diese Wahl passt',
      ingredients: 'Zutaten',
      additions: 'Falls vorhanden ergaenzen',
      preparation: 'Zubereitung',
      nutrition: 'Ernaehrungshinweise',
      substitutions: 'Alternativen',
      tips: 'Tipps',
      advice: 'Chef-Tipp',
    },
    labels: {
      chef: 'Chef',
      used: 'Verwendet',
      detected: 'Erkannt',
      calories: 'Energie',
      protein: 'Protein',
      note: 'Notiz',
      caution: 'Hinweis',
      non_medical: 'Nicht medizinisch',
      to_cook: 'Kochen',
    },
    actions: {
      new_scan: 'Neues Foto',
      home: 'Zur Startseite',
    },
    proposal_status: {
      complete: 'Bereit mit dem, was du hast',
      needs_additions: 'Besser mit 1 oder 2 Extras',
      limited: 'Einfache Version',
    },
    calories_band: {
      light: 'Leicht',
      moderate: 'Moderat',
      hearty: 'Saettigend',
    },
    protein_band: {
      low: 'Niedrig',
      medium: 'Mittel',
      high: 'Hoch',
    },
    goal_badges: {
      diet: 'Ausgewogen',
      muscle_gain: 'Performance',
      gourmand: 'Genuss',
    },
  },
  exercises: {
    title: 'Unsere Übungen',
    search_placeholder: 'Übung suchen...',
    no_results: 'Keine Übungen gefunden',
    duration: 'min',
    difficulty: {
      easy: 'Leicht',
      medium: 'Mittel',
      hard: 'Schwer',
    },
  },
  recipes: {
    title: 'Unsere Rezepte',
    search_placeholder: 'Rezept suchen...',
    no_results: 'Keine Rezepte gefunden',
    prep_time: 'min',
    difficulty: {
      easy: 'Leicht',
      medium: 'Mittel',
      hard: 'Schwer',
    },
  },
  onboarding: {
    welcome_title: 'Willkommen!',
    setup_profile: 'Profil einrichten',
    choose_style: 'Stil wählen',
    theme_step_title: 'Wähle deinen Look',
    theme_step_subtitle:
      'Wähle hell oder dunkel. Du kannst es später ändern.',
    intro_step_title: 'Dein erster Scan beginnt hier',
    intro_step_subtitle:
      'Scanne, verstehe und verfolge dann, was sich verändert. Zuerst richten wir nur das Wesentliche ein.',
    intro_step_note:
      'Benutzername, Look, dann E-Mail bestätigen. Noch ein Schritt bis zu deinem ersten Scan.',
    profile_step_title: 'Richte dein Scan-Profil ein',
    profile_step_subtitle:
      'Wähle deinen Namen, füge auf Wunsch ein Foto hinzu und behalte einen klaren Look.',
    username_step_title: 'Wie sollen wir dich nennen?',
    username_step_subtitle:
      'Dieser Name erscheint auf deinen Scans und Beiträgen.',
    avatar_title: 'Profilfoto hinzufügen',
    avatar_subtitle:
      'Das ist jetzt optional und kann später in den Einstellungen geändert werden.',
    avatar_change_title: 'Profilfoto',
    avatar_change_subtitle:
      'Sie haben bereits ein Foto. Behalten oder ersetzen Sie es später.',
    avatar_skip: 'Jetzt überspringen',
    avatar_pre_auth_title: 'Foto hinzufügen',
    avatar_pre_auth_subtitle:
      'Optional. Es bleibt auf deinem Gerät, bis dein Konto bestätigt ist.',
    avatar_selected: 'Foto ausgewählt',
    avatar_take_photo: 'Foto aufnehmen',
    avatar_choose_gallery: 'Aus Galerie wählen',
    avatar_upload_retry: 'Upload erneut versuchen',
    avatar_upload_continue: 'Ohne Foto fortfahren',
    account_step_title: 'Erstelle dein Konto',
    account_step_subtitle:
      'E-Mail, Passwort, dann ein Code vor deinem ersten Scan.',
    username_label: 'Benutzername *',
    username_placeholder: 'user123',
    profile_theme_title: 'Erscheinungsbild',
    profile_theme_subtitle:
      'Wähle die klarste Ansicht für deinen Flow. Du kannst sie später ändern.',
    social_avatar_prompt_title:
      'Füge ein Foto hinzu, damit man dich leichter erkennt',
    social_avatar_prompt_subtitle:
      'Optional, aber praktisch, wenn du Scans und Fortschritt teilst.',
    username_status: {
      ready: 'Benutzername bereit',
      checking: 'Prüfen...',
      available: 'Verfügbar',
      taken: 'Bereits vergeben',
      invalid: '3-20 Zeichen, Buchstaben, Zahlen',
    },
    theme: {
      dark: 'Dunkel',
      dark_desc: 'Premium-Kontrast',
      light: 'Hell',
      light_desc: 'Klinische Klarheit',
    },
    next_btn: 'Weiter',
    start_btn: 'Abenteuer starten',
    enter_app: 'App öffnen',
    slide_1_eyebrow: 'Scanner',
    slide_1_title: 'Scanne zuerst. Rate weniger.',
    slide_1_subtitle:
      'Ein Foto für Mahlzeiten, Gesicht oder Körper. Health Scan macht daraus einen klaren Ausgangspunkt.',
    slide_1_bullet_1: 'Gesicht, Körper, Mahlzeiten',
    slide_1_bullet_2: 'Schnelle Aufnahme',
    slide_1_bullet_3: 'Klare Basis',
    slide_2_eyebrow: 'Coach',
    slide_2_title: 'Verstehe, was der Scan zeigt',
    slide_2_subtitle:
      'Dein Coach macht aus jedem Scan einfache nächste Schritte.',
    slide_2_bullet_1: 'Persönliche Hinweise',
    slide_2_bullet_2: 'Kontext nach jedem Scan',
    slide_2_bullet_3: 'Nächste beste Aktion',
    slide_3_eyebrow: 'Community',
    slide_3_title: 'Teile Fortschritte, wenn du willst',
    slide_3_subtitle:
      'Veröffentliche Updates, vergleiche Wege und bleib in deinem Tempo dran.',
    slide_3_bullet_1: 'Scans teilen',
    slide_3_bullet_2: 'Andere verfolgen',
    slide_3_bullet_3: 'Motiviert bleiben',
    slide_4_eyebrow: 'Fortschritt',
    slide_4_title: 'Sieh Fortschritt, nicht Rauschen',
    slide_4_subtitle:
      'Vergleiche deine Scans im Zeitverlauf und erkenne, was besser wird, stockt oder abweicht.',
    slide_4_bullet_1: 'Vorher / nachher',
    slide_4_bullet_2: 'Trendansicht',
    slide_4_bullet_3: 'Messbare Veränderung',
    slide_5_eyebrow: 'Kühlschrank',
    slide_5_title: 'Mach mehr daraus: Mahlzeiten',
    slide_5_subtitle:
      'Scanne deinen Kühlschrank und verwandle deinen Plan in einfache Mahlzeiten.',
    slide_5_bullet_1: 'Zutaten-Scan',
    slide_5_bullet_2: 'Rezeptideen',
    slide_5_bullet_3: 'Leicht oder herzhaft',
    error_session: 'Ungültige Sitzung. Bitte neu einloggen.',
    error_email: 'Bitte E-Mail vor dem Fortfahren bestätigen.',
    error_username_empty: 'Bitte Benutzernamen wählen',
    error_username_taken: 'Bitte freien Benutzernamen wählen',
    error_avatar_upload:
      'We could not upload your photo. Retry or continue without a photo.',
  },
  languages: {
    fr: 'Französisch',
    en: 'Englisch',
    de: 'Deutsch',
    it: 'Italienisch',
    es: 'Spanisch',
    pt: 'Portugiesisch',
  },
  analytics: {
    title: 'Analysen',
    subtitle: 'Verfolgen Sie Ihren Fortschritt',
    periods: {
      days_7: '7T',
      days_30: '30T',
      months_3: '3 Mon',
      year_1: '1 Jahr',
    },
    premium_feature: 'Premium-Funktion',
    premium_feature_msg:
      'Analysen über 3 Monate und 1 Jahr sind Premium-Mitgliedern vorbehalten.\n\nSchalten Sie den vollen Zugriff auf Ihre Gesundheitshistorie frei!',
    empty_state: 'Scannen Sie, um hier Ihren Fortschritt zu sehen!',
    health_score: 'Gesundheits-Score',
    health_score_subtitle: 'Entwicklung Ihres Gesamtscores',
    physical_evolution: 'Körperliche Entwicklung',
    physical_evolution_subtitle: 'Körperscore & Körperfett %',
    face_score: 'Gesichtswertung',
    face_score_subtitle: 'Entwicklung Ihrer Gesichtswertung',
    nutrition_score: 'Ernährungs-Score',
    nutrition_score_subtitle: 'Durchschnittlicher Mahlzeitenscore',
    super_scan_score: 'Super Scan',
    super_scan_score_subtitle: 'Globales Risiko-Score',
    legend_score: 'Score (0-100)',
    legend_body_fat: 'Körperfett %',
    metric_tabs: {
      score: 'Score',
      skin_quality: 'Haut',
      symmetry: 'Symmetrie',
      energy: 'Glow',
      hydration: 'Hydration',
      collagen: 'Kollagen',
      body_fat: 'Korperfett',
      strength: 'Kraft',
      posture: 'Haltung',
      metabolic_age: 'Stoffwechselalter',
      calories: 'Kalorien',
      protein: 'Protein',
      carbs: 'Kohlenhydrate',
      fats: 'Fette',
      satiety: 'Sattigung',
    },
  },
  super_scan_features: {
    premium_alert_title: 'Super Scan Premium',
    premium_alert_msg:
      'Super Scan ist eine exklusive Funktion für Premium-Mitglieder.\n\nErhalten Sie eine vollständige und detaillierte Analyse, indem Sie auf Premium upgraden!',
    used_alert_title: 'Super Scan verwendet',
    used_alert_msg:
      'Sie haben Ihren Super Scan heute bereits verwendet.\n\nKommen Sie morgen für einen neuen Super Scan zurück!',
    global_risk_score: 'Globales Risiko-Score',
    analysis_summary: 'Analyse-Zusammenfassung',
    conditions_detected: 'Erkannte Bedingungen',
    ras_title: 'Alles in Ordnung',
    ras_subtitle: 'Keine Anzeichen erkannt',
    ras_description:
      'Die Analyse hat keine besonderen Bedingungen erkannt. Passen Sie weiterhin gut auf sich auf!',
    premium_badge: 'Premium',
    used_today: 'Verwendet',
    limit_daily: '1/Tag',
    connection_reconnecting: 'Verbindung wird wiederhergestellt...',
    connection_unstable: 'Instabile Verbindung. Zum Wiederholen tippen.',
  },
  premium_features: {
    categories: {
      scans: 'Scans',
      analytics: 'Analysen',
      content: 'Inhalt',
      features: 'Funktionen',
      support: 'Support',
    },
    list: {
      health_scans: {
        title: 'Gesundheitsscans',
        description:
          'Analysieren Sie Ihre Gesichtsgesundheit auf Anzeichen von Müdigkeit und Stress',
        free: '1 Gesundheitsscan pro Woche',
        premium: '3 Gesundheitsscans pro Tag',
      },
      body_scans: {
        title: 'Körperscans',
        description:
          'Verfolgen Sie die Entwicklung Ihrer Körperzusammensetzung',
        free: '1 Körperscan pro Monat',
        premium: '3 Körperscans pro Tag',
      },
      nutrition_scans: {
        title: 'Ernährungsscans',
        description:
          'Analysieren Sie Ihre Mahlzeiten für präzises Ernährungstracking',
        free: '1 Ernährungsscan alle 3 Tage',
        premium: '3 Ernährungsscans pro Tag',
      },
      detailed_analytics: {
        title: 'Detaillierte Analysen',
        description:
          'Erweiterte Diagramme, vollständiger Verlauf und Gesundheitsvorhersagen',
        free: 'Basis-Diagramme (7 Tage)',
        premium:
          'Unbegrenzte detaillierte Analysen mit Verlauf und Vorhersagen',
      },
      unlimited_scans: {
        title: 'Taegliche Scans',
        description:
          '1 Gratis-Scan pro Typ alle 24 Stunden, bis zu 3 Scans pro Typ und Tag mit Premium',
        free: '1 Scan pro Typ alle 24 Stunden',
        premium: '3 Scans pro Typ und Tag',
      },
      advanced_recipes: {
        title: 'Fortgeschrittene Rezepte',
        description:
          'Zugang zu Premium-Rezepten mit detaillierten Ernährungsplänen und Videos',
        free: 'Zugang zu Basis-Rezepten',
        premium: 'Voller Zugang zu Premium-Rezepten mit Plänen und Videos',
      },
      premium_exercises: {
        title: 'Premium-Übungen',
        description: 'Personalisierte Trainingsprogramme und HD-Videos',
        free: 'Basis-Übungen',
        premium: 'Personalisierte Programme mit HD-Videos und Coaching',
      },
      export_data: {
        title: 'Datenexport',
        description: 'Exportieren Sie Ihre Gesundheitsdaten als PDF oder CSV',
        free: 'Nicht verfügbar',
        premium: 'Unbegrenzter Export als PDF oder CSV',
      },
      priority_support: {
        title: 'Priorisierter Support',
        description: 'Schnelle Antworten von unserem Support-Team',
        free: 'Standard-Support (48-72h)',
        premium: 'Priorisierte Antworten innerhalb von 24h',
      },
      custom_goals: {
        title: 'Benutzerdefinierte Ziele',
        description:
          'Definieren Sie maßgeschneiderte Gesundheitsziele mit erweitertem Tracking',
        free: 'Vordefinierte Ziele',
        premium: 'Benutzerdefinierte Ziele mit erweitertem Tracking',
      },
      meal_planner: {
        title: 'Mahlzeitenplaner',
        description:
          'Automatische Mahlzeitenplanung basierend auf Ihren Zielen',
        free: 'Nicht verfügbar',
        premium: 'Automatische Planung basierend auf Ihren Zielen',
      },
    },
  },
  months_short: {
    '0': 'Jan',
    '1': 'Feb',
    '2': 'Mär',
    '3': 'Apr',
    '4': 'Mai',
    '5': 'Jun',
    '6': 'Jul',
    '7': 'Aug',
    '8': 'Sep',
    '9': 'Okt',
    '10': 'Nov',
    '11': 'Dez',
  },
  scan_values: {
    face_shape: {
      Oval: 'Oval',
      Round: 'Runden',
      Square: 'Quadrat',
      Heart: 'Herz',
      Diamond: 'Diamant',
      Long: 'Verlängern',
      Triangle: 'Dreieck',
      Rectangular: 'Rechteckig',
    },
    body_type: {
      Ectomorph: 'Ektomorph',
      Mesomorph: 'Mesomorph',
      Endomorph: 'Endomorph',
      Hourglass: 'Sanduhr',
      Pear: 'Birne',
      Apple: 'Apfel',
      Rectangle: 'Rechteck',
      'Inverted Triangle': 'Umgekehrtes Dreieck',
    },
    muscle_mass: {
      Low: 'Schwach',
      Moderate: 'Mäßig',
      Average: 'Durchschnitt',
      High: 'Hoch',
      'Very High': 'Sehr hoch',
      Athlete: 'Sportlich',
    },
    glycemic_index: {
      Low: 'Schwach',
      Moderate: 'Mäßig',
      High: 'Schüler',
    },
    ingredient_quality: {
      Excellent: 'Exzellent',
      Good: 'Gut',
      Average: 'Mittel',
      Poor: 'Schwach',
      Bad: 'Mangelhaft',
      Processed: 'Verarbeitet',
      'Ultra Processed': 'Stark verarbeitet',
    },
    severity: {
      low: 'Schwach',
      moderate: 'Mäßig',
      high: 'Schüler',
    },
  },
  condition_card: {
    explanation: 'Erläuterung',
    advice: 'Praktische Ratschläge',
    probability: 'Wahrscheinlichkeit',
    unlock: 'Entsperren',
  },
  settings: {
    title: 'Einstellungen',
    section_subscription: 'Abonnement',
    upgrade_premium: 'Upgrade auf Premium',
    upgrade_subtitle: 'Alle Scans und Funktionen freischalten',
    section_preferences: 'Präferenzen',
    language: 'Sprache',
    notifications: 'Benachrichtigungen',
    new_notifications: 'Nachricht',
    notifications_preferences: 'Benachrichtigungseinstellungen',
    section_app: 'Anwendung',
    privacy_policy: 'Datenschutzrichtlinie',
    danger_zone_title: 'Gefahrenzone',
    danger_zone_desc:
      'Sobald Ihr Konto gelöscht wurde, gibt es kein Zurück mehr. Seien Sie sich Ihrer Wahl sicher.',
    sign_out_button: 'Abmelden',
    sign_out_loading: 'Trennen...',
    footer_version: 'Gesundheitsscan v1.0.0',
    select_language_title: 'Sprache wählen',
    cancel: 'Stornieren',
    ok: 'Okay',
    sign_out_confirm_title: 'Trennen',
    sign_out_confirm_msg: 'Möchten Sie sich wirklich abmelden?',
    sign_out_error_title: 'Fehler',
    sign_out_error_msg: 'Fehler beim Trennen der Verbindung',
    danger_zone: 'Gefahrenzone',
  },
} as const;

export default DE_TRANSLATIONS;
