import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  concaveHull,
  isSimpleRing,
  medianNearestNeighbour,
  pointInRingInclusive
} from '../src/lib/concave-hull.js';
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

function pointSegmentDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function distanceToRing(p, ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i += 1) {
    best = Math.min(best, pointSegmentDistance(p, ring[i], ring[(i + 1) % ring.length]));
  }
  return best;
}

// Outer-row holes: neighbours within 1.6 spacings leave an angular gap wider than 120 degrees.
function outerRowHoles(points, spacing) {
  return points.filter((p) => {
    const angles = points
      .filter((q) => q !== p && Math.hypot(q[0] - p[0], q[1] - p[1]) <= 1.6 * spacing)
      .map((q) => (Math.atan2(q[0] - p[0], q[1] - p[1]) * 180 / Math.PI + 360) % 360)
      .sort((a, b) => a - b);
    if (!angles.length) {
      return true;
    }
    let maxGap = angles[0] + 360 - angles[angles.length - 1];
    for (let i = 1; i < angles.length; i += 1) {
      maxGap = Math.max(maxGap, angles[i] - angles[i - 1]);
    }
    return maxGap > 120;
  });
}

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

  it('digs the contour so outer-row holes lie within about one spacing of it', () => {
    const path = join(process.cwd(), 'input', 'holes-PP190526_B.dxf');
    const parsed = parseDxfText(readFileSync(path, 'utf8'));
    const centres = parsed.holeCenters;
    const ring = buildContourFromGeometry(parsed);
    const spacing = medianNearestNeighbour(centres);

    const outer = outerRowHoles(centres, spacing);
    const vertexKeys = new Set(ring.map(keyOf));
    const notVertex = outer.filter((p) => !vertexKeys.has(keyOf(p)));
    const maxOuterDistance = Math.max(...outer.map((p) => distanceToRing(p, ring)));

    // Report for the commit / review: outer-row count, vertices, max distance, area.
    console.info(JSON.stringify({
      spacing: Number(spacing.toFixed(3)),
      outerRow: outer.length,
      outerRowNotVertex: notVertex.length,
      vertices: ring.length,
      areaM2: Number(polygonArea(ring).toFixed(1)),
      maxOuterRowDistanceM: Number(maxOuterDistance.toFixed(2)),
      maxInnerDistanceM: Number(Math.max(...centres.map((p) => distanceToRing(p, ring))).toFixed(2))
    }));

    expect(maxOuterDistance).toBeLessThanOrEqual(1.25 * spacing);
    expect(notVertex.length).toBeLessThanOrEqual(2);
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
