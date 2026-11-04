#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// 🎬 Film Mode Pipeline — One-Command Video Production
// Usage: node scripts/pipeline.js --config=configs/the-day-i-lost-you.json
//        node scripts/pipeline.js --config=configs/the-day-i-lost-you.json --step=prompts
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Parse CLI arguments
const args = {};
process.argv.slice(2).forEach(arg => {
    const [key, value] = arg.replace('--', '').split('=');
    args[key] = value;
});

const configPath = args['config'];
const stepOnly = args['step']; // optional: 'prompts', 'production', 'render'

if (!configPath) {
    console.log('🎬 Film Mode Pipeline');
    console.log('Usage: node scripts/pipeline.js --config=configs/book.json [--step=prompts|production|render]');
    console.log('\nConfig JSON format:');
    console.log(JSON.stringify({
        compositionId: 'The-Day-I-Lost-You',
        title: 'The Day I Lost You',
        author: 'Ruth Mancini',
        genre: 'drama',
        audioFile: 'audio/The_Day_I_Lost_You.m4a',
        vttFile: 'captions/captions.vtt',
        introVideo: 'intros/intro.mp4',
        sceneFolder: 'scenes',
        sceneCount: 50,
        channelName: 'BookInsights',
        accentColor: '#e53e3e',
    }, null, 2));
    process.exit(1);
}

// Load config
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const projectRoot = path.resolve(__dirname, '..');

console.log('\n🎬 ═══════════════════════════════════════════');
console.log(`   Film Mode Pipeline`);
console.log(`   "${config.title}" by ${config.author}`);
console.log('═══════════════════════════════════════════════\n');

// ── Step 1: Generate Prompts ──────────────────────────────────
function generatePrompts() {
    console.log('📝 Step 1: Generating B-roll quality scene prompts...');
    const vttPath = path.join(projectRoot, 'public', config.vttFile);
    const outputPath = path.join(projectRoot, 'scene-prompts.txt');

    if (!fs.existsSync(vttPath)) {
        console.error(`❌ VTT file not found: ${vttPath}`);
        process.exit(1);
    }

    const srtArg = config.vttFile ? `--srt="public/${config.vttFile}"` : '';
    const promptCmd = `node "${path.join(projectRoot, 'generate-prompts-from-srt.js')}" ${srtArg} --scenes=${config.sceneCount || 50} --genre=${config.genre || 'drama'} --title="${config.title}"`;
    console.log(`   Running: ${promptCmd}\n`);
    execSync(promptCmd, { stdio: 'inherit', cwd: projectRoot });
    console.log('\n✅ Prompts generated!\n');
}

