# how-to-make-money-in-stocks

> Bu kitabın **hub klasörü**. Kitaba dair her şey (config, meta, prompt, upload pack) burada; render çıktıları `public/` ve `out/` altında, aşağıda linkli.

## Dosyalar

| | Konum | Not |
|---|---|---|
| 🎬 Final video | `out/how-to-make-money-in-stocks.mp4` _(yok)_ | render çıktısı |
| 🖼️ Thumbnail | `out/thumbnail-how-to-make-money-in-stocks.png` _(yok)_ | YouTube kapak |
| 📝 YouTube pack | `books/how-to-make-money-in-stocks/youtube.md` _(yok)_ | başlık/açıklama/tag/bölümler |
| 💬 Captions (CC) | `public/captions/how-to-make-money-in-stocks.clean.vtt` _(yok)_ | YouTube'a "With timing" yükle |
| 💬 Captions (ham) | [`public/captions/how-to-make-money-in-stocks.vtt`](../../public/captions/how-to-make-money-in-stocks.vtt) | kelime-zamanlı (karaoke kaynağı) |
| 🎙️ Audio | `public/audio/how-to-make-money-in-stocks.m4a` _(yok)_ | NotebookLM sesi |
| 🖼️ Scene images | `public/scenes/how-to-make-money-in-stocks/` _(yok)_ | Flux görselleri |
| ✍️ NotebookLM prompt | [`books/how-to-make-money-in-stocks/prompt.notebooklm.md`](prompt.notebooklm.md) | orijinal analiz açısı |
| 📖 Manifest | [`books/how-to-make-money-in-stocks/book.json`](book.json) | book.json (slug/başlık/engine) |
| ⚙️ Vox config | `books/how-to-make-money-in-stocks/config.vox.json` _(yok)_ | render config (beats/captions) |
| ⚙️ YouTube meta | `books/how-to-make-money-in-stocks/youtube-meta.json` _(yok)_ | SEO/meta + thumbnail brief |
| 🎞️ Render chunks | `out_Vox-how-to-make-money-in-stocks_chunks/` _(yok)_ | ara mp4 parçaları + parts.txt |

## Yükleme sırası
1. `out/how-to-make-money-in-stocks.mp4` yükle
2. Başlık + açıklama (bölümler tıklanabilir olur) + tag → [youtube.md](youtube.md)
3. Thumbnail → `out/thumbnail-how-to-make-money-in-stocks.png`
4. CC → `how-to-make-money-in-stocks.clean.vtt` ("With timing")
5. **Altered content = Yes** (sentetik ses)

## Yeniden üretmek
```bash
node scripts/make-book.js --slug=how-to-make-money-in-stocks --title="how-to-make-money-in-stocks"
```
