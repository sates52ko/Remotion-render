import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { BOOK_BG_TINT } from "../../books.generated";
import type { VoxConfig } from "./schema";
import { PAPER, resolvePalette, resolveCaptionHighlight } from "./palette";
import { PaperBackground, FloatingSpecks, Grain, Vignette } from "./backgrounds";
import { SCENES, StatementScene } from "./scenes";
import { CaptionLayer } from "./captions";
import { ChapterOverlay, ProgressRail } from "./overlays";
import { SfxLayer } from "./sfx";
import { ForegroundOcclusion } from "./desk";

export { voxBookSchema } from "./schema";
export { VoxThumbnail, thumbnailSchema } from "./thumbnail";
export * from "./documents";
export * from "./desk";
export * from "./cartography";
export * from "./infographics";
export * from "./scenes-journalism";

export const VoxBook: React.FC<{ config: VoxConfig }> = ({ config }) => {
  const pal = resolvePalette(config.meta.slug);
  const captionHighlight = resolveCaptionHighlight(pal);
  const paletteVars = {
    "--vox-paper": pal.paper,
    "--vox-ink": pal.ink,
    "--vox-red": pal.red,
    "--vox-gold": pal.gold,
    "--vox-caption-highlight": captionHighlight,
  } as React.CSSProperties;
  return (
  <AbsoluteFill style={{ ...paletteVars, backgroundColor: PAPER }}>
    <Audio src={staticFile(config.meta.audio)} />
    <SfxLayer beats={config.beats} enabled={config.meta.sfx === true} />
    <PaperBackground tint={BOOK_BG_TINT[config.meta.slug ?? ""] ?? false} />
    <FloatingSpecks />
    {config.beats.map((beat) => {
      const S = SCENES[beat.type] || StatementScene;
      return (
        <Sequence key={beat.id} from={beat.fromFrame} durationInFrames={beat.durationFrames} name={`${beat.id} · ${beat.type}`}>
          <S beat={beat} />
        </Sequence>
      );
    })}
    <CaptionLayer captions={config.captions} />
    <ChapterOverlay chapters={config.chapters} />
    {config.meta.progress === false ? null : (
      <ProgressRail chapters={config.chapters} total={config.beats.reduce((m, b) => Math.max(m, b.fromFrame + b.durationFrames), 0)} />
    )}
    <ForegroundOcclusion showLampGlow={true} />
    <Vignette />
    <Grain />
  </AbsoluteFill>
  );
};
