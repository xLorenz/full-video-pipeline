import React from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {Circle, Star, Triangle} from '@remotion/shapes';
import {ThemeProvider, TYPE, alpha, useLayout, useTheme, type PaletteName} from '../design/theme';
import {fonts} from '../design/fonts';
import {DUR, STAGGER, ease, prog, sec, spr, staggerDelay, useMotion} from '../motion/language';
import {Backdrop, CameraRig, Counter, DrawPath, PathStroke, Reveal, SplitText, Surface} from '../primitives';

/**
 * SHOWCASE: the reference piece. Read it as a pattern library for building your own scenes.
 *
 * THE PATTERN (every scene below follows it):
 *  - Author in SCENE-LOCAL seconds. `at={0.45}` means 0.45 s after this scene begins.
 *  - ONE hero per beat (the biggest, first, longest move). Everything else supports.
 *  - Stagger siblings, cap the group, offset by reading order.
 *  - Secondary action AFTER the parent lands (the icon pops once its card has arrived).
 *  - Ambient life (float, camera creep, backdrop drift) so no frame is ever dead.
 *  - Hold: the last scene's composition rests >= 1.5 s with nothing arriving.
 *
 * SHOT LIST (30 fps):  Hook 3.0s -> Ideas 3.8s -> Proof 3.6s -> CTA 3.6s, 0.5s crossfades.
 * Persistent <Backdrop> sits OUTSIDE the TransitionSeries: one continuous world, and the
 * crossfades only touch content. Because the scenes are transparent, the crossfade MUST use
 * fade({shouldFadeOutExitingScene: true}). The default only fades the incoming scene in, so the old
 * scene stays fully opaque under it (text ghosting on text) and then vanishes in one frame.
 * Elements in scenes 2-4 wait `IN` seconds before entering: a transition and an entrance should
 * overlap, but something must stay on screen throughout (never an empty frame between beats).
 */
const SCENES = {hook: 3.0, ideas: 3.8, proof: 3.6, cta: 3.6} as const;
const TRANSITION = 0.5;
const IN = 0.15; // entrances begin ~30% into the crossfade: overlap, but never an empty frame

export const showcaseDuration = (fps: number) =>
  Object.values(SCENES).reduce((sum, s) => sum + sec(s, fps), 0) -
  (Object.keys(SCENES).length - 1) * sec(TRANSITION, fps);

