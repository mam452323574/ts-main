#!/usr/bin/env node
// OBSOLETE — do not re-run as-is. Entry "aucun scan exploitable rule" (#11
// in the replacements table below) injected a problematic "mini-action générale
// utile (sommeil, hydratation, posture, repas équilibré, respiration)"
// suggestion that contradicted the anti-réflexe (4) rule and was the upstream
// cause of the "Bois de l'eau dans 5 minutes" output. It has been replaced by
// the R-12 hotfix (see COACH_BUG_HYDRATATION_AUDIT_2026_05_20.md).
// The `to:` value of entry #11 has been updated to the new context-asking
// reformulation so that, if the script is ever re-run against an old export,
// it lays down the post-hotfix value. The other entries (1-10, 12) remain
// historically accurate but should not be re-applied as a batch.
//
// Original rationale (kept for context):
//   - the front-end no longer renders content.data_gaps. The N8N prompt
//     still encourages the LLM to fill it (and to disclaim missing data to the
//     user) which wastes tokens and produces sentences the user never sees.
//   - keeps the schema field (data_gaps: []) for backward compatibility ;
//   - replaces every instruction that asks the LLM to populate it with a
//     STRICT-EMPTY rule + a silent-fallback policy ;
//   - rewrites the analytical persona example so it no longer demonstrates
//     a populated data_gaps ;
//   - injects a consolidation rule on action_steps so related ideas are not
//     split into two artificial actions.
//
// Run from repo root: node tmp/apply-data-gaps-cleanup.js
// Idempotent: a second run is a no-op (each replacement guards on the OLD
// substring being present exactly once).

const fs = require('fs');
const path = require('path');

// Target file: defaults to the in-repo workflow, but can be overridden so the
// same idempotent cleanup can be re-applied to the Downloads copy that the
// user re-imports into N8N. Pass the path as the first CLI arg.
const FILE = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, '..', 'n8n', 'workflows', 'coach.json');
const original = fs.readFileSync(FILE, 'utf-8');

