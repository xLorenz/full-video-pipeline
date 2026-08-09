import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import { BendRip } from "../component";

const PREVIEW_COLORS = {
  primary: "#B5492F",
  secondary: "#2F5D50",
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

/** A stylized "photograph" block built from CSS gradients. */
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
 * The scene behind the fold — a tall magazine "page". It is the
 * CALLER'S content: BendRip knows nothing about it, it just captures
 * its DOM into a texture each frame (scroll position included) and
 * folds the top/bottom edges over virtual creases. The scene is TALLER
 * than the frame so it has real scroll distance for the fold sweep,
 * and a small entrance animation (headline rise) demonstrates that
 * per-frame styles are captured as-is.
 */
const PageScene: React.FC = () => {
  const frame = useCurrentFrame();
  const in1 = interpolate(frame, [6, 22], [0.1, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const in2 = interpolate(frame, [12, 30], [0.1, 1], {
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
          opacity: in1,
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
          THE FOLD
        </div>
        <div
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 16,
            letterSpacing: 2,
            color: PREVIEW_COLORS.muted,
          }}
        >
          VOL. IV — ISSUE 9
        </div>
      </div>

      {/* headline */}
      <div style={{ padding: "64px 0 8px 0", opacity: in1, transform: `translateY(${(1 - in1) * 30}px)` }}>
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
          PAGES BEND
          <br />
          AT THE EDGES
        </div>
        <div
          style={{
            marginTop: 30,
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 26,
            color: PREVIEW_COLORS.muted,
            opacity: in2,
          }}
        >
          A magazine spread scrolling on the face of a cube — the top and
          bottom edges fold over virtual creases and flatten back out at
          the scroll ends.
        </div>
      </div>

      {/* lead photo */}
      <PhotoBlock label="A" sky="#E8DCC3" sun="#E4B64C" ridge1="#9DB8A4" ridge2="#5F7D6A" />

      {/* body text */}
      <div style={{ display: "flex", gap: 60, marginTop: 64 }}>
        <div style={{ flex: 1.15 }}>
          {[
            "Every page in this spread is a plane in three dimensions. The scroll drives the fold: as the content travels through the frame, the crease walks up from the bottom edge, holds through the middle of the pass, and flattens out again at the top — like the turning of a page, except the page is the whole viewport.",
            "The fold is not an illusion pasted over the frame. The shader traces the folded surface pixel by pixel, projects it through a perspective camera, and re-samples the live texture of the page along the folded coordinates. What you see at the crease is the page itself, curved — not a copy of it.",
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
            “A page is a cube face
            <br />
            that forgot it could bend.”
          </div>
          <p
            style={{
              fontSize: 26,
              lineHeight: 1.65,
              color: PREVIEW_COLORS.text,
            }}
          >
            With <span style={{ fontFamily: "JetBrains Mono, monospace" }}>rounding</span> the crease is an arc, not a knife edge — the
            page curls over the fold the way paper really does. Raise the
            <span style={{ fontFamily: "JetBrains Mono, monospace" }}> angle</span> toward 90 and the edge becomes the hard corner of a
            cube; drop the <span style={{ fontFamily: "JetBrains Mono, monospace" }}>perspective</span> and the fold pinches harder
            toward the horizon.
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
            The two edges travel independently. Let either edge reach its
            scroll end and its crease flattens out over the
            <span style={{ fontFamily: "JetBrains Mono, monospace" }}> ease</span> distance, so the page sits flat at rest and only
            bends while the content is actually in motion — the same
            behavior as scrolling the demo on canvasui.dev.
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
          bend · cube-face scroll treatment
        </div>
        <div
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 16,
            letterSpacing: 2,
            color: PREVIEW_COLORS.muted,
          }}
        >
          CANVAS UI PORT — 12
        </div>
      </div>
    </div>
  );
};

/**
 * Self-contained 90-frame (3s @ 30fps) preview for bend.
 *
 * Exercises the full-frame children model: `<BendRip>` wraps a tall
 * `<PageScene>` and the composition plays one scroll pass — the page
 * travels from its top edge (bottom crease folded) through the middle
 * (both folded) to its bottom edge (top crease folded). `zone: 260`
 * for a generous folded region, `ease: 260` so each crease visibly
 * flattens over the first/last quarter of the pass, `rounding: 150`
 * for a paper-like curved crease.
 */
export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "bend.preview",
    theme: {
      palette: {
        primary: "#B5492F",
        secondary: "#2F5D50",
        accent: "#C79A3E",
        background: "#F4EFE6",
        text: "#241F1B",
        muted: "#7A7166",
      },
    },
    global: { speed: 1, delayOffset: 0, easing: "ease-out-cubic" as const },
    elements: [],
    extras: {
      zone: 260,
      angle: 80,
      rounding: 150,
      perspective: 700,
      direction: "in" as const,
      ease: 260,
      top: true,
      bottom: true,
      fadeInFrames: 4,
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return (
    <BendRip {...PREVIEW_DEFAULT_PROPS}>
      <PageScene />
    </BendRip>
  );
};
