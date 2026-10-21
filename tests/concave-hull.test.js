import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { concaveHull, isSimpleRing, pointInRingInclusive } from '../src/lib/concave-hull.js';
import { buildContourFromGeometry, convexHull, polygonArea } from '../src/lib/geometry.js';
import { buildFlightPlanFromDxfText } from '../src/lib/flight-plan.js';
import { parseDxfText } from '../src/lib/dxf.js';

const TOL = 1e-9;

function keyOf([x, y]) {
  return `${x}:${y}`;
}

// Integer grid points of an L-shaped region: horizontal arm 20 x 2 and vertical arm 2 x 20.
function lShapedGrid() {
  const points = [];
  for (let x = 0; x <= 20; x += 1) {
    for (let y = 0; y <= 2; y += 1) {
      points.push([x, y]);
    }
  }
  for (let x = 0; x <= 2; x += 1) {
    for (let y = 3; y <= 20; y += 1) {
      points.push([x, y]);
    }
  }
  return points;
}

describe('concave hull (KNN, Moreira & Santos)', () => {
  it('follows an L-shaped point grid instead of its convex hull', () => {
    const points = lShapedGrid();
    const ring = concaveHull(points);

    expect(ring.length).toBeGreaterThanOrEqual(3);

    const inputKeys = new Set(points.map(keyOf));
    for (const vertex of ring) {
      expect(inputKeys.has(keyOf(vertex))).toBe(true);
    }

    expect(isSimpleRing(ring, TOL)).toBe(true);
    for (const point of points) {
      expect(pointInRingInclusive(point, ring, TOL)).toBe(true);
    }

    const concaveArea = polygonArea(ring);
    const convexArea = polygonArea(convexHull(points));
    expect(concaveArea).toBeLessThan(convexArea * 0.5);
    // The L-shaped boundary encloses about 76 m2 (20*2 + 2*18).
    expect(concaveArea).toBeCloseTo(76, 0);
  });

  it('returns an empty ring for fewer than four points', () => {
    expect(concaveHull([[0, 0], [1, 0], [0, 1]])).toEqual([]);
  });
});

describe('contour from hole centres', () => {
  it('uses hole centres of the sample DXF and keeps every hole inside the contour', () => {
    const path = join(process.cwd(), 'input', 'holes-PP190526_B.dxf');
    const parsed = parseDxfText(readFileSync(path, 'utf8'));

    expect(parsed.holeCenters).toHaveLength(142);

    const ring = buildContourFromGeometry(parsed);
    expect(ring.length).toBeGreaterThanOrEqual(3);
    expect(isSimpleRing(ring, TOL)).toBe(true);

    const centreKeys = new Set(parsed.holeCenters.map(keyOf));
    for (const vertex of ring) {
      expect(centreKeys.has(keyOf(vertex))).toBe(true);
    }
    for (const centre of parsed.holeCenters) {
      expect(pointInRingInclusive(centre, ring, TOL)).toBe(true);
    }

    expect(polygonArea(ring)).toBeLessThan(polygonArea(convexHull(parsed.holeCenters)));
  });

  it('exports the hole contour DXF alongside the flight plan', async () => {
    const path = join(process.cwd(), 'input', 'holes-PP190526_B.dxf');
    const built = await buildFlightPlanFromDxfText(readFileSync(path, 'utf8'), {
      bufferMeters: 7,
      utmZone: 24,
      flightDate: new Date('2026-05-25T00:00:00Z'),
      sourceFileName: 'holes-PP190526_B.dxf'
    });

    expect(built.contourDxfOutputName).toContain('contorno dos furos');
    expect(built.contourDxf).toContain('\n  0\nPOLYLINE\n');
    const vertexCount = built.contourDxf.split('\n  0\nVERTEX\n').length - 1;
    expect(vertexCount).toBe(built.contourRing.length);
  });
});
