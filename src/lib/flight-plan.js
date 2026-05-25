import { parseDxfText } from './dxf.js';
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
    utmZone = 23,
    flightDate = new Date(),
    sourceFileName = 'DXF'
  } = options;

  const parsed = parseDxfText(text);
  const sourceRing = buildBoundaryFromGeometry(parsed);
  const bufferedRing = bufferRing(sourceRing, bufferMeters);
  const projectedRing = projectRingToWgs84(bufferedRing, utmZone);

  const outputName = `${formatOutputName(flightDate)}.kmz`;
  const flightName = formatOutputName(flightDate);

  const sourceAreaM2 = polygonArea(sourceRing);
  const bufferedAreaM2 = polygonArea(bufferedRing);
  const perimeterM = polygonPerimeter(bufferedRing);

  const description = [
    '<p>Poligonal gerada a partir de DXF com buffer de 7 m.</p>',
    `<p><strong>Arquivo:</strong> ${sourceFileName}</p>`,
    `<p><strong>CRS:</strong> ${projectionLabel(utmZone)}</p>`,
    `<p><strong>Unidade do DXF:</strong> ${parsed.unitInfo.label}</p>`,
    `<p><strong>Buffer:</strong> ${formatMeters(bufferMeters)}</p>`
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
      area_buffer: formatAreaSmart(bufferedAreaM2),
      perimetro_buffer: formatMeters(perimeterM),
      zone: projectionLabel(utmZone)
    }
  });

  const kmzBlob = await createKmzBlob(kml);

  return {
    parsed,
    sourceRing,
    bufferedRing,
    projectedRing,
    kml,
    kmzBlob,
    outputName,
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