/** Full-frame stage that respects the format's safe area (platform UI on 9:16 etc). */
const Stage: React.FC<{justify?: 'center' | 'flex-start' | 'flex-end'; align?: 'flex-start' | 'center'; children: React.ReactNode}> = ({
  justify = 'center',
  align = 'flex-start',
  children,
}) => {
  const {safe} = useLayout();
  return (
    <AbsoluteFill
      style={{
        padding: `${safe.top}px ${safe.x}px ${safe.bottom}px`,
        justifyContent: justify,
        alignItems: align,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

const Spacer: React.FC<{h: number}> = ({h}) => {
  const {u} = useLayout();
  return <div style={{height: h * u}} />;
};

const Kicker: React.FC<{children: string; at: number}> = ({children, at}) => {
  const t = useTheme();
  const {u} = useLayout();
  return (
    <Reveal at={at} variant="rise" distance={20}>
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: TYPE.micro * u,
          letterSpacing: '0.28em',
          color: t.accent,
          textTransform: 'uppercase',
        }}
      >
        {children}
      </div>
    </Reveal>
  );
};

/* -------------------------------------------------------------------------- */
/* 1. HOOK: the headline is the hero                                          */
/* -------------------------------------------------------------------------- */
const Hook: React.FC = () => {
  const t = useTheme();
  const {u, isPortrait} = useLayout();
  const {frame, fps} = useMotion();
  const head = (isPortrait ? 164 : 148) * u;
  const headStyle: React.CSSProperties = {
    fontFamily: fonts.display,
    fontWeight: 800,
    fontSize: head,
    lineHeight: 0.98,
    letterSpacing: '-0.035em',
    color: t.fg,
  };
  const rule = prog(frame, sec(1.0, fps), sec(0.7, fps), ease.enterSoft);
  // Pulsing live-dot: a looping ambient detail, deterministic from the frame.
  const ring = ((frame / fps) % 1.6) / 1.6;

  return (
    <CameraRig push={0.05}>
      <Stage>
        {/* at={-0.1}: the entrance began BEFORE frame 0, so the first frame is never blank. */}
        <Reveal at={-0.1} variant="rise" distance={20}>
          <div style={{display: 'flex', alignItems: 'center', gap: 20 * u}}>
            <div style={{position: 'relative', width: 16 * u, height: 16 * u}}>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  border: `${2 * u}px solid ${t.accent}`,
                  scale: 1 + ring * 2,
                  opacity: (1 - ring) * 0.7,
                }}
              />
              <div style={{position: 'absolute', inset: 0, borderRadius: '50%', background: t.accent}} />
            </div>
            <div style={{fontFamily: fonts.mono, fontSize: TYPE.micro * u, letterSpacing: '0.28em', color: t.accent}}>INTRODUCING</div>
          </div>
        </Reveal>
        <Spacer h={36} />
        {/* On a tall canvas, stack the words and go BIG: vertical formats reward scale, not extra whitespace. */}
        <SplitText text={isPortrait ? 'Make\nmotion' : 'Make motion'} at={0.05} style={headStyle} />
        <SplitText text={isPortrait ? 'feel\ninevitable.' : 'feel inevitable.'} at={0.22} style={{...headStyle, color: t.accent}} />
        <Spacer h={46} />
        <div
          style={{
            width: 150 * u,
            height: 7 * u,
            borderRadius: 7 * u,
            background: t.accent,
            transformOrigin: 'left center',
            scale: `${rule} 1`,
          }}
        />
        <Spacer h={40} />
        <Reveal at={1.15} variant="rise" distance={30}>
          {/* text-wrap: balance stops a lone orphan word ("frame.") on the last line */}
          <div style={{fontFamily: fonts.text, fontSize: (isPortrait ? 52 : TYPE.body) * u, lineHeight: 1.3, color: t.muted, maxWidth: 1000 * u, textWrap: 'balance'}}>
            Timing, depth and finish, built into every frame.
          </div>
        </Reveal>
      </Stage>
    </CameraRig>
  );
};

/* -------------------------------------------------------------------------- */
/* 2. IDEAS: three siblings, staggered, with a secondary action               */
/* -------------------------------------------------------------------------- */
// Titles are broken BY HAND into two lines each: equal line counts keep the body copy aligned
// across cards and avoid the browser's orphans ("Depth in every / frame").
const IDEAS = [
  {title: 'Ease with\nintent', body: 'Curves chosen by the job, never by default.', icon: 'circle'},
  {title: 'Stagger,\ndon\u2019t sync', body: 'Overlap the moves so the eye can follow.', icon: 'triangle'},
  {title: 'Depth in\nevery frame', body: 'Light, grain and parallax. Never flat.', icon: 'star'},
] as const;

const Icon: React.FC<{kind: (typeof IDEAS)[number]['icon']; size: number; color: string}> = ({kind, size, color}) => {
  if (kind === 'circle') return <Circle radius={size / 2} fill={color} />;
  if (kind === 'triangle') return <Triangle length={size} direction="up" fill={color} cornerRadius={size * 0.12} />;
  return <Star points={5} innerRadius={size * 0.24} outerRadius={size * 0.5} fill={color} cornerRadius={size * 0.05} />;
};

