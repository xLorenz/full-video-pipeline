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

export interface TextStyle {
  fontSize: number;
  fontWeight: number;
  color: string;
  fontFamily: string;
  lineHeight?: number;
}

export interface AnimationConfig {
  duration?: number;
  easing?: "ease-out" | "ease-in" | "linear";
}
