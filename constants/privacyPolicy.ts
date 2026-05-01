import {
  DEFAULT_LOCALE,
  USER_DEFAULT_LOCALE,
  type LocaleCode,
} from '@/i18n/config';

export interface PrivacyPolicySection {
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface PrivacyPolicyLocaleContent {
  locale: LocaleCode;
  label: string;
  title: string;
  lastUpdated: string;
  intro: string;
  sections: PrivacyPolicySection[];
}

export const PUBLIC_PRIVACY_POLICY_URL = 'https://healthscan.cloud/privacy-policy';

export const PRIVACY_POLICY_CONTENT: Record<LocaleCode, PrivacyPolicyLocaleContent> = {
  fr: {
    locale: 'fr',
    label: 'FR',
    title: 'Politique de confidentialite',
    lastUpdated: 'Derniere mise a jour : 18 mars 2026',
    intro:
      "Cette page explique comment Health Scan collecte, utilise et protege les donnees necessaires a l'analyse des scans sante et au fonctionnement du service.",
    sections: [
      {
        title: '1. Responsable et portee',
        paragraphs: [
          "Health Scan fournit des fonctionnalites de scan photo et de suivi sante. Cette politique couvre l'application mobile, la page publique de politique de confidentialite et les services techniques relies a votre compte.",
          'Si vous utilisez Health Scan, vous acceptez que nous traitions les donnees decrites ci-dessous pour fournir les scans, l historique, la facturation et la securite du compte.',
        ],
      },
      {
        title: '2. Donnees collectees',
        paragraphs: [
          'Nous collectons uniquement les categories de donnees necessaires au service.',
        ],
        bullets: [
          'Informations de compte : adresse email, nom utilisateur et photo de profil si vous en ajoutez une.',
          'Donnees de scan : photos de visage, corps ou repas, resultats d analyse, scores et historique de scans.',
          'Donnees techniques : identifiant d appareil, informations de session et journaux necessaires a la securite et a l authentification.',
          "Donnees d usage : preferences de langue, etat d abonnement et interactions utiles au fonctionnement du produit.",
        ],
      },
      {
        title: '3. Utilisation de la camera et des photos',
        paragraphs: [
          'La camera est utilisee pour capturer les photos que vous choisissez de soumettre a un scan. Les photos peuvent aussi etre choisies depuis la galerie lorsque vous utilisez le selecteur systeme.',
          "Les images sont televersees de maniere securisee vers notre backend, stockees dans l'infrastructure Supabase utilisee par Health Scan, puis transmises a notre infrastructure d'analyse pour produire les resultats affiches dans l'application.",
        ],
      },
      {
        title: '4. Finalites du traitement',
        paragraphs: ['Nous utilisons vos donnees pour :'],
        bullets: [
          'executer les scans et generer des resultats d analyse sante par IA ;',
          "afficher votre historique et vos scores dans l'application ;",
          'gerer l authentification, la securite du compte et les abonnements ;',
          'ameliorer la fiabilite du service et resoudre les incidents techniques.',
        ],
      },
      {
        title: '5. Prestataires et partage des donnees',
        paragraphs: [
          'Nous ne vendons pas vos donnees personnelles.',
          'Nous partageons les donnees uniquement avec des prestataires techniques necessaires a la fourniture du service, notamment Supabase pour l authentification, la base de donnees et le stockage, ainsi que notre infrastructure d analyse accessible via n8n.basedjew.com pour traiter les scans que vous envoyez.',
          'Nous pouvons aussi divulguer certaines donnees si la loi l exige ou pour proteger nos droits et la securite du service.',
        ],
      },
      {
        title: '6. Conservation et securite',
        paragraphs: [
          'Les donnees de compte et l historique de scans sont conserves tant que votre compte reste actif ou jusqu a reception d une demande de suppression valide.',
          "Les communications entre l'application et nos services utilisent HTTPS. L'acces aux donnees est restreint aux besoins du service et des operations de support.",
        ],
      },
      {
        title: '7. Vos droits',
        paragraphs: ['Selon la legislation applicable, vous pouvez demander :'],
        bullets: [
          'l acces a vos donnees ;',
          'la rectification de donnees inexactes ;',
          'la suppression de votre compte et des donnees associees ;',
          'l export de certaines donnees lorsque cela est techniquement possible ;',
          'le retrait de votre consentement lorsque ce traitement repose sur votre consentement.',
        ],
      },
      {
        title: '8. Suppression des donnees',
        paragraphs: [
          "Health Scan ne propose pas actuellement de suppression complete self-service dans l'application.",
          'Pour demander la suppression de votre compte ou de vos donnees, ecrivez a privacy@healthscan.cloud depuis l adresse associee a votre compte.',
        ],
      },
      {
        title: '9. Mineurs et mises a jour',
        paragraphs: [
          "Health Scan n'est pas destine aux personnes de moins de 16 ans.",
          'Nous pouvons mettre a jour cette politique pour refleter des evolutions legales, techniques ou produit. La date de mise a jour la plus recente est indiquee en haut de cette page.',
        ],
      },
      {
        title: '10. Contact',
        paragraphs: [
          'Pour toute question relative a la vie privee, a la suppression de donnees ou a cette politique, contactez privacy@healthscan.cloud.',
          'Pour le support produit general, contactez support@healthscan.cloud.',
        ],
      },
    ],
  },
  en: {
    locale: 'en',
    label: 'EN',
    title: 'Privacy Policy',
    lastUpdated: 'Last updated: March 18, 2026',
    intro:
      'This page explains how Health Scan collects, uses, and protects the data required to run health scans and the service itself.',
    sections: [
      {
        title: '1. Controller and scope',
        paragraphs: [
          'Health Scan provides photo scan and health tracking features. This policy applies to the mobile app, the public privacy policy page, and the technical services connected to your account.',
          'If you use Health Scan, you agree that we process the data described below to provide scans, history, billing, and account security.',
        ],
      },
      {
        title: '2. Data we collect',
        paragraphs: [
          'We only collect categories of data that are necessary to operate the service.',
        ],
        bullets: [
          'Account information: email address, username, and profile photo if you add one.',
          'Scan data: face, body, or food photos, analysis results, scores, and scan history.',
          'Technical data: device identifier, session information, and logs required for security and authentication.',
          'Usage data: language preference, subscription state, and interactions required for product operation.',
        ],
      },
      {
        title: '3. Camera and photo use',
        paragraphs: [
          'The camera is used to capture photos that you choose to submit for a scan. Photos may also be selected from the gallery when you use the system photo picker.',
          'Images are uploaded securely to our backend, stored in the Supabase infrastructure used by Health Scan, and then sent to our analysis infrastructure to produce the results shown in the app.',
        ],
      },
      {
        title: '4. Why we process data',
        paragraphs: ['We use your data to:'],
        bullets: [
          'run scans and generate AI health analysis results;',
          'show your history and scores inside the app;',
          'manage authentication, account security, and subscriptions;',
          'improve service reliability and resolve technical incidents.',
        ],
      },
      {
        title: '5. Service providers and data sharing',
        paragraphs: [
          'We do not sell your personal data.',
          'We only share data with technical providers needed to operate the service, including Supabase for authentication, database, and storage, and our scan analysis infrastructure reachable via n8n.basedjew.com to process the scans you submit.',
          'We may also disclose certain data if required by law or to protect our rights and service security.',
        ],
      },
      {
        title: '6. Retention and security',
        paragraphs: [
          'Account data and scan history are retained while your account remains active or until we receive a valid deletion request.',
          'Communications between the app and our services use HTTPS. Access to data is limited to what is required to operate and support the service.',
        ],
      },
      {
        title: '7. Your rights',
        paragraphs: ['Depending on applicable law, you may request:'],
        bullets: [
          'access to your data;',
          'correction of inaccurate data;',
          'deletion of your account and associated data;',
          'export of certain data where technically feasible;',
          'withdrawal of consent where processing depends on consent.',
        ],
      },
      {
        title: '8. Data deletion',
        paragraphs: [
          'Health Scan does not currently provide a full self-service account deletion flow inside the app.',
          'To request deletion of your account or data, email privacy@healthscan.cloud from the address linked to your account.',
        ],
      },
      {
        title: '9. Children and updates',
        paragraphs: [
          'Health Scan is not intended for people under 16 years old.',
          'We may update this policy to reflect legal, technical, or product changes. The latest revision date appears at the top of this page.',
        ],
      },
      {
        title: '10. Contact',
        paragraphs: [
          'For privacy, deletion, or policy questions, contact privacy@healthscan.cloud.',
          'For general product support, contact support@healthscan.cloud.',
        ],
      },
    ],
  },
  it: {
    locale: 'it',
    label: 'IT',
    title: 'Informativa sulla privacy',
    lastUpdated: 'Ultimo aggiornamento: 18 marzo 2026',
    intro:
      'Questa pagina spiega come Health Scan raccoglie, utilizza e protegge i dati necessari per eseguire gli scan salute e far funzionare il servizio.',
    sections: [
      {
        title: '1. Titolare e ambito',
        paragraphs: [
          "Health Scan offre funzioni di scan fotografico e monitoraggio del benessere. Questa informativa si applica all'app mobile, alla pagina pubblica dell'informativa sulla privacy e ai servizi tecnici collegati al tuo account.",
          'Se utilizzi Health Scan, accetti che trattiamo i dati descritti di seguito per fornire scan, cronologia, fatturazione e sicurezza dell account.',
        ],
      },
      {
        title: '2. Dati raccolti',
        paragraphs: [
          'Raccogliamo solo le categorie di dati necessarie per erogare il servizio.',
        ],
        bullets: [
          'Informazioni account: indirizzo email, nome utente e foto profilo se ne aggiungi una.',
          'Dati di scan: foto di viso, corpo o cibo, risultati di analisi, punteggi e cronologia degli scan.',
          'Dati tecnici: identificatore del dispositivo, informazioni di sessione e log necessari per sicurezza e autenticazione.',
          'Dati di utilizzo: preferenza lingua, stato dell abbonamento e interazioni utili al funzionamento del prodotto.',
        ],
      },
      {
        title: '3. Uso della fotocamera e delle foto',
        paragraphs: [
          'La fotocamera viene usata per acquisire le foto che scegli di inviare a uno scan. Le foto possono anche essere selezionate dalla galleria tramite il selettore foto di sistema.',
          "Le immagini vengono caricate in modo sicuro sul nostro backend, archiviate nell'infrastruttura Supabase usata da Health Scan e poi inviate alla nostra infrastruttura di analisi per produrre i risultati mostrati nell'app.",
        ],
      },
      {
        title: '4. Finalita del trattamento',
        paragraphs: ['Utilizziamo i tuoi dati per:'],
        bullets: [
          'eseguire scan e generare risultati di analisi salute basati su IA;',
          "mostrare cronologia e punteggi all'interno dell'app;",
          'gestire autenticazione, sicurezza dell account e abbonamenti;',
          'migliorare affidabilita del servizio e risolvere incidenti tecnici.',
        ],
      },
      {
        title: '5. Fornitori e condivisione dei dati',
        paragraphs: [
          'Non vendiamo i tuoi dati personali.',
          'Condividiamo i dati solo con fornitori tecnici necessari al funzionamento del servizio, tra cui Supabase per autenticazione, database e storage, e la nostra infrastruttura di analisi raggiungibile tramite n8n.basedjew.com per elaborare gli scan che invii.',
          'Possiamo inoltre divulgare alcuni dati se richiesto dalla legge o per proteggere i nostri diritti e la sicurezza del servizio.',
        ],
      },
      {
        title: '6. Conservazione e sicurezza',
        paragraphs: [
          'I dati dell account e la cronologia degli scan vengono conservati finche il tuo account resta attivo o finche non riceviamo una richiesta valida di cancellazione.',
          "Le comunicazioni tra l'app e i nostri servizi usano HTTPS. L'accesso ai dati e limitato a quanto necessario per far funzionare e supportare il servizio.",
        ],
      },
      {
        title: '7. I tuoi diritti',
        paragraphs: ['In base alla normativa applicabile, puoi richiedere:'],
        bullets: [
          'accesso ai tuoi dati;',
          'rettifica di dati inesatti;',
          'cancellazione del tuo account e dei dati associati;',
          'esportazione di alcuni dati quando tecnicamente possibile;',
          'revoca del consenso quando il trattamento si basa sul consenso.',
        ],
      },
      {
        title: '8. Cancellazione dei dati',
        paragraphs: [
          "Health Scan non offre attualmente un flusso completo di cancellazione self-service all'interno dell'app.",
          'Per richiedere la cancellazione del tuo account o dei tuoi dati, scrivi a privacy@healthscan.cloud dall indirizzo collegato al tuo account.',
        ],
      },
      {
        title: '9. Minori e aggiornamenti',
        paragraphs: [
          'Health Scan non e destinato a persone con meno di 16 anni.',
          'Possiamo aggiornare questa informativa per riflettere cambiamenti legali, tecnici o di prodotto. La data dell ultima revisione appare in alto in questa pagina.',
        ],
      },
      {
        title: '10. Contatti',
        paragraphs: [
          'Per domande su privacy, cancellazione dei dati o questa informativa, contatta privacy@healthscan.cloud.',
          'Per il supporto prodotto generale, contatta support@healthscan.cloud.',
        ],
      },
    ],
  },
  pt: {
    locale: 'pt',
    label: 'PT',
    title: 'Politica de privacidade',
    lastUpdated: 'Ultima atualizacao: 18 de marco de 2026',
    intro:
      'Esta pagina explica como a Health Scan recolhe, utiliza e protege os dados necessarios para executar scans de saude e prestar o servico.',
    sections: [
      {
        title: '1. Responsavel e ambito',
        paragraphs: [
          'A Health Scan disponibiliza funcionalidades de scan por fotografia e acompanhamento de bem-estar. Esta politica aplica-se a app mobile, a pagina publica da politica de privacidade e aos servicos tecnicos ligados a sua conta.',
          'Ao utilizar a Health Scan, aceita que tratemos os dados descritos abaixo para fornecer scans, historico, faturacao e seguranca da conta.',
        ],
      },
      {
        title: '2. Dados recolhidos',
        paragraphs: [
          'Recolhemos apenas as categorias de dados necessarias para operar o servico.',
        ],
        bullets: [
          'Informacoes de conta: endereco de email, nome de utilizador e fotografia de perfil se adicionar uma.',
          'Dados de scan: fotografias de rosto, corpo ou alimentacao, resultados de analise, pontuacoes e historico de scans.',
          'Dados tecnicos: identificador do dispositivo, informacoes de sessao e registos necessarios para seguranca e autenticacao.',
          'Dados de utilizacao: preferencia de idioma, estado da subscricao e interacoes necessarias ao funcionamento do produto.',
        ],
      },
      {
        title: '3. Utilizacao da camara e das fotos',
        paragraphs: [
          'A camara e utilizada para captar as fotos que escolher submeter a um scan. As fotos tambem podem ser selecionadas na galeria quando utiliza o seletor de fotos do sistema.',
          'As imagens sao enviadas em seguranca para o nosso backend, armazenadas na infraestrutura Supabase utilizada pela Health Scan e depois encaminhadas para a nossa infraestrutura de analise para produzir os resultados apresentados na app.',
        ],
      },
      {
        title: '4. Finalidades do tratamento',
        paragraphs: ['Utilizamos os seus dados para:'],
        bullets: [
          'executar scans e gerar resultados de analise de saude com IA;',
          'mostrar o seu historico e as suas pontuacoes dentro da app;',
          'gerir autenticacao, seguranca da conta e subscricoes;',
          'melhorar a fiabilidade do servico e resolver incidentes tecnicos.',
        ],
      },
      {
        title: '5. Prestadores e partilha de dados',
        paragraphs: [
          'Nao vendemos os seus dados pessoais.',
          'Partilhamos dados apenas com prestadores tecnicos necessarios para operar o servico, incluindo a Supabase para autenticacao, base de dados e armazenamento, e a nossa infraestrutura de analise acessivel atraves de n8n.basedjew.com para processar os scans que envia.',
          'Tambem podemos divulgar determinados dados se a lei o exigir ou para proteger os nossos direitos e a seguranca do servico.',
        ],
      },
      {
        title: '6. Conservacao e seguranca',
        paragraphs: [
          'Os dados da conta e o historico de scans sao conservados enquanto a sua conta permanecer ativa ou ate recebermos um pedido valido de eliminacao.',
          'As comunicacoes entre a app e os nossos servicos utilizam HTTPS. O acesso aos dados e limitado ao necessario para operar e dar suporte ao servico.',
        ],
      },
      {
        title: '7. Os seus direitos',
        paragraphs: ['De acordo com a legislacao aplicavel, pode solicitar:'],
        bullets: [
          'acesso aos seus dados;',
          'retificacao de dados inexatos;',
          'eliminacao da sua conta e dos dados associados;',
          'exportacao de determinados dados quando tecnicamente possivel;',
          'retirada do consentimento quando o tratamento depender do consentimento.',
        ],
      },
      {
        title: '8. Eliminacao de dados',
        paragraphs: [
          'A Health Scan nao disponibiliza atualmente um fluxo completo de eliminacao self-service dentro da app.',
          'Para solicitar a eliminacao da sua conta ou dos seus dados, envie um email para privacy@healthscan.cloud a partir do endereco associado a sua conta.',
        ],
      },
      {
        title: '9. Menores e atualizacoes',
        paragraphs: [
          'A Health Scan nao se destina a menores de 16 anos.',
          'Podemos atualizar esta politica para refletir alteracoes legais, tecnicas ou de produto. A data da revisao mais recente aparece no topo desta pagina.',
        ],
      },
      {
        title: '10. Contacto',
        paragraphs: [
          'Para questoes sobre privacidade, eliminacao de dados ou esta politica, contacte privacy@healthscan.cloud.',
          'Para apoio geral ao produto, contacte support@healthscan.cloud.',
        ],
      },
    ],
  },
  es: {
    locale: 'es',
    label: 'ES',
    title: 'Politica de privacidad',
    lastUpdated: 'Ultima actualizacion: 18 de marzo de 2026',
    intro:
      'Esta pagina explica como Health Scan recopila, utiliza y protege los datos necesarios para ejecutar escaneos de salud y prestar el servicio.',
    sections: [
      {
        title: '1. Responsable y alcance',
        paragraphs: [
          'Health Scan ofrece funciones de escaneo por foto y seguimiento del bienestar. Esta politica se aplica a la app movil, a la pagina publica de politica de privacidad y a los servicios tecnicos conectados a tu cuenta.',
          'Si utilizas Health Scan, aceptas que tratemos los datos descritos a continuacion para ofrecer escaneos, historial, facturacion y seguridad de la cuenta.',
        ],
      },
      {
        title: '2. Datos que recopilamos',
        paragraphs: [
          'Solo recopilamos categorias de datos necesarias para operar el servicio.',
        ],
        bullets: [
          'Informacion de la cuenta: direccion de correo, nombre de usuario y foto de perfil si anades una.',
          'Datos de escaneo: fotos de rostro, cuerpo o comida, resultados de analisis, puntuaciones e historial de escaneos.',
          'Datos tecnicos: identificador del dispositivo, informacion de sesion y registros necesarios para seguridad y autenticacion.',
          'Datos de uso: idioma preferido, estado de la suscripcion e interacciones necesarias para el funcionamiento del producto.',
        ],
      },
      {
        title: '3. Uso de la camara y de las fotos',
        paragraphs: [
          'La camara se utiliza para capturar las fotos que decides enviar a un escaneo. Las fotos tambien pueden seleccionarse desde la galeria mediante el selector de fotos del sistema.',
          'Las imagenes se cargan de forma segura a nuestro backend, se almacenan en la infraestructura de Supabase utilizada por Health Scan y despues se envian a nuestra infraestructura de analisis para producir los resultados que se muestran en la app.',
        ],
      },
      {
        title: '4. Por que tratamos los datos',
        paragraphs: ['Utilizamos tus datos para:'],
        bullets: [
          'ejecutar escaneos y generar resultados de analisis de salud con IA;',
          'mostrar tu historial y tus puntuaciones dentro de la app;',
          'gestionar autenticacion, seguridad de la cuenta y suscripciones;',
          'mejorar la fiabilidad del servicio y resolver incidencias tecnicas.',
        ],
      },
      {
        title: '5. Proveedores y cesion de datos',
        paragraphs: [
          'No vendemos tus datos personales.',
          'Solo compartimos datos con proveedores tecnicos necesarios para operar el servicio, incluidos Supabase para autenticacion, base de datos y almacenamiento, y nuestra infraestructura de analisis accesible a traves de n8n.basedjew.com para procesar los escaneos que envias.',
          'Tambien podemos divulgar determinados datos si la ley lo exige o para proteger nuestros derechos y la seguridad del servicio.',
        ],
      },
      {
        title: '6. Conservacion y seguridad',
        paragraphs: [
          'Los datos de la cuenta y el historial de escaneos se conservan mientras tu cuenta permanezca activa o hasta que recibamos una solicitud valida de eliminacion.',
          'Las comunicaciones entre la app y nuestros servicios utilizan HTTPS. El acceso a los datos se limita a lo necesario para operar y dar soporte al servicio.',
        ],
      },
      {
        title: '7. Tus derechos',
        paragraphs: ['Segun la legislacion aplicable, puedes solicitar:'],
        bullets: [
          'acceso a tus datos;',
          'rectificacion de datos inexactos;',
          'eliminacion de tu cuenta y de los datos asociados;',
          'exportacion de determinados datos cuando sea tecnicamente posible;',
          'retirada del consentimiento cuando el tratamiento dependa del consentimiento.',
        ],
      },
      {
        title: '8. Eliminacion de datos',
        paragraphs: [
          'Health Scan no ofrece actualmente un flujo completo de eliminacion self-service dentro de la app.',
          'Para solicitar la eliminacion de tu cuenta o de tus datos, escribe a privacy@healthscan.cloud desde la direccion vinculada a tu cuenta.',
        ],
      },
      {
        title: '9. Menores y actualizaciones',
        paragraphs: [
          'Health Scan no esta dirigido a menores de 16 anos.',
          'Podemos actualizar esta politica para reflejar cambios legales, tecnicos o de producto. La fecha de la revision mas reciente aparece en la parte superior de esta pagina.',
        ],
      },
      {
        title: '10. Contacto',
        paragraphs: [
          'Para preguntas sobre privacidad, eliminacion de datos o esta politica, contacta con privacy@healthscan.cloud.',
          'Para soporte general del producto, contacta con support@healthscan.cloud.',
        ],
      },
    ],
  },
  de: {
    locale: 'de',
    label: 'DE',
    title: 'Datenschutzerklarung',
    lastUpdated: 'Zuletzt aktualisiert: 18. Marz 2026',
    intro:
      'Diese Seite erklart, wie Health Scan die Daten erhebt, nutzt und schutzt, die fur Gesundheits-Scans und den Betrieb des Dienstes erforderlich sind.',
    sections: [
      {
        title: '1. Verantwortlicher und Geltungsbereich',
        paragraphs: [
          'Health Scan bietet Foto-Scan- und Wellness-Tracking-Funktionen. Diese Richtlinie gilt fur die mobile App, die offentliche Datenschutzseite und die technischen Dienste, die mit deinem Konto verbunden sind.',
          'Wenn du Health Scan nutzt, stimmst du zu, dass wir die unten beschriebenen Daten verarbeiten, um Scans, Verlauf, Abrechnung und Kontosicherheit bereitzustellen.',
        ],
      },
      {
        title: '2. Welche Daten wir erfassen',
        paragraphs: [
          'Wir erfassen nur die Datenkategorien, die fur den Betrieb des Dienstes erforderlich sind.',
        ],
        bullets: [
          'Kontoinformationen: E-Mail-Adresse, Benutzername und Profilbild, falls du eines hinzufugst.',
          'Scan-Daten: Fotos von Gesicht, Korper oder Essen, Analyseergebnisse, Scores und Scan-Verlauf.',
          'Technische Daten: Geratekennung, Sitzungsinformationen und Protokolle fur Sicherheit und Authentifizierung.',
          'Nutzungsdaten: Sprachpraferenz, Abonnementstatus und Interaktionen, die fur den Produktbetrieb erforderlich sind.',
        ],
      },
      {
        title: '3. Nutzung von Kamera und Fotos',
        paragraphs: [
          'Die Kamera wird verwendet, um Fotos aufzunehmen, die du fur einen Scan einreichst. Fotos konnen auch uber den System-Fotoauswahler aus der Galerie ausgewahlt werden.',
          'Bilder werden sicher an unser Backend ubertragen, in der von Health Scan genutzten Supabase-Infrastruktur gespeichert und anschliessend an unsere Analyse-Infrastruktur weitergeleitet, um die in der App angezeigten Ergebnisse zu erzeugen.',
        ],
      },
      {
        title: '4. Zwecke der Verarbeitung',
        paragraphs: ['Wir verwenden deine Daten, um:'],
        bullets: [
          'Scans auszufuhren und KI-gestutzte Gesundheitsanalysen zu erzeugen;',
          'deinen Verlauf und deine Scores in der App anzuzeigen;',
          'Authentifizierung, Kontosicherheit und Abonnements zu verwalten;',
          'die Zuverlassigkeit des Dienstes zu verbessern und technische Vorfalle zu beheben.',
        ],
      },
      {
        title: '5. Dienstleister und Datenweitergabe',
        paragraphs: [
          'Wir verkaufen deine personenbezogenen Daten nicht.',
          'Wir geben Daten nur an technische Dienstleister weiter, die fur den Betrieb des Dienstes erforderlich sind, darunter Supabase fur Authentifizierung, Datenbank und Speicher sowie unsere Analyse-Infrastruktur unter n8n.basedjew.com, um die von dir eingereichten Scans zu verarbeiten.',
          'Ausserdem konnen wir bestimmte Daten offenlegen, wenn dies gesetzlich vorgeschrieben ist oder um unsere Rechte und die Sicherheit des Dienstes zu schutzen.',
        ],
      },
      {
        title: '6. Speicherung und Sicherheit',
        paragraphs: [
          'Kontodaten und Scan-Verlauf werden gespeichert, solange dein Konto aktiv bleibt oder bis wir einen gultigen Loschantrag erhalten.',
          'Die Kommunikation zwischen der App und unseren Diensten erfolgt uber HTTPS. Der Datenzugriff ist auf das beschrankt, was fur Betrieb und Support des Dienstes erforderlich ist.',
        ],
      },
      {
        title: '7. Deine Rechte',
        paragraphs: ['Je nach anwendbarem Recht kannst du Folgendes verlangen:'],
        bullets: [
          'Zugang zu deinen Daten;',
          'Berichtigung unrichtiger Daten;',
          'Loschung deines Kontos und der zugehorigen Daten;',
          'Export bestimmter Daten, soweit technisch moglich;',
          'Widerruf deiner Einwilligung, wenn die Verarbeitung auf Einwilligung beruht.',
        ],
      },
      {
        title: '8. Loschung von Daten',
        paragraphs: [
          'Health Scan bietet derzeit keinen vollstandigen Self-Service-Flow zur Kontoloschung innerhalb der App.',
          'Wenn du die Loschung deines Kontos oder deiner Daten beantragen mochtest, schreibe an privacy@healthscan.cloud uber die mit deinem Konto verknupfte Adresse.',
        ],
      },
      {
        title: '9. Minderjahrige und Aktualisierungen',
        paragraphs: [
          'Health Scan ist nicht fur Personen unter 16 Jahren bestimmt.',
          'Wir konnen diese Richtlinie aktualisieren, um rechtliche, technische oder produktbezogene Anderungen abzubilden. Das Datum der letzten Uberarbeitung steht oben auf dieser Seite.',
        ],
      },
      {
        title: '10. Kontakt',
        paragraphs: [
          'Bei Fragen zu Datenschutz, Datenloschung oder dieser Richtlinie kontaktiere privacy@healthscan.cloud.',
          'Fur allgemeinen Produktsupport kontaktiere support@healthscan.cloud.',
        ],
      },
    ],
  },
};

const PRIVACY_POLICY_FALLBACK_ORDER: readonly LocaleCode[] = [
  USER_DEFAULT_LOCALE,
  DEFAULT_LOCALE,
];

export function getPrivacyPolicyContent(
  locale?: LocaleCode | null,
): PrivacyPolicyLocaleContent {
  if (locale && PRIVACY_POLICY_CONTENT[locale]) {
    return PRIVACY_POLICY_CONTENT[locale];
  }

  for (const candidate of PRIVACY_POLICY_FALLBACK_ORDER) {
    if (locale === candidate) {
      continue;
    }

    if (PRIVACY_POLICY_CONTENT[candidate]) {
      return PRIVACY_POLICY_CONTENT[candidate];
    }
  }

  return PRIVACY_POLICY_CONTENT[DEFAULT_LOCALE];
}