const Ideas: React.FC = () => {
  const t = useTheme();
  const {u, isPortrait} = useLayout();
  const {frame, fps} = useMotion();
  const time = frame / fps;
  const icon = (isPortrait ? 112 : 104) * u;

  return (
    <CameraRig push={0.03}>
      <Stage>
        <Kicker at={IN}>The system</Kicker>
        <Spacer h={26} />
        <SplitText
          text={isPortrait ? 'Three rules.\nEvery frame.' : 'Three rules. Every frame.'}
          at={IN + 0.1}
          dur={DUR.hero}
          style={{fontFamily: fonts.display, fontWeight: 800, fontSize: (isPortrait ? 112 : 104) * u, lineHeight: 1, letterSpacing: '-0.035em', color: t.fg}}
        />
        <Spacer h={isPortrait ? 64 : 72} />
        <div style={{display: 'flex', flexDirection: isPortrait ? 'column' : 'row', gap: (isPortrait ? 26 : 34) * u, width: '100%'}}>
          {IDEAS.map((idea, i) => {
            const at = IN + 0.6 + staggerDelay(i, IDEAS.length, sec(0.16, fps), sec(STAGGER.max, fps)) / fps;
            // Secondary action: the icon pops AFTER its card has landed.
            const pop = prog(frame, sec(at + 0.3, fps), sec(0.55, fps), spr.snappy);
            return (
              <Reveal key={idea.title} at={at} dur={DUR.hero} variant="rise" distance={90} style={{flex: 1, display: 'flex'}}>
                <div style={{translate: `0px ${Math.sin(time * 1.3 + i * 1.1) * 5 * u}px`, flex: 1, display: 'flex'}}>
                  <Surface
                    padding={isPortrait ? 42 : 48}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: isPortrait ? 'row' : 'column',
                      alignItems: isPortrait ? 'center' : 'flex-start',
                      gap: (isPortrait ? 32 : 40) * u,
                    }}
                  >
                    <div style={{width: icon, height: icon, flex: 'none', display: 'grid', placeItems: 'center', scale: 0.4 + 0.6 * pop, opacity: Math.min(1, pop * 2)}}>
                      <Icon kind={idea.icon} size={icon * 0.82} color={i === 1 ? t.accent2 : t.accent} />
                    </div>
                    <div>
                      <div style={{fontFamily: fonts.display, fontWeight: 700, fontSize: (isPortrait ? 58 : 56) * u, letterSpacing: '-0.02em', color: t.fg, lineHeight: 1.1, whiteSpace: 'pre-line'}}>
                        {idea.title}
                      </div>
                      <div style={{height: 12 * u}} />
                      <div style={{fontFamily: fonts.text, fontSize: (TYPE.caption + (isPortrait ? 5 : 3)) * u, lineHeight: 1.35, color: t.muted}}>{idea.body}</div>
                    </div>
                  </Surface>
                </div>
              </Reveal>
            );
          })}
        </div>
      </Stage>
    </CameraRig>
  );
};

/* -------------------------------------------------------------------------- */
/* 3. PROOF: a number is the hero, a chart builds supporting evidence         */
/* -------------------------------------------------------------------------- */
const DATA = [0.34, 0.42, 0.5, 0.58, 0.69, 0.83, 1.0];
const VBW = 700;
const VBH = 300;
const BAR_GAP = 14;
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7'];

