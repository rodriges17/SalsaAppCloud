export function localContentSignature(figure, videos = figure.videoContent ?? figure.videoIds ?? []) {
  return JSON.stringify([figure.title?.trim(), figure.description ?? '', figure.tags ?? [], videos]);
}
export function contentVideos(videos) {
  return videos.map(v => [v.id, v.name?.trim() ?? '', v.size ?? v.blob?.size ?? 0, v.crc ?? null]);
}
// Static, monochrome vector icons; the small pencil stays inside the device display.
export function provenanceIcon(status) {
  const device = '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M11 19h2"/>';
  const pencil = '<path d="m10 12 4-4 2 2-4 4-3 1 1-3Z"/>';
  const cloud = '<path d="M20 16.5a4.5 4.5 0 0 0-2-8.5 6 6 0 0 0-11.5-1A4.8 4.8 0 0 0 6 16.5Z"/>';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${status === 'cloud' ? cloud : device + (status === 'modified' ? pencil : '')}</svg>`;
}
export const provenanceLabel = status => status === 'modified' ? 'Aus der Cloud · lokal angepasst' : status === 'cloud' ? 'In der Cloud gespeichert' : 'Nur lokal vorhanden';
