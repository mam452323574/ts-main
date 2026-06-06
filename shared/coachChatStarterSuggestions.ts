// Bibliothèque de starters (250 suggestions FR) affichés dans
// `CoachConversationStarter` quand une conversation est encore vide. Le but
// est de proposer assez de variété pour ne jamais voir le même quartet deux
// fois de suite, tout en gardant la sélection déterministe par conversation
// (seed = conversation id) pour que les suggestions ne flickent pas pendant
// les re-renders ou les refetch de messages.
//
// 50 thèmes × 5 phrasings = 250 entrées. Chaque thème reste compact et
// orienté action pour matcher le ton du chat coach.

export const COACH_CHAT_STARTER_SUGGESTIONS_FR: readonly string[] = [
  // Sommeil
  'Aide-moi à mieux dormir cette semaine.',
  'Comment m’endormir plus vite ce soir ?',
  'Donne-moi une routine du soir simple.',
  'Je me réveille la nuit, qu’est-ce que je peux faire ?',
  'Comment caler mes horaires de sommeil ?',

  // Routine du matin
  'Quelle routine matinale me conviendrait ?',
  'Comment me sentir réveillé en 10 minutes ?',
  'Que faire dès le réveil pour bien démarrer ?',
  'Aide-moi à arrêter le téléphone le matin.',
  'Donne-moi un matin idéal en 30 minutes.',

  // Routine du soir
  'Donne-moi une routine du soir relaxante.',
  'Comment décrocher du boulot après 20h ?',
  'Aide-moi à ralentir avant de dormir.',
  'Que faire 1 h avant d’aller au lit ?',
  'Comment éviter le scroll le soir ?',

  // Petit-déjeuner
  '3 idées de petits-déjeuners équilibrés.',
  'Un petit-déj rapide pour ce matin ?',
  'Comment éviter le coup de pompe à 10h ?',
  'Un petit-déj salé qui change.',
  'Sucré ou salé, qu’est-ce qui me conviendrait ?',

  // Déjeuner
  'Aide-moi à préparer un déj équilibré ce midi.',
  '3 idées de déj rapides au bureau.',
  'Un déj léger sans coup de mou ensuite.',
  'Que manger si je n’ai que 15 minutes ?',
  'Un déj végétarien complet ?',

  // Dîner
  'Quelle taille d’assiette pour le dîner ?',
  '3 idées de dîners légers cette semaine.',
  'Un dîner réconfortant mais pas trop lourd.',
  'Que manger après 21h sans culpabiliser ?',
  'Un dîner anti-ballonnements ?',

  // Collations
  'Une collation saine entre les repas ?',
  'Comment éviter de grignoter le soir ?',
  '3 snacks sains à avoir sous la main.',
  'Que prendre avant un sport ?',
  'Un goûter rassasiant en 2 minutes.',

  // Hydratation
  'Combien d’eau je devrais boire aujourd’hui ?',
  'Astuces pour boire plus d’eau ?',
  'Que boire à part de l’eau ?',
  'Pourquoi j’ai souvent soif ?',
  'Comment me rappeler de boire au boulot ?',

  // Caféine
  'Combien de cafés c’est trop ?',
  'À quelle heure arrêter le café ?',
  'Une alternative au café le matin ?',
  'Comment réduire ma caféine sans crash ?',
  'Le café avant le sport, bonne idée ?',

  // Sucre / glycémie
  'Comment éviter les pics de sucre ?',
  '3 astuces pour stabiliser ma glycémie.',
  'Pourquoi j’ai envie de sucré l’après-midi ?',
  'Une journée pauvre en sucres ajoutés ?',
  'Que manger si j’ai trop sucré hier ?',

  // Stress
  'Comment baisser mon stress aujourd’hui ?',
  'Un rituel anti-stress en 5 minutes.',
  'Que faire quand je sens le stress monter ?',
  'Aide-moi à dédramatiser ma semaine.',
  '3 techniques contre le stress au boulot.',

  // Anxiété
  'Aide-moi à calmer mon anxiété ce soir.',
  'Que faire en cas de pic d’anxiété ?',
  'Une respiration anti-anxiété ?',
  'Comment mieux gérer mes ruminations ?',
  'Un point d’appui simple quand ça monte ?',

  // Énergie matin
  'Comment avoir plus d’énergie au réveil ?',
  'Pourquoi je suis vidé dès le matin ?',
  'Une astuce pour booster ma matinée ?',
  'Un mini-rituel énergie en 3 minutes.',
  'Le sport tôt, oui ou non pour moi ?',

  // Coup de pompe après-midi
  'Que faire contre le coup de barre de 15h ?',
  'Une vraie pause énergisante en 10 minutes ?',
  'Comment éviter le café après-midi ?',
  'Un snack qui réveille sans crash ?',
  'Astuces pour tenir l’après-midi.',

  // Fatigue chronique
  'Aide-moi à comprendre pourquoi je suis fatigué.',
  'Une semaine type pour récupérer ?',
  'Que prioriser quand je suis cramé ?',
  'Mes signes de surcharge à surveiller ?',
  'Un plan doux pour remonter mon énergie.',

  // Motivation
  'Aide-moi à m’y mettre maintenant.',
  'Comment retrouver ma motivation cette semaine ?',
  'Un déclic possible pour aujourd’hui ?',
  'Que faire quand je n’ai envie de rien ?',
  'Une mini-victoire à viser ce soir.',

  // Procrastination
  'Comment arrêter de repousser cette tâche ?',
  'Un premier pas concret en 5 minutes ?',
  'Pourquoi je procrastine sur ce truc ?',
  'Aide-moi à découper la tâche.',
  'Une astuce anti-procrastination simple.',

  // Discipline
  'Comment être plus régulier cette semaine ?',
  'Une mini-routine que je tiendrais 7 jours ?',
  'Comment garder le cap sans pression ?',
  'Un repère qui aide à tenir le rythme ?',
  'Aide-moi à arrêter de tout vouloir d’un coup.',

  // Focus / concentration
  'Comment garder mon focus 1 heure ?',
  'Un setup de travail qui aide à se concentrer ?',
  'Que faire si je suis dispersé ce matin ?',
  'Une technique de focus en 25 minutes ?',
  'Comment limiter mes distractions au boulot ?',

  // Méditation
  'Une méditation de 3 minutes à essayer ?',
  'Comment commencer la méditation simplement ?',
  'Que faire si je n’arrive pas à me poser ?',
  'Un moment idéal pour méditer ?',
  '3 raisons de tester la méditation cette semaine.',

  // Respiration
  'Une respiration pour me calmer maintenant ?',
  '3 techniques de respiration à essayer.',
  'Comment respirer pour mieux dormir ?',
  'Une respiration énergisante ?',
  'Pourquoi je respire mal sous stress ?',

  // Posture
  'Comment mieux me tenir au bureau ?',
  '3 corrections de posture pour aujourd’hui.',
  'Une auto-check de ma posture rapide ?',
  'Pourquoi j’ai mal au dos en fin de journée ?',
  'Une routine posture en 5 minutes ?',

  // Mal de dos
  'Aide-moi à soulager mon mal de dos.',
  '3 étirements pour mon dos ce soir.',
  'Comment éviter le mal de bas du dos au boulot ?',
  'Que faire en cas de tension lombaire ?',
  'Une routine douce pour mon dos.',

  // Tension nuque / épaules
  'Comment dégager mes épaules après le boulot ?',
  '3 étirements nuque rapides.',
  'Aide-moi à relâcher mes trapèzes.',
  'Un auto-massage simple ?',
  'Pourquoi j’ai la nuque tendue ?',

  // Articulations
  'Comment soulager mes genoux ?',
  'Que faire pour mes poignets fatigués au clavier ?',
  'Un échauffement articulaire de 3 minutes ?',
  'Comment garder des articulations en forme ?',
  'Quand m’inquiéter pour une douleur ?',

  // Sport débutant
  'Par où commencer pour me remettre au sport ?',
  '3 séances par semaine, comment caler ?',
  'Un sport doux pour démarrer ?',
  'Aide-moi à choisir un sport pour moi.',
  'Comment éviter de me décourager dès la semaine 2 ?',

  // Récupération sportive
  'Comment bien récupérer après un effort ?',
  'Que manger après le sport ?',
  '3 astuces pour moins de courbatures.',
  'Combien de jours de repos je dois prendre ?',
  'Une routine de récupération en 10 minutes ?',

  // Cardio
  '3 séances de cardio rapides ?',
  'Cardio intense ou doux pour moi ?',
  'Comment progresser en course à pied ?',
  'Une séance cardio sans matériel ?',
  'Quand faire du cardio dans la semaine ?',

  // Renforcement
  'Une séance renforcement complète en 20 minutes ?',
  '3 exercices pour des fessiers solides.',
  'Comment muscler mon dos chez moi ?',
  'Un programme renfo débutant ?',
  'Que travailler en priorité cette semaine ?',

  // Étirements
  'Une séance étirements le soir ?',
  '5 étirements à faire au réveil.',
  'Aide-moi à gagner en souplesse.',
  'Un yoga doux de 10 minutes ?',
  'Étirer chaud ou froid ?',

  // Skincare visage
  'Une routine visage simple matin/soir ?',
  'Comment réduire mes points noirs ?',
  '3 conseils contre les boutons d’adulte.',
  'Que faire si ma peau tire ?',
  'Quelle crème pour ma zone T grasse ?',

  // Skincare corps
  'Une routine corps cette semaine ?',
  'Comment hydrater une peau très sèche ?',
  '3 gestes contre les vergetures.',
  'Que faire pour la peau d’orange ?',
  'Comment soigner les peaux rugueuses des bras ?',

  // Cheveux
  'Comment réduire la chute de cheveux ?',
  '3 idées contre le gras qui revient vite.',
  'Une routine cheveux secs ?',
  'Que faire contre les pointes abîmées ?',
  'Aide-moi à espacer les shampoings.',

  // Yeux / écrans
  'Comment soulager mes yeux après l’écran ?',
  '3 pauses oculaires dans ma journée.',
  'Une astuce pour moins fatiguer mes yeux ?',
  'Que faire si ma vue flou en fin de journée ?',
  'Une routine yeux du soir ?',

  // Digestion / ballonnements
  'Que faire contre les ballonnements ?',
  '3 aliments qui aident ma digestion.',
  'Pourquoi je gonfle après le déjeuner ?',
  'Une routine digestion post-repas ?',
  'Comment apaiser une digestion lente ?',

  // Microbiote
  'Comment chouchouter mon microbiote ?',
  '3 aliments fermentés faciles à intégrer ?',
  'Un bowl pro-flore intestinale ?',
  'Que faire après une cure d’antibiotiques ?',
  'Aide-moi à diversifier mes fibres.',

  // Inflammation
  'Une journée anti-inflammatoire type ?',
  '3 aliments à limiter cette semaine ?',
  'Aide-moi à apaiser mon corps.',
  'Quels signes d’inflammation surveiller ?',
  'Un plan doux contre l’inflammation chronique ?',

  // Hormones / cycle
  'Comment écouter mon cycle cette semaine ?',
  'Que manger en phase lutéale ?',
  '3 astuces pour soulager le SPM.',
  'Quand bouger selon mon cycle ?',
  'Aide-moi à comprendre mon cycle.',

  // Humeur
  'Comment booster mon humeur aujourd’hui ?',
  '3 micro-actions anti-coup de blues.',
  'Pourquoi mon moral est en baisse ?',
  'Un rituel feel-good de 10 minutes ?',
  'Aide-moi à me reconnecter à moi.',

  // Confiance en soi
  'Comment me sentir plus sûr de moi ?',
  '3 rituels confiance en soi ?',
  'Aide-moi à arrêter de me comparer.',
  'Une affirmation utile pour cette semaine ?',
  'Que faire avec ma critique intérieure ?',

  // Relations
  'Comment poser une limite saine cette semaine ?',
  'Aide-moi à dire non sans culpabiliser.',
  '3 conseils pour mieux communiquer en couple.',
  'Comment recharger mes relations ?',
  'Que faire d’une amitié toxique ?',

  // Productivité
  'Comment être productif sans m’épuiser ?',
  '3 hacks productivité simples ?',
  'Un planning de journée équilibré ?',
  'Aide-moi à prioriser ma to-do.',
  'Une astuce pour les journées trop chargées ?',

  // Pause / déconnexion
  'Comment décrocher des écrans ce soir ?',
  '3 vraies pauses dans ma journée ?',
  'Un dimanche off réussi ?',
  'Aide-moi à arrêter de scroller.',
  'Une digital detox réaliste ?',

  // Voyage / décalage
  'Comment gérer le jet lag ?',
  '3 conseils pour bien voyager.',
  'Aide-moi à garder ma routine en voyage.',
  'Que manger en avion ?',
  'Un retour de vacances en douceur ?',

  // Travail intense
  'Comment tenir une semaine chargée sans craquer ?',
  '3 réflexes anti-burnout au boulot ?',
  'Aide-moi à faire de vraies pauses.',
  'Une stratégie pour les deadlines.',
  'Comment garder ma santé sous pression ?',

  // Étudiant
  'Une routine étudiante équilibrée ?',
  '3 astuces pour réviser efficacement.',
  'Aide-moi à gérer mes deadlines de fac.',
  'Comment bien dormir en période d’examens ?',
  'Un petit-déj étudiant pas cher.',

  // Parent débordé
  'Aide-moi à m’occuper de moi en étant parent.',
  '3 micro-rituels pour parent débordé.',
  'Une journée type plus douce ?',
  'Comment trouver 15 minutes pour moi ?',
  'Astuces pour mieux dormir avec un bébé.',

  // Saison froide
  'Comment éviter d’être tout le temps fatigué l’hiver ?',
  '3 réflexes pour la saison froide.',
  'Que manger en hiver pour rester en forme ?',
  'Aide-moi à bouger malgré le froid.',
  'Comment protéger ma peau en hiver ?',

  // Saison chaude
  'Comment bien tenir sous la chaleur ?',
  '3 idées de repas légers en été.',
  'Aide-moi à protéger ma peau du soleil.',
  'Une routine sport l’été ?',
  'Comment bien m’hydrater en été ?',

  // Nouveau départ
  'Aide-moi à démarrer un nouveau cycle.',
  '3 priorités pour le mois qui vient ?',
  'Une routine reboot après une période off ?',
  'Comment poser des bases solides ?',
  'Aide-moi à choisir une seule chose à changer.',
];

