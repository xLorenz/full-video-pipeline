import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import { Magnify } from "../component";

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
const PREVIEW_FONT_SIZES = { headline: 150, body: 24, caption: 16 };

/** A stylized "photograph" block built from CSS gradients — the sun
 * disc, ridge edges and caption text give the lens a lot of fine
 * detail to magnify. */
const PhotoBlock: React.FC<{ label: string }> = ({ label }) => (
  <div style={{ marginTop: 36 }}>
    <div
      style={{
        width: "100%",
        height: 320,
        borderRadius: 10,
        background:
          "linear-gradient(to bottom, #E8DCC3 0%, #E8DCC3 52%, #9DB8A4 52%, #9DB8A4 70%, #5F7D6A 70%, #5F7D6A 100%)",
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 24px 60px -30px rgba(36, 31, 27, 0.55)",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "38%",
          top: 62,
          width: 150,
          height: 150,
          borderRadius: 999,
          background:
            "radial-gradient(circle at 40% 35%, #E4B64C 0%, #E4B64C 42%, rgba(255,255,255,0) 43%)",
          opacity: 0.95,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "22%",
          bottom: 26,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 14,
          letterSpacing: 2,
          color: "rgba(244, 239, 230, 0.85)",
        }}
      >
        FIG. 1 — LIGHT OVER RIDGES
      </div>
    </div>
  </div>
);

/** A dark optical datasheet — rows of tiny mono label:value pairs over
 * a hairline grid. The lens loves this kind of dense detail. */
const SpecSheet: React.FC = () => (
  <div
    style={{
      marginTop: 36,
      backgroundColor: PREVIEW_COLORS.ink,
      borderRadius: 10,
      padding: "34px 36px",
      color: PREVIEW_COLORS.paper,
      boxShadow: "0 24px 60px -30px rgba(29, 26, 22, 0.7)",
    }}
  >
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        borderBottom: `1px solid rgba(244, 239, 230, 0.35)`,
        paddingBottom: 18,
      }}
    >
      <span
        style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 30,
          fontWeight: 800,
          letterSpacing: 1,
        }}
      >
        OPTICAL SPEC
      </span>
      <span
        style={{
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 13,
          letterSpacing: 2,
          color: "rgba(244, 239, 230, 0.6)",
        }}
      >
        MAGNIFY 2.4
      </span>
    </div>
    {[
      ["APERTURE", "F / 2.0"],
      ["FOCAL LENGTH", "24 MM"],
      ["MAGNIFICATION", "1.5 — 4.0 X"],
      ["ABERRATION", "0.8 AXIAL"],
      ["HAZE INDEX", "0.2 SOFT"],
      ["RIPPLE SPEED", "900 PX / S"],
      ["LENS RADIUS", "140 CSS PX"],
    ].map(([k, v], i) => (
      <div
        key={k}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          padding: "13px 0",
          borderBottom:
            i < 6 ? "1px solid rgba(244, 239, 230, 0.12)" : "none",
        }}
      >
        <span
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 14,
            letterSpacing: 2,
            color: "rgba(244, 239, 230, 0.55)",
          }}
        >
          {k}
        </span>
        <span
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 14,
            letterSpacing: 1,
            color: PREVIEW_COLORS.accent,
          }}
        >
          {v}
        </span>
      </div>
    ))}
  </div>
);

/**
 * The scene behind the lens — a 16:9 magazine spread (1920x1080,
 * exactly the composition size, so uMaxX = 1). It is the CALLER'S
 * content: Magnify knows nothing about it, it just captures its DOM
 * into a mipmapped texture each frame and magnifies it under the
 * traveling lens. Dense detail (headline type, gradient photo, tiny
 * mono spec rows) gives the lens something to chew on, and a small
 * transform-only entrance (headline rise) demonstrates that per-frame
 * styles are captured as-is.
 */
