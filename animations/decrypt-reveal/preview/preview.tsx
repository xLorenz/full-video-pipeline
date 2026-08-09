import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import { DecryptRip } from "../component";

const PREVIEW_COLORS = {
  primary: "#4ade80",
  secondary: "#FF5D5D",
  accent: "#D9F3E4",
  background: "#0B0F0C",
  text: "#D9F3E4",
  muted: "#5A6E62",
  ink: "#D9F3E4",
  paper: "#0B0F0C",
  panel: "#101613",
  red: "#FF5D5D",
};
const PREVIEW_FONTS = {
  heading: "Inter",
  body: "Poppins",
  mono: "JetBrains Mono",
};
const PREVIEW_FONT_SIZES = { headline: 128, body: 26, caption: 18 };

/**
 * The scene behind the cipher — a full-frame classified dossier. It is
 * the CALLER'S content: DecryptRip knows nothing about it, it just
 * captures its DOM into a texture each frame and covers it with a
 * shape-matched cipher. Monospace text is ideal: every glyph of the
 * cipher is chosen to match the shapes of the content beneath it, so
 * the encrypted page reads like a scrambled, still-readable script.
 * DecryptReveal does NOT scroll — the scene sits at exactly the frame
 * size, and the decrypt circle travels over it as it stands. A small
 * entrance animation (headline rise, transforms only) demonstrates that
 * per-frame styles are captured as-is.
 */
