import React from 'react';
import {AbsoluteFill} from 'remotion';
import type {TransitionPresentation, TransitionPresentationComponentProps} from '@remotion/transitions';
import {DirectionalBlur} from '../primitives/Extras';

/**
 * CUSTOM TRANSITION PRESENTATIONS. A presentation is just a component that receives
 * `presentationProgress` (0 -> 1, already shaped by the timing's easing) and
 * `presentationDirection` ('entering' | 'exiting'), and returns styled children.
 * Use it exactly like the built-ins:
 *   <TransitionSeries.Transition presentation={whip()} timing={linearTiming({durationInFrames: 9, easing: ease.move})} />
 */

type WhipProps = {
  /** which way the OLD scene leaves */
  direction?: 'left' | 'right';
  /** peak blur in px (std deviation) at mid-transition */
  blur?: number;
};

const WhipComponent: React.FC<TransitionPresentationComponentProps<WhipProps>> = ({
  children,
  presentationProgress: p,
  presentationDirection,
  passedProps: {direction = 'left', blur = 36},
}) => {
  const entering = presentationDirection === 'entering';
  const sign = direction === 'left' ? -1 : 1; // direction of travel of the exiting scene
  // exiting: 0 -> +-100%;   entering: from the opposite side -> 0
  const x = entering ? -sign * (1 - p) * 100 : sign * p * 100;
  // Both scenes move fastest mid-transition, so blur peaks there (sin) and is zero at rest.
  const b = Math.sin(Math.PI * p) * blur;
  return (
    <AbsoluteFill style={{translate: `${x}% 0`}}>
      <DirectionalBlur id={`whip-${presentationDirection}`} x={b} style={{position: 'absolute', inset: 0}}>
        {children}
      </DirectionalBlur>
    </AbsoluteFill>
  );
};

/** Whip pan: the old scene is flung off one side while the new one whips in from the other, with motion blur. Kinetic / hype. Use 6-12 frames and ease.move. */
export const whip = (props: WhipProps = {}): TransitionPresentation<WhipProps> => ({
  component: WhipComponent,
  props,
});
