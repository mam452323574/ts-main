import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const outRoot = path.join(projectRoot, 'store-assets', 'app-store');
const iconPath = path.join(projectRoot, 'assets', 'images', 'icon.png');

const CANVAS = {
  width: 1290,
  height: 2796,
};

const PHONE = {
  width: 620,
  height: 1342,
  x: 335,
  y: 850,
  bezel: 28,
};

const colors = {
  ink: '#07142A',
  body: '#34425F',
  muted: '#687491',
  blue: '#1478FF',
  blueDark: '#0B56CC',
  cyan: '#5ED8FF',
  mint: '#80E2CE',
  green: '#3F8B6D',
  gold: '#D6A329',
  surface: '#FFFFFF',
  surfaceSoft: '#F4F8FF',
  border: '#D9E8FF',
};

const localized = {
  fr: {
    slides: [
      {
        slug: '01-scan',
        title: 'Scanne ton bien-etre en quelques secondes',
        eyebrow: 'SCAN SELF LENS',
        caption: 'Face, corps ou nutrition: lance un scan clair, rapide et guide.',
        screen: 'home',
        badges: ['3 scans visuels', 'Upload securise', 'Resultat lisible'],
      },
      {
        slug: '02-results',
        title: 'Des resultats visuels faciles a lire',
        eyebrow: 'RESULTATS',
        caption: 'Scores, signaux visuels et conseils courts pour comprendre ton evolution.',
        screen: 'result',
        badges: ['Score global', 'Signaux visuels', 'Actions simples'],
      },
      {
        slug: '03-trends',
        title: 'Suis tes tendances dans le temps',
        eyebrow: 'ANALYSES',
        caption: 'Compare tes scans et repere les tendances importantes semaine apres semaine.',
        screen: 'analytics',
        badges: ['Graphiques', 'Historique', 'Progression'],
      },
      {
        slug: '04-coach',
        title: "Un coach pour passer a l'action",
        eyebrow: 'COACH',
        caption: 'Transforme tes resultats en prochaines etapes simples et personnalisees.',
        screen: 'coach',
        badges: ['Questions libres', 'Plans courts', 'Guidance bien-etre'],
      },
      {
        slug: '05-modes',
        title: 'Visage, corps, nutrition, au meme endroit',
        eyebrow: 'MODES',
        caption: 'Choisis le scan adapte a ton objectif du moment.',
        screen: 'modes',
        badges: ['Visage', 'Corps', 'Nutrition', 'Super Scan'],
      },
      {
        slug: '06-premium',
        title: 'Debloque le suivi avance quand tu veux',
        eyebrow: 'PREMIUM',
        caption: 'Plus de scans, plus de tendances et un suivi plus profond.',
        screen: 'premium',
        badges: ['Suivi avance', 'Plus de scans', 'Coach enrichi'],
      },
    ],
  },
  en: {
    slides: [
      {
        slug: '01-scan',
        title: 'Scan your wellness in seconds',
        eyebrow: 'SELF LENS SCAN',
        caption: 'Face, body, or nutrition: start a clear guided scan in seconds.',
        screen: 'home',
        badges: ['3 visual scans', 'Secure upload', 'Readable result'],
      },
      {
        slug: '02-results',
        title: 'Clear visual insights after each scan',
        eyebrow: 'RESULTS',
        caption: 'Scores, visual signals, and short next steps help you understand change.',
        screen: 'result',
        badges: ['Global score', 'Visual signals', 'Simple actions'],
      },
      {
        slug: '03-trends',
        title: 'Track your trends over time',
        eyebrow: 'ANALYTICS',
        caption: 'Compare scans and spot meaningful changes week after week.',
        screen: 'analytics',
        badges: ['Charts', 'History', 'Progress'],
      },
      {
        slug: '04-coach',
        title: 'Turn scans into guided next steps',
        eyebrow: 'COACH',
        caption: 'Move from results to simple wellness guidance you can act on.',
        screen: 'coach',
        badges: ['Free questions', 'Short plans', 'Wellness guidance'],
      },
      {
        slug: '05-modes',
        title: 'Face, body, and nutrition in one place',
        eyebrow: 'MODES',
        caption: 'Choose the scan that matches what you want to understand today.',
        screen: 'modes',
        badges: ['Face', 'Body', 'Nutrition', 'Super Scan'],
      },
      {
        slug: '06-premium',
        title: 'Unlock deeper tracking when you are ready',
        eyebrow: 'PREMIUM',
        caption: 'More scans, richer trends, and deeper coach context.',
        screen: 'premium',
        badges: ['Advanced tracking', 'More scans', 'Richer coach'],
      },
    ],
  },
};

