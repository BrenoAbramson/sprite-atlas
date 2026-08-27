export type Category = "items" | "outfits" | "effects" | "missiles";

export type Thing = {
  id: number;
  category: Category;
  width: number;
  height: number;
  layers: number;
  patternX: number;
  patternY: number;
  patternZ: number;
  phases: number;
  sprites: number[];
};

export type Catalog = {
  datSignature: string;
  sprSignature: string;
  spriteCount: number;
  counts: Record<Category, number>;
  things: Record<Category, Thing[]>;
  offsets: Uint32Array;
};

class Reader {
  offset = 0;
  constructor(public view: DataView) {}
  ensure(size: number) { if (this.offset + size > this.view.byteLength) throw new Error("Arquivo terminou antes do esperado."); }
  u8() { this.ensure(1); return this.view.getUint8(this.offset++); }
  u16() { this.ensure(2); const value = this.view.getUint16(this.offset, true); this.offset += 2; return value; }
  u32() { this.ensure(4); const value = this.view.getUint32(this.offset, true); this.offset += 4; return value; }
  skip(size: number) { this.ensure(size); this.offset += size; }
}

const hex = (value: number) => value.toString(16).toUpperCase().padStart(8, "0");

function skipAttribute(reader: Reader, attribute: number, version: number) {
  let attr = attribute;
  if (version >= 780 && version < 860) {
    if (attr === 8) return;
    if (attr > 8) attr -= 1;
  }
  if ([0, 8, 9, 25, 28, 29, 32, 251].includes(attr)) reader.skip(2);
  else if ([21, 24].includes(attr)) reader.skip(4);
  else if (attr === 33) {
    reader.skip(6);
    reader.skip(reader.u16());
    reader.skip(4);
  }
}

function parseThing(reader: Reader, category: Category, id: number, version: number): Thing {
  let ended = false;
  for (let guard = 0; guard < 255; guard++) {
    const raw = reader.u8();
    if (raw === 255) { ended = true; break; }
    skipAttribute(reader, raw, version);
  }
  if (!ended) throw new Error(`Atributos inválidos no ${category} ${id}.`);
  const width = reader.u8();
  const height = reader.u8();
  if (width > 1 || height > 1) reader.skip(1);
  const layers = reader.u8();
  const patternX = reader.u8();
  const patternY = reader.u8();
  const patternZ = version >= 755 ? reader.u8() : 1;
  const phases = reader.u8();
  const total = width * height * layers * patternX * patternY * patternZ * phases;
  if (total < 0 || total > 65536) throw new Error(`Quantidade de sprites inválida no ${category} ${id}.`);
  const sprites = Array.from({ length: total }, () => reader.u16());
  return { id, category, width, height, layers, patternX, patternY, patternZ, phases, sprites };
}

export function parseCatalog(datBuffer: ArrayBuffer, sprBuffer: ArrayBuffer, version: number): Catalog {
  const dat = new Reader(new DataView(datBuffer));
  const datSignature = hex(dat.u32());
  const lastIds = { items: dat.u16(), outfits: dat.u16(), effects: dat.u16(), missiles: dat.u16() };
  const specs: Array<[Category, number, number]> = [
    ["items", 100, lastIds.items], ["outfits", 1, lastIds.outfits],
    ["effects", 1, lastIds.effects], ["missiles", 1, lastIds.missiles],
  ];
  const things = { items: [], outfits: [], effects: [], missiles: [] } as Record<Category, Thing[]>;
  for (const [category, first, last] of specs) {
    for (let id = first; id <= last; id++) things[category].push(parseThing(dat, category, id, version));
  }

  const spr = new Reader(new DataView(sprBuffer));
  const sprSignature = hex(spr.u32());
  const spriteCount = spr.u16();
  const offsets = new Uint32Array(spriteCount + 1);
  for (let id = 1; id <= spriteCount; id++) offsets[id] = spr.u32();
  return {
    datSignature, sprSignature, spriteCount, offsets, things,
    counts: { items: lastIds.items - 99, outfits: lastIds.outfits, effects: lastIds.effects, missiles: lastIds.missiles },
  };
}

export function decodeSprite(buffer: ArrayBuffer, offsets: Uint32Array, id: number): ImageData | null {
  const offset = offsets[id];
  if (!offset || offset + 5 > buffer.byteLength) return null;
  const view = new DataView(buffer);
  let cursor = offset + 3;
  const size = view.getUint16(cursor, true); cursor += 2;
  const end = Math.min(cursor + size, buffer.byteLength);
  const pixels = new Uint8ClampedArray(32 * 32 * 4);
  let pixel = 0;
  while (cursor + 4 <= end && pixel < 1024) {
    const transparent = view.getUint16(cursor, true); cursor += 2;
    const colored = view.getUint16(cursor, true); cursor += 2;
    pixel += transparent;
    for (let i = 0; i < colored && cursor + 3 <= end && pixel < 1024; i++, pixel++) {
      const out = pixel * 4;
      pixels[out] = view.getUint8(cursor++); pixels[out + 1] = view.getUint8(cursor++); pixels[out + 2] = view.getUint8(cursor++); pixels[out + 3] = 255;
    }
  }
  return new ImageData(pixels, 32, 32);
}

export type StoredLibrary = { id: string; name: string; version: number; createdAt: number; dat: Blob; spr: Blob; otb?: Blob; itemsXml?: Blob; npcSpawnXml?: File; npcXmlFiles?: File[]; monsterXmlFiles?: File[] };
const DB_NAME = "sprite-atlas";
const STORE = "libraries";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listLibraries(): Promise<StoredLibrary[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => b.createdAt - a.createdAt));
    request.onerror = () => reject(request.error);
  });
}

export async function saveLibrary(library: StoredLibrary) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(library);
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
}

export async function deleteLibrary(id: string) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
}
