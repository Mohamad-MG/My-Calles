import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cssPath = path.join(__dirname, 'styles.css');

let css = fs.readFileSync(cssPath, 'utf8');

// 1. Inject Easing Tokens into the main :root (around line 10)
const easingTokens = `
  /* Easing & Motion — 2028 Premium Optics */
  --ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.15);
  --ease-out:    cubic-bezier(0.25, 1, 0.5, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --duration-fast: 150ms;
  --duration-normal: 250ms;`;

if (!css.includes('--ease-spring')) {
  css = css.replace(/(--shadow-luster:.*?;)/, `$1\n${easingTokens}`);
}

// 2. Eradicate 'transition: all' globally
let replaceCount = 0;
css = css.replace(/transition:\s*all\s+([^;]+);/g, (match, timing) => {
    replaceCount++;
    let newTiming = timing;
    if (timing.includes('120ms') || timing.includes('0.1s') || timing.includes('0.15s')) {
       newTiming = 'var(--duration-fast) var(--ease-out)';
    } else if (timing.includes('0.2s') || timing.includes('0.25s') || timing.includes('200ms')) {
       newTiming = 'var(--duration-normal) var(--ease-spring)';
    }
    return `transition: transform ${newTiming}, opacity ${newTiming}, background-color ${newTiming}, border-color ${newTiming}, box-shadow ${newTiming}, color ${newTiming};`;
});

// 3. Optimize the app-shell
css = css.replace('.app-shell { opacity: 0; transition: opacity 0.28s ease; }', '.app-shell { opacity: 0; transition: opacity var(--duration-normal) var(--ease-out); will-change: opacity; }');

// 4. Implement deep lazy rendering base classes (2028 standard)
if (!css.includes('.lazy-container')) {
    css += `\n\n/* ══════════════════════════════════════════════════════════════\n   2028 LAZY RENDERING SYSTEM\n══════════════════════════════════════════════════════════════ */\n.lazy-container {\n  content-visibility: auto;\n  contain-intrinsic-size: 1px 500px;\n}\n\n.hardware-accelerated {\n  transform: translateZ(0);\n  will-change: transform, opacity;\n}\n`;
}

// 5. Upgrade Heavy Backdrop Filters for mobile to use generic opacity scaling instead of full composite
// Rather than fully changing logic, we ensure that backdrop filter heavy layers use will-change
css = css.replace(/backdrop-filter:\s*blur\(/g, 'will-change: backdrop-filter;\n  backdrop-filter: blur(');


fs.writeFileSync(cssPath, css, 'utf8');
console.log(`✅ [2028 Style Upgrade] Successfully upgraded styles.css.`);
console.log(`✅ Replaced ${replaceCount} instances of 'transition: all' with scoped, GPU-accelerated transitions.`);
