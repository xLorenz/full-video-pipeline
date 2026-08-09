import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import { ShatterRip } from "../component";

const PREVIEW_COLORS = {
  primary: "#A93A2A",
  secondary: "#2E5B52",
  accent: "#C79A3E",
  background: "#F4EFE6",
  text: "#241F1B",
  muted: "#7A7166",
  ink: "#1D1A16",
  paper: "#F4EFE6",
  paperDeep: "#E7DFCF",
};
const PREVIEW_FONTS = {
  heading: "Inter",
  body: "Poppins",
  mono: "JetBrains Mono",
};
const PREVIEW_FONT_SIZES = { headline: 128, body: 26, caption: 18 };

/** A stylized "photograph" block built from CSS gradients — the sun disc
 * and ridge edges give the refraction and dispersion a lot to work with
 * when the lens shatters over them. */
const PhotoBlock: React.FC<{
  label: string;
  sky: string;
  sun: string;
  ridge1: string;
  ridge2: string;
}> = ({ label, sky, sun, ridge1, ridge2 }) => (
  <div style={{ marginTop: 56 }}>
    <div
      style={{
        width: "100%",
        height: 480,
        borderRadius: 12,
        background: `linear-gradient(to bottom, ${sky} 0%, ${sky} 55%, ${ridge1} 55%, ${ridge1} 72%, ${ridge2} 72%, ${ridge2} 100%)`,
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 24px 60px -30px rgba(36, 31, 27, 0.55)",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 96,
          width: 220,
          height: 220,
          borderRadius: 999,
          transform: "translateX(-50%)",
          background: `radial-gradient(circle at 40% 35%, ${sun} 0%, ${sun} 42%, rgba(255, 255, 255, 0) 43%)`,
          opacity: 0.95,
        }}
      />
    </div>
    <div
      style={{
        marginTop: 14,
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 16,
        letterSpacing: 2,
        color: PREVIEW_COLORS.muted,
      }}
    >
      FIG. {label} — a landscape, made of gradients
    </div>
  </div>
);

/**
 * The scene behind the glass — a tall magazine "page". It is the
 * CALLER'S content: ShatterRip knows nothing about it, it just captures
 * its DOM into a texture each frame (scroll position included) and
 * breaks it into shards around the traveling lens. The scene is TALLER
 * than the frame so it has real scroll distance, and a small entrance
 * animation (headline rise, transforms only) demonstrates that
 * per-frame styles are captured as-is.
 */
