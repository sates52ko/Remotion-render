# foundation

> Bu kitabın **hub klasörü**. Kitaba dair her şey (config, meta, prompt, upload pack) burada; render çıktıları `public/` ve `out/` altında, aşağıda linkli.

## Dosyalar

| | Konum | Not |
|---|---|---|
| 🎬 Final video | `out/foundation.mp4` _(yok)_ | render çıktısı |
| 🖼️ Thumbnail | `out/thumbnail-foundation.png` _(yok)_ | YouTube kapak |
| 📝 YouTube pack | `books/foundation/youtube.md` _(yok)_ | başlık/açıklama/tag/bölümler |
| 💬 Captions (CC) | `public/captions/foundation.clean.vtt` _(yok)_ | YouTube'a "With timing" yükle |
| 💬 Captions (ham) | [`public/captions/foundation.vtt`](../../public/captions/foundation.vtt) | kelime-zamanlı (karaoke kaynağı) |
| 🎙️ Audio | `public/audio/foundation.m4a` _(yok)_ | NotebookLM sesi |
| 🖼️ Scene images | `public/scenes/foundation/` _(yok)_ | Flux görselleri |
| ✍️ NotebookLM prompt | [`books/foundation/prompt.notebooklm.md`](prompt.notebooklm.md) | orijinal analiz açısı |
| 📖 Manifest | [`books/foundation/book.json`](book.json) | book.json (slug/başlık/engine) |
| ⚙️ Vox config | `books/foundation/config.vox.json` _(yok)_ | render config (beats/captions) |
| ⚙️ YouTube meta | `books/foundation/youtube-meta.json` _(yok)_ | SEO/meta + thumbnail brief |
| 🎞️ Render chunks | `out_Vox-foundation_chunks/` _(yok)_ | ara mp4 parçaları + parts.txt |

## Yükleme sırası
1. `out/foundation.mp4` yükle
2. Başlık + açıklama (bölümler tıklanabilir olur) + tag → [youtube.md](youtube.md)
3. Thumbnail → `out/thumbnail-foundation.png`
4. CC → `foundation.clean.vtt` ("With timing")
5. **Altered content = Yes** (sentetik ses)

## Yeniden üretmek
```bash
node scripts/make-book.js --slug=foundation --title="foundation"
```