const Proof: React.FC = () => {
  const t = useTheme();
  const {u, isPortrait} = useLayout();
  const {frame, fps} = useMotion();

  // Bars, hairlines, trend line and end dot share ONE viewBox, so they can never misalign.
  const step = VBW / DATA.length;
  const top = (h: number) => VBH - h * VBH * 0.9;
  const pts = DATA.map((h, i) => [i * step + step / 2, top(h) - 4] as const);
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  const lineP = prog(frame, sec(IN + 1.25, fps), sec(0.9, fps), ease.move); // starts while the last bars are still landing
  const dot = prog(frame, sec(IN + 1.9, fps), sec(0.4, fps), ease.pop);

  const counterStyle: React.CSSProperties = {
    fontFamily: fonts.display,
    fontWeight: 800,
    fontSize: (isPortrait ? 250 : 200) * u,
    lineHeight: 0.95,
    letterSpacing: '-0.045em',
    color: t.fg,
  };

  return (
    <CameraRig push={0.035}>
      <Stage>
        <div style={{display: 'flex', flexDirection: isPortrait ? 'column' : 'row', alignItems: isPortrait ? 'flex-start' : 'center', gap: (isPortrait ? 56 : 90) * u, width: '100%'}}>
          <div style={{flex: isPortrait ? 'none' : 1}}>
            <Kicker at={IN}>Sample data</Kicker>
            <Spacer h={22} />
            <Counter to={4.2} decimals={1} prefix="$" suffix="M" at={IN + 0.15} dur={1.7} style={counterStyle} />
            <Spacer h={16} />
            <Reveal at={IN + 0.5} variant="rise" distance={26}>
              <div style={{fontFamily: fonts.text, fontSize: (isPortrait ? 54 : TYPE.body) * u, color: t.muted, lineHeight: 1.25}}>Annual recurring revenue</div>
            </Reveal>
          </div>

          <Reveal at={IN + 0.25} variant="scale" dur={DUR.hero} easing={ease.enterSoft} style={{flex: isPortrait ? 'none' : 1.15, width: isPortrait ? '100%' : undefined}}>
            <Surface padding={36}>
              <svg viewBox={`0 0 ${VBW} ${VBH}`} style={{display: 'block', width: '100%', height: 'auto', overflow: 'visible'}}>
                {[0.25, 0.5, 0.75].map((f) => (
                  <line key={f} x1={0} x2={VBW} y1={VBH * f} y2={VBH * f} stroke={t.line} strokeWidth={1.5} />
                ))}
                {DATA.map((h, i) => {
                  const delay = staggerDelay(i, DATA.length, sec(0.1, fps), sec(0.6, fps)) / fps;
                  const p = prog(frame, sec(IN + 0.45 + delay, fps), sec(0.7, fps), ease.enter);
                  const last = i === DATA.length - 1;
                  return (
                    <rect
                      key={i}
                      x={i * step + BAR_GAP / 2}
                      y={top(h)}
                      width={step - BAR_GAP}
                      height={VBH - top(h)}
                      rx={10}
                      fill={last ? t.accent : alpha(t.accent, 0.3)}
                      style={{transformBox: 'fill-box', transformOrigin: 'bottom', scale: `1 ${p}`}}
                    />
                  );
                })}
                <PathStroke d={d} progress={lineP} stroke={t.accent2} strokeWidth={5} glow />
                <circle
                  cx={lx}
                  cy={ly}
                  r={9}
                  fill={t.accent2}
                  style={{transformBox: 'fill-box', transformOrigin: 'center', scale: dot, filter: `drop-shadow(0 0 10px ${alpha(t.accent2, 0.9)})`}}
                />
              </svg>
              <div style={{display: 'flex', marginTop: 16 * u}}>
                {QUARTERS.map((q) => (
                  <div key={q} style={{flex: 1, textAlign: 'center', fontFamily: fonts.mono, fontSize: 22 * u, color: t.muted}}>
                    {q}
                  </div>
                ))}
              </div>
            </Surface>
          </Reveal>
        </div>
      </Stage>
    </CameraRig>
  );
};

/* -------------------------------------------------------------------------- */
/* 4. CTA: assemble the lockup, then HOLD                                     */
/* -------------------------------------------------------------------------- */
const Mark: React.FC<{size: number}> = ({size}) => {
  const t = useTheme();
  return (
    <div style={{position: 'relative', width: size, height: size, flex: 'none'}}>
      <DrawPath
        d="M 50 12 A 38 38 0 0 1 50 88 A 38 38 0 0 1 50 12"
        viewBox="0 0 100 100"
        width={size}
        height={size}
        at={IN}
        dur={1.0}
        stroke={t.accent}
        strokeWidth={9}
        glow
      />
      <Reveal at={IN + 0.6} variant="scale" easing={ease.pop} dur={DUR.base} style={{position: 'absolute', left: '50%', top: '50%', translate: '-50% -50%'}}>
        <div style={{width: size * 0.22, height: size * 0.22, borderRadius: '50%', background: t.fg}} />
      </Reveal>
    </div>
  );
};

