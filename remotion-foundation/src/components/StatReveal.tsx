import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";

interface StatRevealProps {
  value: string;
  label?: string;
  delay?: number;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
}

export const StatReveal: React.FC<StatRevealProps> = ({
  value,
  label,
  delay = 0,
  color = "#00BFA6",
  fontSize = 96,
  fontFamily = "Inter",
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + 20], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const scale = interpolate(frame, [delay, delay + 20], [0.8, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div
      style={{
        opacity,
        transform: `scale(${scale})`,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize,
          fontWeight: 900,
          color,
          fontFamily,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {label && (
        <div
          style={{
            fontSize: fontSize * 0.25,
            color: "#FFFFFF",
            fontFamily,
            marginTop: 16,
            opacity: 0.8,
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
};
