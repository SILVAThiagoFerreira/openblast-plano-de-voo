import concaveman from 'concaveman';
import ClipperLib from 'clipper-lib';
import proj4 from 'proj4';

const CLIPPER_SCALE = 1000;

function toPoint(value) {
  if (!value) {
    return null;
  }

  const x = Number(value.x ?? value.X ?? value[0]);
  const y = Number(value.y ?? value.Y ?? value[1]);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return [x, y];
}

export function normalizeRing(ring) {
  const cleaned = [];

  for (const value of ring ?? []) {
    const point = toPoint(value);
    if (!point) {
      continue;
    }

    const last = cleaned[cleaned.length - 1];
    if (!last || last[0] !== point[0] || last[1] !== point[1]) {
      cleaned.push(point);
    }
  }

  if (cleaned.length > 1) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      cleaned.pop();
    }
  }

  return cleaned;
}

export function dedupePoints(points, precision = 3) {
  const seen = new Set();
  const output = [];

  for (const value of points ?? []) {
    const point = toPoint(value);
    if (!point) {
      continue;
    }

    const key = `${point[0].toFixed(precision)}:${point[1].toFixed(precision)}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(point);
  }

  return output;
}

export function polygonArea(ring) {
  const points = normalizeRing(ring);
  if (points.length < 3) {
    return 0;
  }

  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }

  return Math.abs(sum) / 2;
}

export function polygonPerimeter(ring) {
  const points = normalizeRing(ring);
  if (points.length < 2) {
    return 0;
  }

  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    sum += Math.hypot(x2 - x1, y2 - y1);
  }

  return sum;
}

export function bboxOfPoints(points) {
  const cleaned = dedupePoints(points, 4);
  if (!cleaned.length) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0
    };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [x, y] of cleaned) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

export function bboxToRing(box, padding = 0) {
  return [
    [box.minX - padding, box.minY - padding],
    [box.maxX + padding, box.minY - padding],
    [box.maxX + padding, box.maxY + padding],
    [box.minX - padding, box.maxY + padding]
  ];
}

export function ringToSvgPath(ring, mapPoint) {
  const points = normalizeRing(ring);
  if (!points.length) {
    return '';
  }

  return `${points
    .map((point, index) => {
      const [x, y] = mapPoint(point);
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ')} Z`;
}

export function buildPreviewTransform(rings, width = 1000, height = 680, padding = 56) {
  const allPoints = rings.flat();
  const box = bboxOfPoints(allPoints);
  const usableWidth = Math.max(width - padding * 2, 1);
  const usableHeight = Math.max(height - padding * 2, 1);
  const scale = Math.min(
    usableWidth / Math.max(box.width, 1),
    usableHeight / Math.max(box.height, 1)
  );

  const mapPoint = ([x, y]) => [
    padding + (x - box.minX) * scale,
    height - padding - (y - box.minY) * scale
  ];

  return {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    box,
    scale,
    mapPoint
  };
}

export function convexHull(points) {
  const sorted = dedupePoints(points)
    .map(([x, y]) => [x, y])
    .sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));

  if (sorted.length <= 3) {
    return sorted;
  }

  const cross = (origin, a, b) => (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
  const lower = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  upper.pop();
  lower.pop();
  return [...lower, ...upper];
}

function rectangleFromPoints(points, padding = 1) {
  const box = bboxOfPoints(points);
  const margin = Math.max(padding, Math.max(box.width, box.height) * 0.05 || padding);
  return bboxToRing(box, margin);
}

function segmentRectangle(a, b, padding = 1) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy * padding;
  const py = ux * padding;

  return [
    [a[0] + px, a[1] + py],
    [b[0] + px, b[1] + py],
    [b[0] - px, b[1] - py],
    [a[0] - px, a[1] - py]
  ];
}

export function chooseLargestRing(rings) {
  let winner = null;
  let area = -1;

  for (const ring of rings ?? []) {
    const current = normalizeRing(ring);
    const currentArea = polygonArea(current);
    if (currentArea > area) {
      area = currentArea;
      winner = current;
    }
  }

  return winner ?? [];
}

export function buildBoundaryFromGeometry({ points = [], closedPolygons = [] } = {}) {
  const normalizedClosed = closedPolygons
    .map((ring) => normalizeRing(ring))
    .filter((ring) => ring.length >= 3);

  if (normalizedClosed.length) {
    return chooseLargestRing(normalizedClosed);
  }

  const cloud = dedupePoints(points);
  if (cloud.length === 0) {
    return [];
  }

  if (cloud.length === 1) {
    return rectangleFromPoints(cloud, 1);
  }

  if (cloud.length === 2) {
    return segmentRectangle(cloud[0], cloud[1], 1);
  }

  const hull = concaveman(cloud, 12, 20);
  const normalizedHull = normalizeRing(hull);

  if (normalizedHull.length >= 3) {
    return normalizedHull;
  }

  return convexHull(cloud);
}

export function bufferRing(ring, distanceMeters) {
  const cleanRing = normalizeRing(ring);
  if (cleanRing.length < 3) {
    return rectangleFromPoints(cleanRing, distanceMeters || 1);
  }

  const path = cleanRing.map(([x, y]) => ({
    X: Math.round(x * CLIPPER_SCALE),
    Y: Math.round(y * CLIPPER_SCALE)
  }));

  const offset = new ClipperLib.ClipperOffset(2, 0.25 * CLIPPER_SCALE);
  offset.AddPath(path, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);

  const solution = [];
  offset.Execute(solution, Math.round(distanceMeters * CLIPPER_SCALE));

  const rings = solution.map((currentPath) => currentPath.map((point) => [point.X / CLIPPER_SCALE, point.Y / CLIPPER_SCALE]));
  if (!rings.length) {
    return rectangleFromPoints(cleanRing, distanceMeters || 1);
  }

  return chooseLargestRing(rings);
}

export function utmProjection(zone) {
  const numericZone = Number(zone) || 23;
  return `+proj=utm +zone=${numericZone} +south +ellps=GRS80 +units=m +no_defs`;
}

export function projectRingToWgs84(ring, zone) {
  const source = utmProjection(zone);
  return normalizeRing(ring).map(([x, y]) => proj4(source, 'WGS84', [x, y]));
}

export function metersToHectares(areaMeters) {
  return areaMeters / 10000;
}

export function formatNumber(value, fractionDigits = 2) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(value);
}

export function formatArea(areaMeters) {
  return `${formatNumber(metersToHectares(areaMeters), 2)} ha`;
}

export function formatAreaSmart(areaMeters) {
  const hectares = metersToHectares(areaMeters);
  if (hectares < 1) {
    return `${formatNumber(areaMeters, 0)} m²`;
  }

  return `${formatNumber(hectares, 2)} ha`;
}

export function formatMeters(value) {
  return `${formatNumber(value, value >= 100 ? 0 : 2)} m`;
}

export function dateStamp(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10).replaceAll('-', '');
  }

  const text = String(value ?? '').trim();
  if (/^\d{8}$/.test(text)) {
    return text;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text.replaceAll('-', '');
  }

  return new Date().toISOString().slice(0, 10).replaceAll('-', '');
}

export function projectionLabel(zone) {
  return `SIRGAS 2000 / UTM Zona ${Number(zone) || 23}S`;
}
