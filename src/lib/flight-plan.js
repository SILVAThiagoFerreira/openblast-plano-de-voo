import { parseDxfText } from './dxf.js';
import { buildDxfDocument } from './dxf-export.js';
import {
  bufferRing,
  buildBoundaryFromGeometry,
  formatAreaSmart,
  formatMeters,
  metersToHectares,
  polygonArea,
  polygonPerimeter,
  projectRingToWgs84,
  projectionLabel,
  dateStamp
} from './geometry.js';
import { buildKmlDocument, createKmzBlob } from './kml.js';

export function formatOutputName(value) {
  return `PLANO DE VOO - ${dateStamp(value)}`;
}

export async function buildFlightPlanFromDxfText(text, options = {}) {
  const {
    bufferMeters = 7,
    utmZone = 24,
    flightDate = new Date(),
    sourceFileName = 'DXF',
    dxfMode = 'contour'
  } = options;

  const parsed = parseDxfText(text);
  const sourceRing = buildBoundaryFromGeometry(parsed);
  const bufferedRing = bufferRing(sourceRing, bufferMeters);
  const projectedRing = projectRingToWgs84(bufferedRing, utmZone);

  const outputName = `${formatOutputName(flightDate)}.kmz`;
  const dxfSuffix = dxfMode === 'offset' ? 'offset' : 'contorno';
  const dxfOutputName = `${formatOutputName(flightDate)} - ${dxfSuffix}.dxf`;
  const flightName = formatOutputName(flightDate);

  const sourceAreaM2 = polygonArea(sourceRing);
  const bufferedAreaM2 = polygonArea(bufferedRing);
  const perimeterM = polygonPerimeter(bufferedRing);

  const description = [
    '<p>Poligonal gerada a partir de DXF com recuo de 7 m.</p>',
    `<p><strong>Arquivo:</strong> ${sourceFileName}</p>`,
    `<p><strong>CRS:</strong> ${projectionLabel(utmZone)}</p>`,
    `<p><strong>Unidade do DXF:</strong> ${parsed.unitInfo.label}</p>`,
    `<p><strong>Recuo:</strong> ${formatMeters(bufferMeters)}</p>`
  ].join('');

  const kml = buildKmlDocument({
    name: flightName,
    ring: projectedRing,
    description,
    metadata: {
      arquivo: sourceFileName,
      entidades: parsed.entityCount,
      pontos: parsed.points.length,
      area_original: formatAreaSmart(sourceAreaM2),
      area_recuo: formatAreaSmart(bufferedAreaM2),
      perimetro_recuo: formatMeters(perimeterM),
      zone: projectionLabel(utmZone)
    }
  });

  const dxf = buildDxfDocument({
    name: flightName,
    ring: dxfMode === 'offset' ? bufferedRing : sourceRing
  });

  const kmzBlob = await createKmzBlob(kml);
  const dxfBlob = new Blob([dxf], { type: 'application/dxf' });

  return {
    parsed,
    sourceRing,
    bufferedRing,
    projectedRing,
    kml,
    kmzBlob,
    dxf,
    dxfBlob,
    outputName,
    dxfOutputName,
    flightName,
    stats: {
      sourceAreaM2,
      bufferedAreaM2,
      perimeterM,
      sourceAreaHa: metersToHectares(sourceAreaM2),
      bufferedAreaHa: metersToHectares(bufferedAreaM2)
    }
  };
}
