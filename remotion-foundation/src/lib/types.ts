export interface CaptionCue {
  start: number;
  end: number;
  text: string;
}

export interface SceneTiming {
  id: number;
  title: string;
  durationInFrames: number;
  /**
   * Path to the scene's voiceover audio. Audio is muxed at stitch time
   * (assemble.py), NOT baked into scene MP4s. Scene components should NOT
   * render <Audio> for the voiceover — render silent video only.
   * Kept on the prop for reference and for the optional burned-in captions layer.
   */
  audioFile?: string;
  /** Per-scene captions for the optional burned-in Remotion layer. */
  captions?: CaptionCue[];
  /** If true, scene renders the captions layer. Default is false (set via props). */
  showCaptions?: boolean;
}

export interface VideoProps {
  scenes: SceneTiming[];
  fps: number;
  width: number;
  height: number;
  /** Global default for showing the burned-in captions layer. Default false. */
  burnCaptions?: boolean;
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

export interface PaletteColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export interface ThumbnailProps {
  title: string;
  subtitle: string;
  palette: PaletteColors;
}
