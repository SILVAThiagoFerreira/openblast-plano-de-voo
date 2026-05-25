import DxfParser from 'dxf-parser';
import { dedupePoints } from './geometry.js';

const UNIT_SCALE_MAP = {
  0: { scale: 1, label: 'metros (assumido)' },
  1: { scale: 0.0254, label: 'polegadas' },
  2: { scale: 0.3048, label: 'pés' },
  3: { scale: 1609.344, label: 'milhas' },
  4: { scale: 0.001, label: 'milímetros' },
  5: { scale: 0.01, label: 'centímetros' },
  6: { scale: 1, label: 'metros' }
};

function scalePoint(point, scale) {
  if (!point) {
    return null;
  }

  const x = Number(point.x ?? point.X ?? point[0]);
  const y = Number(point.y ?? point.Y ?? point[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return [x * scale, y * scale];
}

function sampleCircle(center, radius, scale, segments = 24) {
  const origin = scalePoint(center, scale);
  if (!origin || !Number.isFinite(radius)) {
    return [];
  }

  const [cx, cy] = origin;
  const scaledRadius = radius * scale;
  const points = [];

  for (let index = 0; index < segments; index += 1) {
    const angle = (Math.PI * 2 * index) / segments;
    points.push([
      cx + Math.cos(angle) * scaledRadius,
      cy + Math.sin(angle) * scaledRadius
    ]);
  }

  return points;
}

function sampleArc(entity, scale, segments = 18) {
  const center = scalePoint(entity.center, scale);
  if (!center) {
    return [];
  }

  const radius = Number(entity.radius ?? 0) * scale;
  const start = Number(entity.startAngle ?? 0) * (Math.PI / 180);
  const end = Number(entity.endAngle ?? 0) * (Math.PI / 180);
  const counterClockwise = entity.negativeExtrusion || false ? false : true;

  let sweep = end - start;
  if (counterClockwise) {
    if (sweep <= 0) {
      sweep += Math.PI * 2;
    }
  } else if (sweep >= 0) {
    sweep -= Math.PI * 2;
  }

  const steps = Math.max(6, Math.ceil(Math.abs(sweep) / (Math.PI / segments)));
  const points = [];

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const angle = start + sweep * t;
    points.push([
      center[0] + Math.cos(angle) * radius,
      center[1] + Math.sin(angle) * radius
    ]);
  }

  return points;
}

function extractVertices(entity, scale) {
  const vertices = entity.vertices ?? entity.points ?? [];
  return vertices
    .map((vertex) => scalePoint(vertex, scale))
    .filter(Boolean);
}

function isClosedPolyline(entity) {
  const flags = Number(entity.flags ?? 0);
  return Boolean(entity.closed || entity.shape || (flags & 1));
}

function sampleEntity(entity, scale) {
  const type = String(entity.type ?? '').toUpperCase();

  switch (type) {
    case 'LINE': {
      const start = scalePoint(entity.start, scale);
      const end = scalePoint(entity.end, scale);
      return {
        points: [start, end].filter(Boolean)
      };
    }

    case 'CIRCLE': {
      return {
        points: sampleCircle(entity.center, entity.radius, scale)
      };
    }

    case 'ARC': {
      return {
        points: sampleArc(entity, scale)
      };
    }

    case 'LWPOLYLINE':
    case 'POLYLINE': {
      const points = extractVertices(entity, scale);
      return {
        points,
        closedRing: isClosedPolyline(entity) && points.length >= 3 ? points : null
      };
    }

    case 'POINT':
    case 'INSERT': {
      const point = scalePoint(entity.position ?? entity.point, scale);
      return {
        points: point ? [point] : []
      };
    }

    case 'SPLINE': {
      const fitPoints = (entity.fitPoints ?? entity.controlPoints ?? [])
        .map((vertex) => scalePoint(vertex, scale))
        .filter(Boolean);
      return {
        points: fitPoints
      };
    }

    default:
      return {
        points: []
      };
  }
}

export function parseDxfText(text) {
  const parser = new DxfParser();
  const parsed = parser.parseSync(text);
  const entities = Array.isArray(parsed.entities) ? parsed.entities : [];
  const unitCode = Number(parsed.header?.$INSUNITS ?? 0);
  const unitInfo = UNIT_SCALE_MAP[unitCode] ?? UNIT_SCALE_MAP[0];

  const allPoints = [];
  const closedPolygons = [];
  const counts = {};

  for (const entity of entities) {
    const type = String(entity.type ?? 'UNKNOWN').toUpperCase();
    counts[type] = (counts[type] ?? 0) + 1;

    const sampled = sampleEntity(entity, unitInfo.scale);
    if (sampled.points?.length) {
      allPoints.push(...sampled.points);
    }

    if (sampled.closedRing?.length) {
      closedPolygons.push(sampled.closedRing);
    }
  }

  return {
    header: parsed.header ?? {},
    entities,
    entityCount: entities.length,
    counts,
    unitInfo,
    points: dedupePoints(allPoints, 4),
    closedPolygons
  };
}
