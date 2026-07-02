import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from "remotion";

export const Scene02: React.FC = () => {
  const frame = useCurrentFrame();

  const textOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  const diagramOpacity = interpolate(frame, [30, 50], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, #0f3460 0%, #16213e 100%)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: 60,
      }}
    >
      <div
        style={{
          opacity: textOpacity,
          color: "white",
          fontSize: 44,
          fontFamily: "Arial, sans-serif",
          fontWeight: "bold",
          textAlign: "center",
          marginBottom: 40,
          lineHeight: 1.4,
        }}
      >
        Rayleigh Scattering
      </div>
      <div
        style={{
          opacity: diagramOpacity,
          color: "#a0d2db",
          fontSize: 28,
          fontFamily: "Arial, sans-serif",
          textAlign: "center",
          lineHeight: 1.6,
          maxWidth: 900,
        }}
      >
        Sunlight hits atmosphere molecules {"\n"}
        Blue light scatters 10x more than red {"\n"}
        Scattered blue comes from every direction
      </div>
    </AbsoluteFill>
  );
};
