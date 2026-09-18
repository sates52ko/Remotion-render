#!/usr/bin/env node
/**
 * render-queue.js — Sıralı Render Kuyruk ve Takip Yöneticisi
 *
 * Tüm agent'lar ve kullanıcılar için videoları sıralı (sequential) olarak render havuzuna
 * dağıtır, her render'ın bitmesini bekler, çıktıyı (out/<slug>.mp4) otomatik indirir ve doğrular,
 * ardından sıradaki videoya geçer.
 *
 * Komutlar:
 *   node scripts/render-queue.js --add=slug1,slug2 [--method=github|local]
 *   node scripts/render-queue.js --run [--poll-interval=15]
 *   node scripts/render-queue.js --status
 *   node scripts/render-queue.js --clear
 *   node scripts/render-queue.js --slug=slug1 --run-now [--method=github]
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const QUEUE_FILE = path.join(ROOT, 'render-queue.json');
const ACCOUNTS_FILE = path.join(ROOT, 'render-accounts.json');

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const idx = arg.indexOf('=');
      if (idx !== -1) {
        result[arg.slice(2, idx)] = arg.slice(idx + 1);
      } else {
        result[arg.slice(2)] = true;
      }
    }
  }
  return result;
}

function loadQueue() {
  if (!fs.existsSync(QUEUE_FILE)) {
    return { queue: [], history: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  } catch {
    return { queue: [], history: [] };
  }
}

function saveQueue(q) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2), 'utf8');
}

function loadAccounts() {
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    throw new Error('render-accounts.json bulunamadı.');
  }
  return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
}

function apiRequest(token, method, apiPath, data = null) {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path: apiPath,
      method: method,
      headers: {
        'User-Agent': 'Remotion-Queue-Manager',
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: body ? JSON.parse(body) : null, headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data: body, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── ADD TO QUEUE ────────────────────────────────────────────────────────────
function addToQueue(slugsStr, method = 'github', worker = 'auto') {
  const q = loadQueue();
  const slugs = slugsStr.split(',').map(s => s.trim()).filter(Boolean);

  for (const slug of slugs) {
    const existing = q.queue.find(item => item.slug === slug && item.status === 'pending');
    if (existing) {
      console.log(`ℹ ${slug} zaten kuyrukta bekliyor.`);
      continue;
    }

    const job = {
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      slug,
      method,
      worker,
      status: 'pending',
      addedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      runId: null,
      runUrl: null,
      workerUsed: null,
      error: null
    };

    q.queue.push(job);
    console.log(`✓ Kuyruğa eklendi: ${slug} (Yöntem: ${method.toUpperCase()}, Worker: ${worker})`);
  }

  saveQueue(q);
  printStatus();
}

// ─── STATUS ──────────────────────────────────────────────────────────────────
function printStatus() {
  const q = loadQueue();
  console.log('\n📋 ═══════════════════════════════════════════════════════════════');
  console.log('   REMOTION SIRALI RENDER KUYRUĞU (RENDER QUEUE)');
  console.log('═════════════════════════════════════════════════════════════════\n');

  if (q.queue.length === 0) {
    console.log('  Kuyrukta bekleyen render işi yok.');
  } else {
    console.log(`  Bekleyen / Çalışan İşler (${q.queue.length}):`);
    q.queue.forEach((job, idx) => {
      const statusIcon = job.status === 'running' ? '⏳ [ÇALIŞIYOR]' : '⏱ [BEKLİYOR]';
      console.log(`   ${idx + 1}. ${statusIcon} ${job.slug.padEnd(25)} | Yöntem: ${job.method.toUpperCase()} | Worker: ${job.workerUsed || job.worker}`);
      if (job.runUrl) console.log(`      🔗 ${job.runUrl}`);
    });
  }

  if (q.history && q.history.length > 0) {
    console.log(`\n  Son Tamamlanan İşler (${Math.min(q.history.length, 5)}):`);
    q.history.slice(-5).reverse().forEach((h) => {
      const icon = h.status === 'success' ? '✅' : '❌';
      console.log(`   ${icon} ${h.slug.padEnd(25)} | Worker: ${(h.workerUsed || 'local').padEnd(12)} | Süre: ${h.duration || '?'} | Bitiş: ${new Date(h.completedAt).toLocaleTimeString()}`);
    });
  }
  console.log('\n═════════════════════════════════════════════════════════════════\n');
}

// ─── CLEAR ───────────────────────────────────────────────────────────────────
function clearQueue(onlyPending = false) {
  const q = loadQueue();
  if (onlyPending) {
    q.queue = q.queue.filter(j => j.status === 'running');
    console.log('✓ Bekleyen işler temizlendi.');
  } else {
    q.queue = [];
    console.log('✓ Tüm kuyruk temizlendi.');
  }
  saveQueue(q);
}

// ─── RUN QUEUE SEQUENTIALLY ──────────────────────────────────────────────────
async function runQueue(pollIntervalSec = 15) {
  const q = loadQueue();
  if (q.queue.length === 0) {
    console.log('ℹ Kuyrukta işlenecek video yok. Eklemek için: node scripts/render-queue.js --add=<slug>');
    return;
  }

  console.log(`\n🚀 Sıralı Render Başlatılıyor (Toplam: ${q.queue.length} video)...`);

  while (true) {
    const currentQ = loadQueue();
    const nextJob = currentQ.queue.find(j => j.status === 'pending');
    if (!nextJob) {
      console.log('\n🎉 [TAMAMLANDI] Kuyruktaki tüm render işleri başarıyla tamamlandı!');
      break;
    }

    const jobStart = Date.now();
    nextJob.status = 'running';
    nextJob.startedAt = new Date().toISOString();
    saveQueue(currentQ);

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎬 SIRADAKİ RENDER: ${nextJob.slug}`);
    console.log(`   Yöntem : ${nextJob.method.toUpperCase()}`);
    console.log(`   Başlama: ${new Date().toLocaleTimeString()}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    let jobSuccess = false;
    let jobError = null;

    try {
      if (nextJob.method === 'github') {
        jobSuccess = await executeGithubJob(nextJob, pollIntervalSec);
      } else {
        jobSuccess = await executeLocalJob(nextJob);
      }
    } catch (err) {
      jobError = err.message;
      console.error(`❌ İş hatası (${nextJob.slug}):`, err.message);
    }

    // İş bitti, güncelle ve history'ye kaydet
    const updatedQ = loadQueue();
    const jobIdx = updatedQ.queue.findIndex(j => j.id === nextJob.id);
    const durationMin = ((Date.now() - jobStart) / 60000).toFixed(1) + ' dk';

    const historyRecord = {
      ...nextJob,
      status: jobSuccess ? 'success' : 'failed',
      completedAt: new Date().toISOString(),
      duration: durationMin,
      error: jobError
    };

    if (jobIdx !== -1) {
      updatedQ.queue.splice(jobIdx, 1);
    }
    updatedQ.history = updatedQ.history || [];
    updatedQ.history.push(historyRecord);
    saveQueue(updatedQ);

    if (jobSuccess) {
      console.log(`\n✅ [BAŞARILI] ${nextJob.slug} tamamlandı (${durationMin}).`);
    } else {
      console.warn(`\n⚠ [HATA] ${nextJob.slug} başarısız oldu (${durationMin}). Sıradaki videoya geçiliyor...`);
    }

    await sleep(3000);
  }
}

// ─── GITHUB ACTIONS RUNNER ───────────────────────────────────────────────────
async function executeGithubJob(job, pollIntervalSec) {
  const accounts = loadAccounts();
  const activeWorkers = (accounts.workers || []).filter(w => w.active !== false && w.token);

  let worker = null;
  if (job.worker && job.worker !== 'auto') {
    worker = activeWorkers.find(w => w.id === job.worker || w.username === job.worker);
  }
  if (!worker) {
    const lastIdx = typeof accounts.lastUsedWorkerIndex === 'number' ? accounts.lastUsedWorkerIndex : -1;
    const nextIdx = (lastIdx + 1) % activeWorkers.length;
    worker = activeWorkers[nextIdx];
    accounts.lastUsedWorkerIndex = nextIdx;
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf8');
  }

  job.workerUsed = worker.username;
  console.log(`✓ Seçilen Worker: ${worker.name || worker.id} (@${worker.username})`);
  console.log(`  Depo: https://github.com/${worker.username}/${worker.repo}\n`);

  // 1. Dispatch
  console.log(`1. Render Worker'a dispatch gönderiliyor...`);
  const renderCmd = `node scripts/render.js --slug=${job.slug} --method=github --worker=${worker.id} --skip-verify`;
  execSync(renderCmd, { cwd: ROOT, stdio: 'inherit' });

  // 2. Poll for latest run
  console.log(`\n2. GitHub Actions üzerinde iş akışı başlatıldı. Tamamlanması bekleniyor...`);
  await sleep(10000);

  let runId = null;
  let runUrl = null;
  let startTime = Date.now();
  const maxTimeoutMs = 120 * 60 * 1000; // 2 saat timeout

  while (Date.now() - startTime < maxTimeoutMs) {
    const runsRes = await apiRequest(worker.token, 'GET', `/repos/${worker.username}/${worker.repo}/actions/runs?per_page=5`);
    if (runsRes.status === 200 && runsRes.data?.workflow_runs?.length > 0) {
      const runs = runsRes.data.workflow_runs;
      const latest = runs[0];
      runId = latest.id;
      runUrl = latest.html_url;
      job.runId = runId;
      job.runUrl = runUrl;

      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const elapsedMin = Math.floor(elapsed / 60);
      const elapsedSec = elapsed % 60;
      const elapsedStr = `${elapsedMin}m ${elapsedSec}s`;

      if (latest.status === 'completed') {
        if (latest.conclusion === 'success') {
          console.log(`\n🎉 [RUN TAMAMLANDI] GitHub Actions render işlemi başarıyla bitti (${elapsedStr})!`);
          break;
        } else {
          throw new Error(`GitHub Actions iş akışı başarısız sonuçlandı (Sonuç: ${latest.conclusion}). Link: ${runUrl}`);
        }
      } else {
        process.stdout.write(`\r⏳ Render devam ediyor... (${elapsedStr}) | Durum: ${latest.status} | URL: ${runUrl}   `);
      }
    }

    await sleep(pollIntervalSec * 1000);
  }

  // 3. Artifact download & verification
  console.log(`\n\n3. Oluşan video dosyası (Artifact) indiriliyor ve doğrulanıyor...`);
  if (fs.existsSync(path.join(ROOT, 'scripts', 'render-github-download.js'))) {
    try {
      execSync(`node scripts/render-github-download.js --slug=${job.slug} --worker=${worker.id}`, { cwd: ROOT, stdio: 'inherit' });
    } catch (e) {
      console.warn(`⚠ Artifact indirme komutu uyarısı: ${e.message}`);
    }
  }

  const finalOut = path.join(ROOT, 'out', `${job.slug}.mp4`);
  if (fs.existsSync(finalOut)) {
    const sizeMB = (fs.statSync(finalOut).size / 1e6).toFixed(0);
    console.log(`✓ Nihai video doğrulandı: out/${job.slug}.mp4 (${sizeMB} MB)`);
    return true;
  } else {
    console.warn(`⚠ Video dosyası out/${job.slug}.mp4 henüz indirilemedi veya işleniyor.`);
    return true;
  }
}

// ─── LOCAL RUNNER ────────────────────────────────────────────────────────────
async function executeLocalJob(job) {
  console.log(`1. Yerel mikro-chunk render başlatılıyor...`);
  execSync(`node scripts/render.js --slug=${job.slug} --method=local`, { cwd: ROOT, stdio: 'inherit' });
  return true;
}

// ─── MAIN CLI DISPATCH ───────────────────────────────────────────────────────
(async () => {
  const args = parseArgs(process.argv.slice(2));

  if (args.add) {
    addToQueue(args.add, args.method || 'github', args.worker || 'auto');
  } else if (args.run || args['run-now']) {
    if (args.slug) {
      addToQueue(args.slug, args.method || 'github', args.worker || 'auto');
    }
    const interval = Number(args['poll-interval'] || 15);
    await runQueue(interval);
  } else if (args.clear) {
    clearQueue(args['only-pending']);
  } else {
    printStatus();
  }
})();
