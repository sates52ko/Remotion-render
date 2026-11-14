/**
 * generate-sfx.js — Procedural PCM 16-bit 44.1kHz SFX generator.
 * Creates clean, deterministic audio effects for Antidote Audio Director:
 *   - pop.wav: Crisp kinetic text / motif pop
 *   - ding.wav: Harmonic crystal chime for payoff / revelation
 *   - thud.wav: Damped low cinematic impact for tension / contradiction
 */
const fs = require("fs");
const path = require("path");

function createWavBuffer(samples, sampleRate = 44100) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  // fmt chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // AudioFormat (PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write PCM 16-bit samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const intSample = s < 0 ? s * 0x8000 : s * 0x7FFF;
    buffer.writeInt16LE(Math.round(intSample), offset);
    offset += 2;
  }

  return buffer;
}

function generateDing() {
  const sampleRate = 44100;
  const duration = 1.2;
  const totalSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(totalSamples);

  const f0 = 1760;
  const f1 = 2640;
  const f2 = 3520;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const attack = Math.min(1, t / 0.003);
    const decay0 = Math.exp(-t * 3.5);
    const decay1 = Math.exp(-t * 5.0);
    const decay2 = Math.exp(-t * 7.0);

    const s =
      0.55 * Math.sin(2 * Math.PI * f0 * t) * decay0 +
      0.30 * Math.sin(2 * Math.PI * f1 * t) * decay1 +
      0.15 * Math.sin(2 * Math.PI * f2 * t) * decay2;

    samples[i] = s * attack * 0.7;
  }

  return createWavBuffer(samples, sampleRate);
}

function generateThud() {
  const sampleRate = 44100;
  const duration = 0.6;
  const totalSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const attack = Math.min(1, t / 0.005);
    const decay = Math.exp(-t * 9.0);
    const pitch = 45 + 75 * Math.exp(-t * 18.0);
    const phase = 2 * Math.PI * pitch * t;

    const body = Math.sin(phase) * decay;
    const click = (Math.random() * 2 - 1) * Math.exp(-t * 80.0) * 0.2;

    samples[i] = (body + click) * attack * 0.85;
  }

  return createWavBuffer(samples, sampleRate);
}

function generatePop() {
  const sampleRate = 44100;
  const duration = 0.12;
  const totalSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const attack = Math.min(1, t / 0.002);
    const decay = Math.exp(-t * 38.0);
    const pitch = 950 - 550 * Math.exp(-t * 45.0);
    const phase = 2 * Math.PI * pitch * t;

    samples[i] = Math.sin(phase) * decay * attack * 0.75;
  }

  return createWavBuffer(samples, sampleRate);
}

function ensureSfxAssets() {
  const sfxDir = path.resolve(__dirname, "../../public/sfx");
  if (!fs.existsSync(sfxDir)) {
    fs.mkdirSync(sfxDir, { recursive: true });
  }

  const dingPath = path.join(sfxDir, "ding.wav");
  const thudPath = path.join(sfxDir, "thud.wav");
  const popPath = path.join(sfxDir, "pop.wav");

  if (!fs.existsSync(dingPath)) {
    fs.writeFileSync(dingPath, generateDing());
    console.log("  ✓ Generated public/sfx/ding.wav");
  }

  if (!fs.existsSync(thudPath)) {
    fs.writeFileSync(thudPath, generateThud());
    console.log("  ✓ Generated public/sfx/thud.wav");
  }

  if (!fs.existsSync(popPath)) {
    fs.writeFileSync(popPath, generatePop());
    console.log("  ✓ Generated public/sfx/pop.wav");
  }
}

if (require.main === module) {
  ensureSfxAssets();
}

module.exports = {
  ensureSfxAssets,
  generateDing,
  generateThud,
  generatePop,
};
