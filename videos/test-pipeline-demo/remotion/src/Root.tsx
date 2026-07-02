import { Composition } from "remotion";
import { Scene01 } from "./scenes/Scene01";
import { Scene02 } from "./scenes/Scene02";
import { Scene03 } from "./scenes/Scene03";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Scene01"
        component={Scene01}
        durationInFrames={230}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="Scene02"
        component={Scene02}
        durationInFrames={511}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="Scene03"
        component={Scene03}
        durationInFrames={389}
        fps={30}
        width={1280}
        height={720}
      />
    </>
  );
};