const uiCopy = {
  fr: {
    readyTitle: 'Pret pour ton scan',
    readySubtitle: 'Choisis une zone et cadre ton image.',
    face: 'Visage',
    body: 'Corps',
    nutrition: 'Nutrition',
    launchScan: 'Lancer le scan',
    resultTitle: 'Resultat du scan',
    resultSubtitle: 'Signaux visuels et tendances.',
    wellnessScore: 'score bien-etre',
    hydration: 'Hydratation',
    energy: 'Energie',
    sleep: 'Sommeil',
    routine: 'Routine',
    stable: 'Stable',
    threeSteps: '3 pas',
    nextStep: 'Prochaine etape',
    nextStepBody: 'Refaire un scan dans 7 jours.',
    trendsTitle: 'Tes tendances',
    trendsSubtitle: 'Compare tes derniers scans.',
    progress30: 'progression 30 jours',
    historyNote: 'Historique clair et facile a comparer.',
    coachTitle: 'Coach SelfLens',
    coachSubtitle: 'Des conseils bases sur tes scans.',
    dayRoutine: 'Routine du jour',
    routineBody: 'Hydratation, sommeil et recuperation.',
    question: 'Que dois-je ameliorer cette semaine ?',
    freeQuestion: 'Question libre',
    simplePlan: 'Ton plan simple',
    planOne: '1. Boire plus tot dans la journee',
    planTwo: '2. Refaire un scan dimanche',
    planThree: '3. Suivre ton energie',
    askCoach: 'Demander au coach...',
    modesTitle: 'Choisis ton scan',
    modesSubtitle: 'Un mode pour chaque objectif.',
    visualSignals: 'Signaux visuels',
    posture: 'Posture & forme',
    mealBalance: 'Repas & equilibre',
    combined: 'Vue combinee',
    grouped: 'Tout ton suivi reste regroupe',
    groupedBody: 'Resultats, tendances et coach dans le meme espace.',
    premiumTitle: 'SelfLens Premium',
    premiumSubtitle: 'Plus de contexte, plus de scans.',
    advancedTracking: 'Suivi avance',
    premiumBody: 'Des tendances plus longues et un coach enrichi.',
    unlock: 'Deblocable quand tu veux',
    moreScans: 'Plus de scans quotidiens',
    longerHistory: 'Historique 30 jours et plus',
    richerCoach: 'Coach avec plus de contexte',
    seePremium: 'Voir Premium',
    tabs: ['Scan', 'Coach', 'Stats'],
  },
  en: {
    readyTitle: 'Ready for your scan',
    readySubtitle: 'Choose an area and frame your image.',
    face: 'Face',
    body: 'Body',
    nutrition: 'Nutrition',
    launchScan: 'Start scan',
    resultTitle: 'Scan result',
    resultSubtitle: 'Visual signals and trends.',
    wellnessScore: 'wellness score',
    hydration: 'Hydration',
    energy: 'Energy',
    sleep: 'Sleep',
    routine: 'Routine',
    stable: 'Stable',
    threeSteps: '3 steps',
    nextStep: 'Next step',
    nextStepBody: 'Scan again in 7 days.',
    trendsTitle: 'Your trends',
    trendsSubtitle: 'Compare your latest scans.',
    progress30: '30 day progress',
    historyNote: 'Clear history that is easy to compare.',
    coachTitle: 'SelfLens Coach',
    coachSubtitle: 'Guidance based on your scans.',
    dayRoutine: 'Today routine',
    routineBody: 'Hydration, sleep, and recovery.',
    question: 'What should I improve this week?',
    freeQuestion: 'Free question',
    simplePlan: 'Your simple plan',
    planOne: '1. Drink earlier in the day',
    planTwo: '2. Scan again on Sunday',
    planThree: '3. Track your energy',
    askCoach: 'Ask the coach...',
    modesTitle: 'Choose your scan',
    modesSubtitle: 'One mode for each goal.',
    visualSignals: 'Visual signals',
    posture: 'Posture & form',
    mealBalance: 'Meals & balance',
    combined: 'Combined view',
    grouped: 'Everything stays grouped',
    groupedBody: 'Results, trends, and coach in one place.',
    premiumTitle: 'SelfLens Premium',
    premiumSubtitle: 'More context, more scans.',
    advancedTracking: 'Advanced tracking',
    premiumBody: 'Longer trends and richer coach context.',
    unlock: 'Unlock when you are ready',
    moreScans: 'More daily scans',
    longerHistory: '30 day history and more',
    richerCoach: 'Coach with more context',
    seePremium: 'See Premium',
    tabs: ['Scan', 'Coach', 'Stats'],
  },
};

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function wrapText(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function textBlock({
  text,
  x,
  y,
  width,
  size,
  lineHeight,
  weight = 700,
  fill = colors.ink,
  anchor = 'middle',
  maxChars,
  opacity = 1,
}) {
  const lines = wrapText(text, maxChars ?? Math.max(12, Math.floor(width / (size * 0.54))));
  const tspans = lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : lineHeight;
      return `<tspan x="${x}" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join('');

  return `<text text-anchor="${anchor}" x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" opacity="${opacity}">${tspans}</text>`;
}

function pill(x, y, label, accent = colors.blue, width = null) {
  const computedWidth = width ?? Math.max(180, label.length * 20 + 56);
  return `
    <g transform="translate(${x} ${y})">
      <rect width="${computedWidth}" height="72" rx="36" fill="#FFFFFF" stroke="${accent}" stroke-width="3" opacity="0.96"/>
      <circle cx="36" cy="36" r="12" fill="${accent}"/>
      <text x="64" y="45" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="${colors.ink}">${escapeXml(label)}</text>
    </g>`;
}

function phoneShell(id, content, lang) {
  const screenX = PHONE.bezel;
  const screenY = PHONE.bezel;
  const screenW = PHONE.width - PHONE.bezel * 2;
  const screenH = PHONE.height - PHONE.bezel * 2;

  return `
    <defs>
      <clipPath id="phone-screen-${id}">
        <rect x="${screenX}" y="${screenY}" width="${screenW}" height="${screenH}" rx="68"/>
      </clipPath>
    </defs>
    <g transform="translate(${PHONE.x} ${PHONE.y})">
      <rect x="-30" y="26" width="${PHONE.width + 60}" height="${PHONE.height}" rx="112" fill="#0A2F66" opacity="0.16"/>
      <rect width="${PHONE.width}" height="${PHONE.height}" rx="96" fill="#07142A"/>
      <rect x="13" y="13" width="${PHONE.width - 26}" height="${PHONE.height - 26}" rx="84" fill="#142548"/>
      <g clip-path="url(#phone-screen-${id})">
        <rect x="${screenX}" y="${screenY}" width="${screenW}" height="${screenH}" fill="#F6F8FC"/>
        ${content(screenX, screenY, screenW, screenH, lang)}
      </g>
      <rect x="226" y="42" width="168" height="36" rx="18" fill="#07142A" opacity="0.92"/>
    </g>`;
}

function screenHeader(x, y, w, title, subtitle) {
  return `
    <text x="${x + 34}" y="${y + 86}" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="800" fill="${colors.ink}">SelfLens</text>
    <circle cx="${x + w - 52}" cy="${y + 74}" r="22" fill="#FFFFFF" stroke="${colors.border}" stroke-width="2"/>
    <text x="${x + 34}" y="${y + 164}" font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="800" fill="${colors.ink}">${escapeXml(title)}</text>
    <text x="${x + 34}" y="${y + 210}" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="600" fill="${colors.muted}">${escapeXml(subtitle)}</text>`;
}

function bottomNav(x, y, w, active = 0, lang = 'fr') {
  const labels = uiCopy[lang].tabs;
  const step = w / labels.length;
  return `
    <rect x="${x + 22}" y="${y - 100}" width="${w - 44}" height="74" rx="37" fill="#FFFFFF" stroke="${colors.border}" stroke-width="2"/>
    ${labels
      .map((label, index) => {
        const cx = x + step * index + step / 2;
        const fill = index === active ? colors.blue : colors.muted;
        return `<text x="${cx}" y="${y - 54}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="800" fill="${fill}">${label}</text>`;
      })
      .join('')}`;
}

function homeScreen(x, y, w, h, lang) {
  const t = uiCopy[lang];
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#F7FBFF"/>
    ${screenHeader(x, y, w, t.readyTitle, t.readySubtitle)}
    <rect x="${x + 44}" y="${y + 260}" width="${w - 88}" height="480" rx="54" fill="#EAF5FF" stroke="#BBD9FF" stroke-width="3"/>
    <circle cx="${x + w / 2}" cy="${y + 500}" r="150" fill="#FFFFFF" opacity="0.86"/>
    <path d="M${x + w / 2 - 70} ${y + 496}c20-58 118-58 138 0 18 54-38 106-68 134-30-28-86-80-70-134Z" fill="#1478FF" opacity="0.16"/>
    <path d="M${x + 118} ${y + 356}h-48v48M${x + w - 118} ${y + 356}h48v48M${x + 118} ${y + 644}h-48v-48M${x + w - 118} ${y + 644}h48v-48" fill="none" stroke="${colors.blue}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="${x + 70}" y="${y + 790}" width="${w - 140}" height="92" rx="32" fill="#FFFFFF" stroke="${colors.border}" stroke-width="3"/>
    <text x="${x + 104}" y="${y + 847}" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="800" fill="${colors.ink}">${escapeXml(t.face)}</text>
    <text x="${x + 244}" y="${y + 847}" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="800" fill="${colors.ink}">${escapeXml(t.body)}</text>
    <text x="${x + 382}" y="${y + 847}" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="800" fill="${colors.ink}">${escapeXml(t.nutrition)}</text>
    <rect x="${x + 70}" y="${y + 925}" width="${w - 140}" height="92" rx="46" fill="${colors.blue}"/>
    <text x="${x + w / 2}" y="${y + 982}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="800" fill="#FFFFFF">${escapeXml(t.launchScan)}</text>
    ${bottomNav(x, y + h, w, 0, lang)}`;
}

