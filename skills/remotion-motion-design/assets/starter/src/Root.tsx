import React from 'react';
import {Composition} from 'remotion';
import {Gallery} from './scenes/Gallery';
import {Showcase, showcaseDuration} from './scenes/Showcase';

const FPS = 30;

/**
 * One scene file, several formats: because every size in the toolkit is in `u` units
 * (1u = 1px at a 1080px short side) and the safe area is format-aware, the same
 * composition renders correctly at 16:9 and 9:16 (and 1:1, 4:5: just add another).
 */
export const Root: React.FC = () => (
  <>
    <Composition
      id="Showcase"
      component={Showcase}
      durationInFrames={showcaseDuration(FPS)}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{palette: 'midnight' as const}}
    />
    <Composition
      id="ShowcaseVertical"
      component={Showcase}
      durationInFrames={showcaseDuration(FPS)}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{palette: 'midnight' as const}}
    />
    {/* Living style guide: every finishing touch and choreography pattern, in motion. */}
    <Composition id="Gallery" component={Gallery} durationInFrames={100} fps={FPS} width={1920} height={1080} defaultProps={{palette: 'midnight' as const}} />
  </>
);
