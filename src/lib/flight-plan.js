import { parseDxfText } from './dxf.js';
import { buildDxfDocument } from './dxf-export.js';
import {
  bufferRing,
  buildBoundaryFromGeometry,
  buildContourFromGeometry,
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

// Keep the source identification (for example PP190526_B) in every DXF name.
export function formatDxfBaseName(sourceFileName) {
  const source = String(sourceFileName ?? '').split(/[\\/]/).pop()
    .replace(/\.dxf$/i, '').replace(/^holes(?:-string)?[-_ ]*/i, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  return `holes-string-${source || 'contorno'}`;
}

export async function buildFlightPlanFromDxfText(text, options = {}) {
  const {
    bufferMeters = 7,
    utmZone = 24,
    flightDate = new Date(),
    sourceFileName = 'DXF',
    dxfMode = 'contour'
  } = options;

  const numericBufferMeters = Number(bufferMeters);
  const configuredBufferMeters = Number.isFinite(numericBufferMeters)
    ? Math.max(0, numericBufferMeters)
    : 7;

  const parsed = parseDxfText(text);
  const sourceRing = buildBoundaryFromGeometry(parsed);
  const sourceAreaM2 = polygonArea(sourceRing);
  const contourRing = buildContourFromGeometry(parsed);
  const contourOutputRing = contourRing.length >= 3 ? contourRing : sourceRing;
  if (sourceRing.length < 3 || !Number.isFinite(sourceAreaM2) || sourceAreaM2 <= 0) {
    throw new Error('Não foi encontrada uma poligonal válida no DXF. Use pelo menos três pontos não colineares ou uma polilinha fechada.');
  }

  const bufferedRing = bufferRing(sourceRing, configuredBufferMeters);
  const bufferedAreaM2 = polygonArea(bufferedRing);
  if (bufferedRing.length < 3 || !Number.isFinite(bufferedAreaM2) || bufferedAreaM2 <= 0) {
    throw new Error('Não foi possível gerar o recuo para a geometria encontrada.');
  }

  const projectedRing = projectRingToWgs84(bufferedRing, utmZone);

  const outputName = `${formatOutputName(flightDate)}.kmz`;
  const dxfBaseName = formatDxfBaseName(sourceFileName);
  const smoothDxfOutputName = `${dxfBaseName} - contorno suave.dxf`;
  const offsetDxfOutputName = `${dxfBaseName} - contorno suave com offset.dxf`;
  const dxfOutputName = dxfMode === 'offset' ? offsetDxfOutputName : smoothDxfOutputName;
  const flightName = formatOutputName(flightDate);

  const perimeterM = polygonPerimeter(bufferedRing);

  const description = [
    '<p>Poligonal gerada a partir de DXF com recuo de ' + formatMeters(configuredBufferMeters) + '.</p>',
    `<p><strong>Arquivo:</strong> ${sourceFileName}</p>`,
    `<p><strong>CRS:</strong> ${projectionLabel(utmZone)}</p>`,
    `<p><strong>Unidade do DXF:</strong> ${parsed.unitInfo.label}</p>`,
    `<p><strong>Recuo:</strong> ${formatMeters(configuredBufferMeters)}</p>`
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

  const smoothDxf = buildDxfDocument({
    name: flightName,
    ring: sourceRing
  });
  const offsetDxf = buildDxfDocument({
    name: flightName,
    ring: bufferedRing
  });
  const dxf = dxfMode === 'offset' ? offsetDxf : smoothDxf;

  const contourDxf = buildDxfDocument({
    name: flightName,
    ring: contourOutputRing
  });

  const kmzBlob = await createKmzBlob(kml);
  const dxfBlob = new Blob([dxf], { type: 'application/dxf' });
  const smoothDxfBlob = new Blob([smoothDxf], { type: 'application/dxf' });
  const offsetDxfBlob = new Blob([offsetDxf], { type: 'application/dxf' });
  const contourDxfBlob = new Blob([contourDxf], { type: 'application/dxf' });

  return {
    parsed,
    sourceRing,
    bufferedRing,
    projectedRing,
    kml,
    kmzBlob,
    dxf,
    dxfBlob,
    smoothDxf,
    smoothDxfBlob,
    smoothDxfOutputName,
    offsetDxf,
    offsetDxfBlob,
    offsetDxfOutputName,
    contourRing: contourOutputRing,
    contourDxf,
    contourDxfBlob,
    outputName,
    dxfOutputName,
    contourDxfOutputName: `${dxfBaseName} - contorno dos furos.dxf`,
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
