import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildBoundaryFromGeometry, bufferRing, polygonArea } from '../src/lib/geometry.js';
import { buildKmlDocument, createKmzBlob } from '../src/lib/kml.js';
import { buildDxfDocument } from '../src/lib/dxf-export.js';
import { buildFlightPlanFromDxfText } from '../src/lib/flight-plan.js';
import { parseDxfText } from '../src/lib/dxf.js';

describe('geometry core', () => {
  it('expands a square by 7 m', () => {
    const square = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100]
    ];

    const buffered = bufferRing(square, 7);
    expect(buffered).toHaveLength(4);
    expect(polygonArea(buffered)).toBeCloseTo(12996, 0);
  });

  it('chooses the outer hull from raw points', () => {
    const ring = buildBoundaryFromGeometry({
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
        [50, 50]
      ]
    });

    expect(ring).toHaveLength(4);
    expect(polygonArea(ring)).toBeCloseTo(10000, 0);
  });
});

describe('DXF parsing', () => {
  it('reads a minimal DXF and extracts geometry', () => {
    const dxf = `0
SECTION
2
HEADER
9
$INSUNITS
70
6
0
ENDSEC
0
SECTION
2
ENTITIES
0
LINE
8
0
10
0
20
0
11
10
21
0
0
CIRCLE
8
0
10
5
20
5
40
2
0
ENDSEC
0
EOF
`;

    const parsed = parseDxfText(dxf);
    expect(parsed.entityCount).toBe(2);
    expect(parsed.points.length).toBeGreaterThan(0);
    expect(parsed.unitInfo.scale).toBe(1);
  });
});

describe('KML/KMZ', () => {
  it('builds a kmz containing doc.kml', async () => {
    const kml = buildKmlDocument({
      name: 'PLANO DE VOO - 20260525',
      ring: [
        [-45.1, -9.1],
        [-45.0, -9.1],
        [-45.0, -9.0],
        [-45.1, -9.0]
      ],
      metadata: { arquivo: 'exemplo.dxf' }
    });

    const kmz = await createKmzBlob(kml);
    const zip = await JSZip.loadAsync(kmz);
    const doc = zip.file('doc.kml');

    expect(doc).toBeTruthy();
    const extracted = await doc.async('string');
    expect(extracted).toContain('PLANO DE VOO - 20260525');
    expect(extracted).toContain('<coordinates>');
  });
});

