# the-choice-factory

> Bu kitabın **hub klasörü**. Kitaba dair her şey (config, meta, prompt, upload pack) burada; render çıktıları `public/` ve `out/` altında, aşağıda linkli.

## Dosyalar

| | Konum | Not |
|---|---|---|
| 🎬 Final video | `out/the-choice-factory.mp4` _(yok)_ | render çıktısı |
| 🖼️ Thumbnail | `out/thumbnail-the-choice-factory.png` _(yok)_ | YouTube kapak |
| 📝 YouTube pack | `books/the-choice-factory/youtube.md` _(yok)_ | başlık/açıklama/tag/bölümler |
| 💬 Captions (CC) | `public/captions/the-choice-factory.clean.vtt` _(yok)_ | YouTube'a "With timing" yükle |
| 💬 Captions (ham) | [`public/captions/the-choice-factory.vtt`](../../public/captions/the-choice-factory.vtt) | kelime-zamanlı (karaoke kaynağı) |
| 🎙️ Audio | `public/audio/the-choice-factory.m4a` _(yok)_ | NotebookLM sesi |
| 🖼️ Scene images | `public/scenes/the-choice-factory/` _(yok)_ | Flux görselleri |
| ✍️ NotebookLM prompt | [`books/the-choice-factory/prompt.notebooklm.md`](prompt.notebooklm.md) | orijinal analiz açısı |
| 📖 Manifest | [`books/the-choice-factory/book.json`](book.json) | book.json (slug/başlık/engine) |
| ⚙️ Vox config | `books/the-choice-factory/config.vox.json` _(yok)_ | render config (beats/captions) |
| ⚙️ YouTube meta | `books/the-choice-factory/youtube-meta.json` _(yok)_ | SEO/meta + thumbnail brief |
| 🎞️ Render chunks | `out_Vox-the-choice-factory_chunks/` _(yok)_ | ara mp4 parçaları + parts.txt |

## Yükleme sırası
1. `out/the-choice-factory.mp4` yükle
2. Başlık + açıklama (bölümler tıklanabilir olur) + tag → [youtube.md](youtube.md)
3. Thumbnail → `out/thumbnail-the-choice-factory.png`
4. CC → `the-choice-factory.clean.vtt` ("With timing")
5. **Altered content = Yes** (sentetik ses)

## Yeniden üretmek
```bash
node scripts/make-book.js --slug=the-choice-factory --title="the-choice-factory"
```
