/**
 * Layout helpers for animation templates.
 *
 * Pixel-based positioning utilities that templates can opt into. None of
 * these touch the React tree — they're pure math so they can be tested
 * in isolation and reused across templates with different anchoring.
 *
 * Coordinate convention: (0,0) is the top-left of the parent `AbsoluteFill`
 * the template is rendered into. Templates compose their own `AbsoluteFill`
 * so callers don't need to know the container size ahead of time.
 */

export interface Rect {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Nine-anchor alignment ("top-left", "center", "bottom-right", ...).
 * Returns the pixel coordinate of the anchor inside `container`.
 */
export function anchor(
  position: AnchorName,
  container: Rect,
): Point {
  const { width: w, height: h } = container;
  switch (position) {
    case "top-left":      return { x: 0,     y: 0 };
    case "top-center":    return { x: w / 2, y: 0 };
    case "top-right":     return { x: w,     y: 0 };
    case "center-left":   return { x: 0,     y: h / 2 };
    case "center":        return { x: w / 2, y: h / 2 };
    case "center-right":  return { x: w,     y: h / 2 };
    case "bottom-left":   return { x: 0,     y: h };
    case "bottom-center": return { x: w / 2, y: h };
    case "bottom-right":  return { x: w,     y: h };
  }
}

export type AnchorName =
  | "top-left" | "top-center" | "top-right"
  | "center-left" | "center" | "center-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

/**
 * Stack of N children along `direction`, evenly spaced between the
 * `from` and `to` points (inclusive). Useful for distributing timeline
 * milestones or ranked bars across a runway.
 *
 * @param count       number of children
 * @param from        first child anchor
 * @param to          last child anchor
 * @param direction   "horizontal" interpolates x and keeps y constant (= from.y);
 *                    "vertical" interpolates y and keeps x constant (= from.x)
 * @returns          one Point per child, in order
 */
export function distribute(
  count: number,
  from: Point,
  to: Point,
  direction: "horizontal" | "vertical" = "horizontal",
): Point[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }];
  const pts: Point[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    if (direction === "horizontal") {
      pts.push({ x: from.x + (to.x - from.x) * t, y: from.y });
    } else {
      pts.push({ x: from.x, y: from.y + (to.y - from.y) * t });
    }
  }
  return pts;
}

/** Grid of `rows × cols` cells filling `rect` (with optional gutter). */
export function gridCells(
  rows: number,
  cols: number,
  rect: Rect,
  gutter = 0,
): Rect[] {
  const cells: Rect[] = [];
  const usableW = rect.width - gutter * (cols - 1);
  const usableH = rect.height - gutter * (rows - 1);
  const cw = usableW / cols;
  const ch = usableH / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        width: cw,
        height: ch,
        x: c * (cw + gutter),
        y: r * (ch + gutter),
      });
    }
  }
  return cells;
}

export interface PositionedRect extends Rect, Point {}

/**
 * Apply an element-level position override on top of an authored position.
 * `null` returned → no override; the caller should use the authored value.
 */
export function withOverride(
  authored: Point,
  elementPosition: Point | null,
): Point {
  return elementPosition ?? authored;
}

/** Diagonal sweep order for `gridCells` (top-left → bottom-right diagonal). */
export function diagonalOrder(rows: number, cols: number): number[] {
  const order: number[] = [];
  for (let s = 0; s < rows + cols - 1; s++) {
    for (let r = 0; r <= s; r++) {
      const c = s - r;
      if (r < rows && c < cols) order.push(r * cols + c);
    }
  }
  return order;
}

/** Spiral inward order for `gridCells` (exterior cells first). */
export function spiralOrder(rows: number, cols: number): number[] {
  const order: number[] = [];
  const seen = new Set<number>();
  let r = 0, c = 0, dr = 0, dc = 1;
  for (let i = 0; i < rows * cols; i++) {
    order.push(r * cols + c);
    seen.add(r * cols + c);
    const nr = r + dr, nc = c + dc;
    if (
      nr < 0 || nr >= rows || nc < 0 || nc >= cols ||
      seen.has(nr * cols + nc)
    ) {
      const tmp = dr; dr = dc; dc = -tmp;
    }
    r += dr; c += dc;
  }
  return order;
}
