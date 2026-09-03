import React, { useMemo } from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Captions } from "remotion-foundation";
import type { VideoProps } from "remotion-foundation";
import { SCENE_MAP } from "../scenes/SceneMap.generated";

const Fallback: React.FC<{ sceneId?: number }> = ({ sceneId }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      height: "100%",
      background: "#7f1d1d",
      color: "#fff",
      fontSize: 42,
    }}
  >
    {`Missing scene ${sceneId ?? "?"}`}
  </div>
);

export const MainVideo: React.FC<VideoProps> = ({ scenes, fps, burnCaptions }) => {
  const offsets = useMemo(() => {
    const result: number[] = [];
    let offset = 0;
    for (const scene of scenes) {
      result.push(offset);
      offset += scene.durationInFrames;
    }
    return result;
  }, [scenes]);

  return (
    <AbsoluteFill>
      {scenes.map((scene, i) => {
        const SceneComponent = SCENE_MAP[scene.id];
        const showCaptions = (scene.showCaptions ?? burnCaptions) && !!scene.captions?.length;
        return (
          <Sequence
            key={`${scene.id}-${i}`}
            from={offsets[i]}
            durationInFrames={scene.durationInFrames}
          >
            {SceneComponent ? (
              <SceneComponent scene={scene} />
            ) : (
              <Fallback sceneId={scene.id} />
            )}
            {showCaptions && (
              <Captions cues={scene.captions!} fps={fps} />
            )}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
