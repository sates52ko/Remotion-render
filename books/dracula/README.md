# dracula

> Bu kitabın **hub klasörü**. Kitaba dair her şey (config, meta, prompt, upload pack) burada; render çıktıları `public/` ve `out/` altında, aşağıda linkli.

## Dosyalar

| | Konum | Not |
|---|---|---|
| 🎬 Final video | `out/dracula.mp4` _(yok)_ | render çıktısı |
| 🖼️ Thumbnail | `out/thumbnail-dracula.png` _(yok)_ | YouTube kapak |
| 📝 YouTube pack | `books/dracula/youtube.md` _(yok)_ | başlık/açıklama/tag/bölümler |
| 💬 Captions (CC) | `public/captions/dracula.clean.vtt` _(yok)_ | YouTube'a "With timing" yükle |
| 💬 Captions (ham) | [`public/captions/dracula.vtt`](../../public/captions/dracula.vtt) | kelime-zamanlı (karaoke kaynağı) |
| 🎙️ Audio | `public/audio/dracula.m4a` _(yok)_ | NotebookLM sesi |
| 🖼️ Scene images | `public/scenes/dracula/` _(yok)_ | Flux görselleri |
| ✍️ NotebookLM prompt | [`books/dracula/prompt.notebooklm.md`](prompt.notebooklm.md) | orijinal analiz açısı |
| 📖 Manifest | [`books/dracula/book.json`](book.json) | book.json (slug/başlık/engine) |
| ⚙️ Vox config | `books/dracula/config.vox.json` _(yok)_ | render config (beats/captions) |
| ⚙️ YouTube meta | `books/dracula/youtube-meta.json` _(yok)_ | SEO/meta + thumbnail brief |
| 🎞️ Render chunks | `out_Vox-dracula_chunks/` _(yok)_ | ara mp4 parçaları + parts.txt |

## Yükleme sırası
1. `out/dracula.mp4` yükle
2. Başlık + açıklama (bölümler tıklanabilir olur) + tag → [youtube.md](youtube.md)
3. Thumbnail → `out/thumbnail-dracula.png`
4. CC → `dracula.clean.vtt` ("With timing")
5. **Altered content = Yes** (sentetik ses)

## Yeniden üretmek
```bash
node scripts/make-book.js --slug=dracula --title="dracula"
```
