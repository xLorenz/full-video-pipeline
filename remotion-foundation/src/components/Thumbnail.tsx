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
          fontSize: "clamp(48px, 6vw, 80px)",
          fontWeight: 700,
          textAlign: "center",
          margin: "0 80px",
          lineHeight: 1.1,
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          textOverflow: "ellipsis",
          overflowWrap: "break-word",
        }}
      >
        {title}
      </h1>
      {subtitle && (
        <p
          style={{
            color: palette.accent,
            fontSize: "clamp(24px, 2.8vw, 36px)",
            fontWeight: 600,
            marginTop: 20,
            maxWidth: "80%",
            textAlign: "center",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {subtitle}
        </p>
      )}
    </AbsoluteFill>
  );
};
