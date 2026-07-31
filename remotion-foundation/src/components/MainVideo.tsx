import React, { useMemo } from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Captions } from "remotion-foundation";
import type { VideoProps } from "remotion-foundation";
import { SCENE_MAP } from "../scenes/SceneMap.generated";

const Fallback: React.FC = () => null;

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
        const SceneComponent = SCENE_MAP[scene.id] ?? Fallback;
        const showCaptions = (scene.showCaptions ?? burnCaptions) && !!scene.captions?.length;
        return (
          <Sequence
            key={scene.id}
            from={offsets[i]}
            durationInFrames={scene.durationInFrames}
          >
            <SceneComponent scene={scene} />
            {showCaptions && (
              <Captions cues={scene.captions!} fps={fps} />
            )}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
