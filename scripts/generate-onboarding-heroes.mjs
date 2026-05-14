import { mkdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const WIDTH = 1080;
const HEIGHT = 1920;
const SLIDES = ['scanner', 'analytics', 'coach', 'social', 'fridge'];
const THEMES = ['light', 'dark'];

const PALETTES = {
  light: {
    backgroundStart: '#F8F2E9',
    backgroundMid: '#E7F1F7',
    backgroundEnd: '#F7F4EE',
    panel: '#FFFFFF',
    panelStrong: '#EFF5F9',
    glass: 'rgba(255,255,255,0.82)',
    line: 'rgba(22,33,43,0.10)',
    dot: 'rgba(22,33,43,0.16)',
    shadow: 'rgba(17,24,39,0.12)',
    text: '#16212B',
  },
  dark: {
    backgroundStart: '#08111E',
    backgroundMid: '#102637',
    backgroundEnd: '#08111A',
    panel: '#121C28',
    panelStrong: '#182636',
    glass: 'rgba(19,30,43,0.78)',
    line: 'rgba(208,222,236,0.14)',
    dot: 'rgba(208,222,236,0.18)',
    shadow: 'rgba(0,0,0,0.26)',
    text: '#F5FAFF',
  },
};

const ACCENTS = {
  scanner: ['#6FB9FF', '#3ED1C5', '#D9F0FF'],
  analytics: ['#59CBA8', '#D9B25F', '#EAF8E8'],
  coach: ['#8E7BFF', '#D29BF6', '#F4EEFF'],
  social: ['#4ED39D', '#6FD6C8', '#EAFDF6'],
  fridge: ['#F2A650', '#F3D273', '#FFF4DB'],
};

const rgba = (hex, alpha) => {
  const normalized = hex.replace('#', '');
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((part) => part + part)
          .join('')
      : normalized;
  const value = parseInt(expanded, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const rect = ({
  x,
  y,
  width,
  height,
  rx = 28,
  fill,
  stroke = 'none',
  strokeWidth = 1,
  opacity = 1,
}) =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" />`;

const circle = ({
  cx,
  cy,
  r,
  fill,
  stroke = 'none',
  strokeWidth = 1,
  opacity = 1,
}) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" />`;

const line = ({ x1, y1, x2, y2, stroke, strokeWidth = 4, opacity = 1 }) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" opacity="${opacity}" />`;

function backdrop(theme, slide) {
  const palette = PALETTES[theme];
  const [accent, accentSecondary] = ACCENTS[slide];

  return `
    <defs>
      <linearGradient id="bg-${theme}-${slide}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${palette.backgroundStart}" />
        <stop offset="52%" stop-color="${palette.backgroundMid}" />
        <stop offset="100%" stop-color="${palette.backgroundEnd}" />
      </linearGradient>
      <radialGradient id="halo-${theme}-${slide}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${rgba(accent, theme === 'dark' ? 0.44 : 0.20)}" />
        <stop offset="100%" stop-color="${rgba(accent, 0)}" />
      </radialGradient>
      <radialGradient id="halo-b-${theme}-${slide}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${rgba(accentSecondary, theme === 'dark' ? 0.26 : 0.16)}" />
        <stop offset="100%" stop-color="${rgba(accentSecondary, 0)}" />
      </radialGradient>
      <linearGradient id="panel-${theme}-${slide}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${theme === 'dark' ? rgba('#182636', 0.96) : rgba('#FFFFFF', 0.98)}" />
        <stop offset="100%" stop-color="${theme === 'dark' ? rgba('#121C28', 0.92) : rgba('#EEF4F8', 0.92)}" />
      </linearGradient>
      <linearGradient id="accent-${theme}-${slide}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${accent}" />
        <stop offset="100%" stop-color="${accentSecondary}" />
      </linearGradient>
      <filter id="blur-${theme}-${slide}" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="42" />
      </filter>
      <filter id="soft-shadow-${theme}-${slide}" x="-20%" y="-20%" width="160%" height="160%">
        <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="${palette.shadow}" />
      </filter>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg-${theme}-${slide})" />
    <ellipse cx="300" cy="540" rx="340" ry="220" fill="url(#halo-${theme}-${slide})" filter="url(#blur-${theme}-${slide})" />
    <ellipse cx="838" cy="672" rx="280" ry="210" fill="url(#halo-b-${theme}-${slide})" filter="url(#blur-${theme}-${slide})" />
    <path d="M-40 170C160 96 360 112 560 184C742 250 890 304 1120 220" fill="none" stroke="${palette.line}" stroke-width="5" />
    <path d="M-60 540C140 470 356 488 560 566C752 638 914 700 1138 632" fill="none" stroke="${palette.line}" stroke-width="4" opacity="0.88" />
    <path d="M-80 1546C126 1490 354 1508 560 1580C780 1656 920 1736 1148 1678" fill="none" stroke="${palette.line}" stroke-width="4" opacity="0.58" />
    ${[120, 360, 620, 880].map((x) =>
      [170, 640, 1180].map((y) => circle({ cx: x, cy: y, r: 4, fill: palette.dot })).join(''),
    ).join('')}
    <ellipse cx="540" cy="1010" rx="210" ry="42" fill="${rgba(theme === 'dark' ? '#030811' : '#243649', theme === 'dark' ? 0.36 : 0.12)}" />
  `;
}

function scannerScene(theme) {
  const palette = PALETTES[theme];
  const [accent, accentSecondary, accentSoft] = ACCENTS.scanner;

  return `
    ${rect({
      x: 110,
      y: 290,
      width: 320,
      height: 250,
      rx: 38,
      fill: 'url(#panel-' + theme + '-scanner)',
      stroke: rgba(accent, theme === 'dark' ? 0.28 : 0.16),
      strokeWidth: 2,
    })}
    ${rect({
      x: 650,
      y: 342,
      width: 300,
      height: 250,
      rx: 34,
      fill: theme === 'dark' ? rgba('#0B1220', 0.86) : rgba('#0D1620', 0.92),
      stroke: rgba(accentSoft, theme === 'dark' ? 0.12 : 0.2),
      strokeWidth: 2,
    })}
    ${circle({ cx: 540, cy: 524, r: 156, fill: rgba(theme === 'dark' ? '#112132' : '#FFFFFF', theme === 'dark' ? 0.92 : 0.92), stroke: rgba(accent, 0.22), strokeWidth: 2 })}
    ${circle({ cx: 540, cy: 524, r: 116, fill: rgba(theme === 'dark' ? '#0E1822' : '#E8F0F7', 0.95), stroke: rgba(accent, 0.28), strokeWidth: 3 })}
    <path d="M540 446c-32 0-58 24-58 54c0 24 16 43 38 51c-52 14-86 40-86 80h212c0-40-34-66-86-80c22-8 38-27 38-51c0-30-26-54-58-54z" fill="${theme === 'dark' ? rgba('#F4FAFF', 0.9) : rgba('#142332', 0.88)}" />
    ${['220,392,90,18', '224,462,18,90', '332,462,18,90', '220,546,90,18'].map((spec) => {
      const [x, y, width, height] = spec.split(',').map(Number);
      return rect({ x, y, width, height, rx: 9, fill: rgba(accent, 0.92) });
    }).join('')}
    ${['734,414,76,10', '824,414,88,10', '734,496,176,10', '734,528,148,10'].map((spec, index) => {
      const [x, y, width, height] = spec.split(',').map(Number);
      return rect({
        x,
        y,
        width,
        height,
        rx: 6,
        fill: index === 2 ? rgba(accentSecondary, 0.88) : rgba(accentSoft, 0.82),
      });
    }).join('')}
    ${rect({
      x: 708,
      y: 620,
      width: 216,
      height: 88,
      rx: 26,
      fill: palette.glass,
      stroke: rgba(accent, theme === 'dark' ? 0.22 : 0.12),
      strokeWidth: 2,
    })}
    ${circle({ cx: 770, cy: 664, r: 18, fill: accentSecondary })}
    ${rect({ x: 808, y: 648, width: 88, height: 12, rx: 6, fill: rgba(theme === 'dark' ? '#F4FAFF' : '#152332', 0.24) })}
    ${rect({ x: 808, y: 676, width: 72, height: 12, rx: 6, fill: rgba(theme === 'dark' ? '#F4FAFF' : '#152332', 0.16) })}
  `;
}

function analyticsScene(theme) {
  const [accent, accentSecondary, accentSoft] = ACCENTS.analytics;

  return `
    ${rect({
      x: 168,
      y: 294,
      width: 744,
      height: 452,
      rx: 46,
      fill: 'url(#panel-' + theme + '-analytics)',
      stroke: rgba(accent, theme === 'dark' ? 0.24 : 0.14),
      strokeWidth: 2,
    })}
    ${rect({ x: 216, y: 342, width: 196, height: 152, rx: 30, fill: rgba(accent, theme === 'dark' ? 0.18 : 0.12), stroke: rgba(accent, 0.18), strokeWidth: 2 })}
    ${rect({ x: 434, y: 342, width: 224, height: 152, rx: 30, fill: rgba(accentSecondary, theme === 'dark' ? 0.16 : 0.12), stroke: rgba(accentSecondary, 0.18), strokeWidth: 2 })}
    ${rect({ x: 680, y: 342, width: 184, height: 152, rx: 30, fill: rgba(accentSoft, theme === 'dark' ? 0.16 : 0.14), stroke: rgba(accentSoft, 0.18), strokeWidth: 2 })}
    ${[0, 1, 2, 3, 4, 5].map((index) =>
      rect({
        x: 248 + index * 22,
        y: 466 - index * 20,
        width: 12,
        height: 34 + index * 20,
        rx: 6,
        fill: index > 3 ? accent : rgba(accent, 0.48),
      }),
    ).join('')}
    ${circle({ cx: 545, cy: 420, r: 48, fill: 'none', stroke: rgba(accentSecondary, 0.28), strokeWidth: 18 })}
    ${circle({ cx: 545, cy: 420, r: 48, fill: 'none', stroke: accentSecondary, strokeWidth: 18, opacity: 0.92, strokeLinecap: 'round' })}
    ${circle({ cx: 772, cy: 388, r: 18, fill: accent })}
    ${rect({ x: 742, y: 438, width: 62, height: 12, rx: 6, fill: rgba(accentSoft, 0.82) })}
    ${rect({ x: 726, y: 470, width: 96, height: 12, rx: 6, fill: rgba(accentSecondary, 0.72) })}
    ${rect({ x: 216, y: 534, width: 648, height: 158, rx: 34, fill: rgba(theme === 'dark' ? '#0A1320' : '#F8FCFF', theme === 'dark' ? 0.68 : 0.96), stroke: rgba(accent, theme === 'dark' ? 0.16 : 0.12), strokeWidth: 2 })}
    ${[0, 1, 2, 3, 4, 5, 6].map((index) =>
      rect({
        x: 254 + index * 72,
        y: 650 - [38, 62, 52, 78, 72, 104, 88][index],
        width: 40,
        height: [38, 62, 52, 78, 72, 104, 88][index],
        rx: 12,
        fill: index === 5 ? accentSecondary : rgba(accent, 0.68),
      }),
    ).join('')}
    ${line({ x1: 248, y1: 664, x2: 820, y2: 664, stroke: rgba(accentSoft, 0.24), strokeWidth: 2 })}
  `;
}

function coachScene(theme) {
  const [accent, accentSecondary, accentSoft] = ACCENTS.coach;

  return `
    ${rect({
      x: 244,
      y: 260,
      width: 592,
      height: 604,
      rx: 54,
      fill: 'url(#panel-' + theme + '-coach)',
      stroke: rgba(accent, theme === 'dark' ? 0.24 : 0.14),
      strokeWidth: 2,
    })}
    ${circle({ cx: 334, cy: 356, r: 46, fill: rgba(accent, 0.24), stroke: rgba(accent, 0.26), strokeWidth: 2 })}
    ${circle({ cx: 334, cy: 356, r: 28, fill: accent })}
    ${rect({ x: 408, y: 316, width: 334, height: 90, rx: 28, fill: rgba(accentSecondary, theme === 'dark' ? 0.16 : 0.1), stroke: rgba(accentSecondary, 0.18), strokeWidth: 2 })}
    ${rect({ x: 408, y: 338, width: 260, height: 12, rx: 6, fill: rgba(accentSoft, 0.78) })}
    ${rect({ x: 408, y: 366, width: 184, height: 12, rx: 6, fill: rgba(accent, 0.64) })}
    ${rect({ x: 316, y: 462, width: 354, height: 110, rx: 34, fill: rgba(theme === 'dark' ? '#132033' : '#FFFFFF', 0.92), stroke: rgba(accent, 0.16), strokeWidth: 2 })}
    ${rect({ x: 402, y: 604, width: 328, height: 96, rx: 32, fill: rgba(accent, theme === 'dark' ? 0.2 : 0.12), stroke: rgba(accent, 0.18), strokeWidth: 2 })}
    ${rect({ x: 316, y: 736, width: 198, height: 72, rx: 28, fill: rgba(accentSecondary, theme === 'dark' ? 0.18 : 0.12), stroke: rgba(accentSecondary, 0.18), strokeWidth: 2 })}
    ${['356,506,244,12', '356,536,212,12', '440,644,232,12', '440,674,186,12', '352,764,126,10'].map((spec, index) => {
      const [x, y, width, height] = spec.split(',').map(Number);
      const fills = [rgba(accentSoft, 0.84), rgba(accent, 0.62), rgba(accentSoft, 0.84), rgba(accent, 0.62), rgba(accentSoft, 0.84)];
      return rect({ x, y, width, height, rx: 6, fill: fills[index] });
    }).join('')}
  `;
}

function socialScene(theme) {
  const palette = PALETTES[theme];
  const [accent, accentSecondary, accentSoft] = ACCENTS.social;

  return `
    ${rect({
      x: 190,
      y: 286,
      width: 696,
      height: 446,
      rx: 46,
      fill: 'url(#panel-' + theme + '-social)',
      stroke: rgba(accent, theme === 'dark' ? 0.24 : 0.14),
      strokeWidth: 2,
    })}
    ${[0, 1, 2, 3].map((index) =>
      circle({
        cx: 290 + index * 92,
        cy: 374,
        r: 34,
        fill: [accent, accentSecondary, accentSoft, '#8EC9FF'][index],
        opacity: 0.9,
      }),
    ).join('')}
    ${rect({ x: 246, y: 440, width: 582, height: 112, rx: 34, fill: rgba(theme === 'dark' ? '#0C1622' : '#FFFFFF', 0.94), stroke: rgba(accent, 0.14), strokeWidth: 2 })}
    ${rect({ x: 246, y: 580, width: 446, height: 96, rx: 30, fill: rgba(accent, theme === 'dark' ? 0.18 : 0.1), stroke: rgba(accent, 0.18), strokeWidth: 2 })}
    ${rect({ x: 718, y: 582, width: 110, height: 96, rx: 30, fill: rgba(accentSecondary, theme === 'dark' ? 0.18 : 0.12), stroke: rgba(accentSecondary, 0.18), strokeWidth: 2 })}
    ${['324,478,396,12', '324,510,298,12', '286,616,336,12', '286,646,234,12'].map((spec, index) => {
      const [x, y, width, height] = spec.split(',').map(Number);
      return rect({
        x,
        y,
        width,
        height,
        rx: 6,
        fill: index % 2 === 0 ? rgba(accentSoft, 0.84) : rgba(accent, 0.62),
      });
    }).join('')}
    ${circle({ cx: 772, cy: 628, r: 18, fill: accentSecondary })}
    ${circle({ cx: 248, cy: 840, r: 42, fill: rgba(accent, 0.18), stroke: rgba(accent, 0.2), strokeWidth: 2 })}
    ${rect({ x: 314, y: 808, width: 236, height: 68, rx: 28, fill: palette.glass, stroke: rgba(accent, 0.16), strokeWidth: 2 })}
    ${rect({ x: 362, y: 834, width: 154, height: 10, rx: 5, fill: rgba(accent, 0.58) })}
  `;
}

function fridgeScene(theme) {
  const [accent, accentSecondary, accentSoft] = ACCENTS.fridge;
  const produceFill = theme === 'dark' ? rgba('#FFFFFF', 0.1) : rgba('#FFFFFF', 0.74);

  return `
    ${rect({
      x: 180,
      y: 282,
      width: 320,
      height: 430,
      rx: 42,
      fill: 'url(#panel-' + theme + '-fridge)',
      stroke: rgba(accent, theme === 'dark' ? 0.24 : 0.14),
      strokeWidth: 2,
    })}
    ${line({ x1: 340, y1: 310, x2: 340, y2: 686, stroke: rgba(accentSoft, 0.28), strokeWidth: 3 })}
    ${rect({ x: 218, y: 336, width: 86, height: 86, rx: 24, fill: produceFill, stroke: rgba(accent, 0.14), strokeWidth: 2 })}
    ${rect({ x: 370, y: 336, width: 86, height: 86, rx: 24, fill: produceFill, stroke: rgba(accentSecondary, 0.14), strokeWidth: 2 })}
    ${rect({ x: 218, y: 474, width: 86, height: 86, rx: 24, fill: produceFill, stroke: rgba(accentSoft, 0.14), strokeWidth: 2 })}
    ${rect({ x: 370, y: 474, width: 86, height: 86, rx: 24, fill: produceFill, stroke: rgba(accent, 0.14), strokeWidth: 2 })}
    ${circle({ cx: 262, cy: 378, r: 20, fill: accent })}
    ${circle({ cx: 414, cy: 378, r: 20, fill: accentSecondary })}
    ${circle({ cx: 262, cy: 516, r: 20, fill: '#67C66F' })}
    ${circle({ cx: 414, cy: 516, r: 20, fill: '#EA6E56' })}
    ${rect({
      x: 560,
      y: 344,
      width: 324,
      height: 348,
      rx: 42,
      fill: rgba(theme === 'dark' ? '#0A1320' : '#FFFFFF', 0.96),
      stroke: rgba(accent, 0.16),
      strokeWidth: 2,
    })}
    ${rect({ x: 604, y: 388, width: 238, height: 154, rx: 30, fill: rgba(accent, theme === 'dark' ? 0.16 : 0.12), stroke: rgba(accentSecondary, 0.18), strokeWidth: 2 })}
    ${['618,574,194,12', '618,606,160,12', '618,638,112,12'].map((spec, index) => {
      const [x, y, width, height] = spec.split(',').map(Number);
      return rect({
        x,
        y,
        width,
        height,
        rx: 6,
        fill: index === 2 ? rgba(accentSecondary, 0.78) : rgba(accentSoft, 0.84),
      });
    }).join('')}
    ${circle({ cx: 644, cy: 448, r: 22, fill: accentSecondary })}
    ${circle({ cx: 718, cy: 448, r: 18, fill: '#67C66F' })}
    ${circle({ cx: 784, cy: 448, r: 20, fill: '#EA6E56' })}
  `;
}

function buildSvg(theme, slide) {
  const scenes = {
    scanner: scannerScene(theme),
    analytics: analyticsScene(theme),
    coach: coachScene(theme),
    social: socialScene(theme),
    fridge: fridgeScene(theme),
  };

  return `
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      ${backdrop(theme, slide)}
      <g filter="url(#soft-shadow-${theme}-${slide})">
        ${scenes[slide]}
      </g>
    </svg>
  `;
}

async function main() {
  for (const theme of THEMES) {
    for (const slide of SLIDES) {
      const outputPath = path.join(
        process.cwd(),
        'assets',
        'onboarding',
        theme,
        slide,
        'hero.png',
      );
      mkdirSync(path.dirname(outputPath), { recursive: true });
      await sharp(Buffer.from(buildSvg(theme, slide)))
        .png({ compressionLevel: 9 })
        .toFile(outputPath);
      console.log(`generated ${path.relative(process.cwd(), outputPath)}`);
    }
  }
}

main().catch((error) => {
  console.error('[generate-onboarding-heroes] Failed:', error);
  process.exitCode = 1;
});
