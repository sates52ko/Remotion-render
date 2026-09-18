import React from "react";
import { AbsoluteFill } from "remotion";
import { Everyman } from "./characters/Everyman";
import { ANTIDOTE_FONT } from "./components/KineticText";
import type { Pose } from "./movements";
import type { VariantSpec } from "./schema";

/**
 * CastSheet — a living reference of what the Character Foundry can build.
 *
 * One parametric rig, recombined: garment · headwear · hair · beard · accessory
 * · build · height · head-to-body ratio. Each column below is a person the
 * casting director (`scripts/lib/antidote-costume.js`) can actually draw from
 * one of its wardrobe WORLDS, so this doubles as the visual contract for that
 * module — add a wardrobe part, add a cell here, and a regression is visible at
 * a glance instead of eleven books later.
 *
 * Dev-only composition (`Antidote-cast-sheet`); not part of any book.
 */
const STILL: Pose = { lean: 0, armL: 8, armR: -8, mouth: 0, browY: 0, headY: 0, blink: 0, gazeX: 0 };

type Cell = { label: string; world: string; v: Partial<VariantSpec> };
const D: VariantSpec = {
  skin: "#F2C79B", hair: "#3A2A22", suit: "#4E6E8E", shirt: "#FFFFFF", expression: "neutral",
  hairStyle: "short", glasses: false, beard: "none", gender: "m", age: "adult", outfit: "suit",
  headwear: "none", accessory: "none", build: "average", height: 1, headScale: 1, overlay: [],
};

const CELLS: Cell[] = [
  { label: "office · exec", world: "office", v: { outfit: "suit", accessory: "tie", hairStyle: "receding", suit: "#2E3A59", glasses: true } },
  { label: "modern · student", world: "modern", v: { outfit: "hoodie", headwear: "beanie", hairStyle: "curly", suit: "#3E8E7E", age: "young", height: 0.96, accessory: "satchel" } },
  { label: "modern · child", world: "modern", v: { outfit: "casual", hairStyle: "pigtails", gender: "f", age: "child", height: 0.74, headScale: 1.2, build: "slight", suit: "#C56B7A", hair: "#5A3A28" } },
  { label: "1920s · gentleman", world: "jazzAge", v: { outfit: "coat", headwear: "fedora", accessory: "bowtie", beard: "mustache", suit: "#5A4632", trim: "#2C2620" } },
  { label: "1920s · woman", world: "jazzAge", v: { outfit: "dress", headwear: "bonnet", gender: "f", hairStyle: "bun", accessory: "necklace", suit: "#8A5570", height: 0.97 } },
  { label: "victorian · top hat", world: "victorian", v: { outfit: "vest", headwear: "topHat", accessory: "collar", beard: "muttonchops", suit: "#3A3F4A", build: "heavy" } },
  { label: "victorian · maid", world: "victorian", v: { outfit: "apron", headwear: "headscarf", gender: "f", hairStyle: "braids", suit: "#6E6A5E", shirt: "#F3EFE6", height: 0.95 } },
  { label: "medieval · knight", world: "medieval", v: { outfit: "armor", headwear: "helmet", suit: "#7E838C", build: "heavy", height: 1.06, trim: "#8C919A" } },
  { label: "medieval · king", world: "medieval", v: { outfit: "cloak", headwear: "crown", beard: "full", age: "old", suit: "#6B2F44", trim: "#C99A48", hair: "#B9B2A6" } },
  { label: "medieval · beggar", world: "medieval", v: { outfit: "rags", headwear: "hood", hairStyle: "messy", suit: "#6A5E4E", build: "slight", height: 0.94 } },
  { label: "war · soldier", world: "military", v: { outfit: "uniform", headwear: "cap", accessory: "badge", hairStyle: "buzz", suit: "#4A5A44", skin: "#A96C42" } },
  { label: "farm · overalls", world: "rural", v: { outfit: "overalls", headwear: "cowboy", accessory: "suspenders", beard: "stubble", suit: "#4E6E8E", skin: "#8A5430" } },
  { label: "regime · hooded", world: "dystopian", v: { outfit: "robe", headwear: "hood", gender: "f", suit: "#8C3A32", trim: "#5E241E", height: 0.98 } },
  { label: "academic · sage", world: "academic", v: { outfit: "robe", hairStyle: "bald", beard: "full", glasses: true, age: "old", suit: "#8A7A5E", skin: "#E7B489", build: "slight" } },
];

const COLS = 7;
const CELL_W = 1920 / COLS;

export const CastSheet: React.FC = () => (
  <AbsoluteFill style={{ background: "#F4EFE6", fontFamily: ANTIDOTE_FONT }}>
    <div style={{ position: "absolute", top: 18, left: 0, width: 1920, textAlign: "center", fontSize: 40, fontWeight: 800, color: "#1D3B57" }}>
      Antidote — the Character Foundry (one rig, cast per book)
    </div>
    {CELLS.map((c, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cx = col * CELL_W + CELL_W / 2;
      const top = 86 + row * 486;
      return (
        <React.Fragment key={i}>
          {/* feet land on a shared baseline so height differences actually read */}
          <div style={{ position: "absolute", left: cx, top: top + 392, transform: "translate(-50%,-100%)" }}>
            <Everyman variant={{ ...D, ...c.v }} pose={STILL} body="full" width={172} />
          </div>
          <div style={{ position: "absolute", left: cx - CELL_W / 2, top: top + 396, width: CELL_W, textAlign: "center", fontSize: 24, fontWeight: 800, color: "#3A4A57" }}>
            {c.label}
          </div>
          <div style={{ position: "absolute", left: cx - CELL_W / 2, top: top + 424, width: CELL_W, textAlign: "center", fontSize: 18, fontWeight: 600, color: "#8A8578" }}>
            {c.world}
          </div>
        </React.Fragment>
      );
    })}
  </AbsoluteFill>
);
