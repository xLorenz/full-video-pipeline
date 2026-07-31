import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import type { CaptionCue } from "../lib/types";

interface CaptionsProps {
  cues: CaptionCue[];
  fps: number;
  /** Visible window per cue (seconds) before fade. Default 3.5s. */
  maxCueSeconds?: number;
  /** Font size in pixels. Default scaled to height elsewhere; defaults to 48. */
  fontSize?: number;
  /** Text color. */
  color?: string;
  /** Background pill color (semi-transparent if alpha included). */
  backgroundColor?: string;
  /** Bottom offset in pixels from the bottom edge. */
  bottomOffset?: number;
}

/**
 * Burned-in caption bar. Reads per-scene `captions` cues (times relative to
 * scene start). Optional: scene components should render <Captions> only when
 * `showCaptions` (set on the scene from props) is true.
 *
 * Audio is muxed at stitch time — this component renders captions ONLY,
 * it does NOT play the voiceover.
 */
export const Captions: React.FC<CaptionsProps> = ({
  cues,
  fps,
  maxCueSeconds = 3.5,
  fontSize = 48,
  color = "#FFFFFF",
  backgroundColor = "rgba(0,0,0,0.65)",
  bottomOffset = 80,
}) => {
  const frame = useCurrentFrame();
  const t = frame / fps;

  const active = cues.find((c) => t >= c.start && t < c.end);
  if (!active) return null;

  const cueEndFrame = Math.round(active.end * fps);
  const fadeFrames = Math.min(6, Math.round((active.end - active.start) * fps * 0.15));

  const opacity = interpolate(
    frame,
    [cueEndFrame - fadeFrames, cueEndFrame],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: bottomOffset,
        transform: "translateX(-50%)",
        opacity,
        backgroundColor,
        color,
        fontSize,
        fontFamily: "Poppins, sans-serif",
        fontWeight: 600,
        padding: "10px 28px",
        borderRadius: 12,
        maxWidth: "72%",
        textAlign: "center",
        lineHeight: 1.25,
        whiteSpace: "normal",
        wordBreak: "normal",
        pointerEvents: "none",
      }}
    >
      {active.text}
    </div>
  );
};
