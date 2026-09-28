import type { Color } from "three";

// Pure geometry math for duckweed patches. Each patch is built once in
// patch-local space (origin = patch placement point, rotation 0); the
// renderer then moves whole patches with mesh transforms every frame.

// Leaves are only 1–3 px across, so fewer segments visibly shrink them once
// rasterised. The geometry is static, so the segment count is free per frame.
export const DUCKWEED_LEAF_SEGMENTS = 7;
export const DUCKWEED_HIGHLIGHT_SEGMENTS = 5;
// Leaves at or below this radius get no highlight.
export const DUCKWEED_HIGHLIGHT_MIN_RADIUS = 1.55;

export interface DuckweedLeafShape {
  offsetX: number;
  offsetY: number;
  radius: number;
  angle: number;
  tone: number;
  paired: boolean;
}

export interface DuckweedPaletteColors {
  base: Color;
  light: Color;
  shade: Color;
  center: Color;
}

export interface DuckweedPatchBuffers {
  /** xyz triplets, three vertices per triangle. */
  positions: number[];
  /** rgb triplets matching `positions`. */
  colors: number[];
  /** xyz triplets, three vertices per highlight triangle. */
  highlightPositions: number[];
  /** rgb triplets matching `highlightPositions`. */
  highlightColors: number[];
}

interface Point {
  x: number;
  y: number;
}

function pushVertex(
  positions: number[],
  colors: number[],
  x: number,
  y: number,
  color: Color,
): void {
  positions.push(x, y, 0);
  colors.push(color.r, color.g, color.b);
}

function ellipsePoint(
  center: Point,
  radius: number,
  rotation: number,
  angle: number,
  verticalScale: number,
): Point {
  const localX = Math.cos(angle) * radius;
  const localY = Math.sin(angle) * radius * verticalScale;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return {
    x: center.x + localX * cosine - localY * sine,
    y: center.y + localX * sine + localY * cosine,
  };
}

function pushLeaf(
  positions: number[],
  colors: number[],
  center: Point,
  radius: number,
  angle: number,
  color: Color,
  verticalScale: number,
): void {
  const segments = DUCKWEED_LEAF_SEGMENTS;
  for (let index = 0; index < segments; index += 1) {
    const angleA = (index / segments) * Math.PI * 2;
    const angleB = ((index + 1) / segments) * Math.PI * 2;
    const a = ellipsePoint(center, radius, angle, angleA, verticalScale);
    const b = ellipsePoint(center, radius, angle, angleB, verticalScale);
    pushVertex(positions, colors, center.x, center.y, color);
    pushVertex(positions, colors, a.x, a.y, color);
    pushVertex(positions, colors, b.x, b.y, color);
  }
}

function pushCircle(
  positions: number[],
  colors: number[],
  center: Point,
  radius: number,
  color: Color,
): void {
  const segments = DUCKWEED_HIGHLIGHT_SEGMENTS;
  for (let index = 0; index < segments; index += 1) {
    const angleA = (index / segments) * Math.PI * 2;
    const angleB = ((index + 1) / segments) * Math.PI * 2;
    pushVertex(positions, colors, center.x, center.y, color);
    pushVertex(
      positions,
      colors,
      center.x + Math.cos(angleA) * radius,
      center.y + Math.sin(angleA) * radius,
      color,
    );
    pushVertex(
      positions,
      colors,
      center.x + Math.cos(angleB) * radius,
      center.y + Math.sin(angleB) * radius,
      color,
    );
  }
}

export function duckweedLeafColor(
  tone: number,
  palette: DuckweedPaletteColors,
): Color {
  return tone < 0.24 ? palette.light : tone > 0.82 ? palette.shade : palette.base;
}

export function buildDuckweedPatchBuffers(
  leaves: readonly DuckweedLeafShape[],
  palette: DuckweedPaletteColors,
  verticalScale: number,
): DuckweedPatchBuffers {
  const positions: number[] = [];
  const colors: number[] = [];
  const highlightPositions: number[] = [];
  const highlightColors: number[] = [];

  for (const leaf of leaves) {
    const center = { x: leaf.offsetX, y: leaf.offsetY };
    const { radius, angle } = leaf;
    pushLeaf(
      positions,
      colors,
      center,
      radius,
      angle,
      duckweedLeafColor(leaf.tone, palette),
      verticalScale,
    );
    if (radius > DUCKWEED_HIGHLIGHT_MIN_RADIUS) {
      pushCircle(
        highlightPositions,
        highlightColors,
        {
          x: center.x - Math.cos(angle) * radius * 0.18,
          y: center.y - Math.sin(angle) * radius * 0.18,
        },
        Math.max(0.22, radius * 0.14),
        palette.center,
      );
    }
    if (leaf.paired) {
      const pairCenter = {
        x: center.x + Math.cos(angle + 0.8) * radius * 0.92,
        y: center.y + Math.sin(angle + 0.8) * radius * 0.92,
      };
      pushLeaf(
        positions,
        colors,
        pairCenter,
        radius * 0.72,
        angle + 1.15,
        palette.light,
        verticalScale,
      );
    }
  }

  return { positions, colors, highlightPositions, highlightColors };
}
