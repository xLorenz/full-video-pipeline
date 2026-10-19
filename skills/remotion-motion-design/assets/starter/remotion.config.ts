import {Config} from '@remotion/cli/config';

Config.setOverwriteOutput(true);

// Uncomment if you use @remotion/effects (glow, noise, lightLeak, ...) or the shader-based
// transitions (crossZoom, zoomBlur, filmBurn, ...). They use WebGL2, which needs ANGLE:
// Config.setChromiumOpenGlRenderer('angle');
