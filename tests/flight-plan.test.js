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

    expect(dxf).toContain('LWPOLYLINE');
    expect(dxf).toContain('\n  8\n0\n');
    expect(dxf).not.toContain('\n  8\n1\n');
    expect(dxf.match(/\n  8\n/g)?.length).toBe(1);
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

    expect(built.dxf).toMatch(/\n\s*8\n\s*0\n/);
    expect(built.dxf).toMatch(/\n\s*10\n\s*0\n\s*20\n\s*0\n/);
    expect(built.dxf).toMatch(/\n\s*10\n\s*100\n\s*20\n\s*0\n/);
    expect(built.dxf).not.toContain('  8\n 1\n');
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
    expect(built.dxf).toContain('modo: contorno com offset');
  });
});
