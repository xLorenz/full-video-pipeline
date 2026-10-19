#!/usr/bin/env python3
"""
motion_lint.py: catch the mistakes that make Remotion renders flicker, break, or feel cheap.

Remotion renders each frame independently, so anything that depends on wall-clock time,
randomness, CSS animation, or an un-clamped number will look right in the Studio and wrong
in the export. This is a fast static pass (no build, no browser) to run BEFORE you render.

USAGE
  python motion_lint.py [PATH]            # PATH defaults to ./src (or .)
  python motion_lint.py src --level warn  # hide INFO notes
  python motion_lint.py src --json        # machine-readable
  python motion_lint.py src --strict      # exit 1 on WARN too (default: only on ERROR)

LEVELS
  ERROR  breaks determinism or the render. Fix before rendering.
  WARN   usually a bug or an obvious quality problem.
  INFO   a prompt to double-check intent.

Heuristic (regex + a small tokenizer, not a type-checker): a hit is a prompt to look, not a verdict.
Comments are ignored, so documenting a bad pattern doesn't trip the linter.
"""
import argparse
import json
import os
import re
import sys

EXTS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".css")
SKIP_DIRS = {"node_modules", "out", "build", "dist", ".git", ".remotion", ".next"}
LEVEL_ORDER = {"INFO": 0, "WARN": 1, "ERROR": 2}


# ----------------------------------------------------------------------------- tokenizer
def strip_comments(src):
    """Blank out // and /* */ comments (keeping line numbers). Understands '', "", `` and ${}."""
    out, i, n = [], 0, len(src)
    stack = ["code"]  # states: code, sq, dq, tpl ; plus ('expr', depth) frames for ${}
    brace = [0]
    while i < n:
        c = src[i]
        nx = src[i + 1] if i + 1 < n else ""
        state = stack[-1]
        if state == "code":
            if c == "/" and nx == "/":
                while i < n and src[i] != "\n":
                    out.append(" ")
                    i += 1
                continue
            if c == "/" and nx == "*":
                out.append("  ")
                i += 2
                while i < n and not (src[i] == "*" and i + 1 < n and src[i + 1] == "/"):
                    out.append("\n" if src[i] == "\n" else " ")
                    i += 1
                out.append("  ")
                i += 2
                continue
            if c == "'":
                stack.append("sq")
            elif c == '"':
                stack.append("dq")
            elif c == "`":
                stack.append("tpl")
            elif c == "{":
                brace[-1] += 1
            elif c == "}":
                if brace[-1] > 0:
                    brace[-1] -= 1
                elif len(stack) > 1 and len(brace) > 1:  # closing a ${ } expression
                    stack.pop()
                    brace.pop()
                    out.append(c)
                    i += 1
                    continue
            out.append(c)
            i += 1
        elif state in ("sq", "dq"):
            out.append(c)
            if c == "\\" and nx:
                out.append(nx)
                i += 2
                continue
            if (state == "sq" and c == "'") or (state == "dq" and c == '"') or c == "\n":
                stack.pop()
            i += 1
        else:  # template literal
            out.append(c)
            if c == "\\" and nx:
                out.append(nx)
                i += 2
                continue
            if c == "`":
                stack.pop()
            elif c == "$" and nx == "{":
                out.append(nx)
                i += 2
                stack.append("code")
                brace.append(0)
                continue
            i += 1
    return "".join(out)


def split_args(text):
    """Split a call's argument text on top-level commas."""
    args, depth, cur, quote = [], 0, [], None
    for ch in text:
        if quote:
            cur.append(ch)
            if ch == quote:
                quote = None
            continue
        if ch in "'\"`":
            quote = ch
            cur.append(ch)
        elif ch in "([{":
            depth += 1
            cur.append(ch)
        elif ch in ")]}":
            depth -= 1
            cur.append(ch)
        elif ch == "," and depth == 0:
            args.append("".join(cur).strip())
            cur = []
        else:
            cur.append(ch)
    tail = "".join(cur).strip()
    if tail:
        args.append(tail)
    return args