function resultScreen(x, y, w, h, lang) {
  const t = uiCopy[lang];
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#F6F8FC"/>
    ${screenHeader(x, y, w, t.resultTitle, t.resultSubtitle)}
    <rect x="${x + 46}" y="${y + 258}" width="${w - 92}" height="360" rx="44" fill="#FFFFFF" stroke="${colors.border}" stroke-width="3"/>
    <circle cx="${x + w / 2}" cy="${y + 420}" r="112" fill="none" stroke="#E8EEF8" stroke-width="30"/>
    <circle cx="${x + w / 2}" cy="${y + 420}" r="112" fill="none" stroke="${colors.blue}" stroke-width="30" stroke-dasharray="520 180" stroke-linecap="round" transform="rotate(-90 ${x + w / 2} ${y + 420})"/>
    <text x="${x + w / 2}" y="${y + 438}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="76" font-weight="900" fill="${colors.ink}">84</text>
    <text x="${x + w / 2}" y="${y + 486}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="${colors.muted}">${escapeXml(t.wellnessScore)}</text>
    ${metricCard(x + 46, y + 662, 250, t.hydration, t.stable, colors.blue)}
    ${metricCard(x + 318, y + 662, 250, t.energy, '+8%', colors.gold)}
    ${metricCard(x + 46, y + 838, 250, t.sleep, 'OK', colors.green)}
    ${metricCard(x + 318, y + 838, 250, t.routine, t.threeSteps, colors.mint)}
    <rect x="${x + 46}" y="${y + 1048}" width="${w - 92}" height="116" rx="32" fill="#EAF5FF"/>
    <text x="${x + 82}" y="${y + 1094}" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="800" fill="${colors.ink}">${escapeXml(t.nextStep)}</text>
    <text x="${x + 82}" y="${y + 1132}" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="600" fill="${colors.muted}">${escapeXml(t.nextStepBody)}</text>
    ${bottomNav(x, y + h, w, 0, lang)}`;
}

function metricCard(x, y, width, label, value, accent) {
  return `
    <rect x="${x}" y="${y}" width="${width}" height="142" rx="30" fill="#FFFFFF" stroke="${colors.border}" stroke-width="2"/>
    <circle cx="${x + 48}" cy="${y + 46}" r="18" fill="${accent}" opacity="0.22"/>
    <text x="${x + 28}" y="${y + 91}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="800" fill="${colors.ink}">${escapeXml(label)}</text>
    <text x="${x + 28}" y="${y + 123}" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="800" fill="${accent}">${escapeXml(value)}</text>`;
}

function analyticsScreen(x, y, w, h, lang) {
  const t = uiCopy[lang];
  const chartX = x + 54;
  const chartY = y + 420;
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#F7FBFF"/>
    ${screenHeader(x, y, w, t.trendsTitle, t.trendsSubtitle)}
    <rect x="${x + 44}" y="${y + 254}" width="${w - 88}" height="112" rx="36" fill="#FFFFFF" stroke="${colors.border}" stroke-width="2"/>
    <text x="${x + 86}" y="${y + 323}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="900" fill="${colors.blue}">+12%</text>
    <text x="${x + 190}" y="${y + 323}" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="800" fill="${colors.ink}">${escapeXml(t.progress30)}</text>
    <rect x="${x + 44}" y="${y + 398}" width="${w - 88}" height="430" rx="42" fill="#FFFFFF" stroke="${colors.border}" stroke-width="2"/>
    <path d="M${chartX} ${chartY + 300} C${chartX + 96} ${chartY + 250}, ${chartX + 144} ${chartY + 210}, ${chartX + 210} ${chartY + 232} S${chartX + 356} ${chartY + 174}, ${chartX + 456} ${chartY + 108}" fill="none" stroke="${colors.blue}" stroke-width="10" stroke-linecap="round"/>
    <path d="M${chartX} ${chartY + 248} C${chartX + 100} ${chartY + 280}, ${chartX + 160} ${chartY + 200}, ${chartX + 250} ${chartY + 208} S${chartX + 360} ${chartY + 150}, ${chartX + 456} ${chartY + 176}" fill="none" stroke="${colors.mint}" stroke-width="10" stroke-linecap="round"/>
    <line x1="${chartX}" y1="${chartY + 332}" x2="${chartX + 456}" y2="${chartY + 332}" stroke="#DDE8F7" stroke-width="3"/>
    ${metricCard(x + 46, y + 884, 250, t.face, '84', colors.blue)}
    ${metricCard(x + 318, y + 884, 250, t.body, '79', colors.green)}
    <rect x="${x + 46}" y="${y + 1070}" width="${w - 92}" height="98" rx="30" fill="#EAF5FF"/>
    <text x="${x + 82}" y="${y + 1129}" font-family="Arial, Helvetica, sans-serif" font-size="23" font-weight="800" fill="${colors.ink}">${escapeXml(t.historyNote)}</text>
    ${bottomNav(x, y + h, w, 2, lang)}`;
}

