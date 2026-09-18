#!/usr/bin/env node
/**
 * dl-render.js — download a finished Lambda render MP4 from the Remotion S3 bucket.
 * Usage: node scripts/dl-render.js <renderId> <s3key> <localPath>
 *   e.g. node scripts/dl-render.js pzf57vdkic sway-seg1.mp4 out/sway-segments/seg1.mp4
 * Reads REMOTION_AWS_* creds from .env.
 */
const fs = require("fs");
const path = require("path");
require("dotenv").config();
let S3Client, GetObjectCommand;
try {
  ({ S3Client, GetObjectCommand } = require("@aws-sdk/client-s3"));
} catch {
  // pnpm store fallback (not hoisted to top-level node_modules)
  const hit = require("fs").readdirSync(path.join(__dirname, "..", "node_modules", ".pnpm"))
    .find((d) => /^@aws-sdk\+client-s3@/.test(d));
  ({ S3Client, GetObjectCommand } = require(
    path.join(__dirname, "..", "node_modules", ".pnpm", hit, "node_modules", "@aws-sdk", "client-s3"),
  ));
}

const [renderId, keyName, localPath] = process.argv.slice(2);
if (!renderId || !keyName || !localPath) {
  console.error("Usage: node scripts/dl-render.js <renderId> <s3key> <localPath>");
  process.exit(1);
}
const BUCKET = process.env.REMOTION_S3_BUCKET || "remotionlambda-useast1-76dhcu3tnu";
const Key = `renders/${renderId}/${keyName}`;

const client = new S3Client({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.REMOTION_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.REMOTION_AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.REMOTION_AWS_SESSION_TOKEN || undefined,
  },
});

(async () => {
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  const { Body, ContentLength } = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key }));
  const total = Number(ContentLength || 0);
  let got = 0, lastPct = -1;
  const out = fs.createWriteStream(localPath);
  await new Promise((resolve, reject) => {
    Body.on("data", (c) => {
      got += c.length;
      const pct = total ? Math.floor((got / total) * 100) : 0;
      if (pct !== lastPct && pct % 10 === 0) { process.stdout.write(`  ${pct}% (${(got/1e6).toFixed(0)}MB)\n`); lastPct = pct; }
    });
    Body.pipe(out);
    Body.on("error", reject);
    out.on("finish", resolve);
    out.on("error", reject);
  });
  console.log(`✓ ${localPath} (${(got/1e6).toFixed(1)} MB)`);
})().catch((e) => { console.error("HATA:", e.message); process.exit(1); });
