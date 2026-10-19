import React from 'react';
import {AbsoluteFill} from 'remotion';
import {alpha, useLayout, useTheme} from '../design/theme';
import {useMotion} from '../motion/language';
import {Grain} from './Grain';

/**
 * BACKDROP. A flat colour is the most common reason AI-made motion graphics look cheap.
 * This stacks five cheap layers that read as depth and light:
 *   1. base gradient, lit from above (never a single flat fill)
 *   2. soft light orbs on very slow Lissajous paths (periods 15-27 s: felt, not seen)
 *   3. optional hairline grid that drifts, masked to fade at the edges
 *   4. vignette, pulling the eye to the centre
 *   5. grain, for texture and to prevent gradient banding in compression
 *
 * Ambient motion must stay slower and lower-contrast than the hero motion, or it competes.
 * Keep the Backdrop OUTSIDE a <CameraRig> so content dollies against it (free parallax).
 */
type Orb = {x: number; y: number; ax: number; ay: number; px: number; py: number; ph: number; size: number; a: number; hue: 'accent' | 'accent2'};

const ORBS: Orb[] = [
  {x: 0.2, y: 0.26, ax: 0.08, ay: 0.06, px: 17, py: 23, ph: 0.0, size: 1.0, a: 0.3, hue: 'accent'},
  {x: 0.84, y: 0.8, ax: 0.07, ay: 0.08, px: 21, py: 15, ph: 1.7, size: 0.85, a: 0.2, hue: 'accent2'},
  {x: 0.62, y: 0.1, ax: 0.05, ay: 0.04, px: 27, py: 19, ph: 3.1, size: 0.6, a: 0.12, hue: 'accent'},
];

export const Backdrop: React.FC<{
  variant?: 'glow' | 'grid' | 'plain';
  intensity?: number;
  grain?: number;
}> = ({variant = 'glow', intensity = 1, grain = 0.1}) => {
  const t = useTheme();
  const {frame, fps} = useMotion();
  const {width, height, u} = useLayout();
  const time = frame / fps;
  const span = Math.max(width, height);

  return (
    <AbsoluteFill style={{background: `radial-gradient(130% 95% at 50% -10%, ${t.bgLift} 0%, ${t.bg} 62%)`}}>
      {variant !== 'plain' &&
        ORBS.map((o, i) => {
          const size = o.size * span;
          const cx = (o.x + o.ax * Math.sin((2 * Math.PI * time) / o.px + o.ph)) * width;
          const cy = (o.y + o.ay * Math.sin((2 * Math.PI * time) / o.py + o.ph * 1.3)) * height;
          const color = o.hue === 'accent' ? t.accent : t.accent2;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: cx - size / 2,
                top: cy - size / 2,
                width: size,
                height: size,
                borderRadius: '50%',
                background: `radial-gradient(circle, ${alpha(color, o.a * intensity * (t.dark ? 1 : 0.7))} 0%, transparent 62%)`,
              }}
            />
          );
        })}

      {variant === 'grid' && (
        <AbsoluteFill
          style={{
            backgroundImage: `linear-gradient(${t.line} 1px, transparent 1px), linear-gradient(90deg, ${t.line} 1px, transparent 1px)`,
            backgroundSize: `${96 * u}px ${96 * u}px`,
            backgroundPosition: `${time * 7 * u}px ${time * 7 * u}px`,
            maskImage: 'radial-gradient(ellipse 75% 65% at 50% 45%, #000 15%, transparent 78%)',
            WebkitMaskImage: 'radial-gradient(ellipse 75% 65% at 50% 45%, #000 15%, transparent 78%)',
          }}
        />
      )}

      <AbsoluteFill
        style={{
          background: `radial-gradient(130% 110% at 50% 45%, transparent 52%, ${t.dark ? 'rgba(0,0,0,0.5)' : 'rgba(70,45,20,0.10)'} 100%)`,
        }}
      />
      {grain > 0 && <Grain opacity={t.dark ? grain : grain * 0.7} />}
    </AbsoluteFill>
  );
};
