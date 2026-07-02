import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

interface BackgroundProps {
  colors: {
    background: string;
    primary: string;
    gridLine: string;
  };
  gridSize?: number;
}

export const Background: React.FC<BackgroundProps> = ({
  colors,
  gridSize = 80,
}) => {
  const frame = useCurrentFrame();
  const gridOpacity = interpolate(frame, [0, 30], [0, 0.3], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <AbsoluteFill>
      <div
        style={{
          width: "100%",
          height: "100%",
          background: `linear-gradient(135deg, ${colors.background} 0%, ${colors.primary} 100%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          opacity: gridOpacity,
          backgroundImage: `
            linear-gradient(${colors.gridLine} 1px, transparent 1px),
            linear-gradient(90deg, ${colors.gridLine} 1px, transparent 1px)
          `,
          backgroundSize: `${gridSize}px ${gridSize}px`,
        }}
      />
    </AbsoluteFill>
  );
};
