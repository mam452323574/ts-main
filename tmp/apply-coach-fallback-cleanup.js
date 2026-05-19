#!/usr/bin/env node
// One-shot script to neutralize "not enough data" responses in the N8N coach
// workflow.
//
// Rationale: the audit identified three problematic fallback paths that ship
// the user an excuse instead of useful advice:
//   - localizedCopy.defaultBody   "Je n'ai pas pu formuler un conseil…"
//   - localizedCopy.genericError  "Un conseil personnalisé n'est pas disponible…"
//   - parsed.body returned by the LLM when it slipped a refusal through
//     ("pas assez de données", "je ne peux pas conseiller", …).
//
// This pass:
//   - rewrites defaultBody / genericError in the 6 locales (FR/EN/DE/IT/ES/PT)
//     with a non-apologetic, actionable, universal piece of advice ;
//   - keeps noScanBody (legitimate "user has zero scan" path) untouched ;
//   - injects a defensive sanitizer that strips the LLM body when it contains
//     a banned refusal phrase, so the user sees the new useful fallback
//     instead of the LLM's excuse.
//
// Run from repo root: node tmp/apply-coach-fallback-cleanup.js
// Idempotent: re-runs are no-ops (each replacement guards on the OLD substring).
'use strict';

const fs = require('fs');
const path = require('path');

// Apply on both the repo source-of-truth and the Downloads export so the
// next N8N import already has the fix. CLI arg overrides the default list.
const FILES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      path.resolve(__dirname, '..', 'n8n', 'workflows', 'coach.json'),
      'C:/Users/maloh/Downloads/coach (1).json',
    ];