const Cta: React.FC = () => {
  const t = useTheme();
  const {u, isPortrait} = useLayout();
  return (
    <CameraRig push={0.03}>
      <Stage align="center">
        {/* The wordmark is the hero and lands FIRST; the ring draws in parallel. A faint arc must never lead the beat. */}
        <div style={{display: 'flex', flexDirection: isPortrait ? 'column' : 'row', alignItems: 'center', gap: (isPortrait ? 44 : 52) * u}}>
          <Mark size={(isPortrait ? 210 : 196) * u} />
          <SplitText
            text="Lumen"
            at={IN + 0.1}
            style={{fontFamily: fonts.display, fontWeight: 800, fontSize: (isPortrait ? 230 : 220) * u, lineHeight: 1, letterSpacing: '-0.045em', color: t.fg}}
          />
        </div>
        <Spacer h={26} />
        <Reveal at={IN + 0.7} variant="rise" distance={26}>
          <div style={{fontFamily: fonts.text, fontSize: (isPortrait ? 56 : TYPE.body + 6) * u, color: t.muted, textAlign: 'center'}}>Motion, designed.</div>
        </Reveal>
        <Spacer h={isPortrait ? 84 : 64} />
        <Reveal at={IN + 1.0} variant="scale" easing={ease.pop} dur={DUR.base}>
          <div
            style={{
              display: 'inline-block',
              padding: `${(isPortrait ? 34 : 30) * u}px ${(isPortrait ? 74 : 64) * u}px`,
              borderRadius: 999,
              background: t.accent,
              color: t.onAccent,
              fontFamily: fonts.display,
              fontWeight: 700,
              fontSize: (isPortrait ? 56 : 48) * u,
              letterSpacing: '-0.01em',
              boxShadow: `0 ${18 * u}px ${50 * u}px ${-14 * u}px ${alpha(t.accent, 0.7)}`,
            }}
          >
            Start building {'\u2192'}
          </div>
        </Reveal>
        <Spacer h={36} />
        <Reveal at={IN + 1.4} variant="fade" dur={DUR.slow}>
          <div style={{fontFamily: fonts.mono, fontSize: (isPortrait ? 34 : TYPE.micro) * u, letterSpacing: '0.14em', color: t.muted}}>lumen.example</div>
        </Reveal>
      </Stage>
    </CameraRig>
  );
};

/* -------------------------------------------------------------------------- */

export const Showcase: React.FC<{palette?: PaletteName; backdrop?: 'glow' | 'grid' | 'plain'}> = ({
  palette = 'midnight',
  backdrop = 'glow',
}) => {
  const {fps} = useVideoConfig();
  // linearTiming is LINEAR by default, which feels mechanical. Always pass an easing.
  const timing = linearTiming({durationInFrames: sec(TRANSITION, fps), easing: ease.move});
  // Transparent scenes over a persistent backdrop: fade the EXITING scene out too (see header note).
  const crossfade = fade({shouldFadeOutExitingScene: true});
  return (
    <ThemeProvider palette={palette}>
      <Backdrop variant={backdrop} />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={sec(SCENES.hook, fps)} premountFor={fps}>
          <Hook />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={crossfade} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={sec(SCENES.ideas, fps)} premountFor={fps}>
          <Ideas />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={crossfade} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={sec(SCENES.proof, fps)} premountFor={fps}>
          <Proof />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={crossfade} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={sec(SCENES.cta, fps)} premountFor={fps}>
          <Cta />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </ThemeProvider>
  );
};
