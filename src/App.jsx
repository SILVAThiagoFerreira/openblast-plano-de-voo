import { useEffect, useMemo, useRef, useState } from 'react';
import { enaexLogoWhiteUrl, sampleDxfUrl } from './assets.js';
import { readBlobText, readUrlText } from './lib/file.js';
import { buildFlightPlanFromDxfText, formatOutputName } from './lib/flight-plan.js';
import {
  buildPreviewTransform,
  formatAreaSmart,
  formatMeters,
  formatNumber,
  projectionLabel,
  ringToSvgPath
} from './lib/geometry.js';

const now = new Date();
const todayIso = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0')
].join('-');
const defaultZone = '24';

function getBufferMeters(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return 7;
  }

  const numericValue = Number(text);
  return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 7;
}

function App() {
  const fileInputRef = useRef(null);
  const [sourceText, setSourceText] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [sourceRevision, setSourceRevision] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [utmZone, setUtmZone] = useState(defaultZone);
  const [bufferMeters, setBufferMeters] = useState(7);
  const [flightDate, setFlightDate] = useState(todayIso);
  const [status, setStatus] = useState('Aguardando DXF');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [smoothDxfDownloadUrl, setSmoothDxfDownloadUrl] = useState('');
  const [offsetDxfDownloadUrl, setOffsetDxfDownloadUrl] = useState('');
  const [contourDownloadUrl, setContourDownloadUrl] = useState('');

  useEffect(() => {
    if (!result?.kmzBlob || !result?.smoothDxfBlob || !result?.offsetDxfBlob || !result?.contourDxfBlob) {
      setDownloadUrl('');
      setSmoothDxfDownloadUrl('');
      setOffsetDxfDownloadUrl('');
      setContourDownloadUrl('');
      return undefined;
    }

    const url = URL.createObjectURL(result.kmzBlob);
    const smoothDxfUrl = URL.createObjectURL(result.smoothDxfBlob);
    const offsetDxfUrl = URL.createObjectURL(result.offsetDxfBlob);
    const contourUrl = URL.createObjectURL(result.contourDxfBlob);
    setDownloadUrl(url);
    setSmoothDxfDownloadUrl(smoothDxfUrl);
    setOffsetDxfDownloadUrl(offsetDxfUrl);
    setContourDownloadUrl(contourUrl);

    return () => {
      URL.revokeObjectURL(url);
      URL.revokeObjectURL(smoothDxfUrl);
      URL.revokeObjectURL(offsetDxfUrl);
      URL.revokeObjectURL(contourUrl);
    };
  }, [result]);

  useEffect(() => {
    let cancelled = false;

    if (!sourceText) {
      setResult(null);
      setIsProcessing(false);
      if (!error) {
        setStatus('Aguardando DXF');
      }
      return undefined;
    }

    setIsProcessing(true);
    setStatus('Gerando poligonal...');
    setError('');

    void (async () => {
      try {
        const built = await buildFlightPlanFromDxfText(sourceText, {
          bufferMeters: getBufferMeters(bufferMeters),
          utmZone: Number(utmZone) || 24,
          flightDate,
          sourceFileName: sourceName || 'DXF'
        });

        if (cancelled) {
          return;
        }

        setResult(built);
        setIsProcessing(false);
        setStatus('Poligonal pronta para exportação');
      } catch (err) {
        if (cancelled) {
          return;
        }

        setResult(null);
        setIsProcessing(false);
        setError(err instanceof Error ? err.message : 'Falha ao processar o DXF');
        setStatus('Erro ao gerar a poligonal');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bufferMeters, flightDate, sourceName, sourceRevision, sourceText, utmZone]);

  const preview = useMemo(() => {
    if (!result?.sourceRing?.length || !result?.bufferedRing?.length) {
      return null;
    }

    return buildPreviewTransform([result.sourceRing, result.bufferedRing]);
  }, [result]);

  const outputName = result?.outputName ?? `${formatOutputName(flightDate)}.kmz`;
  const canDownload = Boolean(downloadUrl && result?.kmzBlob && !isProcessing);
  const canDownloadSmoothDxf = Boolean(smoothDxfDownloadUrl && result?.smoothDxfBlob && !isProcessing);
  const canDownloadOffsetDxf = Boolean(offsetDxfDownloadUrl && result?.offsetDxfBlob && !isProcessing);
  const canDownloadContour = Boolean(contourDownloadUrl && result?.contourDxfBlob && !isProcessing);

  async function handleFile(file) {
    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith('.dxf')) {
      setIsProcessing(false);
      setResult(null);
      setSourceName('');
      setSourceText('');
      setError('Selecione um arquivo .dxf válido.');
      setStatus('Arquivo inválido');
      return;
    }

    setIsProcessing(true);
    setResult(null);
    setError('');
    setStatus('Lendo DXF...');

    try {
      const text = await readBlobText(file);
      setSourceName(file.name);
      setSourceText(text);
      setSourceRevision((revision) => revision + 1);
    } catch (err) {
      setResult(null);
      setSourceName('');
      setSourceText('');
      setIsProcessing(false);
      setError(err instanceof Error ? err.message : 'Falha ao ler o DXF');
      setStatus('Erro ao ler o arquivo');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleSample() {
    setIsProcessing(true);
    setResult(null);
    setError('');
    setStatus('Carregando exemplo...');

    try {
      const text = await readUrlText(sampleDxfUrl);
      setSourceName('holes-PP190526_B.dxf');
      setSourceText(text);
      setSourceRevision((revision) => revision + 1);
    } catch (err) {
      setSourceName('');
      setSourceText('');
      setIsProcessing(false);
      setError(err instanceof Error ? err.message : 'Falha ao carregar o exemplo');
      setStatus('Erro ao carregar o exemplo');
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragActive(false);

    const file = event.dataTransfer.files?.[0];
    void handleFile(file);
  }

  function handleDownload() {
    if (!canDownload) {
      return;
    }

    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = outputName;
    anchor.click();
  }

  function handleDownloadSmoothDxf() {
    if (!canDownloadSmoothDxf) return;
    const anchor = document.createElement('a');
    anchor.href = smoothDxfDownloadUrl;
    anchor.download = result.smoothDxfOutputName;
    anchor.click();
  }

  function handleDownloadOffsetDxf() {
    if (!canDownloadOffsetDxf) return;
    const anchor = document.createElement('a');
    anchor.href = offsetDxfDownloadUrl;
    anchor.download = result.offsetDxfOutputName;
    anchor.click();
  }

  function handleDownloadContour() {
    if (!canDownloadContour) {
      return;
    }

    const anchor = document.createElement('a');
    anchor.href = contourDownloadUrl;
    anchor.download = result.contourDxfOutputName;
    anchor.click();
  }

  const keyStats = result
    ? [
        { label: 'Área final', value: formatAreaSmart(result.stats.bufferedAreaM2) },
        { label: 'Perímetro', value: formatMeters(result.stats.perimeterM) },
        { label: 'Vértices do recuo', value: formatNumber(result.bufferedRing.length, 0) },
        { label: 'Unidade', value: result.parsed.unitInfo.label }
      ]
    : [];

  const detailStats = result
    ? [
        { label: 'Entidades', value: formatNumber(result.parsed.entityCount, 0) },
        { label: 'Pontos', value: formatNumber(result.parsed.points.length, 0) },
        { label: 'Vértices da borda', value: formatNumber(result.sourceRing.length, 0) },
        { label: 'Área original', value: formatAreaSmart(result.stats.sourceAreaM2) }
      ]
    : [];

  const entityChips = result
    ? Object.entries(result.parsed.counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
    : [];

  const sourcePath = preview ? ringToSvgPath(result.sourceRing, preview.mapPoint) : '';
  const bufferPath = preview ? ringToSvgPath(result.bufferedRing, preview.mapPoint) : '';

  return (
    <div className="app-shell">
      <header className="enaex-band">
        <img className="enaex-band__logo" src={enaexLogoWhiteUrl} alt="Enaex Brasil" />
        <span className="enaex-band__title">Conversor DXF</span>
        <span className="enaex-band__unit">US Vale Verde</span>
      </header>
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Limite de voo</p>
          <h1>Conversor Boreholes/DXF</h1>
          <p className="hero-subtitle">Gere contornos para o Google Earth.</p>
        </div>

        <div className="hero-status">
          <div className="status-pill" role={error ? 'alert' : 'status'} aria-live={error ? 'assertive' : 'polite'}>
            <span className={error ? 'status-dot status-dot-error' : isProcessing ? 'status-dot status-dot-wait' : result ? 'status-dot status-dot-ok' : 'status-dot status-dot-wait'} />
            <span>{error || status}</span>
          </div>
          {sourceName ? <span className="hero-file">{sourceName}</span> : null}
        </div>
      </header>

      <main className="dashboard">
        <section className="panel controls-panel" aria-labelledby="controls-title">
          <SectionHeading id="controls-title" title="Preparar conversão" meta={sourceName ? 'Arquivo carregado' : 'Adicione um DXF'} />

          <div className="controls-layout">
            <div className="source-area">
              <label
                className={dragActive ? 'dropzone dropzone-active' : 'dropzone'}
                htmlFor="dxf-input"
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                }}
                onDrop={handleDrop}
              >
                <span className="dropzone-illustration">
                  <UploadGlyph />
                </span>
                <span className="dropzone-copy">
                  <strong>{sourceName || 'Adicionar arquivo DXF'}</strong>
                  <span>{sourceName ? 'Clique para trocar o arquivo' : 'Arraste aqui ou clique para escolher'}</span>
                </span>
                <span className="dropzone-format">.DXF</span>
                <input
                  id="dxf-input"
                  ref={fileInputRef}
                  className="hidden-input"
                  type="file"
                  accept=".dxf"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    void handleFile(file);
                  }}
                />
              </label>
              <button className="button button-ghost sample-button" type="button" onClick={() => void handleSample()}>
                Usar exemplo
              </button>
            </div>

            <div className="settings-area">
              <div className="field-grid">
                <label className="field">
                  <span>Data</span>
                  <input type="date" value={flightDate} onChange={(event) => setFlightDate(event.target.value)} />
                </label>

                <label className="field">
                  <span>Zona UTM</span>
                  <select value={utmZone} onChange={(event) => setUtmZone(event.target.value)}>
                    <option value="18">18S</option>
                    <option value="19">19S</option>
                    <option value="20">20S</option>
                    <option value="21">21S</option>
                    <option value="22">22S</option>
                    <option value="23">23S</option>
                    <option value="24">24S</option>
                    <option value="25">25S</option>
                  </select>
                </label>

                <label className="field">
                  <span>Recuo lateral (m)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={bufferMeters}
                    onChange={(event) => setBufferMeters(event.target.value)}
                  />
                </label>

              </div>
              <p className="projection-note">{projectionLabel(utmZone)}</p>
            </div>
          </div>
        </section>

        <section className="result-layout" aria-labelledby="preview-title">
          <article className="panel card-preview" aria-labelledby="preview-title" aria-busy={isProcessing}>
            <SectionHeading
              id="preview-title"
              title="Área de voo"
              meta={isProcessing ? 'Processando...' : result ? 'Pronta' : 'Aguardando DXF'}
            />

            <div className={isProcessing && result ? 'preview-wrap preview-wrap-processing' : 'preview-wrap'}>
              {preview && result ? (
                <svg className="preview-svg" viewBox={preview.viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Prévia da área de voo">
                  <defs>
                    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
                      <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(17,17,17,0.06)" strokeWidth="1" />
                    </pattern>
                    <linearGradient id="buffer-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#e20613" stopOpacity="0.32" />
                      <stop offset="100%" stopColor="#e20613" stopOpacity="0.14" />
                    </linearGradient>
                  </defs>

                  <rect width="100%" height="100%" fill="url(#grid)" />
                  <path d={bufferPath} className="preview-buffer" />
                  <path d={sourcePath} className="preview-source" />
                </svg>
              ) : (
                <div className="preview-empty">
                  <UploadGlyph large />
                  <p>Importe um DXF para ver a área.</p>
                </div>
              )}
              {isProcessing && result ? <span className="preview-busy">Atualizando</span> : null}
            </div>

            <div className="legend-row">
              <span><i className="legend-swatch legend-fill" /> Área com recuo</span>
              <span><i className="legend-swatch legend-line" /> Original</span>
            </div>
          </article>

          <aside className="result-side">
            <article className="panel card-stats" aria-labelledby="stats-title">
              <SectionHeading id="stats-title" title="Leitura" meta={result ? 'Dados calculados' : 'Sem dados'} />

              {keyStats.length ? (
                <div className="stats-grid">
                  {keyStats.map((item) => (
                    <div className="stat-card" key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">As medições aparecem após a importação.</div>
              )}

              {result ? (
                <details className="entity-details">
                  <summary>Mais detalhes da leitura</summary>
                  <div className="stats-grid stats-grid-secondary">
                    {detailStats.map((item) => (
                      <div className="stat-card" key={item.label}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="chip-row">
                    {entityChips.map(([type, count]) => (
                      <span className="chip" key={type}>
                        {type} {formatNumber(count, 0)}
                      </span>
                    ))}
                  </div>
                </details>
              ) : null}
            </article>

            <article className="panel card-export" aria-labelledby="export-title">
              <SectionHeading id="export-title" title="Baixar arquivos" meta={isProcessing ? 'Processando...' : result ? 'Prontos' : 'Aguardando DXF'} />

              {result ? (
                <>
                  <div className="export-list">
                    <div className="export-item">
                      <div className="export-file">
                        <span className="file-badge">KMZ</span>
                        <span className="file-name">{outputName}</span>
                      </div>
                      <button className="button button-primary" type="button" onClick={handleDownload} disabled={!canDownload} aria-label={'Baixar ' + outputName}>
                        <DownloadGlyph />
                        <span>Baixar</span>
                      </button>
                    </div>
                    <div className="export-item">
                      <div className="export-file">
                        <span className="file-badge file-badge-muted">DXF</span>
                        <span className="file-name"><strong>Contorno suave sem offset</strong><br />{result.smoothDxfOutputName}</span>
                      </div>
                      <button className="button button-secondary" type="button" onClick={handleDownloadSmoothDxf} disabled={!canDownloadSmoothDxf} aria-label="Baixar contorno suave sem offset em DXF">
                        <DownloadGlyph />
                        <span>Baixar</span>
                      </button>
                    </div>
                    <div className="export-item">
                      <div className="export-file">
                        <span className="file-badge file-badge-muted">DXF</span>
                        <span className="file-name"><strong>Contorno suave com offset</strong><br />{result.offsetDxfOutputName}</span>
                      </div>
                      <button className="button button-secondary" type="button" onClick={handleDownloadOffsetDxf} disabled={!canDownloadOffsetDxf} aria-label="Baixar contorno suave com offset em DXF">
                        <DownloadGlyph />
                        <span>Baixar</span>
                      </button>
                    </div>
                  </div>

                  <div className="contour-export">
                    <div className="contour-export-copy">
                      <strong>Exportar contorno dos furos (DXF)</strong>
                      <span>Polígono fechado passando pelos furos das extremidades</span>
                    </div>
                    <button className="button button-contour" type="button" onClick={handleDownloadContour} disabled={!canDownloadContour} aria-label={'Baixar ' + result.contourDxfOutputName}>
                      <DownloadGlyph />
                      <span>Baixar contorno</span>
                    </button>
                  </div>

                  <p className="export-note">O offset usa o recuo lateral informado acima.</p>
                </>
              ) : (
                <div className="empty-state">Os arquivos aparecem após a importação.</div>
              )}
            </article>
          </aside>
        </section>
      </main>
    </div>
  );
}

function SectionHeading({ id, title, meta }) {
  return (
    <div className="panel-heading">
      <h2 id={id}>{title}</h2>
      {meta ? <span>{meta}</span> : null}
    </div>
  );
}

function UploadGlyph({ large = false }) {
  return (
    <svg className={`glyph ${large ? 'glyph-large' : ''}`} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 9l13 13h-9v17H28V22h-9z" />
      <path d="M14 39h36v10H14z" />
    </svg>
  );
}

function DownloadGlyph() {
  return (
    <svg className="glyph glyph-inline" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v10m0 0l4-4m-4 4l-4-4" />
      <path d="M5 17h14v4H5z" />
    </svg>
  );
}

export default App;
