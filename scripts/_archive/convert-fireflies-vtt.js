const fs = require('fs');

const inPath = 'public/captions/captions.vtt';
const outPath = 'src/data/fireflies-vtt.ts';

try {
    const raw = fs.readFileSync(inPath, 'utf-8');
    const escaped = raw.replace(/`/g, '\\`').replace(/\$/g, '\\$');
    const tsContent = `export const firefliesVTT = \`${escaped}\`;\n`;
    fs.writeFileSync(outPath, tsContent);
    console.log("Successfully converted VTT to TS.");
} catch(e) {
    console.error("Error converting VTT to TS:", e);
}
