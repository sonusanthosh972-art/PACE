/**
 * Raw SVG and vector specifications for the PACE / Paisa Pulse logo,
 * directly extracted from assets/gemini-svg.svg.
 */

export const GEMINI_SVG_RAW = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500" width="100%" height="100%">
  <defs>
    <style>
      .bg-rect { fill: #0B0D11; }
      .real-letter {
        font-family: 'Outfit', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 168px;
        font-weight: 700;
        fill: url(#platinum);
        dominant-baseline: central;
        text-anchor: middle;
      }
      .p-icon { animation: slideP 4.2s cubic-bezier(0.22, 1, 0.36, 1) infinite; }
      .char-a { animation: emergeA 4.2s cubic-bezier(0.16, 1, 0.3, 1) infinite; transform-origin: 435px 250px; }
      .char-c { animation: emergeC 4.2s cubic-bezier(0.16, 1, 0.3, 1) infinite; transform-origin: 555px 250px; }
      .char-e { animation: emergeE 4.2s cubic-bezier(0.16, 1, 0.3, 1) infinite; transform-origin: 670px 250px; }
      @keyframes slideP {
        0%, 25%   { transform: translateX(0px) scale(1.08); }
        48%, 85%  { transform: translateX(-185px) scale(1); }
        95%, 100% { transform: translateX(0px) scale(1.08); }
      }
      @keyframes emergeA {
        0%, 26% { transform: translate(65px, 8px) scale(0.25); opacity: 0; filter: blur(12px); }
        46%, 85% { transform: translate(0px, 0px) scale(1); opacity: 1; filter: blur(0px); }
        94%, 100% { transform: translate(65px, 8px) scale(0.25); opacity: 0; filter: blur(12px); }
      }
      @keyframes emergeC {
        0%, 29% { transform: translate(-55px, 8px) scale(0.25); opacity: 0; filter: blur(14px); }
        49%, 85% { transform: translate(0px, 0px) scale(1); opacity: 1; filter: blur(0px); }
        94%, 100% { transform: translate(-55px, 8px) scale(0.25); opacity: 0; filter: blur(14px); }
      }
      @keyframes emergeE {
        0%, 32% { transform: translate(-170px, 8px) scale(0.25); opacity: 0; filter: blur(16px); }
        52%, 85% { transform: translate(0px, 0px) scale(1); opacity: 1; filter: blur(0px); }
        94%, 100% { transform: translate(-170px, 8px) scale(0.25); opacity: 0; filter: blur(16px); }
      }
    </style>
    <linearGradient id="platinum" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#F8F9FA" />
      <stop offset="65%" stop-color="#F1F5F9" />
      <stop offset="100%" stop-color="#94A3B8" />
    </linearGradient>
    <linearGradient id="emerald" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#059669" />
      <stop offset="50%" stop-color="#10E896" />
      <stop offset="100%" stop-color="#6EE7B7" />
    </linearGradient>
    <filter id="glow" x="-25%" y="-25%" width="150%" height="150%">
      <feGaussianBlur stdDeviation="5" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <rect width="1000" height="500" class="bg-rect" />
  <g class="char-a"><text x="435" y="250" class="real-letter">A</text></g>
  <g class="char-c"><text x="555" y="250" class="real-letter">C</text></g>
  <g class="char-e"><text x="670" y="250" class="real-letter">E</text></g>
  <g class="p-icon" transform-origin="500 250">
    <path d="M 452 198 L 478 186 L 478 310 L 452 322 Z" fill="url(#emerald)" filter="url(#glow)" />
    <path d="M 488 186 L 516 186 A 38 38 0 0 1 554 224 A 38 38 0 0 1 516 262 L 488 262 L 488 238 L 514 238 A 14 14 0 0 0 528 224 A 14 14 0 0 0 514 210 L 488 210 Z" fill="url(#platinum)" />
  </g>
</svg>`;

/**
 * Exact geometric paths from the SVG:
 * - Stem: Emerald slit stem, exact 120px cap height (y=190 to y=310, points 186 to 322)
 * - Bowl: Platinum geometric P-bowl with 10px razor slit
 */
export const LOGO_PATHS = {
  stem: 'M 452 198 L 478 186 L 478 310 L 452 322 Z',
  bowl: 'M 488 186 L 516 186 A 38 38 0 0 1 554 224 A 38 38 0 0 1 516 262 L 488 262 L 488 238 L 514 238 A 14 14 0 0 0 528 224 A 14 14 0 0 0 514 210 L 488 210 Z',
} as const;

export const LOGO_COLORS = {
  carbonBg: '#0B0D11',
  emeraldGradient: ['#6EE7B7', '#10E896', '#059669'],
  platinumGradient: ['#F8F9FA', '#F1F5F9', '#94A3B8'],
  emeraldGlow: 'rgba(16, 232, 150, 0.45)',
  emeraldGlowSoft: 'rgba(16, 232, 150, 0.15)',
} as const;
