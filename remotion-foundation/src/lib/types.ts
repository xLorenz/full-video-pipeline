export interface SceneTiming {
  id: number;
  title: string;
  durationInFrames: number;
  audioFile: string;
}

export interface VideoProps {
  scenes: SceneTiming[];
  fps: number;
  width: number;
  height: number;
}