def call_args(src, open_paren_idx):
    """Return the raw argument text between the matching parens starting at open_paren_idx."""
    depth, i, quote = 0, open_paren_idx, None
    while i < len(src):
        ch = src[i]
        if quote:
            if ch == "\\":
                i += 2
                continue
            if ch == quote:
                quote = None
        elif ch in "'\"`":
            quote = ch
        elif ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
            if depth == 0:
                return src[open_paren_idx + 1 : i]
        i += 1
    return None


def line_of(src, idx):
    return src.count("\n", 0, idx) + 1


# ----------------------------------------------------------------------------- rules
def lint_file(path, text, project):
    findings = []

    def add(level, rule, idx, msg):
        findings.append({"file": path, "line": line_of(text, idx), "level": level, "rule": rule, "msg": msg})

    code = strip_comments(text) if not path.endswith(".css") else re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group(0)), text, flags=re.S)

    # ---- ERROR: determinism
    for m in re.finditer(r"\bMath\.random\s*\(", code):
        add("ERROR", "random", m.start(), "Math.random() differs per frame/render thread -> flicker. Use random('seed') from 'remotion'.")
    for m in re.finditer(r"\bDate\.now\s*\(|\bnew\s+Date\s*\(\s*\)|\bperformance\.now\s*\(", code):
        add("ERROR", "wall-clock", m.start(), "Wall-clock time is not the frame clock. Derive time from useCurrentFrame() / fps.")
    for m in re.finditer(r"\b(setTimeout|setInterval|requestAnimationFrame)\s*\(", code):
        add("ERROR", "timers", m.start(), f"{m.group(1)}() runs in real time, not frame time. Drive everything from useCurrentFrame().")

    # ---- ERROR: CSS animation of any kind
    css_prop = re.compile(r"(?<![\w-])(transition|animation)(-(?:duration|delay|name|property|timing-function|iteration-count|direction|fill-mode)|(?:Duration|Delay|Name|Property|TimingFunction|IterationCount|Direction|FillMode))?\s*:\s*[^;,\n}]*")
    for m in css_prop.finditer(code):
        if re.match(r"""(transition|animation)\s*:\s*['"]?(none|0s?)?['"]?\s*$""", m.group(0).strip()):
            continue  # explicitly disabling is fine
        add("ERROR", "css-animation", m.start(), "CSS transitions/animations run on wall-clock time and are not captured frame-accurately. Animate from useCurrentFrame() instead.")
    for m in re.finditer(r"@keyframes\b", code):
        add("ERROR", "css-animation", m.start(), "@keyframes animates in real time. Use interpolate()/spring() driven by the frame.")
    for m in re.finditer(r"className\s*=\s*(?:\{\s*)?[`\"']([^`\"']*)", code):
        cls = m.group(1)
        if re.search(r"(?<![\w-])(animate-[\w\[\]-]+|transition(?:-[\w]+)?)(?![\w-])", cls):
            add("ERROR", "css-animation", m.start(), "Tailwind animate-*/transition classes run in real time. Animate from useCurrentFrame() instead.")

    # ---- ERROR/WARN: animation libraries that run on their own clock
    for m in re.finditer(r"from\s+['\"](framer-motion|motion/react|motion|gsap|animejs|anime\.js|react-spring|@react-spring/[\w-]+|react-transition-group)['\"]", code):
        add("ERROR", "motion-lib", m.start(), f"'{m.group(1)}' animates on its own clock (rAF). Use interpolate()/spring() or this skill's primitives.")
    for m in re.finditer(r"from\s+['\"](lottie-react|react-lottie|lottie-web)['\"]", code):
        add("WARN", "lottie", m.start(), f"'{m.group(1)}' plays in real time. Use <Lottie> from @remotion/lottie so it follows the frame.")

    # ---- WARN: interpolate without clamping
    for m in re.finditer(r"(?<![\w.])interpolate\s*\(", code):
        raw = call_args(code, m.end() - 1)
        if raw is None:
            continue
        args = split_args(raw)
        if len(args) < 3:
            continue
        if len(args) == 3:
            add("WARN", "interpolate-clamp", m.start(), "interpolate() with no options extrapolates ('extend'): values keep going outside the range. Add {extrapolateLeft:'clamp', extrapolateRight:'clamp'} (or use prog()).")
            continue
        opts = args[3]
        if not opts.startswith("{"):
            continue  # options passed as a variable: can't judge
        has_l, has_r = "extrapolateLeft" in opts, "extrapolateRight" in opts
        if "extrapolate" not in opts or not (has_l or has_r):
            add("WARN", "interpolate-clamp", m.start(), "interpolate() options don't clamp: values run past the range before/after the animation. Add extrapolateLeft/Right: 'clamp'.")
        elif has_l != has_r:
            add("INFO", "interpolate-clamp", m.start(), "interpolate() clamps only one side. Intentional? Usually both ends should clamp.")

    # ---- WARN: default (bouncy) spring
    for m in re.finditer(r"(?<![\w.])spring\s*\(", code):
        raw = call_args(code, m.end() - 1)
        if raw is None:
            continue
        a = raw.strip()
        if a.startswith("{") and "config" not in a:
            add("WARN", "spring-default", m.start(), "spring() without a config uses damping:10 (~16% overshoot): cartoonish. Pass config: {damping:200} (no bounce), {damping:20, stiffness:200} (snappy) - or use spr.* presets.")

    # ---- WARN: un-eased transition timing, and the fade() trap
    for m in re.finditer(r"\blinearTiming\s*\(", code):
        raw = call_args(code, m.end() - 1) or ""
        if "easing" not in raw:
            add("WARN", "timing-linear", m.start(), "linearTiming() is linear by default (mechanical). Pass easing: Easing.bezier(0.65, 0, 0.35, 1) or ease.move.")
    for m in re.finditer(r"(?<![\w.])fade\s*\(\s*\)", code):
        add("INFO", "fade-exit", m.start(), "fade() fades only the INCOMING scene; the outgoing one stays opaque, then pops. With transparent scenes pass fade({shouldFadeOutExitingScene: true}).")

    # ---- WARN: media elements that may not be loaded when a frame is captured
    for m in re.finditer(r"<img[\s>]", code):
        add("WARN", "img", m.start(), "<img> may not be decoded when the frame is captured. Use <Img> from 'remotion' (waits for load) or <CanvasImage>.")
    for m in re.finditer(r"<(video|audio)[\s>]", code):
        add("WARN", "media-el", m.start(), f"<{m.group(1)}> isn't frame-synced. Use <{m.group(1).capitalize()}> from '@remotion/media'.")
    for m in re.finditer(r"import\s*\{[^}]*\b(Audio|Video|OffthreadVideo)\b[^}]*\}\s*from\s*['\"]remotion['\"]", code):
        add("INFO", "media-import", m.start(), "Prefer <Audio>/<Video> from '@remotion/media' over the legacy 'remotion' versions.")

    # ---- WARN: data loading
    if re.search(r"\bfetch\s*\(", code) and not re.search(r"delayRender|useDelayRender|calculateMetadata", code):
        m = re.search(r"\bfetch\s*\(", code)
        add("WARN", "fetch", m.start(), "fetch() during render needs delayRender()/continueRender() (or calculateMetadata), or frames are captured before data arrives.")

    # ---- INFO / WARN: sizing and fps
    for m in re.finditer(r"const\s+fps\s*=\s*\d+", code):
        add("WARN", "hard-fps", m.start(), "Hard-coded fps. Read it from useVideoConfig() and express timing in seconds * fps.")
    for m in re.finditer(r"fontSize\s*:\s*(\d+(?:\.\d+)?)(?:px)?\s*(?=[,}\n])", code):
        if float(m.group(1)) < 36:
            add("INFO", "tiny-text", m.start(), f"fontSize {m.group(1)}px is small for video. Floors on 1080p: ~44px supporting text, ~84px headlines. (Labels/captions below that must be secondary.)")
    for m in re.finditer(r"Easing\.linear|\beasing\s*:\s*\(?\s*t\s*\)?\s*=>\s*t\s*(?=[,})\n])", code):
        add("INFO", "linear-ease", m.start(), "Linear easing is right for camera creep, rotation loops, tickers, progress bars. For entrances/exits use a decelerating/accelerating curve.")
    for m in re.finditer(r"backdrop-?[Ff]ilter\s*:", code):
        add("INFO", "backdrop-filter", m.start(), "backdrop-filter is slow to render at video resolution. A pre-blurred layer is usually cheaper.")

    # ---- font loading is judged at project level
    if re.search(r"fontFamily\s*:", code):
        project["font_use"].append((path, line_of(code, re.search(r"fontFamily\s*:", code).start())))
    if re.search(r"@remotion/google-fonts|@remotion/fonts|@font-face|fonts\.offline|from\s+['\"][./]+design/fonts['\"]|from\s+['\"]\./fonts['\"]", code):
        project["font_loaded"] = True
    for m in re.finditer(r"fonts\.googleapis\.com", code):
        add("WARN", "font-link", m.start(), "Google Fonts via <link>/@import isn't awaited by the renderer. Use @remotion/google-fonts loadFont().")

    return findings


