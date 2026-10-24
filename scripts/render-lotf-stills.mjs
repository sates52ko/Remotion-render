import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import path from 'path';
import fs from 'fs';

const scenesToRender = [
  { id: 'scene-12', frame: 3539 },
  { id: 'scene-80', frame: 20635 },
  { id: 'scene-86', frame: 22133 },
  { id: 'scene-92', frame: 23895 },
  { id: 'scene-182', frame: 47966 },
  { id: 'scene-190', frame: 50036 },
];

const outDir = path.resolve('audit/p1.5-stills/lotf');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function main() {
  console.log('--- Bundling for LOTF ---');
  const serveUrl = await bundle(path.resolve('src/index.ts'));
  const composition = await selectComposition({
    serveUrl,
    id: 'Antidote-lord-of-the-flies',
  });
  console.log('Composition loaded:', composition.id);

  for (const s of scenesToRender) {
    const outFile = path.join(outDir, s.id + '.png');
    if (fs.existsSync(outFile) && fs.statSync(outFile).size > 10000) {
      console.log('[SKIP]', s.id);
      continue;
    }
    const t0 = Date.now();
    console.log('[RENDERING]', s.id, 'frame', s.frame);
    await renderStill({
      composition,
      serveUrl,
      output: outFile,
      frame: s.frame,
    });
    console.log('[DONE]', s.id, ((Date.now() - t0)/1000).toFixed(1) + 's');
  }
  console.log('Done rendering LOTF passed scenes!');
}

main().catch(err => { console.error(err); process.exit(1); });
