export type CreatureLook = { type: number; head: number; body: number; legs: number; feet: number };
export type NpcEntry = { name: string; x: number; y: number; z: number; look?: CreatureLook };
export type MonsterAttack = { type: string; min: number; max: number };
export type MonsterEntry = {
  name: string; health: number; experience: number; armor: number; defense: number;
  damageMin: number; damageMax: number; attacks: MonsterAttack[]; source: string; look?: CreatureLook;
};

function xml(file: File) {
  return file.text().then((text) => {
    const document = new DOMParser().parseFromString(text, "application/xml");
    if (document.querySelector("parsererror")) throw new Error(`XML inválido: ${file.name}`);
    return document;
  });
}

const value = (element: Element, attribute: string) => Number(element.getAttribute(attribute)) || 0;
const look = (document: Document): CreatureLook | undefined => {
  const element = document.querySelector("look");
  if (!element || !value(element, "type")) return undefined;
  return { type: value(element, "type"), head: value(element, "head"), body: value(element, "body"), legs: value(element, "legs"), feet: value(element, "feet") };
};

export async function parseNpcs(spawnFile: File, npcFiles: File[]): Promise<NpcEntry[]> {
  const spawnDocument = await xml(spawnFile);
  if (spawnDocument.documentElement.tagName.toLowerCase() !== "spawns") throw new Error("Selecione o arquivo de spawn do mundo.");
  const looks = new Map<string, CreatureLook>();
  await Promise.all(npcFiles.map(async (file) => {
    const document = await xml(file);
    if (document.documentElement.tagName.toLowerCase() !== "npc") return;
    const npcLook = look(document);
    const name = document.documentElement.getAttribute("name");
    if (!npcLook) return;
    const fileName = file.name.replace(/\.xml$/i, "").toLocaleLowerCase("pt-BR");
    looks.set(fileName, npcLook);
    if (name) looks.set(name.toLocaleLowerCase("pt-BR"), npcLook);
  }));
  const entries: NpcEntry[] = [];
  spawnDocument.querySelectorAll("spawn").forEach((spawn) => {
    const centerX = value(spawn, "centerx"), centerY = value(spawn, "centery"), centerZ = value(spawn, "centerz");
    spawn.querySelectorAll(":scope > npc").forEach((npc) => {
      const name = npc.getAttribute("name") || "NPC sem nome";
      entries.push({ name, x: centerX + value(npc, "x"), y: centerY + value(npc, "y"), z: npc.hasAttribute("z") ? value(npc, "z") : centerZ, look: looks.get(name.toLocaleLowerCase("pt-BR")) });
    });
  });
  return entries.sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.z - b.z || a.x - b.x || a.y - b.y);
}

export async function parseMonsters(files: File[]): Promise<MonsterEntry[]> {
  const monsters: MonsterEntry[] = [];
  await Promise.all(files.map(async (file) => {
    const document = await xml(file);
    const root = document.documentElement;
    if (root.tagName.toLowerCase() !== "monster") return;
    const health = document.querySelector("health");
    const attacks = [...document.querySelectorAll("attacks > attack")].map((attack) => ({
      type: attack.getAttribute("name") || attack.getAttribute("type") || "ataque",
      min: Math.abs(value(attack, "mindamage") || value(attack, "min")),
      max: Math.abs(value(attack, "maxdamage") || value(attack, "max")),
    }));
    monsters.push({
      name: root.getAttribute("name") || file.name.replace(/\.xml$/i, ""),
      health: health ? value(health, "max") || value(health, "now") : 0,
      experience: value(root, "experience"), armor: value(root, "armor"), defense: value(root, "defense"),
      damageMin: attacks.length ? Math.min(...attacks.map((attack) => attack.min)) : 0,
      damageMax: attacks.length ? Math.max(...attacks.map((attack) => attack.max)) : 0,
      attacks, source: file.webkitRelativePath || file.name, look: look(document),
    });
  }));
  return monsters.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
