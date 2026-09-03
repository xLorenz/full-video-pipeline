import React from "react";
import { Composition, registerRoot } from "remotion";
import type { VideoProps, ThumbnailProps } from "remotion-foundation";
import { FPS, WIDTH, HEIGHT } from "./lib/config";
import { MainVideo } from "./components/MainVideo";
import { Thumbnail } from "./components/Thumbnail";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MainVideo"
        component={MainVideo as React.ComponentType<any>}
        calculateMetadata={async ({ props }) => {
          const p = props as unknown as VideoProps;
          if (!Number.isFinite(p.fps) || p.fps <= 0) {
            throw new Error(`invalid fps: ${p.fps}`);
          }
          if (!Number.isFinite(p.width) || p.width <= 0 ||
              !Number.isFinite(p.height) || p.height <= 0) {
            throw new Error(`invalid dimensions: ${p.width}x${p.height}`);
          }
          // NOTE: defaultProps.scenes is [] so `remotion compositions`
          // (which evaluates this against defaults, no --props) must succeed.
          // Empty scenes fall back to 1 frame; the real empty-project guard
          // lives in validate.py (step>=3 requires >=1 scene) and Step 9's
          // pre-render check, not here.
          const totalFrames = p.scenes.reduce(
            (sum: number, s) => sum + s.durationInFrames, 0,
          );
          return {
            durationInFrames: totalFrames || 1,
            fps: p.fps,
            width: p.width,
            height: p.height,
          };
        }}
        defaultProps={{
          scenes: [],
          fps: FPS,
          width: WIDTH,
          height: HEIGHT,
          burnCaptions: false,
        } satisfies VideoProps}
      />
      <Composition
        id="Thumbnail"
        component={Thumbnail as React.ComponentType<any>}
        durationInFrames={1}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          title: "Video Title",
          subtitle: "",
          palette: {
            primary: "#0F1B2D",
            secondary: "#00BFA6",
            accent: "#FFB300",
            background: "#0A1220",
            text: "#FFFFFF",
          },
        } satisfies ThumbnailProps}
      />
    </>
  );
};
registerRoot(RemotionRoot);
