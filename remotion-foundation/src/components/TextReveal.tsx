import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";

interface TextRevealProps {
  text: string;
  delay?: number;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  fontFamily?: string;
  maxWidth?: number;
}

export const TextReveal: React.FC<TextRevealProps> = ({
  text,
  delay = 0,
  fontSize = 64,
  fontWeight = 700,
  color = "#FFFFFF",
  fontFamily = "Inter",
  maxWidth,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + 15], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const translateY = interpolate(frame, [delay, delay + 15], [30, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        fontSize,
        fontWeight,
        color,
        fontFamily,
        maxWidth,
        lineHeight: 1.2,
      }}
    >
      {text}
    </div>
  );
};
