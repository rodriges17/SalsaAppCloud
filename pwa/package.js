// Salsa figure exchange v1: ordinary, uncompressed ZIP (no ZIP64/encryption).
// Videos remain original bytes. Chunked checksums avoid whole-video JS buffers.
export const MAX_PACKAGE_BYTES = 250 * 1024 * 1024;
const MAX_MANIFEST = 256 * 1024, MAX_VIDEOS = 100;
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
const fail = message => { throw new Error(message); };
const invalid = () => fail('Keine gültige Salsa-Figur-Datei. Bitte eine unveränderte ZIP-Datei aus der App wählen.');
function check(signal) { signal?.throwIfAborted(); }
const table = Uint32Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
export async function checksum(blob, signal) {
  let crc = 0xffffffff;
  for (let offset = 0; offset < blob.size; offset += 1048576) {
    check(signal); const bytes = new Uint8Array(await blob.slice(offset, offset + 1048576).arrayBuffer());
    for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  check(signal); return (crc ^ 0xffffffff) >>> 0;
}
function header(length) { const bytes = new Uint8Array(length); return { bytes, view: new DataView(bytes.buffer) }; }
const mimeExtensions = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/x-m4v': 'm4v', 'video/webm': 'webm', 'video/ogg': 'ogv' };
function mediaType(blob) { const type = blob.type.toLowerCase().split(';')[0]; if (!mimeExtensions[type]) fail('Dieses Videoformat kann nicht geteilt werden. Unterstützt: MP4, MOV, M4V, WebM und Ogg.'); return type; }
export function packageSize(figure, records) {
  return records.reduce((sum, r) => sum + r.blob.size, 0) + encoder.encode(JSON.stringify({ title: figure.title, description: figure.description, tags: figure.tags, names: records.map(r => r.name) })).length + 2048 + records.length * 512;
}
export async function writeZip(entries, signal) {
  const parts = [], directory = []; let offset = 0, directorySize = 0;
  if (!entries.length || entries.length > MAX_VIDEOS + 1) invalid();
  for (const entry of entries) {
    check(signal); const name = encoder.encode(entry.path), crc = await checksum(entry.blob, signal);
    const local = header(30); local.view.setUint32(0, 0x04034b50, true); local.view.setUint16(4, 20, true); local.view.setUint16(6, 0x800, true);
    local.view.setUint32(14, crc, true); local.view.setUint32(18, entry.blob.size, true); local.view.setUint32(22, entry.blob.size, true); local.view.setUint16(26, name.length, true);
    const central = header(46); central.view.setUint32(0, 0x02014b50, true); central.view.setUint16(4, 20, true); central.view.setUint16(6, 20, true); central.view.setUint16(8, 0x800, true);
    central.view.setUint32(16, crc, true); central.view.setUint32(20, entry.blob.size, true); central.view.setUint32(24, entry.blob.size, true); central.view.setUint16(28, name.length, true); central.view.setUint32(42, offset, true);
    parts.push(local.bytes, name, entry.blob); directory.push(central.bytes, name); directorySize += 46 + name.length; offset += 30 + name.length + entry.blob.size;
    if (offset + directorySize + 22 > MAX_PACKAGE_BYTES) fail('Das Paket ist größer als 250 MB. Bitte weniger Videos auswählen.');
  }
  const end = header(22); end.view.setUint32(0, 0x06054b50, true); end.view.setUint16(8, entries.length, true); end.view.setUint16(10, entries.length, true); end.view.setUint32(12, directorySize, true); end.view.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end.bytes], { type: 'application/zip' });
}
export async function exportFigure(figure, records, signal) {
  if (!records.length || records.length > MAX_VIDEOS) fail('Bitte 1 bis 100 Videos auswählen.');
  if (packageSize(figure, records) > MAX_PACKAGE_BYTES) fail('Das Paket ist größer als 250 MB. Bitte weniger Videos auswählen.');
  const videos = records.map((record, index) => { const type = mediaType(record.blob); return { path: `videos/${index + 1}.${mimeExtensions[type]}`, name: record.name, type, size: record.blob.size }; });
  const manifest = { format: 'salsa-figure', version: 1, title: figure.title, description: figure.description, tags: figure.tags, videos };
  validateManifest(manifest);
  const metadata = new Blob([JSON.stringify(manifest)]);
  if (metadata.size > MAX_MANIFEST) fail('Die Beschreibung oder Tags sind zu umfangreich zum Teilen.');
  return writeZip([{ path: 'figure.json', blob: metadata }, ...records.map((r, i) => ({ path: videos[i].path, blob: r.blob }))], signal);
}
async function readZip(blob, signal) {
  if (!(blob instanceof Blob) || blob.size < 22) invalid();
  if (blob.size > MAX_PACKAGE_BYTES) fail('Die Datei ist größer als 250 MB. Bitte ein kleineres Figuren-Paket verwenden.');
  const end = new DataView(await blob.slice(-22).arrayBuffer());
  if (end.getUint32(0, true) !== 0x06054b50 || end.getUint16(4, true) || end.getUint16(6, true) || end.getUint16(20, true)) invalid();
  const count = end.getUint16(10, true), size = end.getUint32(12, true), start = end.getUint32(16, true);
  if (!count || count > MAX_VIDEOS + 1 || end.getUint16(8, true) !== count || start + size !== blob.size - 22 || size > 65536) invalid();
  const bytes = new Uint8Array(await blob.slice(start, start + size).arrayBuffer()), view = new DataView(bytes.buffer), entries = new Map();
  let pos = 0, expectedOffset = 0;
  for (let i = 0; i < count; i++) {
    check(signal);
    if (pos + 46 > size || view.getUint32(pos, true) !== 0x02014b50) invalid();
    const flags = view.getUint16(pos + 8, true), method = view.getUint16(pos + 10, true), crc = view.getUint32(pos + 16, true), length = view.getUint32(pos + 24, true);
    const nameLength = view.getUint16(pos + 28, true), extra = view.getUint16(pos + 30, true), comment = view.getUint16(pos + 32, true), offset = view.getUint32(pos + 42, true);
    if (flags !== 0x800 || method || view.getUint32(pos + 20, true) !== length || extra || comment || view.getUint16(pos + 34, true) || offset !== expectedOffset || pos + 46 + nameLength > size) invalid();
    const path = decoder.decode(bytes.slice(pos + 46, pos + 46 + nameLength));
    if (!/^(figure\.json|videos\/[1-9][0-9]*\.(mp4|mov|m4v|webm|ogv))$/.test(path) || entries.has(path) || offset + 30 + nameLength + length > start || (path === 'figure.json' && length > MAX_MANIFEST)) invalid();
    const localBytes = new Uint8Array(await blob.slice(offset, offset + 30 + nameLength).arrayBuffer()), local = new DataView(localBytes.buffer);
    if (local.getUint32(0, true) !== 0x04034b50 || local.getUint16(6, true) !== flags || local.getUint16(8, true) !== method || local.getUint32(14, true) !== crc || local.getUint32(18, true) !== length || local.getUint32(22, true) !== length || local.getUint16(26, true) !== nameLength || local.getUint16(28, true) || decoder.decode(localBytes.slice(30)) !== path) invalid();
    const content = blob.slice(offset + 30 + nameLength, offset + 30 + nameLength + length);
    if (await checksum(content, signal) !== crc) fail('Die ZIP-Datei ist beschädigt. Bitte erneut übertragen.');
    entries.set(path, { blob: content, crc }); expectedOffset = offset + 30 + nameLength + length; pos += 46 + nameLength;
  }
  if (pos !== size || expectedOffset !== start || !entries.has('figure.json')) invalid();
  return entries;
}
function validateManifest(m) {
  const text = (v, max) => typeof v === 'string' && v.length <= max;
  if (!m || m.format !== 'salsa-figure') invalid();
  if (m.version !== 1) fail('Diese Version der Figur-Datei wird nicht unterstützt. Bitte die App aktualisieren.');
  if (!text(m.title, 160) || !m.title.trim() || !text(m.description, 100000) || !Array.isArray(m.tags) || m.tags.length > 100 || m.tags.some(t => !text(t, 160)) || !Array.isArray(m.videos) || !m.videos.length || m.videos.length > MAX_VIDEOS) invalid();
  m.videos.forEach((v, i) => {
    if (!v || !text(v.name, 160) || !mimeExtensions[v.type] || v.path !== `videos/${i + 1}.${mimeExtensions[v.type]}` || !Number.isSafeInteger(v.size) || v.size <= 0 || v.size > MAX_PACKAGE_BYTES) invalid();
  });
}
export async function importFigure(blob, signal) {
  const entries = await readZip(blob, signal); let m;
  try { m = JSON.parse(await entries.get('figure.json').blob.text()); } catch { invalid(); }
  validateManifest(m);
  if (entries.size !== m.videos.length + 1) invalid();
  const drafts = m.videos.map(v => {
    const entry = entries.get(v.path); if (!entry || entry.blob.size !== v.size) invalid();
    return { name: v.name, blob: entry.blob.slice(0, entry.blob.size, v.type), confirmed: false, existing: false, duration: 0, poster: null };
  });
  // A repeat hint, not an authentication signature. No sender IDs or private paths.
  const identity = JSON.stringify([m.title, m.description, m.tags, m.videos.map(v => [v.name, v.type, v.size, entries.get(v.path).crc])]);
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(identity)); check(signal);
  const fingerprint = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  return { title: m.title, description: m.description, tags: m.tags, fingerprint, drafts };
}
export function packageFilename(title) { return `${title.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 80) || 'Salsa-Figur'}.zip`; }