const Dossier: React.FC = () => {
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
        padding: "0 110px",
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
        color: PREVIEW_COLORS.ink,
      }}
    >
      {/* status bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "26px 0",
          borderBottom: `2px solid ${PREVIEW_COLORS.muted}`,
          fontSize: 17,
          letterSpacing: 3,
          color: PREVIEW_COLORS.muted,
        }}
      >
        <div>CLASSIFIED // EYES ONLY</div>
        <div>FILE 0014 // CANVAS UI PORT — 15</div>
      </div>

      {/* headline */}
      <div style={{ padding: "54px 0 6px 0", transform: `translateY(${(1 - rise) * 30}px)` }}>
        <div
          style={{
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontSize: 128,
            fontWeight: 700,
            letterSpacing: -2,
            lineHeight: 1.0,
            color: PREVIEW_COLORS.ink,
          }}
        >
          PROJECT
          <br />
          DECRYPT
        </div>
        <div
          style={{
            marginTop: 26,
            fontSize: 22,
            letterSpacing: 2,
            color: PREVIEW_COLORS.muted,
          }}
        >
          A cipher of shape-matched glyphs covers the page. A decrypt
          circle travels the frame and the real content falls through.
        </div>
      </div>

      {/* redacted block */}
      <div
        style={{
          marginTop: 42,
          padding: "20px 28px",
          backgroundColor: PREVIEW_COLORS.panel,
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          border: `1px solid ${PREVIEW_COLORS.muted}`,
        }}
      >
        <div style={{ fontSize: 22, letterSpacing: 3, color: PREVIEW_COLORS.ink }}>
          ▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓
        </div>
        <div style={{ fontSize: 20, letterSpacing: 4, color: PREVIEW_COLORS.red }}>
          REDACTED
        </div>
      </div>

      {/* body columns */}
      <div style={{ display: "flex", gap: 56, marginTop: 42 }}>
        <div style={{ flex: 1.1, fontSize: 19, lineHeight: 1.75, color: PREVIEW_COLORS.text }}>
          <p style={{ marginBottom: 24 }}>
            Every cell of the cipher grid samples the page beneath it —
            six probe circles carve a shape signature out of the ink, and
            the glyph whose signature is nearest wins. Text stays
            text-like; blocks stay blocks. The encrypted page is a
            mirror, not a scramble.
          </p>
          <p style={{ marginBottom: 24 }}>
            The decrypt circle is a cursor with no cursor: it follows a
            waypoint path across the composition, damped like upstream's
            pointer. Where it passes, the cipher falls away in a
            flickering wave — glyphs swap faster near the edge, the
            wavefront glows and tints, and the revealed UI is split
            into its RGB by chromatic aberration.
          </p>
          <p style={{ marginBottom: 24 }}>
            Crank <span style={{ color: PREVIEW_COLORS.primary }}>scramble</span> and the
            idle cipher churns restlessly. Kill{" "}
            <span style={{ color: PREVIEW_COLORS.primary }}>colored</span> and the page
            goes monochrome green. Raise{" "}
            <span style={{ color: PREVIEW_COLORS.primary }}>legibility</span> and even
            the faintest UI earns a visible glyph.
          </p>
        </div>
        <div style={{ flex: 1, fontSize: 19, lineHeight: 1.75, color: PREVIEW_COLORS.text }}>
          <div
            style={{
              borderLeft: `4px solid ${PREVIEW_COLORS.primary}`,
              padding: "6px 0 6px 28px",
              margin: "6px 0 28px 0",
              fontSize: 26,
              fontWeight: 700,
              lineHeight: 1.3,
              color: PREVIEW_COLORS.ink,
            }}
          >
            KEY MATERIAL
            <br />
            — FIELD NOTES —
          </div>
          <div style={{ marginBottom: 12 }}>
            <span style={{ color: PREVIEW_COLORS.muted }}>CELL&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
            <span style={{ color: PREVIEW_COLORS.primary }}>16px</span> — cipher resolution
          </div>
          <div style={{ marginBottom: 12 }}>
            <span style={{ color: PREVIEW_COLORS.muted }}>RADIUS&nbsp;&nbsp;</span>
            <span style={{ color: PREVIEW_COLORS.primary }}>440px</span> — reveal diameter
          </div>
          <div style={{ marginBottom: 12 }}>
            <span style={{ color: PREVIEW_COLORS.muted }}>SWEEP&nbsp;&nbsp;&nbsp;</span>
            <span style={{ color: PREVIEW_COLORS.primary }}>L → R</span> — one pass per comp
          </div>
          <div style={{ marginBottom: 12 }}>
            <span style={{ color: PREVIEW_COLORS.muted }}>TIME&nbsp;&nbsp;&nbsp;&nbsp;</span>
            <span style={{ color: PREVIEW_COLORS.primary }}>frame / fps</span> — deterministic
          </div>
          <div>
            <span style={{ color: PREVIEW_COLORS.muted }}>ATLAS&nbsp;&nbsp;&nbsp;</span>
            <span style={{ color: PREVIEW_COLORS.primary }}>95 glyphs</span> — shape-matched
          </div>
          <p style={{ marginTop: 32 }}>
            The cipher is drawn from the printable ASCII set, rasterized
            once into a mipmapped atlas; every cell carries its glyph's
            index and average color. No fake noise — the encryption IS
            the content, filtered through its own shapes.
          </p>
        </div>
      </div>

      {/* footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 34,
          padding: "22px 0",
          borderTop: `2px solid ${PREVIEW_COLORS.muted}`,
          fontSize: 16,
          letterSpacing: 2,
          color: PREVIEW_COLORS.muted,
        }}
      >
        <div>decrypt-reveal · shape-matched cipher treatment</div>
        <div>HANDLE WITH CARE</div>
      </div>
    </div>
  );
};

/**
 * Self-contained 90-frame (3s @ 30fps) preview for decrypt-reveal.
 *
 * Exercises the full-frame children model: `<DecryptRip>` wraps a
 * frame-sized `<Dossier>` and the decrypt circle sweeps across it for
 * the whole composition — everything outside the circle is a shape-
 * matched cipher of the dossier, everything inside is the real page,
 * and the edge flickers, glows and aberrates as it passes. The preview
 * raises `cell` to 16px (finer than upstream's 10 would be slower to
 * software-render) and sets `background` to the dossier's exact
 * backdrop so empty cells stay empty. The `activePath` envelope grows
 * the decrypt circle in over the first ~5 frames and `smoothing` damps
 * it to 0.12s — the circle visibly lags its sweep like a real cursor.
 */
export const PREVIEW_DEFAULT_PROPS = {
  config: {
    instanceId: "decrypt-reveal.preview",
    theme: {
      palette: {
        primary: "#4ade80",
        secondary: "#FF5D5D",
        accent: "#D9F3E4",
        background: "#0B0F0C",
        text: "#D9F3E4",
        muted: "#5A6E62",
      },
    },
    global: { speed: 1, delayOffset: 0, easing: "ease-out-cubic" as const },
    elements: [],
    extras: {
      radius: 440,
      softness: 0.5,
      cell: 16,
      aspect: 0.75,
      charset: " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~",
      colored: 1,
      color: "#4ade80",
      brightness: 1,
      legibility: 1,
      contrast: 1,
      exposure: 1,
      scramble: 0.15,
      scrambleSpeed: 8,
      edgeWidth: 0.2,
      edgeFlicker: 1,
      edgeGlow: 2,
      edgeTint: 0.75,
      aberration: 12,
      passthrough: 0.15,
      threshold: 0.025,
      background: "#0B0F0C",
      smoothing: 0.12,
      lensPath: [
        { x: -0.3, y: 0.5, at: 0 },
        { x: 1.3, y: 0.5, at: 1 },
      ],
      activePath: [
        { at: 0, v: 0 },
        { at: 0.06, v: 1 },
      ],
    },
  },
  styles: { colors: PREVIEW_COLORS, fonts: PREVIEW_FONTS },
  fontSizes: PREVIEW_FONT_SIZES,
};

export const Preview: React.FC = () => {
  return (
    <DecryptRip {...PREVIEW_DEFAULT_PROPS}>
      <Dossier />
    </DecryptRip>
  );
};
