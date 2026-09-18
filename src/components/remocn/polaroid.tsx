import React from "react";
import { Handwrite } from "./handwrite";
import { DEFAULT_STEP } from "../../lib/remocn/stop-motion";

const BASE_WIDTH = 652;
const BASE_PAD = 16;
const BASE_MEDIA_WIDTH = 620;
const BASE_MEDIA_HEIGHT = 440;
const BASE_CAPTION_HEIGHT = 72;
const BASE_CAPTION_SIZE = 36;

export type PolaroidGeometry = {
  pad: number;
  mediaWidth: number;
  mediaHeight: number;
  captionHeight: number;
  height: number;
};

export function polaroidGeometry(width: number): PolaroidGeometry {
  const scale = width / BASE_WIDTH;
  const pad = BASE_PAD * scale;
  const mediaWidth = BASE_MEDIA_WIDTH * scale;
  const mediaHeight = BASE_MEDIA_HEIGHT * scale;
  const captionHeight = BASE_CAPTION_HEIGHT * scale;
  return {
    pad,
    mediaWidth,
    mediaHeight,
    captionHeight,
    height: pad + mediaHeight + captionHeight,
  };
}

export interface PolaroidProps {
  children: React.ReactNode;
  caption?: string;
  captionAt?: number;
  width?: number;
  frameColor?: string;
  captionColor?: string;
  captionSize?: number;
  perStep?: number;
  step?: number;
  style?: React.CSSProperties;
}

export function Polaroid({
  children,
  caption,
  captionAt = 0,
  width = BASE_WIDTH,
  frameColor = "#fdfcf8",
  captionColor = "#26242c",
  captionSize,
  perStep = 2.0,
  step = DEFAULT_STEP,
  style,
}: PolaroidProps) {
  const { pad, mediaWidth, mediaHeight, captionHeight, height } =
    polaroidGeometry(width);
  const resolvedCaptionSize =
    captionSize ?? BASE_CAPTION_SIZE * (width / BASE_WIDTH);

  return (
    <div
      style={{
        width,
        height,
        boxSizing: "border-box",
        background: frameColor,
        borderRadius: 4,
        boxShadow:
          "0 14px 32px rgba(30,42,36,0.22), 0 4px 10px rgba(30,42,36,0.12)",
        paddingTop: pad,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        ...style,
      }}
    >
      <div
        style={{
          position: "relative",
          width: mediaWidth,
          height: mediaHeight,
          margin: "0 auto",
          background: "#100f14",
          overflow: "hidden",
          borderRadius: 2,
        }}
      >
        {children}
      </div>
      <div
        style={{
          position: "relative",
          width: mediaWidth,
          height: captionHeight,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {caption ? (
          <Handwrite
            text={caption}
            fontSize={resolvedCaptionSize}
            color={captionColor}
            delay={captionAt}
            perStep={perStep}
            weight={600}
            step={step}
          />
        ) : null}
      </div>
    </div>
  );
}
