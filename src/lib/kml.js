import JSZip from 'jszip';
import { normalizeRing } from './geometry.js';

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function ringToKmlCoordinates(ring) {
  const points = normalizeRing(ring);
  const closed = points.length ? [...points, points[0]] : [];

  return closed
    .map(([lon, lat]) => `${lon.toFixed(8)},${lat.toFixed(8)},0`)
    .join(' ');
}

export function buildKmlDocument({
  name,
  ring,
  description = '',
  metadata = {}
}) {
  const coordinates = ringToKmlCoordinates(ring);
  const safeName = xmlEscape(name);
  const metadataLines = Object.entries(metadata)
    .map(([key, value]) => `<p><strong>${xmlEscape(key)}:</strong> ${xmlEscape(value)}</p>`)
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${safeName}</name>
    <description><![CDATA[${description}${metadataLines ? `<div class="metadata">${metadataLines}</div>` : ''}]]></description>
    <Style id="flight-plan-style">
      <LineStyle>
        <color>ff2b8bff</color>
        <width>3</width>
      </LineStyle>
      <PolyStyle>
        <color>662b8bff</color>
      </PolyStyle>
    </Style>
    <Placemark>
      <name>${safeName}</name>
      <styleUrl>#flight-plan-style</styleUrl>
      <Polygon>
        <extrude>1</extrude>
        <tessellate>1</tessellate>
        <altitudeMode>clampToGround</altitudeMode>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coordinates}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;
}

export async function createKmzBlob(kml) {
  const zip = new JSZip();
  zip.file('doc.kml', kml);
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });
}