const PageScene: React.FC = () => {
  const frame = useCurrentFrame();
  const rise = interpolate(frame, [6, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <div
      style={{
        width: 1920,
        height: 2240,
        backgroundColor: PREVIEW_COLORS.paper,
        position: "relative",
        padding: "0 150px",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* masthead */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "34px 0",
          borderBottom: `2px solid ${PREVIEW_COLORS.ink}`,
        }}
      >
        <div
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 20,
            letterSpacing: 6,
            fontWeight: 700,
            color: PREVIEW_COLORS.ink,
          }}
        >
          SHATTER
        </div>
        <div
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 16,
            letterSpacing: 2,
            color: PREVIEW_COLORS.muted,
          }}
        >
          VOL. IV — ISSUE 12
        </div>
      </div>

      {/* headline */}
      <div style={{ padding: "64px 0 8px 0", transform: `translateY(${(1 - rise) * 30}px)` }}>
        <div
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 148,
            fontWeight: 900,
            letterSpacing: -4,
            lineHeight: 0.94,
            color: PREVIEW_COLORS.ink,
          }}
        >
          GLASS BREAKS
          <br />
          INTO LIGHT
        </div>
        <div
          style={{
            marginTop: 30,
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 26,
            color: PREVIEW_COLORS.muted,
          }}
        >
          A shatter lens travels across the page — every tile it passes
          lifts off the spread, tips into the light, and floats as glass
          over the void, refracting the content beneath it.
        </div>
      </div>

      {/* lead photo */}
      <PhotoBlock label="A" sky="#E8DCC3" sun="#E4B64C" ridge1="#9DB8A4" ridge2="#5F7D6A" />

      {/* body text */}
      <div style={{ display: "flex", gap: 60, marginTop: 64 }}>
        <div style={{ flex: 1.15 }}>
          {[
            "The lens is a circle in screen space; the shards are a Voronoi-jittered tile grid in content space. Where the two overlap, each tile computes its own seed — lift, tilt, scatter, float phase — and the shader solves the inverse perspective map to re-sample the live texture of the page through the tilted glass.",
            "Nothing is faked with a mask. The lifted shards really are the page, displaced: the refraction shifts the sample, the dispersion splits it into separate red, green and blue picks, and the shading tints each shard by its normal against a fixed light. Break the page and it keeps being the page.",
          ].map((text, i) => (
            <p
              key={i}
              style={{
                marginBottom: 28,
                fontSize: 26,
                lineHeight: 1.65,
                color: PREVIEW_COLORS.text,
              }}
            >
              {text}
            </p>
          ))}
          {/* pull quote */}
          <div
            style={{
              borderLeft: `6px solid ${PREVIEW_COLORS.primary}`,
              padding: "8px 0 8px 36px",
              margin: "44px 0",
              fontFamily: "Inter, system-ui, sans-serif",
              fontSize: 42,
              fontWeight: 800,
              lineHeight: 1.15,
              color: PREVIEW_COLORS.ink,
            }}
          >
            “Glass is just a page
            <br />
            that forgot it was whole.”
          </div>
          <p
            style={{
              fontSize: 26,
              lineHeight: 1.65,
              color: PREVIEW_COLORS.text,
            }}
          >
            Raise <span style={{ fontFamily: "JetBrains Mono, monospace" }}>lift</span> and
            the shards hang higher over the void; push{" "}
            <span style={{ fontFamily: "JetBrains Mono, monospace" }}>refraction</span> and
            the page bends harder behind the glass. Crank{" "}
            <span style={{ fontFamily: "JetBrains Mono, monospace" }}>dispersion</span> and
            every shard edge fringes into its RGB.
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <PhotoBlock label="B" sky="#CBDDE3" sun="#E9C46A" ridge1="#7D9E89" ridge2="#40594C" />
          <p
            style={{
              marginTop: 40,
              fontSize: 26,
              lineHeight: 1.65,
              color: PREVIEW_COLORS.text,
            }}
          >
            The lens never stops sweeping: from off the left edge of the
            frame to off the right, mid-screen, while the page scrolls
            beneath it. Tiles settle back into the page as the lens
            leaves — a shatter wave that reforms behind itself, the same
            behavior as moving your cursor across the demo on
            canvasui.dev.
          </p>
        </div>
      </div>

      {/* footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 72,
          padding: "30px 0",
          borderTop: `2px solid ${PREVIEW_COLORS.ink}`,
        }}
      >
        <div
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 16,
            letterSpacing: 2,
            color: PREVIEW_COLORS.muted,
          }}
        >
          shatter · glass-shard lens treatment
        </div>
        <div
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 16,
            letterSpacing: 2,
            color: PREVIEW_COLORS.muted,
          }}
        >
          CANVAS UI PORT — 13
        </div>
      </div>
    </div>
  );
};

/**
 * Self-contained 90-frame (3s @ 30fps) preview for shatter.
 *
 * Exercises the full-frame children model: `<ShatterRip>` wraps a tall
 * `<PageScene>` and the composition plays one pass — the page scrolls
 * while the lens sweeps from the left edge to the right edge,
 * shattering the spread and letting it reform behind itself. Defaults
 * from upstream, `fadeInFrames`/`fadeOutFrames: 8` so the lens grows
 * in and out smoothly at the scene bounds.
 */
export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "shatter.preview",
    theme: {
      palette: {
        primary: "#A93A2A",
        secondary: "#2E5B52",
        accent: "#C79A3E",
        background: "#F4EFE6",
        text: "#241F1B",
        muted: "#7A7166",
      },
    },
    global: { speed: 1, delayOffset: 0, easing: "ease-out-cubic" as const },
    elements: [],
    extras: {
      radius: 0.4,
      softness: 0.6,
      tileSize: 125,
      shards: 1,
      corner: 0,
      lift: 30,
      tilt: 2,
      scatter: 5,
      perspective: 1500,
      gapColor: [0, 0, 0],
      shadow: 0.5,
      shading: 0.5,
      refraction: 1.5,
      dispersion: 0.3,
      floatSpeed: 2,
      strength: 1,
      baseStrength: 0,
      fadeInFrames: 8,
      fadeOutFrames: 8,
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return (
    <ShatterRip {...PREVIEW_DEFAULT_PROPS}>
      <PageScene />
    </ShatterRip>
  );
};
