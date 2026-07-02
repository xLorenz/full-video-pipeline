import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from "remotion";

export const Scene03: React.FC = () => {
  const frame = useCurrentFrame();

  const gradientShift = interpolate(frame, [0, 389], [0, 20], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  const textOpacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${180 + gradientShift}deg, #e94560 0%, #f39c12 50%, #1a1a2e 100%)`,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          opacity: textOpacity,
          color: "white",
          fontSize: 36,
          fontFamily: "Arial, sans-serif",
          fontWeight: "bold",
          textAlign: "center",
          textShadow: "0 2px 10px rgba(0,0,0,0.7)",
          lineHeight: 1.5,
          padding: 40,
        }}
      >
        Nature's physics, happening {"\n"}
        right above your head.
      </div>
    </AbsoluteFill>
  );
};
