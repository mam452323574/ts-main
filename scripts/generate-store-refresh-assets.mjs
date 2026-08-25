import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outRoot = path.join(root, 'store-assets', 'store-refresh-2026-07');

const palette = {
  navy: '#0D2A64',
  blue: '#2F66C5',
  blueLight: '#65A9F3',
  mint: '#6EC8A5',
  green: '#3F8B6D',
  cream: '#F6F6F3',
  paper: '#FFFFFF',
  ink: '#1C1C1E',
  muted: '#63666D',
  border: '#E0E1DD',
  gold: '#B8955D',
  black: '#000000',
};

const copy = {
  fr: [
    { slug: '01-scan', title: 'Ton bien-être. En un scan.', subtitle: 'Cadre, capture, puis découvre un suivi clair.', screen: 'scan', dark: true },
    { slug: '02-results', title: 'Comprends ce que tu vois.', subtitle: 'Des résultats visuels et des prochaines étapes simples.', screen: 'result', dark: false },
    { slug: '03-trends', title: 'Suis ce qui change.', subtitle: 'Compare tes scans et repère tes tendances.', screen: 'trends', dark: false },
    { slug: '04-coach', title: "Passe du score à l’action.", subtitle: 'Ton coach transforme les signaux en actions concrètes.', screen: 'coach', dark: true },
    { slug: '05-chef', title: 'Ton frigo devient un repas.', subtitle: 'Choisis ton chef et transforme ce que tu as déjà.', screen: 'chef', dark: false },
    { slug: '06-modes', title: 'Visage, corps, nutrition.', subtitle: 'Un seul espace pour comprendre et suivre ton bien-être.', screen: 'modes', dark: true },
  ],
  en: [
    { slug: '01-scan', title: 'Your wellness. One scan.', subtitle: 'Frame, capture, then get a clear view of your progress.', screen: 'scan', dark: true },
    { slug: '02-results', title: 'See what your results mean.', subtitle: 'Visual insights and simple next steps after every scan.', screen: 'result', dark: false },
    { slug: '03-trends', title: 'Track what changes.', subtitle: 'Compare scans and spot meaningful trends over time.', screen: 'trends', dark: false },
    { slug: '04-coach', title: 'Turn scores into action.', subtitle: 'Your coach turns signals into practical next steps.', screen: 'coach', dark: true },
    { slug: '05-chef', title: 'Turn your fridge into a meal.', subtitle: 'Pick your chef and use what you already have.', screen: 'chef', dark: false },
    { slug: '06-modes', title: 'Face, body, nutrition.', subtitle: 'One place to understand and track your wellness.', screen: 'modes', dark: true },
  ],
};

