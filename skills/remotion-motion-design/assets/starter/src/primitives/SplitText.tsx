import React from 'react';
import {DUR, STAGGER, ease, sec, staggerDelay, useMotion, type EasingFn} from '../motion/language';
import {Reveal, type RevealVariant} from './Reveal';

/**
 * SPLIT TEXT: kinetic typography with the rules of good stagger built in.
 *  - Use "\n" for DELIBERATE line breaks. Break by meaning ("Make motion / feel inevitable."),
 *    never by whatever the browser decides. `text-wrap: balance` handles the rest.
 *  - Stagger gap is small (words 90 ms, chars 30 ms) and the WHOLE group is capped at
 *    `maxTotal` seconds, so a long sentence doesn't crawl in.
 *  - by="char" splits kerning pairs apart. Reserve it for short, loud text (<= ~14 chars).
 *    For anything longer, by="word" looks more refined.
 */
export const SplitText: React.FC<{
  text: string;
  by?: 'word' | 'char';
  at?: number;
  dur?: number;
  variant?: RevealVariant;
  /** seconds between units; defaults by `by` */
  stagger?: number;
  /** seconds: cap for the whole group's launch window */
  maxTotal?: number;
  easing?: EasingFn;
  exitAt?: number;
  style?: React.CSSProperties;
}> = ({
  text,
  by = 'word',
  at = 0,
  dur = DUR.hero,
  variant = 'mask',
  stagger,
  maxTotal = STAGGER.max,
  easing = ease.enter,
  exitAt,
  style,
}) => {
  const {fps} = useMotion();
  const gap = stagger ?? (by === 'word' ? STAGGER.word : STAGGER.char);

  // Pure index model: no side effects during render.
  let n = 0;
  const model = text.split('\n').map((line) =>
    line
      .split(' ')
      .filter(Boolean)
      .map((word) => {
        const start = n;
        n += by === 'word' ? 1 : [...word].length;
        return {word, start};
      }),
  );
  const total = n;
  const delay = (i: number) => staggerDelay(i, total, sec(gap, fps), sec(maxTotal, fps)) / fps;

  return (
    <div style={{textWrap: 'balance', ...style}}>
      {model.map((words, li) => (
        <div key={li}>
          {words.map(({word, start}, wi) => (
            <span
              key={wi}
              style={{
                display: 'inline-block',
                whiteSpace: 'nowrap',
                marginRight: wi < words.length - 1 ? '0.26em' : 0,
              }}
            >
              {by === 'word' ? (
                <Reveal inline variant={variant} at={at + delay(start)} dur={dur} easing={easing} exitAt={exitAt}>
                  {word}
                </Reveal>
              ) : (
                [...word].map((ch, ci) => (
                  <Reveal key={ci} inline variant={variant} at={at + delay(start + ci)} dur={dur} easing={easing} exitAt={exitAt}>
                    {ch}
                  </Reveal>
                ))
              )}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
};
