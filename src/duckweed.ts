import * as THREE from "three";
import { DUCKWEED, DUCKWEED_PATCHES, viewportPoint } from "./config";
import {
  buildDuckweedPatchBuffers,
  type DuckweedLeafShape,
} from "./duckweed-geometry";

interface DuckweedPalette {
  base: THREE.Color;
  light: THREE.Color;
  shade: THREE.Color;
  center: THREE.Color;
}

interface DuckweedPatchMesh {
  geometry: THREE.BufferGeometry;
  highlightGeometry: THREE.BufferGeometry;
  leafMesh: THREE.Mesh;
  shadowMesh: THREE.Mesh;
  highlights: THREE.Mesh;
}

const PALETTES: readonly DuckweedPalette[] = DUCKWEED.palettes.map((palette) => ({
  base: new THREE.Color(palette.base),
  light: new THREE.Color(palette.light),
  shade: new THREE.Color(palette.shade),
  center: new THREE.Color(palette.center),
}));

function randomUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function createAttributeGeometry(
  positions: readonly number[],
  colors: readonly number[],
  name: string,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setAttribute(
    "color",
    new THREE.BufferAttribute(new Float32Array(colors), 3),
  );
  geometry.name = name;
  return geometry;
}

export class DuckweedPass {
  public readonly shadowGroup = new THREE.Group();
  public readonly group = new THREE.Group();

  private readonly shadowMaterial = new THREE.MeshBasicMaterial({
    color: DUCKWEED.shadow.color,
    opacity: DUCKWEED.shadow.opacity,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly leafMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private patches: DuckweedPatchMesh[] = [];

  public constructor() {
    this.refreshConfig();
  }

  public refreshConfig(): void {
    this.shadowMaterial.color.setHex(DUCKWEED.shadow.color);
    this.shadowMaterial.opacity = DUCKWEED.shadow.opacity;
    for (const [index, palette] of DUCKWEED.palettes.entries()) {
      const target = PALETTES[index];
      if (!target) continue;
      target.base.setHex(palette.base);
      target.light.setHex(palette.light);
      target.shade.setHex(palette.shade);
      target.center.setHex(palette.center);
    }
    this.rebuild();
  }

  public update(time: number): void {
    if (DUCKWEED_PATCHES.length !== this.patches.length) this.rebuild();

    const visiblePatchCount = Math.min(
      DUCKWEED.visiblePatchCount,
      DUCKWEED_PATCHES.length,
    );
    const shadowOffset = DUCKWEED.shadow.offset;
    for (const [patchIndex, mesh] of this.patches.entries()) {
      const visible = patchIndex < visiblePatchCount;
      mesh.leafMesh.visible = visible;
      mesh.shadowMesh.visible = visible;
      mesh.highlights.visible = visible;
      if (!visible) continue;

      const patch = DUCKWEED_PATCHES[patchIndex];
      const driftX = Math.sin(time * 0.1 + patch.phase) * DUCKWEED.driftX;
      const driftY =
        Math.cos(time * 0.13 + patch.phase * 1.4) * DUCKWEED.driftY;
      const rotation =
        Math.sin(time * 0.075 + patch.phase) * DUCKWEED.rotationAmount;
      const placement = viewportPoint(patch.x, patch.y);
      const x = placement.x + driftX;
      const y = placement.y + driftY;

      mesh.leafMesh.position.set(x, y, 0);
      mesh.leafMesh.rotation.z = rotation;
      mesh.highlights.position.set(x, y, 0);
      mesh.highlights.rotation.z = rotation;
      mesh.shadowMesh.position.set(x + shadowOffset.x, y + shadowOffset.y, 0);
      mesh.shadowMesh.rotation.z = rotation;
    }
  }

  private rebuild(): void {
    this.disposePatches();

    const leavesByPatch = this.createLeaves();
    const patches: DuckweedPatchMesh[] = [];
    for (const [patchIndex, patch] of DUCKWEED_PATCHES.entries()) {
      const palette = PALETTES[patch.palette % PALETTES.length];
      const buffers = buildDuckweedPatchBuffers(
        leavesByPatch[patchIndex],
        palette,
        DUCKWEED.verticalScale,
      );
      const geometry = createAttributeGeometry(
        buffers.positions,
        buffers.colors,
        `duckweed patch ${patchIndex}`,
      );
      const highlightGeometry = createAttributeGeometry(
        buffers.highlightPositions,
        buffers.highlightColors,
        `duckweed highlights ${patchIndex}`,
      );

      const leafMesh = new THREE.Mesh(geometry, this.leafMaterial);
      // The shadow shares the leaf geometry; its material ignores vertex colors.
      const shadowMesh = new THREE.Mesh(geometry, this.shadowMaterial);
      const highlights = new THREE.Mesh(highlightGeometry, this.leafMaterial);
      leafMesh.frustumCulled = false;
      shadowMesh.frustumCulled = false;
      highlights.frustumCulled = false;
      leafMesh.renderOrder = 0;
      shadowMesh.renderOrder = 0;
      highlights.renderOrder = 1;
      this.group.add(leafMesh, highlights);
      this.shadowGroup.add(shadowMesh);
      patches.push({
        geometry,
        highlightGeometry,
        leafMesh,
        shadowMesh,
        highlights,
      });
    }
    this.patches = patches;
  }

  private disposePatches(): void {
    for (const mesh of this.patches) {
      this.group.remove(mesh.leafMesh, mesh.highlights);
      this.shadowGroup.remove(mesh.shadowMesh);
      mesh.geometry.dispose();
      mesh.highlightGeometry.dispose();
    }
    this.patches = [];
  }

  private createLeaves(): DuckweedLeafShape[][] {
    const leavesByPatch: DuckweedLeafShape[][] = [];
    for (const [patchIndex, patch] of DUCKWEED_PATCHES.entries()) {
      const leaves: DuckweedLeafShape[] = [];
      for (let index = 0; index < patch.count; index += 1) {
        const seed = patchIndex * 1013 + index * 37 + 11;
        const radiusAmount = Math.pow(
          randomUnit(seed + 1),
          DUCKWEED.spreadExponent,
        );
        const distance = patch.radius * radiusAmount;
        const angle = randomUnit(seed + 2) * Math.PI * 2;
        leaves.push({
          offsetX: Math.cos(angle) * distance,
          offsetY: Math.sin(angle) * distance * 0.74,
          radius:
            DUCKWEED.minimumLeafRadius +
            randomUnit(seed + 3) *
              (DUCKWEED.maximumLeafRadius - DUCKWEED.minimumLeafRadius),
          angle: randomUnit(seed + 4) * Math.PI * 2,
          tone: randomUnit(seed + 6),
          paired: randomUnit(seed + 7) < DUCKWEED.pairChance,
        });
      }
      leavesByPatch.push(leaves);
    }
    return leavesByPatch;
  }
}