function coachScreen(x, y, w, h, lang) {
  const t = uiCopy[lang];
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#F6F8FC"/>
    ${screenHeader(x, y, w, t.coachTitle, t.coachSubtitle)}
    <rect x="${x + 44}" y="${y + 252}" width="${w - 88}" height="148" rx="38" fill="#EAFBF6" stroke="#B9E8DA" stroke-width="2"/>
    <text x="${x + 82}" y="${y + 308}" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="900" fill="${colors.green}">${escapeXml(t.dayRoutine)}</text>
    <text x="${x + 82}" y="${y + 351}" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="700" fill="${colors.body}">${escapeXml(t.routineBody)}</text>
    <rect x="${x + 44}" y="${y + 446}" width="${w - 132}" height="154" rx="36" fill="#FFFFFF" stroke="${colors.border}" stroke-width="2"/>
    <text x="${x + 78}" y="${y + 506}" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="800" fill="${colors.ink}">${escapeXml(t.question)}</text>
    <text x="${x + 78}" y="${y + 548}" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="600" fill="${colors.muted}">${escapeXml(t.freeQuestion)}</text>
    <rect x="${x + 132}" y="${y + 642}" width="${w - 176}" height="250" rx="38" fill="${colors.blue}"/>
    <text x="${x + 166}" y="${y + 704}" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="900" fill="#FFFFFF">${escapeXml(t.simplePlan)}</text>
    <text x="${x + 166}" y="${y + 756}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#EAF5FF">${escapeXml(t.planOne)}</text>
    <text x="${x + 166}" y="${y + 802}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#EAF5FF">${escapeXml(t.planTwo)}</text>
    <text x="${x + 166}" y="${y + 848}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#EAF5FF">${escapeXml(t.planThree)}</text>
    <rect x="${x + 44}" y="${y + 940}" width="${w - 88}" height="98" rx="49" fill="#FFFFFF" stroke="${colors.border}" stroke-width="2"/>
    <text x="${x + 82}" y="${y + 1001}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="${colors.muted}">${escapeXml(t.askCoach)}</text>
    ${bottomNav(x, y + h, w, 1, lang)}`;
}

function modesScreen(x, y, w, h, lang) {
  const t = uiCopy[lang];
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#F7FBFF"/>
    ${screenHeader(x, y, w, t.modesTitle, t.modesSubtitle)}
    ${modeCard(x + 44, y + 260, 230, 260, t.face, t.visualSignals, colors.blue)}
    ${modeCard(x + 294, y + 260, 230, 260, t.body, t.posture, colors.green)}
    ${modeCard(x + 44, y + 552, 230, 260, t.nutrition, t.mealBalance, colors.gold)}
    ${modeCard(x + 294, y + 552, 230, 260, 'Super', t.combined, colors.mint)}
    <rect x="${x + 44}" y="${y + 880}" width="${w - 88}" height="186" rx="40" fill="#FFFFFF" stroke="${colors.border}" stroke-width="2"/>
    <text x="${x + 82}" y="${y + 944}" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="900" fill="${colors.ink}">${escapeXml(t.grouped)}</text>
    <text x="${x + 82}" y="${y + 992}" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="600" fill="${colors.muted}">${escapeXml(t.groupedBody)}</text>
    ${bottomNav(x, y + h, w, 0, lang)}`;
}