function runOnFile(FILE) {
  if (!fs.existsSync(FILE)) {
    console.log(`\n[skip] ${FILE} (not found)`);
    return;
  }
  console.log(`\n=== Patching ${FILE} ===`);
  const original = fs.readFileSync(FILE, 'utf-8');
  const wf = JSON.parse(original);
  const node = wf.nodes.find((n) => n.name === 'Code in JavaScript2');
  if (!node || !node.parameters || typeof node.parameters.jsCode !== 'string') {
    console.log(`  [warn] Node "Code in JavaScript2" not found — skipping`);
    return;
  }

  let code = node.parameters.jsCode;

// ─────────────────────────────────────────────────────────────────────────────
// Replacement table: (old literal in jsCode) → (new literal).
// Each entry is checked for exactly one occurrence to avoid silent ambiguity.
// ─────────────────────────────────────────────────────────────────────────────
const replacements = [
  // FR
  {
    label: 'FR defaultBody',
    from: 'defaultBody: "Je n\'ai pas pu formuler un conseil personnalise fiable a partir des informations disponibles. Reessaie avec un scan recent pour obtenir un retour plus utile.",',
    to: 'defaultBody: "Voici ta priorite du jour : un grand verre d eau au reveil, 5 minutes de marche apres le dejeuner, et un coucher avant minuit. Trois gestes simples qui font deja une vraie difference.",',
  },
  {
    label: 'FR genericError',
    from: 'genericError: "Un conseil personnalise n\'est pas disponible pour le moment. Reessaie dans un instant.",',
    to: 'genericError: "Ta priorite aujourd hui : bois un grand verre d eau au reveil, bouge 5 minutes apres le repas, et couche-toi un peu plus tot. Petits gestes, grand impact.",',
  },

  // EN
  {
    label: 'EN defaultBody',
    from: 'defaultBody: "I could not build a reliable personalized coaching summary from the available information. Try again with a recent scan for clearer guidance.",',
    to: 'defaultBody: "Your priority today: a tall glass of water on waking, a 5-minute walk after lunch, and an earlier bedtime. Three simple actions that already make a real difference.",',
  },
  {
    label: 'EN genericError',
    from: 'genericError: "A personalized coaching note is not available right now. Please try again shortly.",',
    to: 'genericError: "Your priority today: drink a tall glass of water on waking, walk 5 minutes after a meal, and get to bed a little earlier. Small actions, big impact.",',
  },

  // DE
  {
    label: 'DE defaultBody',
    from: 'defaultBody: "Ich konnte aus den verfuegbaren Informationen keine verlaessliche personalisierte Coach-Zusammenfassung erstellen. Versuche es mit einem aktuellen Scan noch einmal.",',
    to: 'defaultBody: "Deine Tagespriorität: ein großes Glas Wasser nach dem Aufwachen, 5 Minuten Gehen nach dem Mittagessen und etwas früher schlafen. Drei einfache Gesten mit echter Wirkung.",',
  },
  {
    label: 'DE genericError',
    from: 'genericError: "Ein personalisierter Coach-Hinweis ist im Moment nicht verfuegbar. Bitte versuche es gleich noch einmal.",',
    to: 'genericError: "Deine Priorität heute: morgens ein großes Glas Wasser, 5 Minuten Gehen nach einer Mahlzeit, etwas früher ins Bett. Kleine Gesten, großer Effekt.",',
  },

  // IT
  {
    label: 'IT defaultBody',
    from: 'defaultBody: "Non sono riuscito a creare un riepilogo coach personalizzato e affidabile dalle informazioni disponibili. Riprova con una scansione recente per avere indicazioni piu chiare.",',
    to: 'defaultBody: "La tua priorità di oggi: un grande bicchiere d acqua appena sveglio, 5 minuti di camminata dopo pranzo e andare a letto un po\' prima. Tre gesti semplici che fanno davvero la differenza.",',
  },
  {
    label: 'IT genericError',
    from: 'genericError: "Un consiglio personalizzato non e disponibile in questo momento. Riprova tra poco.",',
    to: 'genericError: "La tua priorità oggi: bevi un grande bicchiere d acqua appena sveglio, cammina 5 minuti dopo un pasto e dormi un po\' prima. Piccoli gesti, grande impatto.",',
  },

  // ES
  {
    label: 'ES defaultBody',
    from: 'defaultBody: "No pude crear un resumen personalizado y fiable a partir de la informacion disponible. Intentalo de nuevo con un escaneo reciente para obtener una orientacion mas clara.",',
    to: 'defaultBody: "Tu prioridad de hoy: un vaso grande de agua al despertar, 5 minutos de caminata después del almuerzo, y acostarte un poco antes. Tres gestos simples que ya marcan la diferencia.",',
  },
  {
    label: 'ES genericError',
    from: 'genericError: "Una orientacion personalizada no esta disponible en este momento. Intentalo de nuevo en breve.",',
    to: 'genericError: "Tu prioridad hoy: bebe un vaso grande de agua al despertar, camina 5 minutos después de una comida, y acuéstate un poco antes. Pequeños gestos, gran impacto.",',
  },

  // PT
  {
    label: 'PT defaultBody',
    from: 'defaultBody: "Nao consegui criar um resumo personalizado e fiavel a partir das informacoes disponiveis. Tenta novamente com um scan recente para obter uma orientacao mais clara.",',
    to: 'defaultBody: "A tua prioridade hoje: um copo grande de água ao acordar, 5 minutos de caminhada depois do almoço, e ir para a cama um pouco mais cedo. Três gestos simples que já fazem a diferença.",',
  },
  {
    label: 'PT genericError',
    from: 'genericError: "Uma orientacao personalizada nao esta disponivel neste momento. Tenta novamente daqui a pouco.",',
    to: 'genericError: "A tua prioridade hoje: bebe um copo grande de água ao acordar, caminha 5 minutos depois de uma refeição, e deita-te um pouco mais cedo. Pequenos gestos, grande impacto.",',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Defensive sanitizer: drop LLM body when it contains a banned refusal phrase.
// Injected just before the `const synthesizedBody = synthesizeBody(...)` line
// so the new useful fallback wins over the LLM excuse.
// ─────────────────────────────────────────────────────────────────────────────
const SANITIZER_MARKER = '/* COACH_LLM_REFUSAL_SANITIZER_V1 */';

const SANITIZER_BLOCK = `
${SANITIZER_MARKER}
const COACH_BANNED_LLM_PATTERNS = {
  fr: [
    /pas assez de donn[eé]es/i,
    /donn[eé]es insuffisantes/i,
    /je ne peux pas (?:te |vous )?(?:r[eé]pondre|conseiller|donner un conseil|aider)/i,
    /impossible de (?:te |vous )?(?:r[eé]pondre|conseiller)/i,
    /aucune? (?:donn[eé]e|comparaison|recommandation)/i,
    /pas de comparaison (?:disponible|possible)/i,
    /reviens (?:apr[eè]s|plus tard|avec)/i,
    /il (?:me )?manque (?:de|des) donn[eé]es/i,
    /je n ?ai pas (?:assez|suffisamment) (?:de )?donn[eé]es/i,
  ],
  en: [
    /not enough data/i,
    /insufficient (?:data|information)/i,
    /cannot (?:answer|advise|help|conclude|provide)/i,
    /unable to (?:advise|conclude|help|provide)/i,
    /no (?:data|comparison|recommendation) (?:available|yet)/i,
    /come back (?:after|later|when)/i,
    /i (?:do not|don[\\u2019']t) have (?:enough|sufficient) (?:data|information)/i,
  ],
  de: [
    /nicht (?:genug|gen[uü]gend) daten/i,
    /unzureichende? (?:daten|informationen)/i,
    /kann ich (?:nicht|leider nicht) (?:antworten|raten|helfen)/i,
    /keine? (?:daten|vergleich|empfehlung) verf[uü]gbar/i,
  ],
  it: [
    /dati insufficienti/i,
    /non (?:posso|riesco a) (?:rispondere|consigliare|aiutare|concludere)/i,
    /nessun(?:a)? (?:dato|confronto|raccomandazione) (?:disponibile|presente)/i,
    /non ho (?:abbastanza|sufficienti) dati/i,
  ],
  es: [
    /datos insuficientes/i,
    /no puedo (?:responder|aconsejar|ayudar|concluir)/i,
    /sin (?:datos|comparaci[oó]n|recomendaci[oó]n) (?:suficientes?|disponible)/i,
    /no tengo (?:suficientes?|bastantes) datos/i,
  ],
  pt: [
    /dados insuficientes/i,
    /n[aã]o (?:posso|consigo) (?:responder|aconselhar|ajudar|concluir)/i,
    /sem (?:dados|compara[cç][aã]o|recomenda[cç][aã]o) (?:suficientes?|dispon[ií]vel)/i,
    /n[aã]o tenho (?:dados|informa[cç][oõ]es) (?:suficientes?|bastantes?)/i,
  ],
};
function coachStripLLMRefusal(text, locale) {
  if (typeof text !== 'string' || !text.trim()) return '';
  const patterns = COACH_BANNED_LLM_PATTERNS[locale] || COACH_BANNED_LLM_PATTERNS.fr;
  let cleaned = text;
  for (const pat of patterns) {
    cleaned = cleaned.replace(pat, '').trim();
  }
  cleaned = cleaned.replace(/\\s{2,}/g, ' ').trim();
  // If less than 24 chars remain, treat as empty so the useful fallback wins.
  if (cleaned.length < 24) return '';
  return cleaned;
}
const parsedBodySanitized = coachStripLLMRefusal(parsed.body, languageCode);
`;

const SANITIZER_ANCHOR = 'const synthesizedBody = synthesizeBody(content, localizedCopy.sectionLabels);';

// Replace parsed.body references in firstNonEmptyString chains with the
// sanitized version so the LLM excuse never wins.
const FINALBODY_OLD_LATESTSCAN = `firstNonEmptyString([
        parsed.body,
        synthesizedBody,
        fallbackBody,
        localizedCopy.genericError,
      ])`;
const FINALBODY_NEW_LATESTSCAN = `firstNonEmptyString([
        parsedBodySanitized,
        synthesizedBody,
        fallbackBody,
        localizedCopy.genericError,
      ])`;

// Soften hasMeaningfulContent: also accept a meaningful raw body (>= 24 chars).
const HAS_MEANINGFUL_OLD = `const hasMeaningfulContent =
  !!content.title &&
  (
    !!content.summary ||`;
const HAS_MEANINGFUL_NEW = `const hasMeaningfulRawBody =
  typeof parsedBodySanitized === 'string' && parsedBodySanitized.trim().length >= 24;
const hasMeaningfulContent =
  !!content.title &&
  (
    hasMeaningfulRawBody ||
    !!content.summary ||`;

// ─────────────────────────────────────────────────────────────────────────────
function replaceOnce(haystack, needle, replacement, label) {
  const idx = haystack.indexOf(needle);
  if (idx === -1) return { applied: false, label, reason: 'pattern not found (already applied?)' };
  const last = haystack.lastIndexOf(needle);
  if (last !== idx) throw new Error(`Ambiguous "${label}" — multiple occurrences.`);
  return { applied: true, label, output: haystack.slice(0, idx) + replacement + haystack.slice(idx + needle.length) };
}

  const report = [];

  for (const { label, from, to } of replacements) {
    const r = replaceOnce(code, from, to, label);
    if (r.applied) {
      code = r.output;
      report.push({ label, status: 'OK (1 replacement applied)' });
    } else {
      report.push({ label, status: `SKIPPED (${r.reason})` });
    }
  }

  // Inject sanitizer (idempotent via marker).
  if (code.indexOf(SANITIZER_MARKER) === -1) {
    const r = replaceOnce(
      code,
      SANITIZER_ANCHOR,
      SANITIZER_BLOCK.trim() + '\n' + SANITIZER_ANCHOR,
      'sanitizer block',
    );
    if (r.applied) {
      code = r.output;
      report.push({ label: 'sanitizer block', status: 'OK (injected)' });
    } else {
      report.push({ label: 'sanitizer block', status: `SKIPPED (${r.reason})` });
    }
  } else {
    report.push({ label: 'sanitizer block', status: 'SKIPPED (marker already present)' });
  }

  // Switch finalBody chain to parsedBodySanitized (latest_scan branch).
  {
    const r = replaceOnce(code, FINALBODY_OLD_LATESTSCAN, FINALBODY_NEW_LATESTSCAN, 'finalBody chain');
    if (r.applied) {
      code = r.output;
      report.push({ label: 'finalBody chain', status: 'OK (parsed.body → parsedBodySanitized)' });
    } else {
      report.push({ label: 'finalBody chain', status: `SKIPPED (${r.reason})` });
    }
  }

  // Soften hasMeaningfulContent.
  {
    const r = replaceOnce(code, HAS_MEANINGFUL_OLD, HAS_MEANINGFUL_NEW, 'hasMeaningfulContent softening');
    if (r.applied) {
      code = r.output;
      report.push({ label: 'hasMeaningfulContent softening', status: 'OK (raw body accepted)' });
    } else {
      report.push({ label: 'hasMeaningfulContent softening', status: `SKIPPED (${r.reason})` });
    }
  }

  // Validate the JS code is still syntactically valid before writing.
  try {
    new Function(code);
  } catch (error) {
    throw new Error(`Resulting jsCode is not valid JS in ${FILE}: ${error.message}`);
  }

  node.parameters.jsCode = code;
  const updated = JSON.stringify(wf, null, 2) + '\n';

  // Validate the JSON.
  try {
    JSON.parse(updated);
  } catch (error) {
    throw new Error(`Resulting ${FILE} is not valid JSON: ${error.message}`);
  }

  if (updated === original) {
    console.log('No change applied (file already cleaned).');
  } else {
    fs.writeFileSync(FILE, updated, 'utf-8');
    console.log(`Wrote ${FILE}`);
  }

  console.log('Report:');
  for (const entry of report) {
    console.log(`  - ${entry.label}: ${entry.status}`);
  }
}

for (const f of FILES) {
  runOnFile(f);
}
