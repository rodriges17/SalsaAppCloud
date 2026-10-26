export function localContentSignature(figure, videos = figure.videoContent ?? figure.videoIds ?? []) {
  return JSON.stringify([figure.title?.trim(), figure.description ?? '', figure.tags ?? [], videos]);
}
export function contentVideos(videos) {
  return videos.map(v => [v.id, v.name?.trim() ?? '', v.size ?? v.blob?.size ?? 0, v.crc ?? null]);
}
export const provenanceIcon = status => status === 'modified' ? '☁ ✎' : status === 'cloud' ? '☁' : '▣';
export const provenanceLabel = status => status === 'modified' ? 'Aus der Cloud · lokal angepasst' : status === 'cloud' ? 'In der Cloud gespeichert' : 'Nur lokal vorhanden';
