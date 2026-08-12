// dual.ts — dual-cell extraction. PURE. Ported from
// STB_BruchmalysII/src/board/dual.ts (from oskar-procedure).
//
// A dual cell exists for each PRIMARY vertex with >= 3 incident quads (interior
// vertex). Its polygon is the centroids of the incident quads, sorted by angle
// around the vertex (ascending atan2 == CCW). Boundary vertices are skipped.

import type { Vec2 } from './types';
import type { Mesh } from './grid';
import type { HalfEdgeMesh } from './halfedge';

export type DualCell = {
  vertexIndex: number;
  centroids: Vec2[];
  center: Vec2;
};

export type DualCells = {
  cells: DualCell[];
  byVertex: Map<number, DualCell>;
};

function centroidOfFaceVerts(vertices: Vec2[], vidx: number[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const vi of vidx) {
    x += vertices[vi]![0];
    y += vertices[vi]![1];
  }
  return [x / vidx.length, y / vidx.length];
}

export function extractDualCells(
  mesh: Pick<Mesh, 'vertices'>,
  halfEdge: HalfEdgeMesh,
): DualCells {
  const { vertices } = mesh;
  const cells: DualCell[] = [];
  const byVertex = new Map<number, DualCell>();

  for (let v = 0; v < vertices.length; v++) {
    const faces = halfEdge.facesAroundVertex(v);
    if (faces.length < 3) continue;

    const center = vertices[v]!;
    const centroids = faces.map((f) =>
      centroidOfFaceVerts(vertices, halfEdge.verticesOfFace(f)),
    );

    centroids.sort(
      (a, b) =>
        Math.atan2(a[1] - center[1], a[0] - center[0]) -
        Math.atan2(b[1] - center[1], b[0] - center[0]),
    );

    const cell: DualCell = { vertexIndex: v, centroids, center };
    cells.push(cell);
    byVertex.set(v, cell);
  }

  return { cells, byVertex };
}