const ui = {
  fr: {
    ready: 'Prêt pour ton scan', frame: 'Cadre ton image puis lance le scan.', start: 'Lancer le scan', face: 'Visage', body: 'Corps', nutrition: 'Nutrition',
    result: 'Résultat du scan', resultSub: 'Signaux visuels et tendances personnelles.', score: 'score bien-être', hydration: 'Hydratation', energy: 'Énergie', sleep: 'Sommeil', routine: 'Routine', stable: 'Stable', steps: '3 étapes', next: 'Prochaine étape', nextBody: 'Refais un scan dans 7 jours.',
    trends: 'Tes tendances', compare: 'Compare tes derniers scans.', progress: 'progression sur 30 jours', history: 'Historique clair, facile à comparer.',
    coach: 'Coach SelfLens', coachSub: 'Des conseils basés sur tes scans.', daily: 'Routine du jour', dailyBody: 'Hydratation, sommeil et récupération.', question: 'Que puis-je améliorer cette semaine ?', freeQuestion: 'Question libre', plan: 'Ton plan simple', planSteps: ['Hydrate-toi plus tôt', 'Refais un scan dimanche', 'Suis ton énergie'], askCoach: 'Demander au coach…',
    chef: 'Choisis ton chef', chefSub: 'Une recette adaptée à ce que tu as.', diet: 'Chef Diététique', sport: 'Chef Sportif', gourmand: 'Chef Gourmand', chefTags: ['ÉQUILIBRE', 'PERFORMANCE', 'PLAISIR'], askChef: 'Demander au chef',
    modes: 'Choisis ton scan', modesSub: 'Un mode pour chaque objectif.', modeSubs: ['Signaux visuels', 'Posture & forme', 'Repas & équilibre', 'Vue combinée'], super: 'Super Scan', grouped: 'Tout ton suivi reste regroupé', groupedBody: 'Résultats, tendances et coach au même endroit.',
    tabs: ['Accueil', 'Scanner', 'Coach'],
  },
  en: {
    ready: 'Ready for your scan', frame: 'Frame your image, then start the scan.', start: 'Start scan', face: 'Face', body: 'Body', nutrition: 'Nutrition',
    result: 'Scan result', resultSub: 'Personal visual signals and trends.', score: 'wellness score', hydration: 'Hydration', energy: 'Energy', sleep: 'Sleep', routine: 'Routine', stable: 'Stable', steps: '3 steps', next: 'Next step', nextBody: 'Scan again in 7 days.',
    trends: 'Your trends', compare: 'Compare your latest scans.', progress: '30-day progress', history: 'Clear history that is easy to compare.',
    coach: 'SelfLens Coach', coachSub: 'Guidance based on your scans.', daily: 'Today’s routine', dailyBody: 'Hydration, sleep, and recovery.', question: 'What should I improve this week?', freeQuestion: 'Free question', plan: 'Your simple plan', planSteps: ['Hydrate earlier', 'Scan again on Sunday', 'Track your energy'], askCoach: 'Ask the coach…',
    chef: 'Choose your chef', chefSub: 'A recipe built from what you have.', diet: 'Balanced Chef', sport: 'Performance Chef', gourmand: 'Comfort Chef', chefTags: ['BALANCE', 'PERFORMANCE', 'COMFORT'], askChef: 'Ask the chef',
    modes: 'Choose your scan', modesSub: 'One mode for each goal.', modeSubs: ['Visual signals', 'Posture & form', 'Meals & balance', 'Combined view'], super: 'Super Scan', grouped: 'Everything stays together', groupedBody: 'Results, trends, and coach in one place.',
    tabs: ['Home', 'Scanner', 'Coach'],
  },
};

