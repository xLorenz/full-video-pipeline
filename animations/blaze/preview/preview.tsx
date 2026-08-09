import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import { BlazeRip } from "../component";

const PREVIEW_COLORS = {
  primary: "#E4572E",
  secondary: "#C9A227",
  accent: "#F2E8DA",
  background: "#171014",
  text: "#F2E8DA",
  muted: "#9A8A82",
  ink: "#F2E8DA",
  paper: "#171014",
  dusk: "#2A1E23",
  ember: "#E4572E",
};
const PREVIEW_FONTS = {
  heading: "Inter",
  body: "Poppins",
  mono: "JetBrains Mono",
};
const PREVIEW_FONT_SIZES = { headline: 128, body: 26, caption: 18 };

/** A stylized "pyre" photograph built from CSS gradients — the sunset
 * disc and ridge silhouettes give the heat distortion and luma
 * darkening a lot of structure to bend when the fire rises over them. */
const PhotoBlock: React.FC<{ label: string }> = ({ label }) => (
  <div style={{ marginTop: 40 }}>
    <div
      style={{
        width: "100%",
        height: 360,
        borderRadius: 12,
        background: `linear-gradient(to bottom, #2A1E23 0%, #2A1E23 30%, #7A3B22 55%, #E4572E 78%, #C9A227 100%)`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 70,
          width: 190,
          height: 190,
          borderRadius: 999,
          transform: "translateX(-50%)",
          background: `radial-gradient(circle at 42% 36%, #F2E8DA 0%, #F2E8DA 38%, rgba(242, 232, 218, 0) 39%)`,
          opacity: 0.95,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "8%",
          right: "8%",
          bottom: 0,
          height: 150,
          background:
            "linear-gradient(to bottom, rgba(23, 16, 20, 0) 0%, #171014 78%, #171014 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 90,
          top: 92,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 15,
          letterSpacing: 3,
          color: "rgba(242, 232, 218, 0.85)",
        }}
      >
        FIG. {label} — a pyre, made of gradients
      </div>
    </div>
  </div>
);

/**
 * The scene behind the fire — a full-frame editorial poster. It is the
 * CALLER'S content: BlazeRip knows nothing about it, it just captures
 * its DOM into a texture each frame and burns it from the bottom up.
 * Blaze does NOT scroll — the scene sits at exactly the frame size
 * (1920×1080), and the fire rises over it as it stands. A small entrance
 * animation (headline rise, transforms only) demonstrates that per-frame
 * styles are captured as-is.
 */
