const fs = require('fs');
const content = fs.readFileSync('i18n/translations.ts', 'utf8');
const langs = ['fr', 'en', 'de', 'it', 'es', 'pt'];
let out = '';

for (const lang of langs) {
    const start = content.indexOf('"' + lang + '": {');
    if (start === -1) continue;
    let chunk = content.substring(start, start + 3000);
    let match = chunk.match(/"scanner":\s*"([^"]+)"/);
    out += lang + ' scanner: ' + (match ? match[1] : 'NOT FOUND') + '\n';
}

let lines = content.split('\n');
let currentLang = '';
lines.forEach((l, i) => {
    for (const lang of langs) {
        if (l.trim() === '"' + lang + '": {') {
            currentLang = lang;
        }
    }
    if (l.includes('features_title') || l.includes('Premium-Funktionen')) {
        out += '[' + currentLang + '] line ' + (i + 1) + ': ' + l.trim() + '\n';
    }
});
fs.writeFileSync('check_out2.txt', out, 'utf8');
