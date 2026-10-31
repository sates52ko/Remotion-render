// A renderer transport tag is not a semantic identity. Match rendered geometry,
// not an author's label; altered or unregistered payloads cannot borrow authority.
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
function signature(svg) {
  if (!svg || typeof svg.viewBox !== 'string' || !Array.isArray(svg.paths) || !svg.paths.length ||
      svg.paths.some(p => !p || typeof p.d !== 'string' || !p.d.trim())) return null;
  const box = svg.viewBox.trim().split(/[\s,]+/).map(Number);
  if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) return null;
  return JSON.stringify(stable({ viewBox: box, paths: svg.paths }));
}
function resolveSvgMotif(prop, motifs = {}) {
  if (prop.type !== 'customSvg') return { motif: prop.type };
  const key = signature(prop.customSvg);
  if (!key) return { motif: prop.type, invalid: true };
  const matches = Object.entries(motifs).filter(([, svg]) => signature(svg) === key).map(([id]) => id);
  return { motif: matches.length === 1 ? matches[0] : prop.type, registered: matches.length === 1 };
}
module.exports = { signature, resolveSvgMotif };
