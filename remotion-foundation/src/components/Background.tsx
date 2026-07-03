import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

interface GridConfig {
  color: string;
  size?: number;
  maxOpacity?: number;
  fadeInDuration?: number;
}

interface BackgroundProps {
  gradient?: string;
  backgroundColor?: string;
  grid?: GridConfig | null;
}

export const Background: React.FC<BackgroundProps> = ({
  gradient,
  backgroundColor,
  grid,
}) => {
  const frame = useCurrentFrame();

  const gridMaxOpacity = grid?.maxOpacity ?? 0.3;
  const gridFadeInDuration = grid?.fadeInDuration ?? 30;
  const gridOpacity = grid
    ? interpolate(frame, [0, gridFadeInDuration], [0, gridMaxOpacity], {
        extrapolateRight: "clamp",
        extrapolateLeft: "clamp",
      })
    : 0;

  const gridSize = grid?.size ?? 80;

  return (
    <AbsoluteFill>
      <div
        style={{
          width: "100%",
          height: "100%",
          background: gradient ?? backgroundColor ?? "#000000",
        }}
      />
      {grid && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            opacity: gridOpacity,
            backgroundImage: `
              linear-gradient(${grid.color} 1px, transparent 1px),
              linear-gradient(90deg, ${grid.color} 1px, transparent 1px)
            `,
            backgroundSize: `${gridSize}px ${gridSize}px`,
          }}
        />
      )}
    </AbsoluteFill>
  );
};
