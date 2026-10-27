export function localContentSignature(figure, videos = figure.videoContent ?? figure.videoIds ?? []) {
  return JSON.stringify([figure.title?.trim(), figure.description ?? '', figure.tags ?? [], videos]);
}
export function contentVideos(videos) {
  return videos.map(v => [v.id, v.name?.trim() ?? '', v.size ?? v.blob?.size ?? 0, v.crc ?? null]);
}
// Shared monochrome cloud, optically centered in its 24px view box.
export function cloudIcon(modified = false) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path transform="translate(0 1.5)" d="M6 18a4 4 0 0 1-.5-8 6.5 6.5 0 0 1 12.4-1.8A5 5 0 0 1 18 18H6Z"/>${modified ? '<path d="m13 15 4-4 2 2-4 4-3 1 1-3Z"/>' : ''}</svg>`;
}
export function provenanceIcon(status) {
  if (status === 'remote' || status === 'conflict') return cloudIcon(status === 'conflict').replace('</svg>', '<path d="m9 7 3-3 3 3M12 4v8"/></svg>');
  if (status === 'cloud' || status === 'modified') return cloudIcon(status === 'modified');
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M11 19h2"/></svg>';
}
export const provenanceLabel = status => status === 'remote' ? 'Cloud-Version aktualisiert' : status === 'conflict' ? 'Lokal und in der Cloud geändert' : status === 'modified' ? 'Aus der Cloud · lokal angepasst' : status === 'cloud' ? 'In der Cloud gespeichert' : 'Nur lokal vorhanden';
