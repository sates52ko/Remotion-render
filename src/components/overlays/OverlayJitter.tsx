import React from 'react';
import { useCurrentFrame, useVideoConfig, spring } from 'remotion';

/**
 * OverlayJitter applies a subtle random jitter animation to its children.
 * It uses a spring animation with a small amplitude to create a premium, dynamic feel.
 */
export const OverlayJitter: React.FC<{ intensity?: number; children: React.ReactNode }> = ({ intensity = 0.02, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Generate a small random offset based on frame and intensity
  const offsetX = spring({
    frame,
    fps,
    from: -intensity,
    to: intensity,
    config: { damping: 30, stiffness: 120 },
  });
  const offsetY = spring({
    frame: frame + 10,
    fps,
    from: -intensity,
    to: intensity,
    config: { damping: 30, stiffness: 120 },
  });

  const style: React.CSSProperties = {
    transform: `translate(${offsetX * 100}%, ${offsetY * 100}%)`,
  };

  return <div style={style}>{children}</div>;
};
