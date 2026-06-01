import { normalizeRing } from './geometry.js';

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return '0';
  }

  const rounded = Number(value.toFixed(6));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', '.');
}

function buildLayerTable() {
  return [
    '  0',
    'TABLE',
    '  2',
    'LAYER',
    ' 70',
    '1',
    '  0',
    'LAYER',
    '  2',
    '0',
    ' 70',
    '0',
    ' 62',
    '7',
    '  6',
    'CONTINUOUS',
    '  0',
    'ENDTAB'
  ];
}

export function buildDxfDocument({
  name = 'PLANO DE VOO',
  ring = [],
  units = 6
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
    'AC1015',
    '9',
    '$INSUNITS',
    '70',
    String(Number.isFinite(units) ? units : 6),
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'TABLES',
    ...buildLayerTable(),
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
