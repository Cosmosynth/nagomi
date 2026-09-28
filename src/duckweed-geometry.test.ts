import { Color } from "three";
import { describe, expect, it } from "vitest";
import {
  buildDuckweedPatchBuffers,
  DUCKWEED_HIGHLIGHT_SEGMENTS,
  DUCKWEED_LEAF_SEGMENTS,
  type DuckweedLeafShape,
  type DuckweedPaletteColors,
} from "./duckweed-geometry";

const palette: DuckweedPaletteColors = {
  base: new Color(0x6fc94f),
  light: new Color(0x9be66c),
  shade: new Color(0x45963e),
  center: new Color(0xc3ee75),
};
const verticalScale = 0.76;

// The previous per-frame world-space formulas, kept as the reference.
function worldEllipsePoint(
  center: { x: number; y: number },
  radius: number,
  rotation: number,
  angle: number,
) {
  const localX = Math.cos(angle) * radius;
  const localY = Math.sin(angle) * radius * verticalScale;
  return {
    x: center.x + localX * Math.cos(rotation) - localY * Math.sin(rotation),
    y: center.y + localX * Math.sin(rotation) + localY * Math.cos(rotation),
  };
}

function worldLeafTriangles(
  center: { x: number; y: number },
  radius: number,
  angle: number,
): number[] {
  const out: number[] = [];
  for (let index = 0; index < DUCKWEED_LEAF_SEGMENTS; index += 1) {
    const a = worldEllipsePoint(
      center,
      radius,
      angle,
      (index / DUCKWEED_LEAF_SEGMENTS) * Math.PI * 2,
    );
    const b = worldEllipsePoint(
      center,
      radius,
      angle,
      ((index + 1) / DUCKWEED_LEAF_SEGMENTS) * Math.PI * 2,
    );
    out.push(center.x, center.y, a.x, a.y, b.x, b.y);
  }
  return out;
}

describe("duckweed patch geometry", () => {
  const leaves: DuckweedLeafShape[] = [
    { offsetX: 6.5, offsetY: -3.25, radius: 2.4, angle: 1.1, tone: 0.5, paired: true },
    { offsetX: -9, offsetY: 4, radius: 1.2, angle: 4.2, tone: 0.1, paired: false },
    { offsetX: 1.5, offsetY: 7.75, radius: 3.3, angle: 5.9, tone: 0.9, paired: true },
  ];
  const placement = { x: 41.7, y: 88.2 };
  const drift = { x: 2.3, y: -1.9 };
  const rotation = 0.037;

  it("matches the world-space formula once transformed by the patch", () => {
    const buffers = buildDuckweedPatchBuffers(leaves, palette, verticalScale);
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const transformed: number[] = [];
    for (let i = 0; i < buffers.positions.length; i += 3) {
      const x = buffers.positions[i];
      const y = buffers.positions[i + 1];
      transformed.push(
        placement.x + drift.x + x * cosine - y * sine,
        placement.y + drift.y + x * sine + y * cosine,
      );
    }

    const expected: number[] = [];
    for (const leaf of leaves) {
      const center = {
        x: placement.x + leaf.offsetX * cosine - leaf.offsetY * sine + drift.x,
        y: placement.y + leaf.offsetX * sine + leaf.offsetY * cosine + drift.y,
      };
      const angle = leaf.angle + rotation;
      expected.push(...worldLeafTriangles(center, leaf.radius, angle));
      if (leaf.paired) {
        expected.push(
          ...worldLeafTriangles(
            {
              x: center.x + Math.cos(angle + 0.8) * leaf.radius * 0.92,
              y: center.y + Math.sin(angle + 0.8) * leaf.radius * 0.92,
            },
            leaf.radius * 0.72,
            angle + 1.15,
          ),
        );
      }
    }

    expect(transformed).toHaveLength(expected.length);
    for (const [index, value] of expected.entries()) {
      expect(Math.abs(transformed[index] - value)).toBeLessThan(1e-6);
    }
  });

  it("emits highlights only for large leaves, in the same place", () => {
    const buffers = buildDuckweedPatchBuffers(leaves, palette, verticalScale);
    // Radius 1.2 is below the 1.55 threshold; each highlight is a small fan.
    expect(buffers.highlightPositions).toHaveLength(2 * DUCKWEED_HIGHLIGHT_SEGMENTS * 3 * 3);
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const leaf = leaves[0];
    const center = {
      x: placement.x + leaf.offsetX * cosine - leaf.offsetY * sine + drift.x,
      y: placement.y + leaf.offsetX * sine + leaf.offsetY * cosine + drift.y,
    };
    const angle = leaf.angle + rotation;
    const expectedX = center.x - Math.cos(angle) * leaf.radius * 0.18;
    const expectedY = center.y - Math.sin(angle) * leaf.radius * 0.18;
    // The first vertex of each highlight fan is its center.
    const x = buffers.highlightPositions[0];
    const y = buffers.highlightPositions[1];
    expect(
      Math.abs(placement.x + drift.x + x * cosine - y * sine - expectedX),
    ).toBeLessThan(1e-6);
    expect(
      Math.abs(placement.y + drift.y + x * sine + y * cosine - expectedY),
    ).toBeLessThan(1e-6);
    expect(buffers.highlightColors.slice(0, 3)).toEqual([
      palette.center.r,
      palette.center.g,
      palette.center.b,
    ]);
  });

  it("uses matching position and color counts and tone-based colors", () => {
    const buffers = buildDuckweedPatchBuffers(leaves, palette, verticalScale);
    expect(buffers.colors).toHaveLength(buffers.positions.length);
    // Leaf 0 is base tone, leaf 1 is light (tone < 0.24).
    const perLeaf = DUCKWEED_LEAF_SEGMENTS * 3 * 3;
    expect(buffers.colors.slice(0, 3)).toEqual([
      palette.base.r,
      palette.base.g,
      palette.base.b,
    ]);
    const leaf1Start = perLeaf * 2; // leaf 0 + its pair
    expect(buffers.colors.slice(leaf1Start, leaf1Start + 3)).toEqual([
      palette.light.r,
      palette.light.g,
      palette.light.b,
    ]);
  });
});
