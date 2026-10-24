# Scripts

Active pipeline scripts. Run from repo root: `node scripts/<name>.js`

## Pipeline Orchestration
- **make-book.js** — one-command: audio + VTT + meta → preview-ready video + YouTube pack
- **make-prompt.js** — Step 0: generate NotebookLM "Audio Overview" prompt for a book
- **suggest-engine.js** — read VTT and recommend Vox vs Antidote engine

## Planning (LLM Art-Direction)
- **plan-vox.js** — VTT → Vox config (beats/archetypes/captions/art-direction)
- **plan-antidote.js** — VTT → Antidote config (scenes/kinetic text/characters)
- **plan-meta.js** — YouTube metadata + thumbnail brief (Vox books)
- **plan-antidote-meta.js** — YouTube metadata + thumbnail brief (Antidote books)
- **thumbnail-grammar.js** — channel-aware thumbnail design pick + Test & Compare variants → youtube-meta.json (no LLM)
- **render-thumbnails.js** — renders out/thumbnail-<slug>{,-b,-c}.png from one slim bundle + Test & Compare block in youtube.md
- **preview-thumbnail-grammar.js** — simulated browse-feed preview of several books (`--variants` for A/B/C)
- **test-thumbnail-grammar.js** — guard: fails if thumbnails collapse back into one template
- **lib/antidote-costume.js** — the Character Foundry's casting director: reads a wardrobe
  WORLD off the narration (1920s, regime, farm, war, pre-modern…) and casts five visibly
  different people from it. `plan-antidote.js --emit-cast` / `--cast` hands it to Claude.
- **audit-antidote.js** — visual-event budget for an Antidote plan: fails when any window
  runs longer than `--max-gap` (default 8s) with nothing happening on screen. Also reports
  presenter-shot share, full-body share, sustained takes, held props and distinct locations.
  `--slug=<slug>` · `--all` · `--soft` · `--json`

## Rendering
- **render.js** — unified render orchestrator (local/github/lambda)
- **render-github-download.js** — pull finished render from GitHub Actions worker
- **render-github-cleanup.js** — free worker repo Actions storage after approval
- **render-github-assemble.js** — download + concat split GitHub render segments
- **auto-chain-render.js** — hands-free overnight multi-book render chain
- **render-queue.js** — sequential render queue manager
- **fast-assemble.js** — FFmpeg concat of rendered chunks
- **dl-render.js** — download finished Lambda render from S3

## Post-Render Finalization
The cleanup ones are **post-UPLOAD** steps — each destroys something you still need before the film is on YouTube. See the "Post-upload order" block in `CLAUDE.md`.
- **post-render.js** — verify MP4 (ffprobe + head/tail decode) + YouTube-readiness check; auto-called by render.js/assemble/download after every render, or run standalone
- **render-github-cleanup.js --slug=** — free a worker's Actions artifacts + run logs (⚠ also deletes that book's upload captions + audio)
- **purge-render-branches.js --slug=** — delete the per-render `render/<slug>-segN` bundle refs off every worker. Refuses unless the book is finished (`out/<slug>.mp4` or in `PUBLISHED_BOOKS.md`; `--force` overrides). `--dry` lists, `--worker=` narrows. Never touches the workers' `god-mode`
- **render-purge.js --slug=** — reclaim local disk (master MP4, chunk dirs, thumbnails, split state). `--source` additionally `git rm`s the committed book source — retiring a book, not a normal step
- **rebuild-clean-vtt.js <slug>** — regenerate an upload `.clean.vtt` from the committed config's `captions[]` when cleanup already removed it (fallback: `clean-vtt.js`, which needs the raw ASR VTT)

## Post-Processing
- **apply-emphasis.js** — recompute on-screen emphasis words
- **apply-phrases.js** — lock hand-authored "phrase-that-pays" lines
- **apply-chapters.js** — copy chapter marks into config
- **apply-coldopen.js** — retrofit cold-open hook
- **apply-quota.js** — retrofit archetype spread
- **fix-names.js** — repair ASR name misspellings in text + captions
- **master-audio.js** — two-pass EBU R128 loudness normalization

## Validation
- **check-vtt.js** — pre-flight: right book + full-length + not a copy
- **clean-vtt.js** — YouTube-safe CC from raw VTT
- **verify-assets.js** — every config-referenced asset exists on disk
- **verify-render-assets.js** — git-tracked pre-flight for remote renders

## Utilities
- **gen-books-registry.js** — scan books/ → src/books.generated.ts
- **gen-book-readme.js** — per-book hub README at books/\<slug\>/README.md

## Shared Libraries (lib/)
- **paths.js** — canonical file path layer for books/assets
- **llm.js** — NVIDIA NIM LLM config
- **vtt.js** — word-level VTT parsing
- **beat-text.js** — beat text helpers + archetype quota
- **antidote-copy.js** — Antidote kinetic text copywriter
- **antidote-director.js** — Antidote shot grammar director
- **render-pool.js** — GitHub Actions worker pool helpers

## Archive
`scripts/_archive/` — legacy/one-off scripts kept for reference.
