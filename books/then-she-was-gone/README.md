# then-she-was-gone

> Bu kitabın **hub klasörü**. Kitaba dair her şey (config, meta, prompt, upload pack) burada; render çıktıları `public/` ve `out/` altında, aşağıda linkli.

## Dosyalar

| | Konum | Not |
|---|---|---|
| 🎬 Final video | `out/then-she-was-gone.mp4` _(yok)_ | render çıktısı |
| 🖼️ Thumbnail | `out/thumbnail-then-she-was-gone.png` _(yok)_ | YouTube kapak |
| 📝 YouTube pack | `books/then-she-was-gone/youtube.md` _(yok)_ | başlık/açıklama/tag/bölümler |
| 💬 Captions (CC) | `public/captions/then-she-was-gone.clean.vtt` _(yok)_ | YouTube'a "With timing" yükle |
| 💬 Captions (ham) | [`public/captions/then-she-was-gone.vtt`](../../public/captions/then-she-was-gone.vtt) | kelime-zamanlı (karaoke kaynağı) |
| 🎙️ Audio | `public/audio/then-she-was-gone.m4a` _(yok)_ | NotebookLM sesi |
| 🖼️ Scene images | `public/scenes/then-she-was-gone/` _(yok)_ | Flux görselleri |
| ✍️ NotebookLM prompt | [`books/then-she-was-gone/prompt.notebooklm.md`](prompt.notebooklm.md) | orijinal analiz açısı |
| 📖 Manifest | [`books/then-she-was-gone/book.json`](book.json) | book.json (slug/başlık/engine) |
| ⚙️ Vox config | `books/then-she-was-gone/config.vox.json` _(yok)_ | render config (beats/captions) |
| ⚙️ YouTube meta | `books/then-she-was-gone/youtube-meta.json` _(yok)_ | SEO/meta + thumbnail brief |
| 🎞️ Render chunks | `out_Vox-then-she-was-gone_chunks/` _(yok)_ | ara mp4 parçaları + parts.txt |

## Yükleme sırası
1. `out/then-she-was-gone.mp4` yükle
2. Başlık + açıklama (bölümler tıklanabilir olur) + tag → [youtube.md](youtube.md)
3. Thumbnail → `out/thumbnail-then-she-was-gone.png`
4. CC → `then-she-was-gone.clean.vtt` ("With timing")
5. **Altered content = Yes** (sentetik ses)

## Yeniden üretmek
```bash
node scripts/make-book.js --slug=then-she-was-gone --title="then-she-was-gone"
```
