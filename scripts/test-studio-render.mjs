import { renderStill, selectComposition } from '@remotion/renderer';
import path from 'path';

async function test() {
  console.log('Testing selectComposition against localhost:3000...');
  const t0 = Date.now();
  const composition = await selectComposition({
    serveUrl: 'http://localhost:3000',
    id: 'Antidote-the-republic',
  });
  console.log('Got composition in ' + (Date.now() - t0) + 'ms:', composition.id);
  
  console.log('Rendering frame 71849 (scene-262)...');
  await renderStill({
    composition,
    serveUrl: 'http://localhost:3000',
    output: path.resolve('audit/p1.5-stills/republic/scene-262.png'),
    frame: 71849,
  });
  console.log('Successfully rendered scene-262 in ' + (Date.now() - t0) + 'ms!');
}

test().catch(e => console.error('Error:', e.message));
