#!/usr/bin/env node
// OBSOLETE — do not re-run. The hydration fallback strings injected by this
// script (defaultBody / genericError × 6 locales) were replaced by neutral
// context-asking strings in the hotfix documented in
// COACH_BUG_HYDRATATION_AUDIT_2026_05_20.md (R-1).
// The `to:` values below have been updated to the new neutral strings so that,
// if the script is ever re-run against an old export, it lays down the correct
// (post-hotfix) values. Kept for historical traceability only.
//
// Original rationale (kept for context):
//   - localizedCopy.defaultBody   "Je n'ai pas pu formuler un conseil…"
//   - localizedCopy.genericError  "Un conseil personnalisé n'est pas disponible…"
//   - parsed.body returned by the LLM when it slipped a refusal through
//     ("pas assez de données", "je ne peux pas conseiller", …).
//
// This pass (historical):
//   - rewrites defaultBody / genericError in the 6 locales (FR/EN/DE/IT/ES/PT) ;
//   - keeps noScanBody (legitimate "user has zero scan" path) untouched ;
//   - injects a defensive sanitizer that strips the LLM body when it contains
//     a banned refusal phrase, so the user sees the fallback instead of the
//     LLM's excuse.
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
    to: 'defaultBody: "Pour te donner un retour vraiment utile, j ai besoin d un peu plus de contexte. Reformule ta question en quelques mots ou relance un scan recent et je te reponds en detail.",',
  },
  {
    label: 'FR genericError',
    from: 'genericError: "Un conseil personnalise n\'est pas disponible pour le moment. Reessaie dans un instant.",',
    to: 'genericError: "Reformule ta demande en une ou deux phrases pour que je puisse y repondre precisement. Si tu veux un retour personnalise, un scan recent m aide a ajuster le conseil.",',
  },

  // EN
  {
    label: 'EN defaultBody',
    from: 'defaultBody: "I could not build a reliable personalized coaching summary from the available information. Try again with a recent scan for clearer guidance.",',
    to: 'defaultBody: "To give you a truly useful answer, I need a bit more context. Rephrase your question in a few words, or run a recent scan and I will reply in detail.",',
  },
  {
    label: 'EN genericError',
    from: 'genericError: "A personalized coaching note is not available right now. Please try again shortly.",',
    to: 'genericError: "Rephrase your request in one or two sentences so I can answer precisely. If you want a personalized note, a recent scan helps me fine-tune the advice.",',
  },

  // DE
  {
    label: 'DE defaultBody',
    from: 'defaultBody: "Ich konnte aus den verfuegbaren Informationen keine verlaessliche personalisierte Coach-Zusammenfassung erstellen. Versuche es mit einem aktuellen Scan noch einmal.",',
    to: 'defaultBody: "Damit ich dir wirklich nützlich antworten kann, brauche ich etwas mehr Kontext. Formuliere deine Frage in wenigen Worten neu oder starte einen aktuellen Scan, und ich antworte dir ausführlich.",',
  },
  {
    label: 'DE genericError',
    from: 'genericError: "Ein personalisierter Coach-Hinweis ist im Moment nicht verfuegbar. Bitte versuche es gleich noch einmal.",',
    to: 'genericError: "Formuliere deine Anfrage in ein bis zwei Sätzen neu, damit ich präzise antworten kann. Für eine persönliche Rückmeldung hilft mir ein aktueller Scan, den Hinweis genau abzustimmen.",',
  },

  // IT
  {
    label: 'IT defaultBody',
    from: 'defaultBody: "Non sono riuscito a creare un riepilogo coach personalizzato e affidabile dalle informazioni disponibili. Riprova con una scansione recente per avere indicazioni piu chiare.",',
    to: 'defaultBody: "Per darti una risposta davvero utile mi serve un po’ piu di contesto. Riformula la tua domanda in poche parole oppure avvia una scansione recente e ti rispondo nel dettaglio.",',
  },
  {
    label: 'IT genericError',
    from: 'genericError: "Un consiglio personalizzato non e disponibile in questo momento. Riprova tra poco.",',
    to: 'genericError: "Riformula la tua richiesta in una o due frasi cosi posso risponderti con precisione. Per un riscontro personalizzato, una scansione recente mi aiuta a calibrare il consiglio.",',
  },

  // ES
  {
    label: 'ES defaultBody',
    from: 'defaultBody: "No pude crear un resumen personalizado y fiable a partir de la informacion disponible. Intentalo de nuevo con un escaneo reciente para obtener una orientacion mas clara.",',
    to: 'defaultBody: "Para darte una respuesta realmente útil necesito un poco más de contexto. Reformula tu pregunta en pocas palabras o lanza un escaneo reciente y te respondo en detalle.",',
  },
  {
    label: 'ES genericError',
    from: 'genericError: "Una orientacion personalizada no esta disponible en este momento. Intentalo de nuevo en breve.",',
    to: 'genericError: "Reformula tu petición en una o dos frases para que pueda responderte con precisión. Si quieres una respuesta personalizada, un escaneo reciente me ayuda a afinar el consejo.",',
  },

  // PT
  {
    label: 'PT defaultBody',
    from: 'defaultBody: "Nao consegui criar um resumo personalizado e fiavel a partir das informacoes disponiveis. Tenta novamente com um scan recente para obter uma orientacao mais clara.",',
    to: 'defaultBody: "Para te dar uma resposta verdadeiramente útil preciso de um pouco mais de contexto. Reformula a tua pergunta em poucas palavras ou lança um scan recente e respondo-te em detalhe.",',
  },
  {
    label: 'PT genericError',
    from: 'genericError: "Uma orientacao personalizada nao esta disponivel neste momento. Tenta novamente daqui a pouco.",',
    to: 'genericError: "Reformula o teu pedido em uma ou duas frases para eu poder responder com precisão. Se queres uma resposta personalizada, um scan recente ajuda-me a afinar o conselho.",',
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
