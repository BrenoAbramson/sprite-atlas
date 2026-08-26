import { Thing } from "./tibia";

export type ServerItem = {
  sid: number;
  clientId: number;
  group: number;
  name: string;
  thing?: Thing;
  slot?: string;
  attack?: number;
  armor?: number;
  defense?: number;
  ability?: string;
  charges?: number;
  flags: Record<string, boolean>;
};

type Node = { type: number; props: number[]; children: Node[] };

export const SERVER_ITEM_GROUPS = [
  { id: "all", label: "Todos" },
  { id: 0, label: "Nenhum" }, { id: 1, label: "Chão" }, { id: 2, label: "Recipiente" },
  { id: 3, label: "Arma" }, { id: 4, label: "Munição" }, { id: 5, label: "Armadura" },
  { id: 6, label: "Cargas" }, { id: 7, label: "Teleporte" }, { id: 8, label: "Campo mágico" },
  { id: 9, label: "Gravável" }, { id: 10, label: "Chave" }, { id: 11, label: "Splash" },
  { id: 12, label: "Recipiente de fluido" }, { id: 13, label: "Porta" }, { id: 14, label: "Obsoleto" },
] as const;

const FLAG_LABELS: Array<[number, string]> = [
  [1, "Bloqueia passagem"], [8192, "Sempre no topo"], [128, "Empilhável"],
  [16, "Usável"], [64, "Móvel"], [32, "Coletável"], [32768, "Girável"],
  [2, "Bloqueia projétil"], [16384, "Legível"], [4, "Bloqueia caminho"],
  [8, "Possui altura"], [1048576, "Leitura à distância"], [131072, "Vertical"],
  [262144, "Horizontal"], [65536, "Pendurável"],
];

const SLOT_NAMES = ["Padrão", "Cabeça", "Corpo", "Pernas", "Mochila", "Arma", "Duas mãos", "Pés", "Amuleto", "Anel", "Mão"];

function tree(buffer: ArrayBuffer): Node {
  const bytes = new Uint8Array(buffer);
  let cursor = 4;
  function readNode(): Node {
    if (bytes[cursor++] !== 0xfe) throw new Error("Estrutura inválida no items.otb.");
    const type = bytes[cursor++];
    const node: Node = { type, props: [], children: [] };
    while (cursor < bytes.length) {
      const value = bytes[cursor++];
      if (value === 0xfd) node.props.push(bytes[cursor++]);
      else if (value === 0xfe) { cursor--; node.children.push(readNode()); }
      else if (value === 0xff) return node;
      else node.props.push(value);
    }
    throw new Error("O items.otb terminou antes do esperado.");
  }
  return readNode();
}

const u16 = (data: number[], offset: number) => data[offset] | (data[offset + 1] << 8);
const u32 = (data: number[], offset: number) => (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0;

function xmlData(text: string) {
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("O XML de itens não é válido.");
  const result = new Map<number, Record<string, string>>();
  document.querySelectorAll("item").forEach((element) => {
    const id = Number(element.getAttribute("id"));
    if (!Number.isFinite(id)) return;
    const values: Record<string, string> = { name: element.getAttribute("name") || "" };
    element.querySelectorAll("attribute").forEach((attribute) => {
      const key = attribute.getAttribute("key");
      if (key) values[key.toLowerCase()] = attribute.getAttribute("value") || "";
    });
    result.set(id, values);
  });
  return result;
}

function numberValue(values: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(values[key.toLowerCase()]);
    if (Number.isFinite(value)) return value;
  }
}

export function parseServerItems(otb: ArrayBuffer, xml: string, things: Thing[]): ServerItem[] {
  const root = tree(otb);
  const names = xmlData(xml);
  const byClientId = new Map(things.map((thing) => [thing.id, thing]));
  const decoder = new TextDecoder("windows-1252");
  const result: ServerItem[] = [];

  for (const node of root.children) {
    const data = node.props;
    if (data.length < 4) continue;
    const mask = u32(data, 0);
    let sid = 0, clientId = 0, name = "", slot: string | undefined;
    let attack: number | undefined, armor: number | undefined, defense: number | undefined;
    for (let offset = 4; offset + 3 <= data.length;) {
      const attribute = data[offset++];
      const length = u16(data, offset); offset += 2;
      if (offset + length > data.length) break;
      if (attribute === 0x10 && length >= 2) sid = u16(data, offset);
      else if (attribute === 0x11 && length >= 2) clientId = u16(data, offset);
      else if (attribute === 0x12) name = decoder.decode(new Uint8Array(data.slice(offset, offset + length)));
      else if (attribute === 0x15 && length >= 2) slot = SLOT_NAMES[u16(data, offset)] || `Slot ${u16(data, offset)}`;
      else if (attribute === 0x1a && length >= 2) armor = u16(data, offset);
      else if (attribute === 0x26 && length >= 5) { attack = data[offset + 3]; defense = data[offset + 4]; }
      else if (attribute === 0x27 && length >= 3) attack = data[offset + 2];
      else if (attribute === 0x28 && length >= 12) { armor = u16(data, offset); slot = SLOT_NAMES[u16(data, offset + 10)] || slot; }
      offset += length;
    }
    if (!sid || !clientId) continue;
    const xmlItem = names.get(sid) || {};
    const abilityParts = Object.entries(xmlItem)
      .filter(([key, value]) => value && (key.startsWith("skill") || ["magiclevelpoints", "absorbpercentall", "speed"].includes(key)))
      .map(([key, value]) => `${key}: ${value}`);
    result.push({
      sid, clientId, group: node.type, thing: byClientId.get(clientId), name: xmlItem.name || name || `Item ${sid}`,
      slot: xmlItem.slottype || slot,
      attack: numberValue(xmlItem, "attack") ?? attack,
      armor: numberValue(xmlItem, "armor") ?? armor,
      defense: numberValue(xmlItem, "defense", "defence") ?? defense,
      charges: numberValue(xmlItem, "charges"), ability: abilityParts.join(" · ") || undefined,
      flags: Object.fromEntries([...FLAG_LABELS.map(([bit, label]) => [label, Boolean(mask & bit)]), ["Permite olhar através", !(mask & 1)], ["Cargas", Boolean(numberValue(xmlItem, "charges"))]]),
    });
  }
  return result.sort((a, b) => a.sid - b.sid);
}

export const SERVER_FLAG_LABELS = [...FLAG_LABELS.map(([, label]) => label), "Permite olhar através", "Cargas"];
