// MEDIUM own-icon layout (2026-10-26, P2). On the `medium` shot the callout (1360,300), a titled own-icon (customSvg,
// 520 px box at 1380,690) and the burned-in captions all share the right-hand column: the icon's title fell under the
// captions (island 23 / 149), the box ran into the caption band (icebreaker 03), and on a two-person medium the callout
// sat on the second face (as-good-as-dead 201: "BLOOD OFF" over Ravi's eyes). A/B on those 4 real frames, blind
// readout per still: moving the callout to the existing top-centre text slot (the `split` preset's) and, with ONE
// person on screen, lifting the icon so its title sits on the camera-safe line → faces clear 4/4, objects clear 4/4,
// titles legible 3/3; shrinking the icon instead left the text on the face. With TWO people the icon stays where it
// was (lifted, it covered the second face and hid its own title).
// Only what the author did not place: a scene with any explicit text/icon position, more than one text, or no titled
// own-icon is returned unchanged. Uses existing fields only (text x/y/size, prop x/y). Pure.

const TOP_SLOT = { x: 960, y: 158, size: 82 }; // shots.ts split.text — an existing top-centre copy slot
const MEDIUM_MOTIF = { x: 1380, y: 690 }; // shots.ts medium.motif
const CAMERA_SAFE = 800; // KineticText CAPTION_SAFE_TOP: lowest line kept clear of the captions under camera zoom
const TITLE_DROP = 236; // motifs.tsx CustomSvgMotif: the title sits 236 px (×scale) below the icon's centre

const isTitledIcon = (p) => !!p && p.type === "customSvg" && !!p.customSvg && !!p.customSvg.title;

function mediumIconLayout(scene) {
  if (!scene || scene.shot !== "medium" || scene.diagram) return scene;
  const props = scene.props || [];
  const texts = scene.texts || [];
  const k = props.findIndex(isTitledIcon);
  const solo = (scene.characters || []).length <= 1;
  // the same collision without an icon: on a two-person medium the callout's slot IS the second person's face
  if ((k < 0 && solo) || texts.length !== 1) return scene;
  const icon = k >= 0 ? props[k] : {}, text = texts[0];
  if (icon.x != null || icon.y != null || text.x != null || text.y != null || text.size != null) return scene;
  if (k < 0) return { ...scene, texts: [{ ...text, ...TOP_SLOT }] };
  const scale = icon.scale || 1;
  const liftedY = Math.min(MEDIUM_MOTIF.y, CAMERA_SAFE - TITLE_DROP * scale);
  return {
    ...scene,
    texts: [{ ...text, ...TOP_SLOT }],
    props: solo ? props.map((p, i) => (i === k ? { ...p, x: MEDIUM_MOTIF.x, y: liftedY } : p)) : props,
  };
}

module.exports = { mediumIconLayout, TOP_SLOT, MEDIUM_MOTIF, CAMERA_SAFE, TITLE_DROP };
