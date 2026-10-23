/**
 * dispatch-lotf-render.mjs
 * Lord of the Flies render'ını tüm worker hesaplara dağıtır.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const accounts = JSON.parse(fs.readFileSync(path.join(ROOT, 'render-accounts.json'), 'utf8'));
const workers = accounts.workers.filter(w => w.active);

const SLUG = 'lord-of-the-flies';
const COMPOSITION = 'Antidote-lord-of-the-flies';
const CHUNK_SIZE = 400;
const CONCURRENCY = 2;

async function dispatchToWorker(worker) {
  const url = `https://api.github.com/repos/${worker.username}/Remotion-render/actions/workflows/render-video.yml/dispatches`;
  const body = {
    ref: 'main',
    inputs: {
      slug: SLUG,
      composition: COMPOSITION,
      chunk_size: String(CHUNK_SIZE),
      concurrency: String(CONCURRENCY),
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${worker.token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (res.status === 204) {
    console.log(`OK  ${worker.name} (${worker.username}): dispatched`);
    return { worker: worker.id, status: 'dispatched' };
  } else {
    const txt = await res.text();
    console.error(`ERR ${worker.name} (${worker.username}): FAILED ${res.status} -- ${txt}`);
    return { worker: worker.id, status: 'failed', error: txt, code: res.status };
  }
}

console.log(`\nLORD OF THE FLIES -- GitHub Actions Render Dispatch`);
console.log(`Slug: ${SLUG} | Composition: ${COMPOSITION}`);
console.log(`Workers: ${workers.length} | Chunk: ${CHUNK_SIZE} frames | Concurrency: ${CONCURRENCY}\n`);

const results = await Promise.all(workers.map(dispatchToWorker));

const ok = results.filter(r => r.status === 'dispatched').length;
const fail = results.filter(r => r.status === 'failed').length;

console.log(`\nSonuc: ${ok}/${workers.length} worker dispatch edildi, ${fail} basarisiz.`);
console.log(`\nWorkflow durumlari:`);
for (const w of workers) {
  console.log(`  https://github.com/${w.username}/Remotion-render/actions`);
}
