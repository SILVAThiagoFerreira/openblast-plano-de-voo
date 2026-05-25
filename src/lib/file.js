export function decodeArrayBuffer(buffer) {
  try {
    return new TextDecoder('windows-1252').decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

export async function readBlobText(blob) {
  const buffer = await blob.arrayBuffer();
  return decodeArrayBuffer(buffer);
}

export async function readUrlText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao carregar o arquivo de exemplo: ${response.status}`);
  }
  return decodeArrayBuffer(await response.arrayBuffer());
}
