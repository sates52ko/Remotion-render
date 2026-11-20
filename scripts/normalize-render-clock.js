#!/usr/bin/env node
// Explicit repair for encoded frames with concat timestamp gaps. No scene edits,
// video re-encoding, validation bypass, or automatic deletion of evidence.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const args = Object.fromEntries(process.argv.slice(2).map(a => a.slice(2).split(/=(.*)/s).slice(0, 2)));
const fps = Number(args.fps), frames = Number(args.frames);
const video = path.resolve(args.video || ''), audio = path.resolve(args.audio || ''), output = path.resolve(args.out || '');
if (!args.video || !args.audio || !args.out || video === output || !Number.isFinite(fps) || fps <= 0 || !Number.isInteger(frames) || frames <= 0) throw Error('Usage: --video=<mp4> --audio=<full-master.m4a> --out=<different.mp4> --fps=<fps> --frames=<count>');
if (!fs.existsSync(video) || !fs.existsSync(audio)) throw Error('Missing video or full mastered audio');
const run = (program, argv) => execFileSync(program, argv, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const probe = file => JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,nb_frames,duration:format=duration', '-of', 'json', file]));
const source = probe(video).streams.find(s => s.codec_type === 'video');
if (Number(source?.nb_frames) !== frames) throw Error('Frame count mismatch; clock repair cannot restore missing frames');
const clockVideo = output + '.video-clock.mp4';
run('ffmpeg', ['-y', '-v', 'error', '-i', video, '-map', '0:v:0', '-an', '-c:v', 'copy', '-bsf:v', `setts=dts=STARTDTS+N/(${fps}*TB):pts=PTS-DTS+STARTDTS+N/(${fps}*TB):duration=1/(${fps}*TB)`, clockVideo]);
run('ffmpeg', ['-y', '-v', 'error', '-i', clockVideo, '-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', '-t', String(frames / fps), '-movflags', '+faststart', output]);
const result = probe(output), stream = result.streams.find(s => s.codec_type === 'video');
if (Number(stream?.nb_frames) !== frames || Math.abs(Number(stream.duration) - frames / fps) > 1 / fps || Math.abs(Number(result.format.duration) - frames / fps) > 0.2) throw Error('Normalized timing verification failed');
for (const seek of [['-t', '6'], ['-sseof', '-6']]) run('ffmpeg', ['-v', 'error', ...seek, '-i', output, '-f', 'null', '-']);
const report = { video, audio, output, fps, frames, duration: Number(result.format.duration), verified: true, videoReencoded: false, productionApproved: false };
fs.writeFileSync(output + '.timing-report.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