function modeCard(x, y, width, height, title, subtitle, accent) {
  return `
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="38" fill="#FFFFFF" stroke="${colors.border}" stroke-width="2"/>
    <circle cx="${x + width / 2}" cy="${y + 86}" r="44" fill="${accent}" opacity="0.18"/>
    <path d="M${x + width / 2 - 32} ${y + 86}h64M${x + width / 2} ${y + 54}v64" stroke="${accent}" stroke-width="9" stroke-linecap="round" opacity="0.9"/>
    <text x="${x + width / 2}" y="${y + 172}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="900" fill="${colors.ink}">${escapeXml(title)}</text>
    <text x="${x + width / 2}" y="${y + 214}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="700" fill="${colors.muted}">${escapeXml(subtitle)}</text>`;
}

function premiumScreen(x, y, w, h, lang) {
  const t = uiCopy[lang];
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#FCFAF3"/>
    ${screenHeader(x, y, w, t.premiumTitle, t.premiumSubtitle)}
    <rect x="${x + 44}" y="${y + 254}" width="${w - 88}" height="210" rx="44" fill="#FFF7DF" stroke="#F0D58B" stroke-width="3"/>
    <text x="${x + 84}" y="${y + 326}" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="900" fill="${colors.ink}">${escapeXml(t.advancedTracking)}</text>
    <text x="${x + 84}" y="${y + 374}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="${colors.body}">${escapeXml(t.premiumBody)}</text>
    <text x="${x + 84}" y="${y + 424}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="800" fill="${colors.gold}">${escapeXml(t.unlock)}</text>
    ${premiumFeature(x + 54, y + 528, w - 108, t.moreScans)}
    ${premiumFeature(x + 54, y + 654, w - 108, t.longerHistory)}
    ${premiumFeature(x + 54, y + 780, w - 108, t.richerCoach)}
    <rect x="${x + 62}" y="${y + 954}" width="${w - 124}" height="94" rx="47" fill="${colors.gold}"/>
    <text x="${x + w / 2}" y="${y + 1012}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="900" fill="#FFFFFF">${escapeXml(t.seePremium)}</text>
    ${bottomNav(x, y + h, w, 2, lang)}`;
}

function premiumFeature(x, y, width, label) {
  return `
    <rect x="${x}" y="${y}" width="${width}" height="92" rx="28" fill="#FFFFFF" stroke="#F0D58B" stroke-width="2"/>
    <circle cx="${x + 46}" cy="${y + 46}" r="18" fill="${colors.gold}" opacity="0.24"/>
    <text x="${x + 82}" y="${y + 56}" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="800" fill="${colors.ink}">${escapeXml(label)}</text>`;
}

const screenRenderers = {
  home: homeScreen,
  result: resultScreen,
  analytics: analyticsScreen,
  coach: coachScreen,
  modes: modesScreen,
  premium: premiumScreen,
};

async function readIconDataUri() {
  const icon = await fs.readFile(iconPath);
  return `data:image/png;base64,${icon.toString('base64')}`;
}

function badgeRow(badges) {
  const totalWidth = badges.reduce((sum, badge) => sum + Math.max(180, badge.length * 18 + 56), 0) + (badges.length - 1) * 20;
  let cursor = (CANVAS.width - totalWidth) / 2;
  const y = 646;

  return badges
    .map((badge, index) => {
      const width = Math.max(180, badge.length * 18 + 56);
      const item = pill(cursor, y, badge, index === 2 ? colors.green : colors.blue, width);
      cursor += width + 20;
      return item;
    })
    .join('');
}

function buildSlideSvg(slide, iconDataUri, lang, index) {
  const id = `${lang}-${index}`;
  const renderer = screenRenderers[slide.screen];
  const footerLabel =
    lang === 'fr'
      ? 'Bien-etre visuel, suivi personnel, conseils simples'
      : 'Visual wellness, personal tracking, simple guidance';
  const title = textBlock({
    text: slide.title,
    x: CANVAS.width / 2,
    y: 230,
    width: 1040,
    size: 74,
    lineHeight: 84,
    weight: 900,
    maxChars: 24,
  });
  const captionLines = textBlock({
    text: slide.caption,
    x: CANVAS.width / 2,
    y: 500,
    width: 920,
    size: 34,
    lineHeight: 44,
    weight: 700,
    fill: colors.body,
    maxChars: 44,
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}">
    <defs>
      <linearGradient id="page-${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#F7FCFF"/>
        <stop offset="52%" stop-color="#EAF5FF"/>
        <stop offset="100%" stop-color="#FFFFFF"/>
      </linearGradient>
      <linearGradient id="accent-${id}" x1="110" y1="100" x2="1180" y2="2620" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#65A9F3" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#80E2CE" stop-opacity="0.18"/>
      </linearGradient>
    </defs>
    <rect width="${CANVAS.width}" height="${CANVAS.height}" fill="url(#page-${id})"/>
    <path d="M64 420C250 190 554 118 826 208c154 50 276 148 392 286v2056H64V420Z" fill="url(#accent-${id})"/>
    <image href="${iconDataUri}" x="82" y="82" width="118" height="118"/>
    <text x="226" y="128" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="900" fill="${colors.blue}">${escapeXml(slide.eyebrow)}</text>
    <text x="226" y="170" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="${colors.muted}">SelfLens</text>
    ${title}
    ${captionLines}
    ${badgeRow(slide.badges)}
    ${phoneShell(id, renderer, lang)}
    <rect x="174" y="2302" width="942" height="132" rx="66" fill="#FFFFFF" opacity="0.88" stroke="${colors.border}" stroke-width="3"/>
    <circle cx="246" cy="2368" r="18" fill="${colors.blue}"/>
    <circle cx="278" cy="2368" r="18" fill="${colors.mint}"/>
    <text x="328" y="2380" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="900" fill="${colors.ink}">${escapeXml(footerLabel)}</text>
  </svg>`;
}

