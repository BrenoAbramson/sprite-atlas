"use client";

import { useEffect, useRef, useState } from "react";
import type { Thing } from "../lib/tibia";
import { decodeSprite } from "../lib/tibia";

type Props = { spr: ArrayBuffer; offsets: Uint32Array; spriteId?: number; thing?: Thing; scale: number; animate?: boolean };

function spriteIndex(thing: Thing, w: number, h: number, layer: number, x: number, y: number, z: number, phase: number) {
  return ((((((phase % thing.phases) * thing.patternZ + z) * thing.patternY + y) * thing.patternX + x) * thing.layers + layer) * thing.height + h) * thing.width + w;
}

export function SpriteCanvas({ spr, offsets, spriteId, thing, scale, animate = false }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState(0);
  const width = thing ? Math.max(1, thing.width) : 1;
  const height = thing ? Math.max(1, thing.height) : 1;

  useEffect(() => {
    setFrame(0);
    if (!animate || !thing || thing.phases <= 1 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const delay = thing.category === "effects" ? 120 : 180;
    const timer = window.setInterval(() => setFrame((value) => (value + 1) % thing.phases), delay);
    return () => window.clearInterval(timer);
  }, [animate, thing]);

  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const xPattern = thing?.category === "outfits" && thing.patternX >= 3 ? 2 : 0;
    const ids = thing
      ? Array.from({ length: width * height }, (_, index) => {
          const w = index % width;
          const h = Math.floor(index / width);
          return thing.sprites[spriteIndex(thing, w, h, 0, xPattern, 0, 0, frame)] || 0;
        })
      : [spriteId || 0];
    ids.forEach((id, index) => {
      const image = decodeSprite(spr, offsets, id); if (!image) return;
      const temp = document.createElement("canvas"); temp.width = 32; temp.height = 32;
      temp.getContext("2d")?.putImageData(image, 0, 0);
      const x = width - 1 - (index % width);
      const y = height - 1 - Math.floor(index / width);
      ctx.drawImage(temp, x * 32 * scale, y * 32 * scale, 32 * scale, 32 * scale);
    });
  }, [spr, offsets, spriteId, thing, scale, width, height, frame]);

  return <canvas ref={ref} width={width * 32 * scale} height={height * 32 * scale} aria-label={thing ? `Objeto ${thing.id}` : `Sprite ${spriteId}`} />;
}
