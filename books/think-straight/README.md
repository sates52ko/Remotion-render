# think-straight

> Bu kitabın **hub klasörü**. Kitaba dair her şey (config, meta, prompt, upload pack) burada; render çıktıları `public/` ve `out/` altında, aşağıda linkli.

## Dosyalar

| | Konum | Not |
|---|---|---|
| 🎬 Final video | `out/think-straight.mp4` _(yok)_ | render çıktısı |
| 🖼️ Thumbnail | `out/thumbnail-think-straight.png` _(yok)_ | YouTube kapak |
| 📝 YouTube pack | `books/think-straight/youtube.md` _(yok)_ | başlık/açıklama/tag/bölümler |
| 💬 Captions (CC) | `public/captions/think-straight.clean.vtt` _(yok)_ | YouTube'a "With timing" yükle |
| 💬 Captions (ham) | [`public/captions/think-straight.vtt`](../../public/captions/think-straight.vtt) | kelime-zamanlı (karaoke kaynağı) |
| 🎙️ Audio | `public/audio/think-straight.m4a` _(yok)_ | NotebookLM sesi |
| 🖼️ Scene images | `public/scenes/think-straight/` _(yok)_ | Flux görselleri |
| ✍️ NotebookLM prompt | [`books/think-straight/prompt.notebooklm.md`](prompt.notebooklm.md) | orijinal analiz açısı |
| 📖 Manifest | [`books/think-straight/book.json`](book.json) | book.json (slug/başlık/engine) |
| ⚙️ Vox config | `books/think-straight/config.vox.json` _(yok)_ | render config (beats/captions) |
| ⚙️ YouTube meta | `books/think-straight/youtube-meta.json` _(yok)_ | SEO/meta + thumbnail brief |
| 🎞️ Render chunks | `out_Vox-think-straight_chunks/` _(yok)_ | ara mp4 parçaları + parts.txt |

## Yükleme sırası
1. `out/think-straight.mp4` yükle
2. Başlık + açıklama (bölümler tıklanabilir olur) + tag → [youtube.md](youtube.md)
3. Thumbnail → `out/thumbnail-think-straight.png`
4. CC → `think-straight.clean.vtt` ("With timing")
5. **Altered content = Yes** (sentetik ses)

## Yeniden üretmek
```bash
node scripts/make-book.js --slug=think-straight --title="think-straight"
```