/* ---------- Helpers --------------------------------------------------- */

function hashSeedString(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  // Stir a bit so very similar seeds (consecutive uuids) don't pick adjacent
  // indices.
  return Math.abs(((h ^ (h >>> 13)) * 0x85ebca6b) | 0);
}

// Tiny seedable PRNG (mulberry32) — same one used elsewhere in the codebase
// for deterministic-but-uniform random choices. Replaces Math.random() so the
// same seed always yields the same sequence.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export interface PickStarterSuggestionsOptions {
  /** Seed for deterministic-per-conversation random picks. */
  seed?: string | null;
  /** Override the pool — useful for tests. */
  pool?: readonly string[];
}

/**
 * Pick `count` unique suggestions from the FR pool. When `seed` is set the
 * pick is deterministic so re-renders of the same conversation surface the
 * same quartet; when omitted, `Math.random()` is used for a fresh roll.
 */
export function pickRandomStarterSuggestions(
  count: number,
  options: PickStarterSuggestionsOptions = {},
): string[] {
  const pool = options.pool ?? COACH_CHAT_STARTER_SUGGESTIONS_FR;
  if (pool.length === 0 || count <= 0) return [];
  const safeCount = Math.min(count, pool.length);

  const rng =
    options.seed && options.seed.length > 0
      ? mulberry32(hashSeedString(options.seed))
      : Math.random;

  const chosen = new Set<number>();
  while (chosen.size < safeCount) {
    const idx = Math.floor(rng() * pool.length);
    chosen.add(idx);
  }
  return Array.from(chosen).map((i) => pool[i]);
}
