import React from "react";
import { AbsoluteFill } from "remotion";
import type { ThumbnailProps } from "remotion-foundation";

export const Thumbnail: React.FC<ThumbnailProps> = ({ title, subtitle, palette }) => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: palette.background,
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <h1
        style={{
          color: palette.text,
          fontSize: 80,
          fontWeight: 700,
          textAlign: "center",
          margin: "0 80px",
          lineHeight: 1.1,
        }}
      >
        {title}
      </h1>
      {subtitle && (
        <p
          style={{
            color: palette.accent,
            fontSize: 36,
            fontWeight: 600,
            marginTop: 20,
          }}
        >
          {subtitle}
        </p>
      )}
    </AbsoluteFill>
  );
};