// ── Step 2: Generate Production JSON ──────────────────────────
function generateProductionJSON() {
    console.log('📋 Step 2: Generating production JSON...');

    // Read scene metadata if available
    const sceneMetaPath = path.join(projectRoot, 'scene-prompts.json');
    let sceneMeta = null;
    if (fs.existsSync(sceneMetaPath)) {
        sceneMeta = JSON.parse(fs.readFileSync(sceneMetaPath, 'utf-8'));
    }

    // Read VTT content
    const vttPath = path.join(projectRoot, 'public', config.vttFile);
    const srtContent = fs.readFileSync(vttPath, 'utf-8');

    const sceneCount = config.sceneCount || 50;
    const totalDuration = sceneMeta?.totalDuration || 300;
    const sceneDuration = totalDuration / sceneCount;

    // Generate scene config
    const scenes = [];
    for (let i = 0; i < sceneCount; i++) {
        const startTime = i * sceneDuration;
        const endTime = (i + 1) * sceneDuration;
        const imagePath = `${config.sceneFolder || 'scenes'}/scene-${String(i).padStart(2, '0')}.png`;

        const meta = sceneMeta?.scenes?.[i] || {};

        scenes.push({
            id: `scene-${String(i).padStart(2, '0')}`,
            startTime: parseFloat(startTime.toFixed(2)),
            endTime: parseFloat(endTime.toFixed(2)),
            assets: [{
                type: 'image',
                path: imagePath,
                position: { x: 50, y: 50 },
                scale: 1.1 + Math.random() * 0.2,
                opacity: 1.0,
                zIndex: 1,
            }],
            animations: [{
                type: getAnimation(i, meta.mood),
                easing: 'ease-in-out',
                params: {},
            }],
            transition: {
                type: getTransition(i),
                duration: 0.8 + Math.random() * 0.7,
                easing: 'ease-out',
            },
            colorGrade: {
                brightness: 0.95 + Math.random() * 0.2,
                contrast: 1.0 + Math.random() * 0.15,
                saturation: 0.95 + Math.random() * 0.2,
                temperature: meta.mood === 'negative' ? 'cool' : meta.mood === 'positive' ? 'warm' : 'neutral',
            },
            filmGrain: { enabled: true, amount: 0.12 + Math.random() * 0.08 },
            vignette: { enabled: i % 2 === 0, intensity: 0.3 + Math.random() * 0.15 },
        });
    }

    const production = {
        compositionId: config.compositionId,
        title: config.title,
        author: config.author,
        genre: config.genre,
        audioFile: config.audioFile,
        captionContent: srtContent,
        chapterCards: sceneMeta?.chapterCards || [],
        typewriterQuotes: sceneMeta?.typewriterQuotes || [],
        channelName: config.channelName || '',
        letterbox: config.letterbox !== false,
        sceneConfig: {
            scenes,
            defaultTransition: { type: 'crossfade', duration: 1.0 },
            fps: 24,
            globalFilmGrain: true,
            globalVignette: false,
            cinematicBars: true,
        },
    };

    const outputPath = path.join(projectRoot, 'src', 'data', `production-${config.compositionId.toLowerCase()}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(production, null, 2), 'utf-8');
    console.log(`✅ Production JSON saved to: ${outputPath}\n`);
    return outputPath;
}

// ── Step 3: Render ────────────────────────────────────────────
function renderVideo() {
    console.log('🎬 Step 3: Rendering video...');
    const outputPath = path.join(projectRoot, 'out', `${config.compositionId.toLowerCase()}.mp4`);
    const cmd = `npx remotion render "${config.compositionId}" "${outputPath}" --codec=h264 --concurrency=3 --force`;
    console.log(`   Running: ${cmd}\n`);
    execSync(cmd, { stdio: 'inherit', cwd: projectRoot });
    console.log(`\n✅ Video rendered: ${outputPath}\n`);
}

// ── Helpers ───────────────────────────────────────────────────
const ANIMATIONS = ['kenburns', 'dolly', 'parallax', 'zoom', 'slide', 'spotlight', 'fade', 'panDrift', 'panFloat', 'panGlide', 'zoomPan', 'breathingFocus', 'cinematicPan', 'glideIn', 'pullBack', 'gentleRock', 'tiltDrift', 'horizonShift', 'breatheAndPan'];
const TRANSITIONS = ['crossfade', 'blur', 'zoom', 'lightLeak', 'radialBlur', 'whiteFlash', 'filmBurn', 'inkBleed', 'circleWipe', 'slide', 'wipe', 'colorShift'];

function getAnimation(index, mood) {
    if (mood === 'tension') return ['whipPan', 'rackFocus', 'quake', 'zoomSnap'][index % 4];
    if (mood === 'negative') return ['fade', 'pullBack', 'sinkDown', 'breathingFocus'][index % 4];
    if (mood === 'reflection') return ['kenburns', 'dolly', 'panFloat', 'gentleRock'][index % 4];
    return ANIMATIONS[index % ANIMATIONS.length];
}

function getTransition(index) {
    return TRANSITIONS[index % TRANSITIONS.length];
}

// ── Execute ───────────────────────────────────────────────────
if (!stepOnly || stepOnly === 'prompts') generatePrompts();
if (!stepOnly || stepOnly === 'production') generateProductionJSON();
if (!stepOnly || stepOnly === 'render') {
    if (stepOnly === 'render') {
        renderVideo();
    } else {
        console.log('📌 To render, run: node scripts/pipeline.js --config=' + configPath + ' --step=render');
        console.log('   Or manually: npx remotion render ' + config.compositionId + ' out/' + config.compositionId.toLowerCase() + '.mp4 --codec=h264 --concurrency=3');
    }
}

console.log('\n🎬 Pipeline complete!\n');
