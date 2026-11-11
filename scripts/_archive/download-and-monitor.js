#!/usr/bin/env node
/**
 * download-and-monitor.js
 * Continuously monitors render workers on GitHub Actions, streams artifacts
 * directly to disk for completed segments, extracts and verifies them, and once all
 * segments are ready, triggers assembly into out/<slug>.mp4.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync, execSync } = require('child_process');
const { ROOT, loadAccounts, parseArgs, walk } = require('./lib/render-pool');

const args = parseArgs(process.argv.slice(2));
const SLUG = args.slug || 'frederick-douglass-prophet-of-freedom';

const stateFile = path.join(ROOT, `.render-github-split.${SLUG}.json`);
if (!fs.existsSync(stateFile)) {
  console.error(`State file not found: ${stateFile}`);
  process.exit(1);
}
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const acc = loadAccounts();
const tmpRoot = path.join(ROOT, 'out', `gh-asm-${SLUG}`);
if (!fs.existsSync(tmpRoot)) fs.mkdirSync(tmpRoot, { recursive: true });

function verifyMp4(f) {
  if (!fs.existsSync(f)) return { ok: false, dur: 0 };
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' });
  const dur = parseFloat((probe.stdout || '').trim());
  if (!Number.isFinite(dur) || dur <= 0.1) return { ok: false, dur: 0 };
  const dec = spawnSync('ffmpeg', ['-v', 'error', '-t', '5', '-i', f, '-f', 'null', '-'], { encoding: 'utf8' });
  return { ok: dec.status === 0, dur };
}

function fetchJson(url, token) {
  return new Promise(resolve => {
    https.get(url, {
      headers: {
        'User-Agent': 'Node-Monitor',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        Accept: 'application/vnd.github.v3+json'
      }
    }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        try { resolve(JSON.parse(b)); } catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

function streamFile(url, token, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Node-Monitor',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        Accept: 'application/vnd.github.v3+json'
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        streamFile(res.headers.location, null, destPath).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      const file = fs.createWriteStream(destPath);
      let downloaded = 0;
      let lastMb = 0;
      res.on('data', chunk => {
        downloaded += chunk.length;
        const curMb = Math.floor(downloaded / (10 * 1024 * 1024));
        if (curMb > lastMb) {
          lastMb = curMb;
          process.stdout.write(`  [${path.basename(destPath)}] ${(downloaded / 1024 / 1024).toFixed(1)} / ${(total / 1024 / 1024).toFixed(1)} MB\r`);
        }
      });
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(downloaded);
      });
      file.on('error', err => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }).on('error', reject);
  });
}

const downloading = new Set();

async function downloadSegment(sg, worker) {
  if (downloading.has(sg.seg)) return;
  downloading.add(sg.seg);

  const segDir = path.join(tmpRoot, `seg${sg.seg}`);
  if (!fs.existsSync(segDir)) fs.mkdirSync(segDir, { recursive: true });

  const existingMp4 = walk(segDir).find(f => f.toLowerCase().endsWith('.mp4'));
  if (existingMp4 && verifyMp4(existingMp4).ok) {
    downloading.delete(sg.seg);
    return;
  }

  try {
    const runsData = await fetchJson(`https://api.github.com/repos/${sg.username}/${worker.repo}/actions/workflows/render-video.yml/runs?event=workflow_dispatch&per_page=5`, worker.token);
    const runs = (runsData && runsData.workflow_runs) || [];
    const doneRun = runs.find(r => r.status === 'completed' && r.conclusion === 'success');
    if (!doneRun) {
      downloading.delete(sg.seg);
      return;
    }

    const artsData = await fetchJson(`https://api.github.com/repos/${sg.username}/${worker.repo}/actions/runs/${doneRun.id}/artifacts`, worker.token);
    const arts = (artsData && artsData.artifacts) || [];
    const art = arts.find(a => a.name === `video-${SLUG}-seg${sg.seg}`);
    if (!art) {
      console.log(`\nSeg ${sg.seg}: Artifact video-${SLUG}-seg${sg.seg} not found in run ${doneRun.id}`);
      downloading.delete(sg.seg);
      return;
    }

    console.log(`\n⬇ Downloading Seg ${sg.seg} artifact (${(art.size_in_bytes / 1024 / 1024).toFixed(1)} MB)...`);
    const zipPath = path.join(segDir, `seg${sg.seg}.zip`);
    await streamFile(art.archive_download_url, worker.token, zipPath);
    console.log(`\n  Unpacking Seg ${sg.seg}...`);

    spawnSync('tar', ['-xf', zipPath, '-C', segDir]);
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

    const mp4 = walk(segDir).find(f => f.toLowerCase().endsWith('.mp4'));
    if (mp4) {
      const v = verifyMp4(mp4);
      if (v.ok) {
        console.log(`  ✓ Seg ${sg.seg} verified (${(v.dur / 60).toFixed(1)}m)`);
      } else {
        console.error(`  ❌ Seg ${sg.seg} corrupted decode!`);
      }
    } else {
      console.error(`  ❌ Seg ${sg.seg} no mp4 found in artifact zip!`);
    }
  } catch (err) {
    console.error(`\nSeg ${sg.seg} download failed:`, err.message);
  } finally {
    downloading.delete(sg.seg);
  }
}

async function loop() {
  console.log(`\n=== Monitoring & Downloading [${SLUG}] ===\n`);

  while (true) {
    let allDownloaded = true;
    let anyRunning = false;
    const table = [];

    for (const sg of state.segments) {
      const worker = acc.workers.find(w => w.username === sg.username);
      const segDir = path.join(tmpRoot, `seg${sg.seg}`);
      const mp4 = fs.existsSync(segDir) ? walk(segDir).find(f => f.toLowerCase().endsWith('.mp4')) : null;
      const isDownloaded = mp4 && verifyMp4(mp4).ok;

      // Check run status
      const runsData = await fetchJson(`https://api.github.com/repos/${sg.username}/${worker.repo}/actions/workflows/render-video.yml/runs?event=workflow_dispatch&per_page=1`, worker.token);
      const run = (runsData && runsData.workflow_runs && runsData.workflow_runs[0]) || null;
      const renderStatus = run ? (run.status === 'completed' ? (run.conclusion === 'success' ? '✅ SUCCESS' : '❌ ' + run.conclusion) : '⏳ ' + run.status) : 'unknown';

      if (renderStatus.includes('in_progress')) anyRunning = true;
      if (!isDownloaded) allDownloaded = false;

      table.push({
        seg: sg.seg,
        frames: `${sg.start}-${sg.end}`,
        worker: sg.username,
        render: renderStatus,
        disk: isDownloaded ? '✅ READY' : (downloading.has(sg.seg) ? '⬇ DOWNLOADING' : '⏳ PENDING')
      });

      // Trigger download if ready and not yet downloaded (limit concurrency to 2)
      if (run && run.status === 'completed' && run.conclusion === 'success' && !isDownloaded && !downloading.has(sg.seg) && downloading.size < 2) {
        downloadSegment(sg, worker);
      }
    }

    console.log(`\n=== Pool Status [${SLUG}] — ${new Date().toLocaleTimeString()} ===\n`);
    console.table(table);

    if (allDownloaded) {
      console.log('\n🎉 ALL 10 SEGMENTS DOWNLOADED & VERIFIED! Assembling final video...');
      execSync(`node scripts/render-github-assemble.js --slug=${SLUG}`, { stdio: 'inherit', cwd: ROOT });
      console.log('\n⚠️ Cleanup is NOT performed automatically. Do NOT run cleanup until operator explicitly requests it.');
      console.log('\n✅ ALL COMPLETE!');
      process.exit(0);
    }

    await new Promise(r => setTimeout(r, 20000));
  }
}

loop();