describe('DXF export', () => {
  it('builds a single-layer dxf with layer 0 only', () => {
    const dxf = buildDxfDocument({
      name: 'PLANO DE VOO - 20260525',
      ring: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100]
      ]
    });

    expect(dxf).toContain('AC1009');
    expect(dxf).toContain('\n  0\nPOLYLINE\n');
    expect(dxf).toContain('\n  0\nVERTEX\n');
    expect(dxf).toContain('\n  0\nSEQEND\n');
    expect(dxf).toContain('\n  8\n0\n');
    expect(dxf).not.toContain('LWPOLYLINE');
  });

  it('exports the raw contour ring without offset through the flight plan pipeline', async () => {
    const dxf = `0
SECTION
2
ENTITIES
0
LWPOLYLINE
8
0
90
4
70
1
10
0
20
0
10
100
20
0
10
100
20
100
10
0
20
100
0
ENDSEC
0
EOF
`;

    const built = await buildFlightPlanFromDxfText(dxf, {
      bufferMeters: 7,
      utmZone: 24,
      flightDate: new Date('2026-05-25T00:00:00Z'),
      sourceFileName: 'contorno.dxf'
    });

    expect(built.dxf).toContain('AC1009');
    expect(built.dxf).toContain('\n  0\nPOLYLINE\n');
    expect(built.dxf).toContain('\n  0\nVERTEX\n');
    expect(built.dxf).toContain('\n  0\nSEQEND\n');
    expect(built.dxfOutputName).toContain('contorno');
  });

  it('exports the offset contour when requested', async () => {
    const dxf = `0
SECTION
2
ENTITIES
0
LWPOLYLINE
8
0
90
4
70
1
10
0
20
0
10
100
20
0
10
100
20
100
10
0
20
100
0
ENDSEC
0
EOF
`;

    const built = await buildFlightPlanFromDxfText(dxf, {
      bufferMeters: 7,
      utmZone: 24,
      flightDate: new Date('2026-05-25T00:00:00Z'),
      sourceFileName: 'offset.dxf',
      dxfMode: 'offset'
    });

    expect(built.dxfOutputName).toContain('offset');
    expect(built.dxf).toContain('\n  0\nPOLYLINE\n');
    expect(built.kml).toContain('recuo de 7,00 m');
  });

  it('keeps a zero buffer in the complete flight plan pipeline', async () => {
    const dxf = `0
SECTION
2
ENTITIES
0
LWPOLYLINE
8
0
90
4
70
1
10
0
20
0
10
100
20
0
10
100
20
100
10
0
20
100
0
ENDSEC
0
EOF
`;

    const built = await buildFlightPlanFromDxfText(dxf, {
      bufferMeters: 0,
      utmZone: 24,
      flightDate: new Date('2026-05-25T00:00:00Z'),
      sourceFileName: 'zero-buffer.dxf'
    });

    expect(built.stats.bufferedAreaM2).toBeCloseTo(built.stats.sourceAreaM2, 0);
    expect(built.kml).toContain('recuo de 0,00 m');
  });

  it('rejects a DXF without usable geometry', async () => {
    const dxf = `0
SECTION
2
ENTITIES
0
TEXT
8
0
1
Somente anotação
10
0
20
0
0
ENDSEC
0
EOF
`;

    await expect(buildFlightPlanFromDxfText(dxf, { dxfMode: 'offset' }))
      .rejects
      .toThrow('Não foi encontrada uma poligonal válida no DXF');
  });

  it('describes the configured buffer in the KML output', async () => {
    const dxf = `0
SECTION
2
ENTITIES
0
LWPOLYLINE
8
0
90
4
70
1
10
0
20
0
10
100
20
0
10
100
20
100
10
0
20
100
0
ENDSEC
0
EOF
`;

    const built = await buildFlightPlanFromDxfText(dxf, {
      bufferMeters: 12,
      utmZone: 24,
      flightDate: new Date('2026-05-25T00:00:00Z'),
      sourceFileName: 'buffer.dxf'
    });

    expect(built.kml).toContain('recuo de 12,00 m');
    expect(built.kml).not.toContain('recuo de 7,00 m');
  });
});

describe('coordinate units', () => {
  // Final.dxf real case: UTM metre coordinates, but the header declares feet ($INSUNITS = 2).
  // The coordinates must be used as-is; the header must not rescale them.
  const utmFeetHeaderDxf = `0
SECTION
2
HEADER
9
$INSUNITS
70
2
0
ENDSEC
0
SECTION
2
ENTITIES
0
LWPOLYLINE
8
0
90
4
70
1
10
748768.5
20
8930379.2
10
748868.5
20
8930379.2
10
748868.5
20
8930479.2
10
748768.5
20
8930479.2
0
ENDSEC
0
EOF
`;

  it('reports the declared header unit without rescaling the coordinates', () => {
    const parsed = parseDxfText(utmFeetHeaderDxf);
    expect(parsed.declaredUnitInfo.label).toBe('pés');
    expect(parsed.unitInfo.scale).toBe(1);
    expect(parsed.points[0][0]).toBeCloseTo(748768.5, 3);
    expect(parsed.points[0][1]).toBeCloseTo(8930379.2, 3);
  });

  it('keeps the UTM coordinates in the exported holes-string DXF', async () => {
    const built = await buildFlightPlanFromDxfText(utmFeetHeaderDxf, {
      bufferMeters: 0,
      utmZone: 23,
      flightDate: new Date('2026-05-25T00:00:00Z'),
      sourceFileName: 'Final.dxf'
    });

    expect(built.contourDxf).toContain('748768.5');
    expect(built.contourDxf).toContain('8930379.2');
    expect(built.contourDxf).not.toContain('228');
    expect(built.stats.sourceAreaM2).toBeCloseTo(10000, 0);
  });
});
