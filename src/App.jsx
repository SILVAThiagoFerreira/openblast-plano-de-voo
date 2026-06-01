import { useEffect, useMemo, useRef, useState } from 'react';
import { enaexLogoUrl, sampleDxfUrl } from './assets.js';
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

const todayIso = new Date().toISOString().slice(0, 10);
const defaultZone = '24';

function App() {
  const fileInputRef = useRef(null);
  const [sourceText, setSourceText] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [utmZone, setUtmZone] = useState(defaultZone);
  const [bufferMeters, setBufferMeters] = useState(7);
  const [flightDate, setFlightDate] = useState(todayIso);
  const [status, setStatus] = useState('Aguardando DXF');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [dxfDownloadUrl, setDxfDownloadUrl] = useState('');

  useEffect(() => {
    if (!result?.kmzBlob || !result?.dxfBlob) {
      setDownloadUrl('');
      setDxfDownloadUrl('');
      return undefined;
    }

    const url = URL.createObjectURL(result.kmzBlob);
    const dxfUrl = URL.createObjectURL(result.dxfBlob);
    setDownloadUrl(url);
    setDxfDownloadUrl(dxfUrl);

    return () => {
      URL.revokeObjectURL(url);
      URL.revokeObjectURL(dxfUrl);
    };
  }, [result]);

  useEffect(() => {
    let cancelled = false;

    if (!sourceText) {
      setResult(null);
      setError('');
      setStatus('Aguardando DXF');
      return undefined;
    }

    setStatus('Gerando poligonal...');
    setError('');

    void (async () => {
      try {
        const built = await buildFlightPlanFromDxfText(sourceText, {
          bufferMeters: Number(bufferMeters) || 7,
          utmZone: Number(utmZone) || 24,
          flightDate,
          sourceFileName: sourceName || 'DXF'
        });

        if (cancelled) {
          return;
        }

        setResult(built);
        setStatus('Poligonal pronta para exportação');
      } catch (err) {
        if (cancelled) {
          return;
        }

        setResult(null);
        setError(err instanceof Error ? err.message : 'Falha ao processar o DXF');
        setStatus('Erro ao gerar a poligonal');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bufferMeters, flightDate, sourceName, sourceText, utmZone]);

  const preview = useMemo(() => {
    if (!result?.sourceRing?.length || !result?.bufferedRing?.length) {
      return null;
    }

    return buildPreviewTransform([result.sourceRing, result.bufferedRing]);
  }, [result]);

  const outputName = result?.outputName ?? `${formatOutputName(flightDate)}.kmz`;
  const dxfOutputName = result?.dxfOutputName ?? `${formatOutputName(flightDate)}.dxf`;
  const canDownload = Boolean(downloadUrl && result?.kmzBlob);
  const canDownloadDxf = Boolean(dxfDownloadUrl && result?.dxfBlob);

  async function handleFile(file) {
    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith('.dxf')) {
      setError('Selecione um arquivo .dxf válido.');
      return;
    }

    setError('');
    setStatus('Lendo DXF...');

    try {
      const text = await readBlobText(file);
      setSourceName(file.name);
      setSourceText(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao ler o DXF');
      setStatus('Erro ao ler o arquivo');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleSample() {
    setError('');
    setStatus('Carregando exemplo...');

    try {
      const text = await readUrlText(sampleDxfUrl);
      setSourceName('holes-PP190526_B.dxf');
      setSourceText(text);
    } catch (err) {
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

  function handleDownloadDxf() {
    if (!canDownloadDxf) {
      return;
    }

    const anchor = document.createElement('a');
    anchor.href = dxfDownloadUrl;
    anchor.download = dxfOutputName;
    anchor.click();
  }

  const stats = result
    ? [
        { label: 'Entidades lidas', value: formatNumber(result.parsed.entityCount, 0) },
        { label: 'Pontos úteis', value: formatNumber(result.parsed.points.length, 0) },
        { label: 'Vértices da borda', value: formatNumber(result.sourceRing.length, 0) },
        { label: 'Vértices do recuo', value: formatNumber(result.bufferedRing.length, 0) },
        { label: 'Área original', value: formatAreaSmart(result.stats.sourceAreaM2) },
        { label: 'Área final', value: formatAreaSmart(result.stats.bufferedAreaM2) },
        { label: 'Perímetro final', value: formatMeters(result.stats.perimeterM) },
        { label: 'Unidade', value: result.parsed.unitInfo.label }
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
      <div className="orb orb-a" />
      <div className="orb orb-b" />

      <header className="hero">
        <div className="brand-block">
          <img className="brand-logo" src={enaexLogoUrl} alt="Enaex Brasil" />
          <div>
            <p className="eyebrow">DXF para KMZ</p>
            <h1>Plano de Voo</h1>
          </div>
        </div>

        <div className="hero-copy">
          <div className="status-pill" aria-live="polite">
            <span className={`status-dot ${error ? 'status-dot-error' : result ? 'status-dot-ok' : 'status-dot-wait'}`} />
            <span>{error || status}</span>
          </div>
        </div>
      </header>

      <main className="dashboard">
        <section className="stack">
          <article className="panel card-upload">
            <PanelHeader
              eyebrow="Entrada"
              title="Importe o DXF:"
              description="Arraste e solte o arquivo ou use o seletor. O sistema lê o desenho, extrai o contorno e prepara o recuo."
            />

            <div
              className={`dropzone ${dragActive ? 'dropzone-active' : ''}`}
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
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
            >
              <div className="dropzone-illustration">
                <UploadGlyph />
              </div>
              <div>
                <strong>Solte o DXF aqui</strong>
                <p>Ou clique para escolher um arquivo local.</p>
              </div>
              <input
                ref={fileInputRef}
                className="hidden-input"
                type="file"
                accept=".dxf"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  void handleFile(file);
                }}
              />
            </div>

            <div className="actions-row">
              <button className="button button-secondary" type="button" onClick={() => fileInputRef.current?.click()}>
                Escolher arquivo
              </button>
              <button className="button button-ghost" type="button" onClick={() => void handleSample()}>
                Carregar exemplo
              </button>
            </div>

            <div className="file-summary">
              <div>
                <span>Arquivo ativo</span>
                <strong>{sourceName || 'Nenhum arquivo selecionado'}</strong>
              </div>
              <div>
                <span>Destino</span>
                <strong>Google Earth / KMZ</strong>
              </div>
            </div>
          </article>

          <article className="panel card-config">
            <PanelHeader
              eyebrow="Configuração"
              title="Parâmetros de Exportação:"
              description="A geometria CAD normalmente não traz CRS explícito. Ajuste a zona UTM se a poligonal aparecer deslocada no Google Earth."
            />

            <div className="field-grid">
              <label className="field">
                <span>Data do plano</span>
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

              <label className="field field-wide">
                <span>Recuo lateral</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={bufferMeters}
                  onChange={(event) => setBufferMeters(event.target.value)}
                />
              </label>
            </div>

            <div className="hint-box">
              <strong>{projectionLabel(utmZone)}</strong>
            </div>
          </article>
        </section>

        <section className="stack">
          <article className="panel card-preview">
            <PanelHeader
              eyebrow="Preview"
              title="Poligonal Gerada:"
              description="Linha clara = contorno lido do DXF. Área sólida = poligonal com o recuo aplicado."
            />

            <div className="preview-wrap">
              {preview && result ? (
                <svg className="preview-svg" viewBox={preview.viewBox} preserveAspectRatio="none" role="img" aria-label="Preview da poligonal">
                  <defs>
                    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
                      <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                    </pattern>
                    <linearGradient id="buffer-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#ffb14d" stopOpacity="0.44" />
                      <stop offset="100%" stopColor="#ff8a1e" stopOpacity="0.20" />
                    </linearGradient>
                  </defs>

                  <rect width="100%" height="100%" fill="url(#grid)" />
                  <path d={bufferPath} className="preview-buffer" />
                  <path d={sourcePath} className="preview-source" />
                </svg>
              ) : (
                <div className="preview-empty">
                  <UploadGlyph large />
                  <p>Carregue um DXF para visualizar a poligonal antes da exportação.</p>
                </div>
              )}
            </div>

            <div className="legend-row">
              <span><i className="legend-swatch legend-fill" /> Recuo</span>
              <span><i className="legend-swatch legend-line" /> Contorno original</span>
            </div>
          </article>

          <article className="panel card-stats">
            <PanelHeader
              eyebrow="Medições"
              title="Resumo Técnico:"
              description="Os números abaixo ajudam a conferir se o DXF foi interpretado corretamente antes do download."
            />

            <div className="stats-grid">
              {stats.map((item) => (
                <div className="stat-card" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>

            <div className="chip-row">
              {entityChips.length ? entityChips.map(([type, count]) => (
                <span className="chip" key={type}>
                  {type} {count}
                </span>
              )) : <span className="chip chip-muted">Sem entidades lidas ainda</span>}
            </div>
          </article>

          <article className="panel card-export">
            <PanelHeader
              eyebrow="Saída"
              title="Exportar KMZ e DXF:"
              description="O arquivo sai com o nome padrão PLANO DE VOO - AAAAMMDD, pronto para abrir no Google Earth ou reusar no CAD."
            />

            <div className="export-row">
              <div>
                <span>Arquivos finais</span>
                <strong>{outputName}</strong>
                <strong>{dxfOutputName}</strong>
              </div>

              <div className="export-actions">
                <button className="button button-primary" type="button" onClick={handleDownload} disabled={!canDownload}>
                  <DownloadGlyph />
                  Baixar KMZ
                </button>
                <button className="button button-secondary" type="button" onClick={handleDownloadDxf} disabled={!canDownloadDxf}>
                  <DownloadGlyph />
                  Baixar DXF
                </button>
              </div>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}

function PanelHeader({ eyebrow, title, description }) {
  return (
    <div className="panel-header">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
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
