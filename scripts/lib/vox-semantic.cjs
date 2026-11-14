/**
 * scripts/lib/vox-semantic.cjs — CommonJS shim for src/engines/vox/semantic.ts.
 * ONE TypeScript implementation; scripts (polarity lint, proposition telemetry)
 * and node tests require the same rules through here (repo's require-hook).
 */
module.exports = require("../../src/engines/vox/semantic.ts");
