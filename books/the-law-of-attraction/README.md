# the-law-of-attraction

> Bu kitabın **hub klasörü**. Kitaba dair her şey (config, meta, prompt, upload pack) burada; render çıktıları `public/` ve `out/` altında, aşağıda linkli.

## Dosyalar

| | Konum | Not |
|---|---|---|
| 🎬 Final video | `out/the-law-of-attraction.mp4` _(yok)_ | render çıktısı |
| 🖼️ Thumbnail | `out/thumbnail-the-law-of-attraction.png` _(yok)_ | YouTube kapak |
| 📝 YouTube pack | `books/the-law-of-attraction/youtube.md` _(yok)_ | başlık/açıklama/tag/bölümler |
| 💬 Captions (CC) | `public/captions/the-law-of-attraction.clean.vtt` _(yok)_ | YouTube'a "With timing" yükle |
| 💬 Captions (ham) | [`public/captions/the-law-of-attraction.vtt`](../../public/captions/the-law-of-attraction.vtt) | kelime-zamanlı (karaoke kaynağı) |
| 🎙️ Audio | `public/audio/the-law-of-attraction.m4a` _(yok)_ | NotebookLM sesi |
| 🖼️ Scene images | `public/scenes/the-law-of-attraction/` _(yok)_ | Flux görselleri |
| ✍️ NotebookLM prompt | [`books/the-law-of-attraction/prompt.notebooklm.md`](prompt.notebooklm.md) | orijinal analiz açısı |
| 📖 Manifest | [`books/the-law-of-attraction/book.json`](book.json) | book.json (slug/başlık/engine) |
| ⚙️ Vox config | `books/the-law-of-attraction/config.vox.json` _(yok)_ | render config (beats/captions) |
| ⚙️ YouTube meta | `books/the-law-of-attraction/youtube-meta.json` _(yok)_ | SEO/meta + thumbnail brief |
| 🎞️ Render chunks | `out_Vox-the-law-of-attraction_chunks/` _(yok)_ | ara mp4 parçaları + parts.txt |

## Yükleme sırası
1. `out/the-law-of-attraction.mp4` yükle
2. Başlık + açıklama (bölümler tıklanabilir olur) + tag → [youtube.md](youtube.md)
3. Thumbnail → `out/thumbnail-the-law-of-attraction.png`
4. CC → `the-law-of-attraction.clean.vtt` ("With timing")
5. **Altered content = Yes** (sentetik ses)

## Yeniden üretmek
```bash
node scripts/make-book.js --slug=the-law-of-attraction --title="the-law-of-attraction"
```
