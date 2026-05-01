const fs = require('fs');
const content = fs.readFileSync('i18n/translations.ts', 'utf8');
const langs = ['fr', 'en', 'de', 'it', 'es', 'pt'];

// checking scanner
for (const lang of langs) {
    const start = content.indexOf('"' + lang + '": {');
    if (start === -1) continue;
    let len = 5000;
    let chunk = content.substring(start, start + len);
    let match = chunk.match(/"scanner":\s*"([^"]+)"/);
    console.log(lang, 'scanner:', match ? match[1] : 'NOT FOUND');
}

// checking features_title globally
let lines = content.split('\n');
let currentLang = '';
lines.forEach((l, i) => {
    for (const lang of langs) {
        if (l.trim() === '"' + lang + '": {') {
            currentLang = lang;
        }
    }
    if (l.includes('features_title') || l.includes('Premium-Funktionen')) {
        console.log('[' + currentLang + '] line ' + (i + 1) + ': ' + l.trim());
    }
});