async function writeReadme(manifest) {
  const content = `# SelfLens App Store Assets

Generated by \`node scripts/generate-store-assets.mjs\`.

- Size: ${CANVAS.width} x ${CANVAS.height} PNG portrait.
- Languages: \`fr\`, \`en\`.
- Count: 6 screenshots per language.
- Phone screen layers are polished draft compositions based on current SelfLens UI patterns. Replace those layers with final TestFlight/iPhone captures before upload if exact device UI proof is required.
- Apple currently accepts 1290 x 2796 portrait screenshots for 6.9 inch iPhone displays, and App Store Connect can scale high-resolution screenshots to smaller devices when the UI is the same across device sizes/localizations.

## Files

${manifest
  .map((item) => `- \`${path.relative(projectRoot, item.path).replaceAll('\\', '/')}\` - ${item.language.toUpperCase()} ${item.title}`)
  .join('\n')}
`;

  await fs.writeFile(path.join(projectRoot, 'store-assets', 'README.md'), content, 'utf8');
}

async function renderStoreAssets() {
  const iconDataUri = await readIconDataUri();
  const manifest = [];

  await fs.mkdir(outRoot, { recursive: true });

  for (const [language, { slides }] of Object.entries(localized)) {
    const languageDir = path.join(outRoot, language);
    await fs.mkdir(languageDir, { recursive: true });

    for (const [index, slide] of slides.entries()) {
      const fileName = `${slide.slug}.png`;
      const outPath = path.join(languageDir, fileName);
      const svg = buildSlideSvg(slide, iconDataUri, language, index + 1);

      await sharp(Buffer.from(svg), { density: 192 })
        .resize(CANVAS.width, CANVAS.height, { fit: 'cover' })
        .flatten({ background: '#FFFFFF' })
        .png({ compressionLevel: 9, palette: false })
        .toFile(outPath);

      manifest.push({
        language,
        slug: slide.slug,
        title: slide.title,
        path: outPath,
        width: CANVAS.width,
        height: CANVAS.height,
      });
    }
  }

  await fs.writeFile(
    path.join(outRoot, 'manifest.json'),
    `${JSON.stringify(manifest.map((item) => ({
      ...item,
      path: path.relative(projectRoot, item.path).replaceAll('\\', '/'),
    })), null, 2)}\n`,
    'utf8',
  );
  await writeReadme(manifest);

  console.log(`Generated ${manifest.length} App Store screenshots in ${path.relative(projectRoot, outRoot)}`);
}

renderStoreAssets().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
