import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import path from 'path';
import fs from 'fs';

const scenesToRender = [
  { id: 'scene-151', frame: 41392 },
  { id: 'scene-262', frame: 71849 },
  { id: 'scene-217', frame: 59260 },
  { id: 'scene-221', frame: 60566 },
  { id: 'scene-195', frame: 53063 },
  { id: 'scene-184', frame: 49823 },
  { id: 'scene-37',  frame: 10340 },
  { id: 'scene-152', frame: 41692 },
  { id: 'scene-236', frame: 65012 },
  { id: 'scene-271', frame: 74359 },
];

const outDir = path.resolve('audit/p1.5-stills/republic');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function main() {
  console.log('--- Step 1: Bundling Antidote entry point once ---');
  const bundleStartTime = Date.now();
  const serveUrl = await bundle(path.resolve('src/index.ts'), (progress) => {
    if (progress % 20 === 0) console.log('Bundle progress: ' + progress + '%');
  });
  console.log('Bundle completed in ' + ((Date.now() - bundleStartTime) / 1000).toFixed(1) + 's: ' + serveUrl);

  console.log('--- Step 2: Selecting composition Antidote-the-republic ---');
  const composition = await selectComposition({
    serveUrl,
    id: 'Antidote-the-republic',
  });
  console.log('Composition loaded: ' + composition.id);

  console.log('--- Step 3: Rendering scene stills ---');
  for (const s of scenesToRender) {
    const outFile = path.join(outDir, s.id + '.png');
    if (fs.existsSync(outFile) && fs.statSync(outFile).size > 10000) {
      console.log('[SKIP] ' + s.id + ' already rendered (' + outFile + ')');
      continue;
    }
    const t0 = Date.now();
    console.log('[RENDERING] ' + s.id + ' at frame ' + s.frame + ' -> ' + outFile + '...');
    await renderStill({
      composition,
      serveUrl,
      output: outFile,
      frame: s.frame,
    });
    console.log('[DONE] ' + s.id + ' rendered in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }

  console.log('All stills rendered successfully!');
}

main().catch((err) => {
  console.error('Render error:', err);
  process.exit(1);
});
