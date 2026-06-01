import { normalizeRing } from './geometry.js';

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return '0';
  }

  const rounded = Number(value.toFixed(6));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', '.');
}

function escapeText(value) {
  return String(value ?? '').replaceAll('\r', ' ').replaceAll('\n', ' ');
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
  metadata = {},
  units = 6
} = {}) {
  const points = normalizeRing(ring);
  if (points.length < 3) {
    throw new Error('DXF export requer ao menos 3 vértices.');
  }

  const closed = points.map(([x, y]) => [x, y]);
  const entities = [
    '  0',
    'LWPOLYLINE',
    '  8',
    '0',
    ' 90',
    String(closed.length),
    ' 70',
    '1',
    ' 43',
    '0'
  ];

  for (const [x, y] of closed) {
    entities.push(' 10', formatNumber(x), ' 20', formatNumber(y));
  }

  const metadataComments = Object.entries(metadata)
    .map(([key, value]) => `999\n${escapeText(`${key}: ${value}`)}`)
    .join('\n');

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
    ...(metadataComments ? metadataComments.split('\n') : []),
    ...entities,
    '0',
    'ENDSEC',
    '0',
    'EOF'
  ].join('\n') + '\n';
}
