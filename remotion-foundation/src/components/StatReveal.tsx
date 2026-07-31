import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";

interface AnimationConfig {
  duration?: number;
  scale?: [number, number];
  easing?: "ease-out" | "ease-in" | "linear";
}

interface StatRevealProps {
  value: string;
  label?: string;
  delay?: number;
  style: {
    fontSize: number;
    fontWeight: number;
    color: string;
    fontFamily: string;
    lineHeight?: number;
  };
  labelStyle?: {
    fontSize: number;
    color: string;
    opacity?: number;
    marginTop?: number;
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

export const StatReveal: React.FC<StatRevealProps> = ({
  value,
  label,
  delay = 0,
  style,
  labelStyle,
  animation,
}) => {
  const frame = useCurrentFrame();

  const duration = animation?.duration ?? 20;
  const scaleRange = animation?.scale ?? [0.8, 1];
  const easing = getEasing(animation?.easing);

  const opacity = interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing,
  });
  const scale = interpolate(
    frame,
    [delay, delay + duration],
    scaleRange,
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
        transform: `scale(${scale})`,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          color: style.color,
          fontFamily: style.fontFamily,
          lineHeight: style.lineHeight ?? 1,
        }}
      >
        {value}
      </div>
      {label && labelStyle && (
        <div
          style={{
            fontSize: labelStyle.fontSize,
            color: labelStyle.color,
            fontFamily: style.fontFamily,
            marginTop: labelStyle.marginTop ?? 16,
            opacity: labelStyle.opacity ?? 0.8,
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
};
