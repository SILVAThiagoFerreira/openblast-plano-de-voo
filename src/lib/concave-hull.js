// KNN concave hull (Moreira & Santos, 2007).
//
// The returned ring is a simple closed polygon whose vertices are a subset of the
// input points (no offset, no buffer, no simplification). Every input point lies
// inside or on the ring. If no valid ring is found up to `maxK`, an empty array is
// returned and the caller decides the fallback.

function dedupeInput(points) {
  const seen = new Set();
  const output = [];

  for (const value of points ?? []) {
    const x = Number(value?.[0]);
    const y = Number(value?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }

    const key = `${x}:${y}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push([x, y]);
  }

  return output;
}

function orientation(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function inBox(a, b, p) {
  return Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0])
    && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);
}

function segmentsTouch(a, b, c, d, tol) {
  const d1 = orientation(c, d, a);
  const d2 = orientation(c, d, b);
  const d3 = orientation(a, b, c);
  const d4 = orientation(a, b, d);

  if (((d1 > tol && d2 < -tol) || (d1 < -tol && d2 > tol))
    && ((d3 > tol && d4 < -tol) || (d3 < -tol && d4 > tol))) {
    return true;
  }

  return (Math.abs(d1) <= tol && inBox(c, d, a))
    || (Math.abs(d2) <= tol && inBox(c, d, b))
    || (Math.abs(d3) <= tol && inBox(a, b, c))
    || (Math.abs(d4) <= tol && inBox(a, b, d));
}

function bearingDeg(from, to) {
  const angle = (Math.atan2(to[0] - from[0], to[1] - from[1]) * 180) / Math.PI;
  return (angle + 360) % 360;
}

export function pointInRingInclusive(p, ring, tol) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[j];
    const b = ring[i];

    if (Math.abs(orientation(a, b, p)) <= tol && inBox(a, b, p)) {
      return true;
    }

    if ((a[1] > p[1]) !== (b[1] > p[1])) {
      const x = ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0];
      if (p[0] < x) {
        inside = !inside;
      }
    }
  }

  return inside;
}

export function isSimpleRing(ring, tol) {
  const n = ring.length;
  if (n < 3) {
    return false;
  }

  for (let i = 0; i < n; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % n];

    for (let j = i + 1; j < n; j += 1) {
      // Skip the pair of edges that are adjacent to each other.
      if (j === i + 1 || (i === 0 && j === n - 1)) {
        continue;
      }

      const c = ring[j];
      const d = ring[(j + 1) % n];
      if (segmentsTouch(a, b, c, d, tol)) {
        return false;
      }
    }
  }

  return true;
}

// One KNN walk with a fixed neighbourhood size k. Returns the ring as point indices
// or null when the walk gets stuck or cannot close.
function walkKnn(pts, k, tol) {
  const n = pts.length;

  let start = 0;
  for (let i = 1; i < n; i += 1) {
    const [x, y] = pts[i];
    const [sx, sy] = pts[start];
    if (y < sy || (y === sy && x < sx)) {
      start = i;
    }
  }

  const hull = [start];
  const unvisited = [];
  for (let i = 0; i < n; i += 1) {
    if (i !== start) {
      unvisited.push(i);
    }
  }

  let current = start;
  // Virtual previous point directly south of the start, i.e. the walk heads north first.
  let backBearing = 180;

  const maxSteps = 4 * n + 10;
  for (let step = 0; step < maxSteps; step += 1) {
    const origin = pts[current];
    const pool = unvisited.map((index) => ({
      index,
      distance: Math.hypot(pts[index][0] - origin[0], pts[index][1] - origin[1])
    }));

    if (hull.length >= 3) {
      pool.push({
        index: start,
        distance: Math.hypot(pts[start][0] - origin[0], pts[start][1] - origin[1])
      });
    }

    pool.sort((a, b) => a.distance - b.distance);

    const candidates = pool
      .slice(0, k)
      .map(({ index }) => {
        const angle = (((bearingDeg(origin, pts[index]) - backBearing) % 360) + 360) % 360;
        return { index, angle };
      })
      .filter(({ angle }) => angle > 1e-9 && angle < 360 - 1e-9)
      .sort((a, b) => b.angle - a.angle);

    let chosen = null;
    for (const { index } of candidates) {
      if (intersectsHull(current, index, hull, pts, tol)) {
        continue;
      }

      chosen = index;
      break;
    }

    if (chosen === null) {
      return null;
    }

    if (chosen === start) {
      return hull;
    }

    backBearing = bearingDeg(pts[chosen], origin);
    hull.push(chosen);
    unvisited.splice(unvisited.indexOf(chosen), 1);
    current = chosen;
  }

  return null;
}

// Checks whether the candidate segment (from -> to) touches the open hull path,
// ignoring path edges that share an endpoint with either segment end.
function intersectsHull(from, to, hull, pts, tol) {
  for (let i = 0; i < hull.length - 1; i += 1) {
    const u = hull[i];
    const v = hull[i + 1];
    if (u === from || u === to || v === from || v === to) {
      continue;
    }

    if (segmentsTouch(pts[from], pts[to], pts[u], pts[v], tol)) {
      return true;
    }
  }

  return false;
}

/** Median distance from each point to its nearest other point. */
export function medianNearestNeighbour(points) {
  const pts = dedupeInput(points);
  if (pts.length < 2) {
    return 0;
  }

  const nearest = pts.map((point, i) => {
    let best = Infinity;
    for (let j = 0; j < pts.length; j += 1) {
      if (j !== i) {
        best = Math.min(best, Math.hypot(pts[j][0] - point[0], pts[j][1] - point[1]));
      }
    }
    return best;
  });

  nearest.sort((a, b) => a - b);
  return nearest[Math.floor(nearest.length / 2)];
}

function pointSegmentDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

// Chi-shape style digging: while a ring edge is longer than `threshold`, insert the
// nearest hole that is not yet a vertex, if the ring stays simple and keeps every hole inside.
const DIG_CANDIDATES = 10;
const DIG_FACTOR = 1.5;

function digRing(pts, ringIndices, tol, threshold) {
  let ring = ringIndices.slice();
  let changed = true;

  while (changed) {
    changed = false;
    const inRing = new Set(ring);

    for (let i = 0; i < ring.length && !changed; i += 1) {
      const a = pts[ring[i]];
      const b = pts[ring[(i + 1) % ring.length]];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) <= threshold) {
        continue;
      }

      const candidates = [];
      for (let j = 0; j < pts.length; j += 1) {
        if (!inRing.has(j)) {
          candidates.push({ index: j, distance: pointSegmentDistance(pts[j], a, b) });
        }
      }
      candidates.sort((x, y) => x.distance - y.distance);

      for (const { index } of candidates.slice(0, DIG_CANDIDATES)) {
        const trial = [...ring.slice(0, i + 1), index, ...ring.slice(i + 1)];
        const trialPts = trial.map((k) => pts[k]);
        if (isSimpleRing(trialPts, tol) && pts.every((point) => pointInRingInclusive(point, trialPts, tol))) {
          ring = trial;
          changed = true;
          break;
        }
      }
    }
  }

  return ring;
}

/**
 * Concave hull of a point cloud.
 * @param {Array<[number, number]>} points input points (used as-is, never moved)
 * @param {{ maxK?: number }} options maxK caps the neighbourhood size tried
 * @returns {Array<[number, number]>} closed-ring vertices (not repeated at the end), or [] on failure
 */
export function concaveHull(points, { maxK = 60 } = {}) {
  const pts = dedupeInput(points);
  const n = pts.length;
  if (n < 4) {
    return [];
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const diagonal = Math.hypot(maxX - minX, maxY - minY);
  const tol = 1e-10 * diagonal * diagonal;

  // Edges longer than DIG_FACTOR x median spacing are dug. 1.6 leaves outer holes up to
  // ~3 spacings from the line on the sample; 1.5 brings them to ~1.1 spacings.
  const threshold = DIG_FACTOR * medianNearestNeighbour(pts);
  const kLimit = Math.min(maxK, n - 1);
  for (let k = 3; k <= kLimit; k += 1) {
    const indices = walkKnn(pts, k, tol);
    if (!indices || indices.length < 3) {
      continue;
    }

    const ringPts = indices.map((index) => pts[index]);
    if (!isSimpleRing(ringPts, tol)) {
      continue;
    }

    if (pts.every((point) => pointInRingInclusive(point, ringPts, tol))) {
      return digRing(pts, indices, tol, threshold).map((index) => pts[index]);
    }
  }

  return [];
}
