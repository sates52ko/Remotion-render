# the-creative-curve

> Bu kitabın **hub klasörü**. Kitaba dair her şey (config, meta, prompt, upload pack) burada; render çıktıları `public/` ve `out/` altında, aşağıda linkli.

## Dosyalar

| | Konum | Not |
|---|---|---|
| 🎬 Final video | `out/the-creative-curve.mp4` _(yok)_ | render çıktısı |
| 🖼️ Thumbnail | `out/thumbnail-the-creative-curve.png` _(yok)_ | YouTube kapak |
| 📝 YouTube pack | `books/the-creative-curve/youtube.md` _(yok)_ | başlık/açıklama/tag/bölümler |
| 💬 Captions (CC) | `public/captions/the-creative-curve.clean.vtt` _(yok)_ | YouTube'a "With timing" yükle |
| 💬 Captions (ham) | [`public/captions/the-creative-curve.vtt`](../../public/captions/the-creative-curve.vtt) | kelime-zamanlı (karaoke kaynağı) |
| 🎙️ Audio | `public/audio/the-creative-curve.m4a` _(yok)_ | NotebookLM sesi |
| 🖼️ Scene images | `public/scenes/the-creative-curve/` _(yok)_ | Flux görselleri |
| ✍️ NotebookLM prompt | [`books/the-creative-curve/prompt.notebooklm.md`](prompt.notebooklm.md) | orijinal analiz açısı |
| 📖 Manifest | [`books/the-creative-curve/book.json`](book.json) | book.json (slug/başlık/engine) |
| ⚙️ Vox config | `books/the-creative-curve/config.vox.json` _(yok)_ | render config (beats/captions) |
| ⚙️ YouTube meta | `books/the-creative-curve/youtube-meta.json` _(yok)_ | SEO/meta + thumbnail brief |
| 🎞️ Render chunks | `out_Vox-the-creative-curve_chunks/` _(yok)_ | ara mp4 parçaları + parts.txt |

## Yükleme sırası
1. `out/the-creative-curve.mp4` yükle
2. Başlık + açıklama (bölümler tıklanabilir olur) + tag → [youtube.md](youtube.md)
3. Thumbnail → `out/thumbnail-the-creative-curve.png`
4. CC → `the-creative-curve.clean.vtt` ("With timing")
5. **Altered content = Yes** (sentetik ses)

## Yeniden üretmek
```bash
node scripts/make-book.js --slug=the-creative-curve --title="the-creative-curve"
```
