import React from 'react';
import {AbsoluteFill, Easing, interpolate} from 'remotion';
import {ThemeProvider, alpha, useLayout, useTheme, type PaletteName} from '../design/theme';
import {fonts} from '../design/fonts';
import {ease, prog, sec, useMotion} from '../motion/language';
import {anticipate, fromCenter, useBeat, useSquash} from '../motion/choreography';
import {Backdrop, Counter, DirectionalBlur, DrawPath, IrisReveal, Marker, ShineText, TiltCard, Typewriter, WordSwap} from '../primitives';

/**
 * GALLERY: a living style guide. Open this composition in Studio to see every primitive,
 * finishing touch and choreography pattern in motion, then lift the one you need.
 * Each cell is labelled with the code it uses. (4 columns x 3 rows, 1920x1080.)
 */
const Label: React.FC<{children: React.ReactNode}> = ({children}) => {
  const t = useTheme();
  return (
    <div style={{fontFamily: fonts.mono, fontSize: 20, letterSpacing: '0.14em', color: t.muted, marginBottom: 20, textTransform: 'uppercase', lineHeight: 1.4}}>
      {children}
    </div>
  );
};

const Cell: React.FC<{label: string; children: React.ReactNode}> = ({label, children}) => (
  <div style={{flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', padding: '0 28px'}}>
    <Label>{label}</Label>
    {children}
  </div>
);

const Row: React.FC<{children: React.ReactNode}> = ({children}) => <div style={{display: 'flex', flex: 1}}>{children}</div>;

const GalleryInner: React.FC = () => {
  const t = useTheme();
  const {frame, fps} = useMotion();
  const {u} = useLayout();
  const {pulse} = useBeat(120);
  const f = frame - sec(0.2, fps);
  const boxX = anticipate(f, 250);
  const boxVx = Math.abs(boxX - anticipate(f - 1, 250));
  const sq = useSquash(0.75);
  const big: React.CSSProperties = {fontFamily: fonts.display, fontWeight: 800, fontSize: 84, letterSpacing: '-0.03em', color: t.fg, lineHeight: 1};
  const drop = interpolate(frame - sec(0.35, fps), [0, 12], [-130, 0], {easing: Easing.in(Easing.quad), extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const dots = 6;
  const wave = 'M 4 80 C 64 4, 124 156, 184 80 S 304 4, 356 80';

  return (
    <AbsoluteFill style={{padding: `${48 * u}px ${28 * u}px`}}>
      <Row>
        <Cell label="ShineText">
          <div style={big}>
            <ShineText text="Premium" at={0.3} />
          </div>
        </Cell>
        <Cell label="Marker">
          <div style={big}>
            Be <Marker at={0.4}>seen</Marker>
          </div>
        </Cell>
        <Cell label="Typewriter">
          <div style={{fontFamily: fonts.mono, fontWeight: 500, fontSize: 40, color: t.fg}}>
            <Typewriter text="npm run motion" at={0.3} />
          </div>
        </Cell>
        <Cell label="WordSwap">
          <div style={{...big, fontSize: 60}}>
            <div style={{color: t.muted, fontWeight: 600}}>Built for</div>
            <WordSwap words={['teams', 'makers', 'you.']} at={0.2} every={0.8} style={{color: t.accent}} />
          </div>
        </Cell>
      </Row>
      <Row>
        <Cell label="useBeat(120): pulse">
          <div style={{...big, scale: 1 + 0.07 * pulse}}>Pulse</div>
        </Cell>
        <Cell label="anticipate() + DirectionalBlur">
          <div style={{width: 380, height: 110}}>
            <div style={{width: 100, height: 100, translate: `${boxX}px 0`}}>
              <DirectionalBlur id="gallery-box" x={boxVx * 0.22}>
                <div style={{width: 100, height: 100, borderRadius: 26, background: t.accent}} />
              </DirectionalBlur>
            </div>
          </div>
        </Cell>
        <Cell label="TiltCard">
          <TiltCard>
            <div style={{width: 330, height: 190, borderRadius: 26, background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`, boxShadow: '0 40px 80px -20px rgba(0,0,0,.6)'}} />
          </TiltCard>
        </Cell>
        <Cell label="IrisReveal">
          <div style={{position: 'relative', width: 330, height: 190, borderRadius: 26, overflow: 'hidden', background: alpha(t.fg, 0.06)}}>
            <IrisReveal at={0.4}>
              <div style={{position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${t.accent2}, ${t.accent})`}} />
            </IrisReveal>
          </div>
        </Cell>
      </Row>
      <Row>
        <Cell label="fromCenter(): stagger">
          <div style={{display: 'flex', gap: 12}}>
            {Array.from({length: dots}).map((_, i) => {
              const p = prog(frame, sec(0.3, fps) + fromCenter(i, dots, 3), sec(0.6, fps), ease.enter);
              return <div key={i} style={{width: 46, height: 46, borderRadius: 14, background: t.accent2, scale: p, opacity: p}} />;
            })}
          </div>
        </Cell>
        <Cell label="useSquash(): landing">
          <div style={{height: 140, display: 'flex', alignItems: 'flex-end', overflow: 'hidden', width: 160}}>
            <div style={{width: 100, height: 100, borderRadius: 28, background: t.accent, translate: `0 ${drop}px`, scale: `${sq.scaleX} ${sq.scaleY}`, transformOrigin: 'bottom center'}} />
          </div>
        </Cell>
        <Cell label="Counter">
          <Counter to={98.6} decimals={1} suffix="%" at={0.2} dur={1.4} style={big} />
        </Cell>
        <Cell label="DrawPath (glow)">
          <DrawPath d={wave} viewBox="0 0 360 160" width={330} height={147} at={0.3} dur={1.2} stroke={t.accent2} strokeWidth={8} glow />
        </Cell>
      </Row>
    </AbsoluteFill>
  );
};

export const Gallery: React.FC<{palette?: PaletteName}> = ({palette = 'midnight'}) => (
  <ThemeProvider palette={palette}>
    <Backdrop variant="plain" />
    <GalleryInner />
  </ThemeProvider>
);