# ----------------------------------------------------------------------------- driver
def collect(path):
    if os.path.isfile(path):
        return [path]
    files = []
    for root, dirs, names in os.walk(path):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for nme in sorted(names):
            if nme.endswith(EXTS):
                files.append(os.path.join(root, nme))
    return sorted(files)


def main():
    ap = argparse.ArgumentParser(description="Lint a Remotion project for determinism bugs and motion anti-patterns.")
    ap.add_argument("path", nargs="?", default=None, help="file or directory (default: ./src, else .)")
    ap.add_argument("--level", choices=["info", "warn", "error"], default="info", help="minimum level to show")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--strict", action="store_true", help="exit non-zero on WARN as well as ERROR")
    args = ap.parse_args()

    path = args.path or ("src" if os.path.isdir("src") else ".")
    files = collect(path)
    if not files:
        sys.exit(f"no source files found under {path}")

    project = {"font_use": [], "font_loaded": False}
    findings = []
    for f in files:
        try:
            with open(f, encoding="utf-8") as fh:
                text = fh.read()
        except (OSError, UnicodeDecodeError):
            continue
        findings.extend(lint_file(f, text, project))

    if project["font_use"] and not project["font_loaded"]:
        f, ln = project["font_use"][0]
        findings.append({"file": f, "line": ln, "level": "WARN", "rule": "font-not-loaded",
                         "msg": "fontFamily is used but no font loader found (@remotion/google-fonts, @remotion/fonts, @font-face). The render will silently fall back to a system font."})

    floor = LEVEL_ORDER[args.level.upper()]
    shown = [x for x in findings if LEVEL_ORDER[x["level"]] >= floor]
    shown.sort(key=lambda x: (-LEVEL_ORDER[x["level"]], x["file"], x["line"]))

    if args.json:
        print(json.dumps(shown, indent=2))
    else:
        for x in shown:
            print(f"{x['file']}:{x['line']}  {x['level']:<5} {x['rule']:<18} {x['msg']}")
        counts = {k: sum(1 for x in findings if x["level"] == k) for k in LEVEL_ORDER}
        print(f"\n{len(files)} files checked: {counts['ERROR']} error(s), {counts['WARN']} warning(s), {counts['INFO']} note(s)")

    bad = any(x["level"] == "ERROR" for x in findings) or (args.strict and any(x["level"] == "WARN" for x in findings))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
