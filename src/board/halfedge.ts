// halfedge.ts — DCEL over a finalized quad mesh. PURE. Built once after relax.
// Ported from STB_BruchmalysII/src/board/halfedge.ts (from oskar-procedure).

import type { Vec2 } from './types';
import type { Mesh } from './grid';

export type Face = { he: HalfEdge | null };
export type HalfEdge = {
  vertex: number; // origin (tail) vertex index
  twin: HalfEdge | null;
  next: HalfEdge | null;
  face: Face;
};
export type HEVertex = { pos: Vec2; he: HalfEdge | null };

export type HalfEdgeMesh = {
  halfEdges: HalfEdge[];
  vertices: HEVertex[];
  faces: Face[];
  facesAroundVertex: (v: number) => Face[];
  verticesOfFace: (face: Face) => number[];
};

export function buildHalfEdge(mesh: Pick<Mesh, 'vertices' | 'quads'>): HalfEdgeMesh {
  const { vertices, quads } = mesh;

  const Vertices: HEVertex[] = vertices.map((pos) => ({ pos, he: null }));
  const Faces: Face[] = [];
  const halfEdges: HalfEdge[] = [];

  const directed = new Map<string, HalfEdge>();
  const dkey = (a: number, b: number): string => a + '->' + b;

  const outgoing: HalfEdge[][] = vertices.map(() => []);

  for (let qi = 0; qi < quads.length; qi++) {
    const q = quads[qi]!;
    const face: Face = { he: null };
    Faces.push(face);

    const ring: HalfEdge[] = [];
    for (let i = 0; i < 4; i++) {
      const he: HalfEdge = { vertex: q[i as 0 | 1 | 2 | 3], twin: null, next: null, face };
      ring.push(he);
      halfEdges.push(he);
    }
    for (let i = 0; i < 4; i++) ring[i]!.next = ring[(i + 1) % 4]!;
    face.he = ring[0]!;

    for (let i = 0; i < 4; i++) {
      const a = q[i as 0 | 1 | 2 | 3];
      const b = q[((i + 1) % 4) as 0 | 1 | 2 | 3];
      directed.set(dkey(a, b), ring[i]!);
      outgoing[a]!.push(ring[i]!);
      if (Vertices[a]!.he === null) Vertices[a]!.he = ring[i]!;
    }
  }

  for (let qi = 0; qi < quads.length; qi++) {
    const q = quads[qi]!;
    const base = qi * 4;
    for (let i = 0; i < 4; i++) {
      const he = halfEdges[base + i]!;
      if (he.twin !== null) continue;
      const a = q[i as 0 | 1 | 2 | 3];
      const b = q[((i + 1) % 4) as 0 | 1 | 2 | 3];
      const back = directed.get(dkey(b, a));
      if (back) {
        he.twin = back;
        back.twin = he;
      }
    }
  }

  function verticesOfFace(face: Face): number[] {
    const out: number[] = [];
    let e = face.he!;
    for (let i = 0; i < 4; i++) {
      out.push(e.vertex);
      e = e.next!;
    }
    return out;
  }

  function facesAroundVertex(v: number): Face[] {
    const start = Vertices[v]!.he;
    if (!start) return [];
    const faces: Face[] = [];
    const seen = new Set<Face>();

    const add = (f: Face): void => {
      if (!seen.has(f)) {
        seen.add(f);
        faces.push(f);
      }
    };

    const walkFan = (s: HalfEdge): void => {
      let e = s;
      let closed = false;
      for (let guard = 0; guard < halfEdges.length + 4; guard++) {
        add(e.face);
        if (!e.twin) break;
        e = e.twin.next!;
        if (e === s) {
          closed = true;
          break;
        }
      }
      if (!closed) {
        let r = s;
        for (let guard = 0; guard < halfEdges.length + 4; guard++) {
          const prev = r.next!.next!.next!;
          if (!prev.twin) break;
          r = prev.twin;
          if (r === s) break;
          add(r.face);
        }
      }
    };

    walkFan(start);

    for (const he of outgoing[v]!) {
      if (!seen.has(he.face)) walkFan(he);
    }

    return faces;
  }

  return {
    halfEdges,
    vertices: Vertices,
    faces: Faces,
    facesAroundVertex,
    verticesOfFace,
  };
}
