# The Myth of Sisyphus, and Other Essays — Albert Camus  ·  _philosophy_

> Bu kitabın **hub klasörü**. Kitaba dair her şey (config, meta, prompt, upload pack) burada; render çıktıları `public/` ve `out/` altında, aşağıda linkli.

## Dosyalar

| | Konum | Not |
|---|---|---|
| 🎬 Final video | `out/the-myth-of-sisyphus.mp4` _(yok)_ | render çıktısı |
| 🖼️ Thumbnail | [`out/thumbnail-the-myth-of-sisyphus.png`](../../out/thumbnail-the-myth-of-sisyphus.png) | YouTube kapak |
| 📝 YouTube pack | [`books/the-myth-of-sisyphus/youtube.md`](youtube.md) | başlık/açıklama/tag/bölümler |
| 💬 Captions (CC) | [`public/captions/the-myth-of-sisyphus.clean.vtt`](../../public/captions/the-myth-of-sisyphus.clean.vtt) | YouTube'a "With timing" yükle |
| 💬 Captions (ham) | [`public/captions/the-myth-of-sisyphus.vtt`](../../public/captions/the-myth-of-sisyphus.vtt) | kelime-zamanlı (karaoke kaynağı) |
| 🎙️ Audio | [`public/audio/the-myth-of-sisyphus.m4a`](../../public/audio/the-myth-of-sisyphus.m4a) | NotebookLM sesi |
| 🖼️ Scene images | [`public/scenes/the-myth-of-sisyphus/`](../../public/scenes/the-myth-of-sisyphus) | Flux görselleri |
| ✍️ NotebookLM prompt | [`books/the-myth-of-sisyphus/prompt.notebooklm.md`](prompt.notebooklm.md) | orijinal analiz açısı |
| 📖 Manifest | [`books/the-myth-of-sisyphus/book.json`](book.json) | book.json (slug/başlık/engine) |
| ⚙️ Vox config | `books/the-myth-of-sisyphus/config.vox.json` _(yok)_ | render config (beats/captions) |
| ⚙️ YouTube meta | [`books/the-myth-of-sisyphus/youtube-meta.json`](youtube-meta.json) | SEO/meta + thumbnail brief |
| 🎞️ Render chunks | `out_Vox-the-myth-of-sisyphus_chunks/` _(yok)_ | ara mp4 parçaları + parts.txt |

## Yükleme sırası
1. `out/the-myth-of-sisyphus.mp4` yükle
2. Başlık + açıklama (bölümler tıklanabilir olur) + tag → [youtube.md](youtube.md)
3. Thumbnail → `out/thumbnail-the-myth-of-sisyphus.png`
4. CC → `the-myth-of-sisyphus.clean.vtt` ("With timing")
5. **Altered content = Yes** (sentetik ses)

## Yeniden üretmek
```bash
node scripts/make-book.js --slug=the-myth-of-sisyphus --title="The Myth of Sisyphus, and Other Essays" --author="Albert Camus" --genre=philosophy
```