function esc(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function wrap(text, max) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function textLines(text, { x, y, size, lineHeight, fill, weight = 800, anchor = 'middle', max = 26 }) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${wrap(text, max).map((line, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${esc(line)}</tspan>`).join('')}</text>`;
}

function nav(t, active) {
  return `<g transform="translate(18 860)"><rect width="394" height="54" rx="27" fill="#FFFFFF" stroke="${palette.border}"/><g font-family="Arial" font-size="12" font-weight="700" text-anchor="middle">${t.tabs.map((label, index) => `<text x="${67 + index * 130}" y="34" fill="${index === active ? palette.ink : palette.muted}">${esc(label)}</text>`).join('')}</g></g>`;
}

function header(title, subtitle, dark = false) {
  const ink = dark ? '#FFFFFF' : palette.ink;
  const muted = dark ? '#B8B8BE' : palette.muted;
  return `<text x="26" y="52" font-family="Arial" font-size="16" font-weight="800" fill="${ink}">SelfLens</text><text x="26" y="102" font-family="Arial" font-size="25" font-weight="900" fill="${ink}">${esc(title)}</text><text x="26" y="130" font-family="Arial" font-size="13" font-weight="600" fill="${muted}">${esc(subtitle)}</text>`;
}

function metricCard(x, y, label, value, accent) {
  return `<g transform="translate(${x} ${y})"><rect width="178" height="104" rx="24" fill="#FFFFFF" stroke="${palette.border}"/><circle cx="24" cy="24" r="10" fill="${accent}" opacity="0.2"/><text x="18" y="62" font-family="Arial" font-size="13" font-weight="800" fill="${palette.ink}">${esc(label)}</text><text x="18" y="84" font-family="Arial" font-size="12" font-weight="800" fill="${accent}">${esc(value)}</text></g>`;
}

function scanScreen(t) {
  return `<rect width="430" height="932" fill="${palette.cream}"/>${header(t.ready, t.frame)}<rect x="34" y="166" width="362" height="402" rx="38" fill="#EDF3FC" stroke="#C8D9F5" stroke-width="2"/><circle cx="215" cy="366" r="112" fill="#FFFFFF" opacity="0.92"/><path d="M215 466c-63-53-117-101-117-166 0-45 34-79 76-79 25 0 47 11 61 30 14-19 36-30 61-30 42 0 76 34 76 79 0 65-54 113-157 166Z" fill="${palette.blue}" opacity="0.12"/><g fill="none" stroke="${palette.blue}" stroke-width="7" stroke-linecap="round"><path d="M90 232h-24v24M340 232h24v24M90 500h-24v-24M340 500h24v-24"/></g><g transform="translate(38 600)" font-family="Arial" font-size="12" font-weight="800" text-anchor="middle"><rect width="354" height="52" rx="26" fill="#FFFFFF" stroke="${palette.border}"/><text x="66" y="32" fill="${palette.ink}">${esc(t.face)}</text><text x="177" y="32" fill="${palette.ink}">${esc(t.body)}</text><text x="288" y="32" fill="${palette.ink}">${esc(t.nutrition)}</text></g><rect x="38" y="680" width="354" height="58" rx="29" fill="${palette.ink}"/><text x="215" y="716" text-anchor="middle" font-family="Arial" font-size="15" font-weight="800" fill="#FFFFFF">${esc(t.start)}</text>${nav(t, 1)}`;
}

function resultScreen(t) {
  return `<rect width="430" height="932" fill="${palette.cream}"/>${header(t.result, t.resultSub)}<rect x="34" y="164" width="362" height="250" rx="34" fill="#FFFFFF" stroke="${palette.border}"/><circle cx="215" cy="276" r="78" fill="none" stroke="#E8EEF8" stroke-width="18"/><circle cx="215" cy="276" r="78" fill="none" stroke="${palette.blue}" stroke-width="18" stroke-dasharray="380 110" stroke-linecap="round" transform="rotate(-90 215 276)"/><text x="215" y="291" text-anchor="middle" font-family="Arial" font-size="50" font-weight="900" fill="${palette.ink}">84</text><text x="215" y="322" text-anchor="middle" font-family="Arial" font-size="12" font-weight="700" fill="${palette.muted}">${esc(t.score)}</text>${metricCard(34, 438, t.hydration, t.stable, palette.blue)}${metricCard(218, 438, t.energy, '+8%', palette.gold)}${metricCard(34, 554, t.sleep, 'OK', palette.green)}${metricCard(218, 554, t.routine, t.steps, palette.mint)}<rect x="34" y="684" width="362" height="92" rx="26" fill="#EDF3FC"/><text x="58" y="720" font-family="Arial" font-size="14" font-weight="900" fill="${palette.ink}">${esc(t.next)}</text><text x="58" y="746" font-family="Arial" font-size="13" font-weight="600" fill="${palette.muted}">${esc(t.nextBody)}</text>${nav(t, 0)}`;
}

function trendsScreen(t) {
  return `<rect width="430" height="932" fill="${palette.cream}"/>${header(t.trends, t.compare)}<rect x="34" y="158" width="362" height="72" rx="24" fill="#FFFFFF" stroke="${palette.border}"/><text x="58" y="201" font-family="Arial" font-size="19" font-weight="900" fill="${palette.blue}">+12%</text><text x="136" y="201" font-family="Arial" font-size="13" font-weight="800" fill="${palette.ink}">${esc(t.progress)}</text><rect x="34" y="252" width="362" height="300" rx="32" fill="#FFFFFF" stroke="${palette.border}"/><line x1="60" y1="500" x2="370" y2="500" stroke="#E6E7E2"/><path d="M62 470C118 444 145 404 190 418s74-28 112-16 42-62 68-82" fill="none" stroke="${palette.blue}" stroke-width="7" stroke-linecap="round"/><path d="M62 442c60 30 96-12 140-4s68-36 104-30 40-20 64-8" fill="none" stroke="${palette.mint}" stroke-width="7" stroke-linecap="round"/>${metricCard(34, 578, t.face, '84', palette.blue)}${metricCard(218, 578, t.body, '79', palette.green)}<rect x="34" y="706" width="362" height="76" rx="24" fill="#FFFFFF" stroke="${palette.border}"/><text x="58" y="750" font-family="Arial" font-size="13" font-weight="800" fill="${palette.ink}">${esc(t.history)}</text>${nav(t, 0)}`;
}

function coachScreen(t) {
  return `<rect width="430" height="932" fill="#000000"/>${header(t.coach, t.coachSub, true)}<rect x="28" y="164" width="374" height="118" rx="30" fill="#102A22" stroke="#285D48"/><text x="52" y="208" font-family="Arial" font-size="15" font-weight="900" fill="${palette.mint}">${esc(t.daily)}</text><text x="52" y="238" font-family="Arial" font-size="13" font-weight="600" fill="#D1D1D6">${esc(t.dailyBody)}</text><rect x="28" y="310" width="330" height="118" rx="28" fill="#121212" stroke="#333333"/><text x="50" y="356" font-family="Arial" font-size="14" font-weight="800" fill="#FFFFFF">${esc(t.question)}</text><text x="50" y="390" font-family="Arial" font-size="12" font-weight="700" fill="#8E8E93">${esc(t.freeQuestion)}</text><rect x="74" y="458" width="328" height="236" rx="30" fill="${palette.blue}"/><text x="100" y="502" font-family="Arial" font-size="15" font-weight="900" fill="#FFFFFF">${esc(t.plan)}</text><g font-family="Arial" font-size="13" font-weight="700" fill="#FFFFFF">${t.planSteps.map((step, index) => `<text x="100" y="${550 + index * 40}">${index + 1}. ${esc(step)}</text>`).join('')}</g><rect x="28" y="726" width="374" height="58" rx="29" fill="#121212" stroke="#333333"/><text x="54" y="761" font-family="Arial" font-size="13" font-weight="700" fill="#8E8E93">${esc(t.askCoach)}</text>${nav(t, 2)}`;
}

function chefScreen(t, chefImages) {
  const chefs = [[t.diet, chefImages.diet, palette.green], [t.sport, chefImages.sport, palette.blue], [t.gourmand, chefImages.gourmand, palette.gold]];
  return `<rect width="430" height="932" fill="#000000"/>${header(t.chef, t.chefSub, true)}${chefs.map(([label, uri, accent], index) => { const y = 178 + index * 170; return `<g transform="translate(26 ${y})"><rect width="378" height="146" rx="30" fill="#171719" stroke="${accent}" stroke-opacity="0.65"/><circle cx="70" cy="73" r="48" fill="${accent}" opacity="0.18"/><clipPath id="chef-${index}"><circle cx="70" cy="73" r="42"/></clipPath><image href="${uri}" x="28" y="31" width="84" height="84" preserveAspectRatio="xMidYMid slice" clip-path="url(#chef-${index})"/><text x="136" y="67" font-family="Arial" font-size="18" font-weight="900" fill="#FFFFFF">${esc(label)}</text><text x="136" y="94" font-family="Arial" font-size="12" font-weight="700" fill="${accent}">${esc(t.chefTags[index])}</text></g>`; }).join('')}<rect x="34" y="714" width="362" height="62" rx="31" fill="${palette.blue}"/><text x="215" y="752" text-anchor="middle" font-family="Arial" font-size="15" font-weight="900" fill="#FFFFFF">${esc(t.askChef)}</text>${nav(t, 0)}`;
}

function modesScreen(t) {
  const cards = [[t.face, t.modeSubs[0], palette.blue], [t.body, t.modeSubs[1], palette.green], [t.nutrition, t.modeSubs[2], palette.gold], [t.super, t.modeSubs[3], palette.mint]];
  return `<rect width="430" height="932" fill="#000000"/>${header(t.modes, t.modesSub, true)}${cards.map(([label, sub, accent], index) => { const x = 26 + (index % 2) * 195; const y = 170 + Math.floor(index / 2) * 220; return `<g transform="translate(${x} ${y})"><rect width="182" height="194" rx="30" fill="#121212" stroke="#333333"/><circle cx="91" cy="64" r="34" fill="${accent}" opacity="0.18"/><path d="M69 64h44M91 42v44" stroke="${accent}" stroke-width="7" stroke-linecap="round"/><text x="91" y="126" text-anchor="middle" font-family="Arial" font-size="16" font-weight="900" fill="#FFFFFF">${esc(label)}</text><text x="91" y="151" text-anchor="middle" font-family="Arial" font-size="11" font-weight="700" fill="#8E8E93">${esc(sub)}</text></g>`; }).join('')}<rect x="26" y="634" width="378" height="140" rx="30" fill="#121212" stroke="#333333"/><text x="50" y="686" font-family="Arial" font-size="16" font-weight="900" fill="#FFFFFF">${esc(t.grouped)}</text><text x="50" y="720" font-family="Arial" font-size="12" font-weight="700" fill="#8E8E93">${esc(t.groupedBody)}</text>${nav(t, 1)}`;
}

async function renderPhoneScreen(slide, lang, chefImages) {
  const t = ui[lang];
  const body = slide.screen === 'scan' ? scanScreen(t) : slide.screen === 'result' ? resultScreen(t) : slide.screen === 'trends' ? trendsScreen(t) : slide.screen === 'coach' ? coachScreen(t) : slide.screen === 'chef' ? chefScreen(t, chefImages) : modesScreen(t);
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="430" height="932" viewBox="0 0 430 932">${body}</svg>`), { density: 192 }).resize(860, 1864).png().toBuffer();
}

function finalCanvas({ width, height, slide, phoneUri, platform, iconUri }) {
  const dark = slide.dark;
  const background = dark ? `url(#darkBg)` : palette.cream;
  const titleColor = dark ? '#FFFFFF' : palette.ink;
  const subColor = dark ? '#C7CAD2' : palette.muted;
  const isPhone = platform !== 'tablet';
  const titleSize = platform === 'apple-phone' ? 96 : platform === 'google-phone' ? 72 : 104;
  const titleY = platform === 'apple-phone' ? 250 : platform === 'google-phone' ? 150 : 260;
  const maxChars = isPhone ? 24 : 34;
  const phoneHeight = platform === 'apple-phone' ? 1900 : platform === 'google-phone' ? 1370 : 2020;
  const phoneWidth = Math.round(phoneHeight * (430 / 932));
  const phoneX = Math.round((width - phoneWidth) / 2);
  const phoneY = platform === 'apple-phone' ? 770 : platform === 'google-phone' ? 430 : 650;
  const bezel = Math.round(phoneWidth * 0.035);
  const radius = Math.round(phoneWidth * 0.115);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="darkBg" x1="0" y1="${height}" x2="${width}" y2="0"><stop offset="0" stop-color="#071634"/><stop offset="0.55" stop-color="${palette.navy}"/><stop offset="1" stop-color="#235BB2"/></linearGradient><filter id="shadow" x="-30%" y="-20%" width="160%" height="160%"><feDropShadow dx="0" dy="28" stdDeviation="32" flood-color="#000000" flood-opacity="0.28"/></filter><clipPath id="screen"><rect x="${phoneX + bezel}" y="${phoneY + bezel}" width="${phoneWidth - bezel * 2}" height="${phoneHeight - bezel * 2}" rx="${radius - bezel}"/></clipPath></defs><rect width="${width}" height="${height}" fill="${background}"/>${dark ? '<circle cx="82%" cy="18%" r="320" fill="#47DDEB" opacity="0.12"/><circle cx="12%" cy="85%" r="360" fill="#2F66C5" opacity="0.16"/>' : '<circle cx="88%" cy="18%" r="300" fill="#65A9F3" opacity="0.1"/><circle cx="8%" cy="82%" r="360" fill="#6EC8A5" opacity="0.1"/>'}<image href="${iconUri}" x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.035)}" width="${Math.round(width * 0.075)}" height="${Math.round(width * 0.075)}"/><text x="${Math.round(width * 0.16)}" y="${Math.round(height * 0.064)}" font-family="Arial" font-size="${Math.round(width * 0.025)}" font-weight="900" fill="${titleColor}">SELFLENS</text>${textLines(slide.title, { x: width / 2, y: titleY, size: titleSize, lineHeight: Math.round(titleSize * 1.06), fill: titleColor, max: maxChars })}${textLines(slide.subtitle, { x: width / 2, y: titleY + titleSize * 2.25, size: Math.round(titleSize * 0.38), lineHeight: Math.round(titleSize * 0.48), fill: subColor, weight: 600, max: maxChars + 16 })}<g filter="url(#shadow)"><rect x="${phoneX}" y="${phoneY}" width="${phoneWidth}" height="${phoneHeight}" rx="${radius}" fill="#080C14"/><image href="${phoneUri}" x="${phoneX + bezel}" y="${phoneY + bezel}" width="${phoneWidth - bezel * 2}" height="${phoneHeight - bezel * 2}" preserveAspectRatio="none" clip-path="url(#screen)"/><rect x="${phoneX + phoneWidth * 0.36}" y="${phoneY + bezel * 1.45}" width="${phoneWidth * 0.28}" height="${Math.max(18, phoneHeight * 0.016)}" rx="20" fill="#05070C"/></g></svg>`;
}

async function writePng(svg, outPath, width, height) {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await sharp(Buffer.from(svg), { density: 192 }).resize(width, height).flatten({ background: '#FFFFFF' }).removeAlpha().png({ compressionLevel: 9, palette: false }).toFile(outPath);
}

async function contactSheet(paths, outPath, cellWidth = 260) {
  const thumbs = await Promise.all(paths.map((item) => sharp(item).resize({ width: cellWidth }).png().toBuffer()));
  const metas = await Promise.all(thumbs.map((buffer) => sharp(buffer).metadata()));
  const gap = 24;
  const width = paths.length * cellWidth + (paths.length + 1) * gap;
  const height = Math.max(...metas.map((meta) => meta.height)) + gap * 2;
  const composite = thumbs.map((input, index) => ({ input, left: gap + index * (cellWidth + gap), top: gap }));
  await sharp({ create: { width, height, channels: 3, background: palette.cream } }).composite(composite).png().toFile(outPath);
}

async function dataUri(filePath) {
  const ext = path.extname(filePath).slice(1).replace('jpg', 'jpeg');
  return `data:image/${ext};base64,${(await fs.readFile(filePath)).toString('base64')}`;
}

async function main() {
  const iconUri = await dataUri(path.join(root, 'assets', 'images', 'icon.png'));
  const chefImages = {
    diet: await dataUri(path.join(root, 'assets', 'images', 'chef', 'chef-dietetique.png')),
    sport: await dataUri(path.join(root, 'assets', 'images', 'chef', 'chef-sportif.png')),
    gourmand: await dataUri(path.join(root, 'assets', 'images', 'chef', 'chef-gourmand.png')),
  };
  const manifest = [];
  const languages = process.env.STORE_LANGS
    ? process.env.STORE_LANGS.split(',').map((value) => value.trim()).filter((value) => value in copy)
    : ['fr', 'en'];

  for (const lang of languages) {
    const sheets = { applePhone: [], appleTablet: [], googlePhone: [], googleTablet: [] };
    for (const slide of copy[lang]) {
      const phone = await renderPhoneScreen(slide, lang, chefImages);
      const phoneUri = `data:image/png;base64,${phone.toString('base64')}`;
      const variants = [
        ['apple-phone', 1290, 2796, path.join(outRoot, 'app-store', lang, 'iphone-6.9', `${slide.slug}.png`), sheets.applePhone],
        ['tablet', 2064, 2752, path.join(outRoot, 'app-store', lang, 'ipad-13', `${slide.slug}.png`), sheets.appleTablet],
        ['google-phone', 1080, 1920, path.join(outRoot, 'google-play', lang, 'phone', `${slide.slug}.png`), sheets.googlePhone],
      ];
      for (const [platform, width, height, outPath, sheet] of variants) {
        await writePng(finalCanvas({ width, height, slide, phoneUri, platform, iconUri }), outPath, width, height);
        sheet.push(outPath);
        manifest.push({ lang, platform, slug: slide.slug, path: path.relative(root, outPath).replaceAll('\\', '/'), width, height });
      }
      if (Number(slide.slug.slice(0, 2)) <= 4) {
        const tabletPath = path.join(outRoot, 'google-play', lang, 'tablet', `${slide.slug}.png`);
        await writePng(finalCanvas({ width: 1600, height: 2560, slide, phoneUri, platform: 'tablet', iconUri }), tabletPath, 1600, 2560);
        sheets.googleTablet.push(tabletPath);
        manifest.push({ lang, platform: 'google-tablet', slug: slide.slug, path: path.relative(root, tabletPath).replaceAll('\\', '/'), width: 1600, height: 2560 });
      }
    }
    await contactSheet(sheets.applePhone, path.join(outRoot, `contact-sheet-app-store-iphone-${lang}.png`));
    await contactSheet(sheets.appleTablet, path.join(outRoot, `contact-sheet-app-store-ipad-${lang}.png`));
    await contactSheet(sheets.googlePhone, path.join(outRoot, `contact-sheet-google-phone-${lang}.png`));
    await contactSheet(sheets.googleTablet, path.join(outRoot, `contact-sheet-google-tablet-${lang}.png`));

    const firstSlide = copy[lang][0];
    const firstPhone = await renderPhoneScreen(firstSlide, lang, chefImages);
    const firstPhoneUri = `data:image/png;base64,${firstPhone.toString('base64')}`;
    const featureSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500"><defs><linearGradient id="bg" x1="0" y1="500" x2="1024" y2="0"><stop offset="0" stop-color="#071634"/><stop offset="0.58" stop-color="${palette.navy}"/><stop offset="1" stop-color="#2F66C5"/></linearGradient><clipPath id="crop"><rect x="734" y="44" width="246" height="430" rx="44"/></clipPath></defs><rect width="1024" height="500" fill="url(#bg)"/><circle cx="760" cy="70" r="210" fill="#47DDEB" opacity="0.12"/><image href="${iconUri}" x="68" y="66" width="84" height="84"/><text x="176" y="121" font-family="Arial" font-size="30" font-weight="900" fill="#FFFFFF">SELFLENS</text>${textLines(firstSlide.title, { x: 70, y: 230, size: 58, lineHeight: 62, fill: '#FFFFFF', anchor: 'start', max: 18 })}<text x="72" y="394" font-family="Arial" font-size="24" font-weight="600" fill="#C7CAD2">${esc(firstSlide.subtitle)}</text><rect x="718" y="28" width="278" height="464" rx="58" fill="#080C14"/><image href="${firstPhoneUri}" x="734" y="44" width="246" height="430" preserveAspectRatio="none" clip-path="url(#crop)"/></svg>`;
    const featurePath = path.join(outRoot, 'google-play', lang, 'feature-graphic-1024x500.png');
    await writePng(featureSvg, featurePath, 1024, 500);
    manifest.push({ lang, platform: 'google-feature', slug: 'feature-graphic', path: path.relative(root, featurePath).replaceAll('\\', '/'), width: 1024, height: 500 });
  }

  await fs.writeFile(path.join(outRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Generated ${manifest.length} localized store assets in ${path.relative(root, outRoot)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
