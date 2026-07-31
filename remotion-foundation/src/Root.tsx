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
        fps={30}
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
