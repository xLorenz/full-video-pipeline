import React from 'react';
import {alpha, useLayout, useTheme} from '../design/theme';

/**
 * SURFACE: a card/panel that looks like it has material, not a grey rectangle.
 * Recipe (works on both dark and light palettes):
 *   - a barely-there vertical gradient (light catches the top edge)
 *   - a 1px hairline border in the palette's `line` colour
 *   - an inset top highlight (the "glass edge")
 *   - TWO shadows: a large soft one for lift, a small tight one for contact
 * Radius is generous (28u); sharp corners read as a wireframe.
 */
export const Surface: React.FC<{
  radius?: number;
  padding?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({radius = 28, padding = 40, style, children}) => {
  const t = useTheme();
  const {u} = useLayout();
  const dark = t.dark;
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: radius * u,
        padding: padding * u,
        border: `${Math.max(1, u)}px solid ${t.line}`,
        background: dark
          ? `linear-gradient(180deg, ${alpha('#FFFFFF', 0.07)}, ${alpha('#FFFFFF', 0.02)}), ${t.surface}`
          : t.surface,
        boxShadow: dark
          ? `inset 0 1px 0 ${alpha('#FFFFFF', 0.08)}, 0 ${50 * u}px ${90 * u}px ${-30 * u}px rgba(0,0,0,0.7), 0 ${10 * u}px ${28 * u}px ${-10 * u}px rgba(0,0,0,0.45)`
          : `inset 0 1px 0 rgba(255,255,255,0.9), 0 ${40 * u}px ${70 * u}px ${-30 * u}px rgba(40,25,10,0.28), 0 ${8 * u}px ${20 * u}px ${-8 * u}px rgba(40,25,10,0.14)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
