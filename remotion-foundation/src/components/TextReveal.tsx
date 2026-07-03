import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";

interface AnimationConfig {
  duration?: number;
  translateY?: number;
  easing?: "ease-out" | "ease-in" | "linear";
}

interface TextRevealProps {
  text: string;
  delay?: number;
  style: {
    fontSize: number;
    fontWeight: number;
    color: string;
    fontFamily: string;
    lineHeight?: number;
    maxWidth?: number;
  };
  animation?: AnimationConfig;
}

const getEasing = (type?: "ease-out" | "ease-in" | "linear") => {
  switch (type) {
    case "ease-in":
      return Easing.in(Easing.cubic);
    case "linear":
      return Easing.linear;
    case "ease-out":
    default:
      return Easing.out(Easing.cubic);
  }
};

export const TextReveal: React.FC<TextRevealProps> = ({
  text,
  delay = 0,
  style,
  animation,
}) => {
  const frame = useCurrentFrame();

  const duration = animation?.duration ?? 15;
  const translateYAmount = animation?.translateY ?? 30;
  const easing = getEasing(animation?.easing);

  const opacity = interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing,
  });
  const translateY = interpolate(
    frame,
    [delay, delay + duration],
    [translateYAmount, 0],
    {
      extrapolateRight: "clamp",
      extrapolateLeft: "clamp",
      easing,
    }
  );

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        color: style.color,
        fontFamily: style.fontFamily,
        lineHeight: style.lineHeight ?? 1.2,
        maxWidth: style.maxWidth,
      }}
    >
      {text}
    </div>
  );
};