const SpreadScene: React.FC = () => {
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
        padding: "0 150px",
        fontFamily: "Inter, system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* masthead */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "30px 0",
          borderBottom: `2px solid ${PREVIEW_COLORS.ink}`,
        }}
      >
        <div
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 22,
            letterSpacing: 8,
            fontWeight: 700,
            color: PREVIEW_COLORS.ink,
          }}
        >
          MAGNIFY
        </div>
        <div
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 15,
            letterSpacing: 2,
            color: PREVIEW_COLORS.muted,
          }}
        >
          VOL. XII — THE CLOSE-UP ISSUE
        </div>
      </div>

      {/* headline (transform-only entrance) */}
      <div
        style={{
          padding: "52px 0 10px 0",
          transform: `translateY(${(1 - rise) * 30}px)`,
        }}
      >
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
          SEE CLOSER
        </div>
        <div
          style={{
            marginTop: 24,
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 24,
            color: PREVIEW_COLORS.muted,
            maxWidth: 640,
            lineHeight: 1.5,
          }}
        >
          A scripted cursor travels the spread, magnifying the page
          beneath it — and clicks the things it wants you to look at.
        </div>
      </div>

      {/* body: photo block left, spec sheet right */}
      <div style={{ display: "flex", gap: 70, marginTop: 44 }}>
        <div style={{ flex: 1 }}>
          <PhotoBlock label="1" />
          <p
            style={{
              marginTop: 26,
              fontSize: 19,
              lineHeight: 1.6,
              color: PREVIEW_COLORS.text,
            }}
          >
            The lens is a circle in screen space; the page is a live
            texture. Where the two meet, the shader re-samples the
            texture through the magnified lens — chromatic aberration
            splitting the RGB near the rim, a soft haze lifting the
            detail, and a HUD reticle framing the focal point.
          </p>
        </div>
        <div style={{ flex: 1.1 }}>
          <SpecSheet />
        </div>
      </div>

      {/* footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "absolute",
          left: 150,
          right: 150,
          bottom: 28,
          paddingTop: 22,
          borderTop: `2px solid ${PREVIEW_COLORS.ink}`,
        }}
      >
        <div
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 14,
            letterSpacing: 2,
            color: PREVIEW_COLORS.muted,
          }}
        >
          magnify · scripted cursor lens treatment
        </div>
        <div
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 14,
            letterSpacing: 2,
            color: PREVIEW_COLORS.muted,
          }}
        >
          CANVAS UI PORT — 14
        </div>
      </div>
    </div>
  );
};

/**
 * Self-contained 120-frame (4s @ 30fps) preview for magnify.
 *
 * Exercises the scripted cursor model end to end: the lens fades in at
 * the left edge of the frame, sweeps to the headline with an
 * ease-out-quint move, clicks the headline on arrival (ripple + zoom
 * punch), then makes a RELATIVE move (ease-out-back) down to the
 * optical spec sheet, where a standalone double-click at 80% fires two
 * ripples and punches the magnification twice. The lens fades out at
 * 97%. follow 0.5 keeps the damped-cursor feel.
 */
export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "magnify.preview",
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
      size: 150,
      zoom: 1.5,
      color: [0.66, 0.23, 0.16],
      follow: 0.5,
      hud: 0.8,
      ring: true,
      crosshair: true,
      ticks: true,
      brackets: true,
      dot: true,
      grid: false,
      readout: true,
      aberration: 0.8,
      haze: 0.2,
      ripples: true,
      rippleSpeed: 900,
      rippleWidth: 2,
      rippleBendWidth: 100,
      rippleBend: 20,
      rippleGlow: 1,
      rippleLife: 1.4,
      cursor: {
        start: { x: -0.16, y: 0.55 },
        enter: 0.04,
        leave: 0.97,
        moves: [
          {
            to: { x: 0.3, y: 0.34 },
            at: 0.3,
            ease: "ease-out-quint",
          },
          {
            to: { x: 0.52, y: 0.36 },
            at: 0.52,
            ease: "ease-out-cubic",
            click: { hold: 0.1, release: 0.08, zoom: 1.6 },
          },
          {
            to: { dx: 0.16, dy: 0.26 },
            at: 0.76,
            ease: "ease-out-back",
          },
        ],
        clicks: [
          { at: 0.82, hold: 0.08, release: 0.06, count: 2, zoom: 1.5 },
        ],
      },
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return (
    <Magnify {...PREVIEW_DEFAULT_PROPS}>
      <SpreadScene />
    </Magnify>
  );
};
