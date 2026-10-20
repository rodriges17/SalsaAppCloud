// Full local backup, distinct from the single-figure exchange ZIP.
const enc = new TextEncoder(), dec = new TextDecoder('utf-8', { fatal: true });
const MAGIC = 'SALSABK1';
export const MAX_BACKUP_PART = 250 * 1024 * 1024;
const MAX_META = 16 * 1024 * 1024, MAX_PARTS = 10000;
export const BACKUP_CHUNK = 8 * 1024 * 1024;
const fail = s => { throw new Error(s); };
const check = signal => signal?.throwIfAborted();
export async function digest(bytes) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join(''); }
const hashJSON = value => digest(enc.encode(JSON.stringify(value)));
const text = (v, n) => typeof v === 'string' && v.length <= n;
const hex = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const integer = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
export const sourceKey = f => JSON.stringify([f.storageFolder ?? 'app', f.id]);
export function partLayout(sizes, partBytes = MAX_BACKUP_PART, chunkBytes = BACKUP_CHUNK) {
  const reserve = Math.min(MAX_META + 4096, Math.floor(partBytes / 4)), capacity = partBytes - reserve;
  if (!integer(partBytes, 1024, MAX_BACKUP_PART) || !integer(chunkBytes, 1, BACKUP_CHUNK)) fail('Ungültige Sicherungsgröße.');
  chunkBytes = Math.min(chunkBytes, capacity); let part = 0, offset = 0;
  const assets = sizes.map(size => { const chunks = []; for (let pos = 0; pos < size;) { const length = Math.min(chunkBytes, size - pos); if (offset + length > capacity) { part++; offset = 0; } chunks.push({ part, offset, length }); offset += length; pos += length; } return chunks; });
  if (part + 1 > MAX_PARTS) fail('Zu viele Sicherungsteile.');
  return { assets, count: part + 1, chunkBytes };
}
function metadata(f) {
  return { title: f.title, description: f.description, tags: [...f.tags], status: f.status, createdAt: f.createdAt, importFingerprint: f.importFingerprint ?? null };
}
async function assetSignature(blob, chunkBytes, signal) {
  const chunks = [];
  for (let n = 0; n < blob.size; n += chunkBytes) { check(signal); chunks.push(await digest(await blob.slice(n, n + chunkBytes).arrayBuffer())); }
  return { size: blob.size, type: blob.type, hashes: chunks };
}
export async function figureSignature(figure, records, chunkBytes = BACKUP_CHUNK, signal) {
  const video = [];
  for (const r of records) video.push({ name: r.name, duration: r.duration, width: r.width ?? 0, height: r.height ?? 0, data: await assetSignature(r.blob, chunkBytes, signal) });
  // Thumbnail bytes can be regenerated independently; identity concerns the figure and video content.
  return hashJSON([metadata(figure), video]);
}
export async function createBackup(sources, { signal, progress = () => {}, partBytes = MAX_BACKUP_PART, chunkBytes = BACKUP_CHUNK } = {}) {
  if (!sources.length) fail('Es sind keine lokalen Figuren vorhanden.');
  const manifest = { format: 'salsa-full-backup', version: 1, id: crypto.randomUUID(), createdAt: Date.now(), chunkBytes, partCount: 0, figures: [], assets: [] }, blobs = [];
  function add(blob, kind) { if (!blob?.size) return null; const id = manifest.assets.length; manifest.assets.push({ id, kind, size: blob.size, type: blob.type, chunks: [] }); blobs.push(blob); return id; }
  for (const { figure: f, records } of sources) {
    if (!records.length || records.length !== f.videoIds.length) fail(`„${f.title}“ ist unvollständig.`);
    manifest.figures.push({ source: sourceKey(f), originalId: f.id, ...metadata(f), poster: add(f.poster, 'poster'), signature: '', videos: records.map(r => ({ name: r.name, duration: r.duration, width: r.width ?? 0, height: r.height ?? 0, asset: add(r.blob, 'video'), poster: add(r.poster, 'poster') })) });
  }
  const layout = partLayout(blobs.map(b => b.size), partBytes, chunkBytes); manifest.chunkBytes = layout.chunkBytes; manifest.partCount = layout.count;
  const payload = Array.from({ length: layout.count }, () => []); let done = 0, total = blobs.reduce((n, b) => n + b.size, 0);
  for (let i = 0; i < blobs.length; i++) {
    let position = 0;
    for (const c of layout.assets[i]) {
      check(signal); const blob = blobs[i].slice(position, position + c.length), sha = await digest(await blob.arrayBuffer());
      manifest.assets[i].chunks.push({ ...c, sha }); payload[c.part].push(blob); position += c.length; done += c.length; progress({ phase: 'hash', done, total });
    }
  }
  for (let i = 0; i < manifest.figures.length; i++) {
    const f = manifest.figures[i];
    const videos = f.videos.map(v => { const a = manifest.assets[v.asset]; return { name: v.name, duration: v.duration, width: v.width, height: v.height, data: { size: a.size, type: a.type, hashes: a.chunks.map(c => c.sha) } }; });
    f.signature = await hashJSON([metadata(f), videos]);
  }
  validateManifest(manifest); const manifestHash = await hashJSON(manifest), parts = [];
  const date = new Date(manifest.createdAt).toISOString().slice(0, 19).replaceAll(':', '-');
  for (let index = 0; index < layout.count; index++) {
    check(signal); const header = enc.encode(JSON.stringify({ id: manifest.id, index, count: layout.count, manifestHash, ...(index === 0 ? { manifest } : {}) }));
    if (header.length > MAX_META) fail('Die Figurenangaben sind für eine Sicherungsdatei zu umfangreich.');
    const prefix = new Uint8Array(12); prefix.set(enc.encode(MAGIC)); new DataView(prefix.buffer).setUint32(8, header.length, true);
    const blob = new Blob([prefix, header, ...payload[index]], { type: 'application/octet-stream' });
    if (blob.size > partBytes) fail('Sicherungsteil überschreitet die Größenbegrenzung.');
    parts.push({ name: `Salsa-Backup-${date}-${manifest.id.slice(0,8)}-Teil-${String(index+1).padStart(3,'0')}-von-${String(layout.count).padStart(3,'0')}.salsabackup`, blob });
  }
  return { manifest, parts };
}
function validateManifest(m) {
  if (!m || m.format !== 'salsa-full-backup' || m.version !== 1 || !text(m.id,100) || !integer(m.createdAt,0,Number.MAX_SAFE_INTEGER) || !integer(m.chunkBytes,1,BACKUP_CHUNK) || !integer(m.partCount,1,MAX_PARTS) || !Array.isArray(m.figures) || !m.figures.length || m.figures.length>10000 || !Array.isArray(m.assets) || m.assets.length>100000) fail('Keine unterstützte vollständige Salsa-Sicherung.');
  const referenced = new Set(), sources = new Set();
  const asset = (id, kind, optional=false) => { if (id === null && optional) return; if (!integer(id,0,m.assets.length-1) || m.assets[id].kind !== kind) fail('Ungültiger Dateiverweis in der Sicherung.'); referenced.add(id); };
  for (const f of m.figures) {
    if (!text(f.source,500) || sources.has(f.source) || !text(f.originalId,100) || !text(f.title,160) || !f.title.trim() || !text(f.description,100000) || !Array.isArray(f.tags) || f.tags.length>100 || f.tags.some(t=>!text(t,160)) || !['Neu','Am Üben','Sitzt'].includes(f.status) || !integer(f.createdAt,0,Number.MAX_SAFE_INTEGER) || !(f.importFingerprint===null || text(f.importFingerprint,1000)) || !hex(f.signature) || !Array.isArray(f.videos) || !f.videos.length || f.videos.length>1000) fail('Ungültige Figurenangaben in der Sicherung.');
    sources.add(f.source); asset(f.poster,'poster',true);
    for (const v of f.videos) { if (!text(v.name,160) || !Number.isFinite(v.duration) || v.duration<=0 || !Number.isFinite(v.width) || v.width<0 || !Number.isFinite(v.height) || v.height<0) fail('Ungültige Videodaten.'); asset(v.asset,'video'); asset(v.poster,'poster',true); }
  }
  const parts=Array.from({length:m.partCount},()=>[]);
  for (let i=0;i<m.assets.length;i++) {
    const a=m.assets[i]; if(a.id!==i || !['video','poster'].includes(a.kind) || !integer(a.size,1,Number.MAX_SAFE_INTEGER) || !text(a.type,100) || (a.kind==='video' && !a.type.startsWith('video/')) || (a.kind==='poster' && !a.type.startsWith('image/')) || !Array.isArray(a.chunks) || !a.chunks.length || a.chunks.length>100000) fail('Ungültige Datei in der Sicherung.');
    let size=0; for(let n=0;n<a.chunks.length;n++){const c=a.chunks[n];if(!integer(c.part,0,m.partCount-1)||!integer(c.offset,0,MAX_BACKUP_PART)||!integer(c.length,1,m.chunkBytes)||!hex(c.sha)||(n<a.chunks.length-1&&c.length!==m.chunkBytes))fail('Ungültiger Sicherungsblock.');size+=c.length;parts[c.part].push(c);} if(size!==a.size)fail('Unvollständige Datei in der Sicherung.');
  }
  if(referenced.size!==m.assets.length)fail('Unbekannte Dateien in der Sicherung.');
  for(const list of parts){list.sort((a,b)=>a.offset-b.offset);let offset=0;for(const c of list){if(c.offset!==offset)fail('Überlappende oder fehlende Sicherungsblöcke.');offset+=c.length;}if(!offset||offset>MAX_BACKUP_PART)fail('Ungültiger Sicherungsteil.');}
  return parts;
}
export async function readBackup(files,{signal,progress=()=>{}}={}) {
  if(!files.length)fail('Bitte alle Sicherungsteile auswählen.');const headers=[];
  for(const file of files){check(signal);if(file.size<12||file.size>MAX_BACKUP_PART)fail('Ungültige Sicherungsdatei.');const start=new Uint8Array(await file.slice(0,12).arrayBuffer());if(dec.decode(start.slice(0,8))!==MAGIC)fail('Keine vollständige Salsa-Sicherung. Für Figur-ZIP bitte Figur importieren verwenden.');const length=new DataView(start.buffer).getUint32(8,true);if(!length||length>MAX_META||12+length>file.size)fail('Beschädigter Sicherungskopf.');let h;try{h=JSON.parse(dec.decode(new Uint8Array(await file.slice(12,12+length).arrayBuffer())));}catch{fail('Beschädigter Sicherungskopf.');}headers.push({...h,file,start:12+length});}
  const first=headers.find(h=>h.index===0);if(!first?.manifest)fail('Der erste Sicherungsteil fehlt.');const m=first.manifest,layout=validateManifest(m),manifestHash=await hashJSON(m);
  if(headers.length!==m.partCount)fail(`Unvollständige Sicherung: ${m.partCount} Teile erforderlich, ${headers.length} ausgewählt.`);
  const parts=new Map();for(const h of headers){if(h.id!==m.id||h.count!==m.partCount||h.manifestHash!==manifestHash||!integer(h.index,0,m.partCount-1)||parts.has(h.index)||(h.index!==0&&h.manifest!==undefined))fail('Die Sicherungsteile gehören nicht zusammen oder sind doppelt.');parts.set(h.index,h);}
  let done=0,total=m.assets.reduce((n,a)=>n+a.size,0);
  for(let index=0;index<m.partCount;index++){const h=parts.get(index);if(!h)fail('Ein Sicherungsteil fehlt.');const size=layout[index].reduce((n,c)=>n+c.length,0);if(h.file.size-h.start!==size)fail('Sicherungsteil ist abgeschnitten oder enthält zusätzliche Daten.');for(const c of layout[index]){check(signal);if(await digest(await h.file.slice(h.start+c.offset,h.start+c.offset+c.length).arrayBuffer())!==c.sha)fail('Die Sicherung ist beschädigt. Es wurden keine Figuren verändert.');done+=c.length;progress({phase:'verify',done,total});}}
  const assets=m.assets.map(a=>new Blob(a.chunks.map(c=>{const h=parts.get(c.part);return h.file.slice(h.start+c.offset,h.start+c.offset+c.length);}),{type:a.type}));
  const sources=[];for(const f of m.figures){const figure={...metadata(f),id:f.originalId,source:f.source,poster:f.poster===null?null:assets[f.poster]};const records=f.videos.map(v=>({name:v.name,duration:v.duration,width:v.width,height:v.height,blob:assets[v.asset],poster:v.poster===null?null:assets[v.poster]}));if(await figureSignature(figure,records,m.chunkBytes,signal)!==f.signature)fail('Figurenangaben stimmen nicht mit der Sicherung überein.');sources.push({figure,records,signature:f.signature});}
  check(signal);return {manifest:m,sources};
}
