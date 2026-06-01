import { normalizeRing } from './geometry.js';

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return '0';
  }

  const rounded = Number(value.toFixed(6));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', '.');
}

export function buildDxfDocument({
  name = 'PLANO DE VOO',
  ring = [],
} = {}) {
  const points = normalizeRing(ring);
  if (points.length < 3) {
    throw new Error('DXF export requer ao menos 3 vértices.');
  }

  const vertices = points.map(([x, y]) => [x, y]);
  const entities = [
    '  0',
    'POLYLINE',
    '  8',
    '0',
    ' 66',
    '1',
    ' 70',
    '1'
  ];

  for (const [x, y] of vertices) {
    entities.push(
      '  0',
      'VERTEX',
      '  8',
      '0',
      ' 10',
      formatNumber(x),
      ' 20',
      formatNumber(y),
      ' 30',
      '0'
    );
  }

  entities.push(
    '  0',
    'SEQEND',
    '  8',
    '0'
  );

  return [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$ACADVER',
    '1',
    'AC1009',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    ...entities,
    '0',
    'ENDSEC',
    '0',
    'EOF'
  ].join('\n') + '\n';
}
