const fs = require('fs');
let content = fs.readFileSync('i18n/translations.ts', 'utf8');

const replacements = {
    'fr': { scanner: 'Scanner', features_title: 'Fonctionnalités Premium' },
    'en': { scanner: 'Scan', features_title: 'Premium Features' },
    'de': { scanner: 'Scannen', features_title: 'Premium-Funktionen' },
    'it': { scanner: 'Scansiona', features_title: 'Funzionalità Premium' },
    'es': { scanner: 'Escáner', features_title: 'Funciones Premium' },
    'pt': { scanner: 'Escanear', features_title: 'Recursos Premium' }
};

const langs = ['fr', 'en', 'de', 'it', 'es', 'pt'];
for (let i = 0; i < langs.length; i++) {
    const lang = langs[i];
    const nextLang = i < langs.length - 1 ? langs[i + 1] : null;

    const startIdx = content.indexOf('"' + lang + '": {');
    if (startIdx === -1) continue;

    // Find the end of this language's block
    let endIdx = nextLang ? content.indexOf('"' + nextLang + '": {', startIdx) : content.length;
    if (endIdx === -1) endIdx = content.length;

    let chunk = content.substring(startIdx, endIdx);

    // Fix features_title
    chunk = chunk.replace(/"features_title":\s*"[^"]+"/, '"features_title": "' + replacements[lang].features_title + '"');

    // Fix scanner under tabs
    chunk = chunk.replace(/"scanner":\s*"[^"]+"/, '"scanner": "' + replacements[lang].scanner + '"');
    // Also fix any other places if scanner is missing? Wait, if it doesn't exist, we must add it.
    if (!chunk.includes('"scanner":')) {
        // fallback if it's missing entirely under tabs
        chunk = chunk.replace(/"tabs": {\s*/, '"tabs": {\n            "scanner": "' + replacements[lang].scanner + '",\n            ');
    }

    content = content.substring(0, startIdx) + chunk + content.substring(endIdx);
}

fs.writeFileSync('i18n/translations.ts', content, 'utf8');
console.log('Translations fixed successfully.');
