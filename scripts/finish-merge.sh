#!/usr/bin/env bash
# Verify + fix + concat a local chunk render into out/<slug>.mp4
# Usage: bash scripts/finish-merge.sh <slug> <compositionId> <totalFrames> [chunkSize]
# Verifies each chunk (expected duration + full decode), re-renders corrupt ones,
# then ffmpeg concat -c copy. Guards against the silent-corruption bug where
# concat -c copy truncates at the first bad chunk with exit 0.
set -u
ROOT="C:/Users/savas/Cursor/Remotion/test"
cd "$ROOT" || exit 9

SLUG="$1"; COMP="$2"; TOTAL="$3"; CHUNK="${4:-400}"
DIR="out_${COMP}_chunks"
OUT="out/${SLUG}.mp4"
FPS=30
NCHUNKS=$(( (TOTAL + CHUNK - 1) / CHUNK ))

echo "=== finish-merge: $SLUG ($COMP) total=$TOTAL chunk=$CHUNK -> $NCHUNKS chunks ==="

verify_one() {  # $1=index -> echo OK / BAD
  local n="$1"
  local f; f=$(printf "%s/chunk-%04d.mp4" "$DIR" "$n")
  if [ ! -f "$f" ]; then echo "BAD"; return; fi
  local start=$(( (n-1)*CHUNK )); local end=$(( start+CHUNK-1 ))
  [ "$end" -gt $((TOTAL-1)) ] && end=$((TOTAL-1))
  local nframes=$(( end-start+1 ))
  local expdur; expdur=$(awk "BEGIN{printf \"%.3f\", $nframes/$FPS}")
  local dur; dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$f" 2>/dev/null)
  if [ -z "$dur" ]; then echo "BAD"; return; fi
  local diff; diff=$(awk "BEGIN{d=$dur-$expdur; if(d<0)d=-d; printf \"%.3f\", d}")
  if awk "BEGIN{exit !($diff>0.5)}"; then echo "BAD"; return; fi
  # full decode
  if ! ffmpeg -v error -xerror -i "$f" -f null - >/dev/null 2>&1; then echo "BAD"; return; fi
  echo "OK"
}

rerender_one() {  # $1=index
  local n="$1"
  local f; f=$(printf "%s/chunk-%04d.mp4" "$DIR" "$n")
  local start=$(( (n-1)*CHUNK )); local end=$(( start+CHUNK-1 ))
  [ "$end" -gt $((TOTAL-1)) ] && end=$((TOTAL-1))
  echo ">> re-rendering chunk $n (frames $start-$end)"
  rm -f "$f"
  local tries=3
  while [ "$tries" -gt 0 ]; do
    if npx remotion render src/index.ts "$COMP" "$f" --frames="${start}-${end}" --concurrency=1 --puppeteer-timeout=90000; then
      if [ "$(verify_one "$n")" = "OK" ]; then echo ">> chunk $n fixed"; return 0; fi
    fi
    tries=$((tries-1)); echo ">> chunk $n retry, left=$tries"
  done
  echo ">> chunk $n FAILED to fix"; return 1
}

echo "--- verify pass ---"
BAD=()
for n in $(seq 1 "$NCHUNKS"); do
  r=$(verify_one "$n")
  if [ "$r" = "BAD" ]; then echo "chunk $n: BAD"; BAD+=("$n"); fi
done
echo "bad count: ${#BAD[@]}"

FAIL=0
for n in "${BAD[@]:-}"; do
  [ -z "$n" ] && continue
  rerender_one "$n" || FAIL=1
done
if [ "$FAIL" -ne 0 ]; then echo "!! some chunks unfixable — ABORT merge"; exit 1; fi

echo "--- regenerating parts.txt ---"
: > "$DIR/parts.txt"
for n in $(seq 1 "$NCHUNKS"); do printf "file '%s'\n" "$(printf 'chunk-%04d.mp4' "$n")" >> "$DIR/parts.txt"; done

echo "--- concat ---"
mkdir -p out
ffmpeg -y -f concat -safe 0 -i "$DIR/parts.txt" -c copy "$OUT" || { echo "!! concat failed"; exit 2; }

# Completeness = actual video packet (frame) count must equal TOTAL. This is the
# authoritative check. Do NOT compare format-duration to frames/fps: -c copy concat
# inserts ~tens-of-ms gaps at each chunk boundary (applied to BOTH streams equally,
# so A/V stay in sync), which harmlessly stretches the overall timeline by a few sec.
VFRAMES=$(ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of default=nw=1:nk=1 "$OUT" 2>/dev/null)
VDUR=$(ffprobe -v error -select_streams v:0 -show_entries stream=duration -of default=nw=1:nk=1 "$OUT" 2>/dev/null)
ADUR=$(ffprobe -v error -select_streams a:0 -show_entries stream=duration -of default=nw=1:nk=1 "$OUT" 2>/dev/null)
FDUR=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT" 2>/dev/null)
echo "video frames=$VFRAMES expected=$TOTAL  vdur=$VDUR adur=$ADUR fdur=$FDUR"
if [ "$VFRAMES" != "$TOTAL" ]; then
  echo "!! WARNING: video frame count $VFRAMES != expected $TOTAL — truncation/corruption"; exit 3
fi
# A/V sync: video and audio must end within ~2s of each other
if awk "BEGIN{d=$VDUR-$ADUR; if(d<0)d=-d; exit !(d>2)}"; then
  echo "!! WARNING: audio/video durations differ by >2s ($VDUR vs $ADUR) — check sync"; exit 4
fi
echo "=== SUCCESS: $OUT — $VFRAMES frames, ${FDUR}s, A/V in sync ==="
