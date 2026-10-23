import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

/**
 * desk.tsx — 2.5D Çalışma Masası ve Kamera Derinliği (Desk & Spatial Depth)
 *
 * Vox ve Johnny Harris'in kamera dilini Remotion'a kazandırır:
 * - Düz 2D katmanlar yerine hafif açılı (isometric / tilted) dedektif masası derinliği
 * - Sıfır GPU maliyeti: Tamamen CPU-dostu CSS 3D Transforms (perspective, rotateX, rotateY)
 * - Ön plan fluluğu (foreground occlusion) ve yaşayan masa kayması
 * - Stop-motion kadansı (posterized time)
 */

/** Stop-motion kadansı: 30fps akış içinde öğeyi 12-15 fps el yapımı zıplama ile hareket ettirir */
export function posterizeTime(frame: number, step = 2): number {
  return Math.floor(frame / step) * step;
}

export type CameraMotion = "drift" | "panRight" | "panLeft" | "pushIn" | "pullBack" | "macroScan";

/**
 * DeskPerspective — Sahneye gerçekçi izometrik / açılı dedektif masası derinliği verir.
 * CPU render'da sıfır maliyetle çalışır.
 * cameraMotion ile masada sinematik kamera hareketleri (pan, pushIn, macroScan) sağlar.
 */
export const DeskPerspective: React.FC<{
  children: React.ReactNode;
  tiltX?: number; // Örn: 10 - 16 derece
  tiltY?: number; // Örn: -4 - 4 derece
  depth?: number;
  drift?: boolean; // Yaşayan kamera nefes alması
  cameraMotion?: CameraMotion;
  style?: React.CSSProperties;
}> = ({
  children,
  tiltX = 12,
  tiltY = -3,
  depth = 0,
  drift = true,
  cameraMotion = "drift",
  style,
}) => {
  const frame = useCurrentFrame();

  // Temel yaşayan kamera nefes alması (asla donuk kalmaz)
  const driftX = drift ? Math.sin(frame / 65) * 0.8 : 0;
  const driftY = drift ? Math.cos(frame / 75) * 0.6 : 0;

  // Kameranın masadaki sinematik seyahati (Kamera Koreografisi)
  let motionX = 0;
  let motionY = 0;
  let motionZoom = 1;

  if (cameraMotion === "panRight") {
    motionX = interpolate(frame, [0, 180], [-45, 45], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  } else if (cameraMotion === "panLeft") {
    motionX = interpolate(frame, [0, 180], [45, -45], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  } else if (cameraMotion === "pushIn") {
    motionZoom = interpolate(frame, [0, 160], [1, 1.14], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    motionY = interpolate(frame, [0, 160], [0, -18], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  } else if (cameraMotion === "pullBack") {
    motionZoom = interpolate(frame, [0, 160], [1.12, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  } else if (cameraMotion === "macroScan") {
    motionX = interpolate(frame, [0, 180], [-35, 35], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    motionY = interpolate(frame, [0, 180], [20, -20], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    motionZoom = interpolate(frame, [0, 180], [1.06, 1.12], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  } else {
    // Klasik hafif gezinme
    motionX = drift ? Math.sin(frame / 120) * 16 : 0;
    motionY = drift ? (frame * 0.12) % 20 : 0;
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        perspective: 1500,
        perspectiveOrigin: "50% 48%",
        overflow: "visible",
        ...style,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transformStyle: "preserve-3d",
          transform: `scale(${motionZoom}) rotateX(${tiltX + driftY}deg) rotateY(${tiltY + driftX}deg) translateZ(${depth}px) translate(${motionX}px, ${motionY}px)`,
          transition: "transform 0.1s ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
};

/**
 * ForegroundOcclusion — Kameranın hemen önünden geçen ön plan katmanı.
 * 3 katmanlı derinlik hissi yaratır: (Ön Plan -> Masa/Öğe -> Zemin).
 */
export const ForegroundOcclusion: React.FC<{
  showLampGlow?: boolean;
  showMagnifierRim?: boolean;
}> = ({ showLampGlow = true, showMagnifierRim = false }) => {
  const frame = useCurrentFrame();

  // Büyütecin yavaşça kadrajın köşesinden süzülmesi
  const magX = interpolate(frame, [0, 180], [-80, -20], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ zIndex: 55, pointerEvents: "none" }}>
      {/* 1. Masa Lambası Sıcak Işık Hüzmesi (Sıcak sarı/kehribar ambient) */}
      {showLampGlow ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -100,
            left: -100,
            width: 800,
            height: 800,
            borderRadius: "50%",
            background: "radial-gradient(circle at 30% 30%, rgba(245, 205, 120, 0.14), rgba(220, 160, 60, 0.05) 50%, transparent 75%)",
            mixBlendMode: "screen",
          }}
        />
      ) : null}

      {/* 2. Ön Plandan Geçen Flulaştırılmış Büyüteç Çerçevesi (Opsiyonel derinlik) */}
      {showMagnifierRim ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            bottom: -120,
            left: magX,
            width: 420,
            height: 420,
            borderRadius: "50%",
            border: "22px solid rgba(45, 38, 30, 0.28)",
            boxShadow: "0 20px 40px rgba(0,0,0,0.3), inset 0 0 20px rgba(255,255,255,0.1)",
            filter: "blur(6px)",
            transform: "rotate(-18deg)",
          }}
        />
      ) : null}

      {/* 3. Masanın Kenarındaki İnce Doğal Gölgeler (Depth Vignette) */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          boxShadow: "inset 0 40px 100px rgba(18, 14, 10, 0.18), inset 0 -40px 100px rgba(18, 14, 10, 0.22)",
        }}
      />
    </AbsoluteFill>
  );
};