const BurnPoster: React.FC = () => {
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
        height: 1080,
        backgroundColor: PREVIEW_COLORS.paper,
        position: "relative",
        padding: "0 120px",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* masthead */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "30px 0",
          borderBottom: `2px solid ${PREVIEW_COLORS.muted}`,
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
          BLAZE
        </div>
        <div
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 16,
            letterSpacing: 2,
            color: PREVIEW_COLORS.muted,
          }}
        >
          CANVAS UI PORT — 14
        </div>
      </div>

      {/* headline */}
      <div style={{ padding: "48px 0 4px 0", transform: `translateY(${(1 - rise) * 30}px)` }}>
        <div
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 150,
            fontWeight: 900,
            letterSpacing: -4,
            lineHeight: 0.94,
            color: PREVIEW_COLORS.ink,
          }}
        >
          THE FIRE
          <br />
          STARTS HERE
        </div>
        <div
          style={{
            marginTop: 24,
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 26,
            color: PREVIEW_COLORS.muted,
          }}
        >
          A procedural blaze rises from the bottom of the frame — layered
          sparks with depth, drifting smoke, a warm glow at the base.
        </div>
      </div>

      {/* pyre photo */}
      <PhotoBlock label="A" />

      {/* body text */}
      <div style={{ display: "flex", gap: 60, marginTop: 44 }}>
        <div style={{ flex: 1.15 }}>
          <p
            style={{
              marginBottom: 28,
              fontSize: 26,
              lineHeight: 1.65,
              color: PREVIEW_COLORS.text,
            }}
          >
            Blaze is the only Canvas UI treatment with no cursor and no
            scrollbar. The fire is generated entirely from a single clock
            — voronoi sparks rising in depth, fbm smoke drifting off the
            column, a warm glow at the base — so a render has exactly one
            job: advance the clock. That makes it the simplest port yet.
          </p>
          <p
            style={{
              marginBottom: 28,
              fontSize: 26,
              lineHeight: 1.65,
              color: PREVIEW_COLORS.text,
            }}
          >
            The heat is real: a second, half-resolution pass draws the
            fire, and the main pass reads it back — bending the page
            beneath with octaves of simplex noise, darkening it where the
            flames are bright, and rising over it like an open pyre.
          </p>
          {/* pull quote */}
          <div
            style={{
              borderLeft: `6px solid ${PREVIEW_COLORS.primary}`,
              padding: "8px 0 8px 36px",
              margin: "40px 0",
              fontFamily: "Inter, system-ui, sans-serif",
              fontSize: 42,
              fontWeight: 800,
              lineHeight: 1.15,
              color: PREVIEW_COLORS.ink,
            }}
          >
            “Fire is a material
            <br />
            that forgets its source.”
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <p
            style={{
              marginBottom: 28,
              fontSize: 26,
              lineHeight: 1.65,
              color: PREVIEW_COLORS.text,
            }}
          >
            Raise <span style={{ fontFamily: "JetBrains Mono, monospace" }}>height</span> and
            the fire climbs higher; push{" "}
            <span style={{ fontFamily: "JetBrains Mono, monospace" }}>distortion</span> and
            the page shimmers harder beneath it. Kill{" "}
            <span style={{ fontFamily: "JetBrains Mono, monospace" }}>sparks</span> and{" "}
            <span style={{ fontFamily: "JetBrains Mono, monospace" }}>smoke</span>, tune{" "}
            <span style={{ fontFamily: "JetBrains Mono, monospace" }}>sparkColor</span> to
            cyan, and the same pipeline is a cold electric mirage instead
            of a bonfire.
          </p>
          <p
            style={{
              marginBottom: 28,
              fontSize: 26,
              lineHeight: 1.65,
              color: PREVIEW_COLORS.text,
            }}
          >
            Everything is driven by{" "}
            <span style={{ fontFamily: "JetBrains Mono, monospace" }}>uTime</span> alone —
            the same clock the upstream demo runs on, re-based to
            composition frames so frame N always burns the same pixels.
          </p>
        </div>
      </div>

      {/* footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 40,
          padding: "24px 0",
          borderTop: `2px solid ${PREVIEW_COLORS.muted}`,
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
          blaze · procedural fire treatment
        </div>
        <div
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 16,
            letterSpacing: 2,
            color: PREVIEW_COLORS.muted,
          }}
        >
          NO CURSOR · NO SCROLL · ONLY TIME
        </div>
      </div>
    </div>
  );
};

/**
 * Self-contained 90-frame (3s @ 30fps) preview for blaze.
 *
 * Exercises the full-frame children model: `<BlazeRip>` wraps a
 * frame-sized `<BurnPoster>` and the fire rises over it for the whole
 * composition — heat-distorting the poster, darkening it under the
 * flames, and laying sparks and smoke over it. The preview raises the
 * fire `height` a touch above the top edge (0.85) so the clean band of
 * undisturbed poster stays visible at the top of the frame, and fades
 * the treatment in over the first 12 frames and out over the last 12
 * (the `tapeFade` pattern — canvas opacity, so the capture record is
 * untouched).
 */
export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "blaze.preview",
    theme: {
      palette: {
        primary: "#E4572E",
        secondary: "#C9A227",
        accent: "#F2E8DA",
        background: "#171014",
        text: "#F2E8DA",
        muted: "#9A8A82",
      },
    },
    global: { speed: 1, delayOffset: 0, easing: "ease-out-cubic" as const },
    elements: [],
    extras: {
      height: 0.85,
      distortion: 0.6,
      distortionScale: 0.5,
      speed: 1,
      sparks: 0.5,
      sparkDensity: 1.5,
      sparkSize: 1,
      layers: 4,
      smoke: 0.5,
      glow: 1.5,
      sparkColor: [1, 0.4, 0.05],
      smokeColor: [1, 0.43, 0.1],
      fadeInFrames: 12,
      fadeOutFrames: 12,
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return (
    <BlazeRip {...PREVIEW_DEFAULT_PROPS}>
      <BurnPoster />
    </BlazeRip>
  );
};