const replacements = [
  // 1) Global contract — replace the "0 a 3 limites utiles" line.
  {
    label: 'contract data_gaps line',
    from: "'- content.data_gaps : 0 a 3 limites utiles, par exemple estimation visuelle ou absence de scan du bon type.',",
    to: "'- content.data_gaps : RÈGLE STRICTE — toujours [] (jamais visible utilisateur). N écris JAMAIS de phrase utilisateur sur des données manquantes (interdit : \\\"pas assez de données\\\", \\\"données indisponibles\\\", \\\"pas de comparaison\\\", \\\"je ne peux pas conclure\\\", \\\"les données de X ne sont pas disponibles\\\"). Si une métrique manque, reformule simplement le conseil sans mentionner la donnée absente.',",
  },

  // 2) "Si la donnee manque" — flip the instruction from "add a line in data_gaps" to "rewrite silently".
  {
    label: 'donnee manque rule',
    from: "'- Si la donnee manque, mets null ou [] et ajoute si pertinent une ligne dans data_gaps.',",
    to: "'- Si la donnee manque, mets null ou [] sur le champ concerné et reformule le conseil sans mentionner la donnée manquante. data_gaps reste TOUJOURS [].',",
  },

  // 3) Old scan rule — keep next_scan_suggestion as the silent escape hatch.
  //    The file embeds the apostrophe as a JSON-encoded JS-escape (d\\'un → bytes "d", "\\", "\\", "'", "u", "n"),
  //    so we must double the backslashes again in our JS literal here.
  {
    label: 'scan >30j data_gaps rule',
    from: "'- Si la priorite du jour repose sur une metrique d\\\\'un scan >30j, signale-le calmement dans data_gaps (\\\"donnee scan recente manquante pour X\\\") et propose un nouveau scan via next_scan_suggestion.',",
    to: "'- Si la priorite du jour repose sur une metrique d\\\\'un scan >30j, propose simplement un nouveau scan via next_scan_suggestion (reason concise et actionnable). N ecris JAMAIS de disclaimer utilisateur sur l anciennete des donnees ; data_gaps reste [].',",
  },

  // 4) Vague-question rule — never tell the user what is missing.
  {
    label: 'vague question rule',
    from: "'- Si la question est vague, donne une reponse utile sans bloquer et indique ce qui manque dans content.data_gaps.',",
    to: "'- Si la question est vague, donne une reponse utile sans bloquer. Si une clarification courte est utile, pose UNE question concise dans content.summary. N indique JAMAIS un manque de donnees a l utilisateur ; data_gaps reste [].',",
  },

  // 5) free_question artifacts — same intent, keep data_gaps invisible.
  {
    label: 'free_question artifacts data_gaps',
    from: "'- content.data_gaps : limites si les scans/profil ne suffisent pas.',",
    to: "'- content.data_gaps : TOUJOURS [] (jamais visible utilisateur). Si les scans/profil ne suffisent pas, formule un conseil general utile et actionnable sans mentionner les donnees manquantes.',",
  },

  // 6) latest_scan visual-base rule — move the nuance into summary/warnings.
  {
    label: 'visual base data_gaps rule',
    from: "'- Si la base est purement visuelle ou estimée, signale-le brièvement dans data_gaps.',",
    to: "'- Si la base est purement visuelle ou estimée, garde un ton prudent dans summary ou warnings (jamais dans data_gaps, qui reste []).',",
  },

  // 7) Analytical persona — replace the CHAMPS CONDITIONNELS line.
  {
    label: 'analytical CHAMPS CONDITIONNELS',
    from: '\\"CHAMPS CONDITIONNELS : data_gaps si signaux faibles ; primary_metric_delta si comparison_to_previous.available.\\",',
    to: '\\"CHAMPS CONDITIONNELS : data_gaps reste TOUJOURS [] (jamais visible utilisateur, même pour la persona analytique) ; primary_metric_delta si comparison_to_previous.available.\\",',
  },

  // 8) Analytical persona example — empty out the demonstrated data_gaps array.
  {
    label: 'analytical example data_gaps',
    from: '\\\\\\"confidence\\\\\\":\\\\\\"medium\\\\\\",\\\\\\"data_gaps\\\\\\":[\\\\\\"Estimation visuelle, marge ±10 %\\\\\\"]}}',
    to: '\\\\\\"confidence\\\\\\":\\\\\\"medium\\\\\\",\\\\\\"data_gaps\\\\\\":[]}}',
  },

  // 9) action_steps consolidation rule — extend the contract line so the LLM
  // fuses related ideas instead of producing two artificial actions.
  {
    label: 'action_steps contract (consolidation)',
    from: "'- content.action_steps : 1 a 4 actions concretes selon la route.',",
    to: "'- content.action_steps : 1 a 4 actions concretes selon la route. FUSIONNE les idées proches en UNE seule action utile (ex : \\\"Prépare ton petit-déjeuner à l avance avec une portion de protéines (œufs, yaourt grec, fromage blanc)\\\" plutôt que deux actions \\\"Prépare ton petit-déjeuner\\\" + \\\"Ajoute des protéines\\\"). Une action = une idée complète et actionnable.',",
  },

  // 10) free_question action_steps — same consolidation rule on the route-level line.
  {
    label: 'free_question action_steps consolidation',
    from: "'- content.action_steps : 1 a 4 actions concretes, dont une action faisable maintenant.',",
    to: "'- content.action_steps : 1 a 4 actions concretes, dont une action faisable maintenant. FUSIONNE les idees proches en UNE action complete (ne separe pas \\\"Prepare X\\\" et \\\"Ajoute Y a X\\\" en deux actions ; ecris-les en une seule action utile).',",
  },

  // 11) Rewrite "Si aucun scan exploitable" — the original encouraged a
  //     user-facing disclaimer; we keep it silent and ask for a useful
  //     general advice instead. Note: the apostrophes in the source are
  //     smart quotes (U+2019), not ASCII.
  {
    label: 'aucun scan exploitable rule',
    from: "'- Si aucun scan exploitable n’existe, explique simplement qu’il n’y a pas encore de scan récent exploitable et propose une mini-action utile.',",
    to: "'- Si aucun scan exploitable n’existe ou si le contexte est trop maigre, formule une réponse utile centrée sur la question posée (ou pose UNE question courte de clarification dans content.summary si la question est trop vague). N énumère JAMAIS d actions génériques de remplissage (interdit notamment : suggérer un grand verre d eau, une marche de quelques minutes, une heure de coucher, une respiration ou une \\\"mini-action\\\" santé non demandée). Reste fidèle à l intention de l utilisateur et à la persona active.',",
  },

  // 12) Inject the new product rule right after "ne formule aucune
  //     conclusion médicale." — this is the closing line of « Règles globales »
  //     and a natural anchor for a top-level silence-on-missing-data rule.
  //     IMPORTANT: every apostrophe inside the rule uses the smart quote ’ (U+2019)
  //     to avoid conflicting with the single-quoted JS string delimiter that wraps
  //     each prompt line in coach.json (same convention as the surrounding lines).
  {
    label: 'new product rule (silence on missing data)',
    from: "'- Ne remplace pas un avis professionnel de santé et ne formule aucune conclusion médicale.',",
    to: "'- Ne remplace pas un avis professionnel de santé et ne formule aucune conclusion médicale.',\\n  '- RÈGLE PRODUIT (silence sur les manques de données) : Le Coach doit toujours produire une réponse utile, concrète et actionnable. Le manque de données ne devient JAMAIS une section utilisateur. Interdit explicitement : \\\"je n’ai pas assez de données\\\", \\\"les données de X ne sont pas disponibles\\\", \\\"pas de comparaison disponible\\\", \\\"je ne peux pas conclure\\\", \\\"impossible de te conseiller sans plus de scans\\\". Si une métrique manque, reformule simplement le conseil sans mentionner la donnée absente. data_gaps reste TOUJOURS [] côté contrat ; il n’est plus rendu côté UI.',",
  },
];

let current = original;
const report = [];

for (const { label, from, to } of replacements) {
  const occurrences = current.split(from).length - 1;
  if (occurrences === 0) {
    report.push({ label, status: 'SKIPPED (already cleaned / pattern not found)' });
    continue;
  }
  if (occurrences > 1) {
    throw new Error(
      `Ambiguous replacement "${label}" — found ${occurrences} occurrences; aborting.`,
    );
  }
  current = current.replace(from, to);
  report.push({ label, status: 'OK (1 replacement applied)' });
}

// Validate the result is still valid JSON before writing.
try {
  JSON.parse(current);
} catch (error) {
  throw new Error(`Resulting coach.json is not valid JSON: ${error.message}`);
}

if (current === original) {
  console.log('No change applied (file already cleaned).');
} else {
  fs.writeFileSync(FILE, current, 'utf-8');
  console.log(`Wrote ${FILE}`);
}

console.log('\nReport:');
for (const entry of report) {
  console.log(`  - ${entry.label}: ${entry.status}`);
}
