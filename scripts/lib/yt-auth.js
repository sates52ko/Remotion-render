/**
 * yt-auth.js — read-only OAuth for the channel's YouTube Data + Analytics APIs (2026-11-11).
 *
 * The OAuth client file and the token live OUTSIDE every checkout: %USERPROFILE%/.yt-analytics (override: YT_ANALYTICS_DIR).
 * No worktree, bundle or commit can ever carry them. Scopes are read-only; nothing here can upload or change the channel.
 * No dependency: Node's fetch + http (desktop loopback flow with PKCE). Secrets and tokens are never printed.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { spawn } = require("child_process");

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

function storeDir() {
  return path.resolve(process.env.YT_ANALYTICS_DIR || path.join(os.homedir(), ".yt-analytics"));
}

/** A credential directory inside a checkout could be committed or bundled: refuse it. */
function isInside(child, parent) {
  const r = path.relative(path.resolve(parent), path.resolve(child));
  return r === "" || (!r.startsWith("..") && !path.isAbsolute(r));
}
function assertOutsideRepo(dir, repoRoot) {
  if (isInside(dir, repoRoot)) throw new Error(`credential directory must be outside the checkout: ${dir}`);
  let d = path.resolve(dir);
  for (;;) {
    if (fs.existsSync(path.join(d, ".git"))) throw new Error(`credential directory is inside a git checkout: ${d}`);
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return dir;
}

function loadClient(dir = storeDir()) {
  const file = fs.readdirSync(dir).find((f) => /^client_secret.*\.json$/.test(f));
  if (!file) throw new Error(`no client_secret*.json in ${dir}`);
  const j = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  const c = j.installed;
  if (!c || !c.client_id || !c.client_secret) throw new Error(`${file}: not a "Desktop app" OAuth client (no "installed" block)`);
  return { clientId: c.client_id, clientSecret: c.client_secret, authUri: c.auth_uri, tokenUri: c.token_uri };
}

const tokenPath = (dir = storeDir()) => path.join(dir, "token.json");
const readToken = (dir) => { try { return JSON.parse(fs.readFileSync(tokenPath(dir), "utf8")); } catch { return null; } };
function writeToken(tok, dir) {
  fs.writeFileSync(tokenPath(dir), JSON.stringify(tok, null, 2), { mode: 0o600 });
}

async function tokenRequest(client, body) {
  const res = await fetch(client.tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: client.clientId, client_secret: client.clientSecret, ...body }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`token endpoint ${res.status}: ${j.error || "error"} ${j.error_description || ""}`.trim());
  return j;
}

/** One-time consent in the operator's own browser. Resolves when token.json is written. */
async function authorize({ dir = storeDir(), open = true, log = console.log } = {}) {
  const client = loadClient(dir);
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("hex");

  const { code, redirectUri } = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, "http://127.0.0.1");
      if (!u.searchParams.has("code") && !u.searchParams.has("error")) { res.writeHead(404).end(); return; }
      const ok = u.searchParams.get("state") === state && u.searchParams.get("code");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(ok ? "<h3>Done. You can close this tab.</h3>" : "<h3>Authorization failed. Return to the terminal.</h3>");
      server.close();
      if (ok) resolve({ code: u.searchParams.get("code"), redirectUri: server.redirectUri });
      else reject(new Error(`authorization failed: ${u.searchParams.get("error") || "state mismatch"}`));
    });
    server.listen(0, "127.0.0.1", () => {
      server.redirectUri = `http://127.0.0.1:${server.address().port}`;
      const url = `${client.authUri}?${new URLSearchParams({
        client_id: client.clientId, redirect_uri: server.redirectUri, response_type: "code", scope: SCOPES.join(" "),
        access_type: "offline", prompt: "consent", state, code_challenge: challenge, code_challenge_method: "S256",
      })}`;
      log("Open this address in your browser, choose the channel's account and allow read-only access:\n\n" + url + "\n");
      if (open) {
        try {
          const [cmd, args] = process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
            : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
          spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
        } catch { /* the printed address is enough */ }
      }
    });
    server.on("error", reject);
    setTimeout(() => { server.close(); reject(new Error("no answer from the browser within 10 minutes")); }, 600000).unref();
  });

  const j = await tokenRequest(client, { code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: redirectUri });
  if (!j.refresh_token) throw new Error("no refresh token returned (remove the app's access in your Google account and run auth again)");
  writeToken({ refresh_token: j.refresh_token, access_token: j.access_token, expires_at: Date.now() + (j.expires_in || 0) * 1000, scope: j.scope }, dir);
  return { scope: j.scope };
}

async function accessToken(dir = storeDir()) {
  const tok = readToken(dir);
  if (!tok || !tok.refresh_token) throw new Error("not authorized yet: run  node scripts/yt-analytics.js auth");
  if (tok.access_token && tok.expires_at - Date.now() > 60000) return tok.access_token;
  const j = await tokenRequest(loadClient(dir), { refresh_token: tok.refresh_token, grant_type: "refresh_token" });
  writeToken({ ...tok, access_token: j.access_token, expires_at: Date.now() + (j.expires_in || 0) * 1000 }, dir);
  return j.access_token;
}

/** GET a Google API as JSON. Errors carry the API's own reason, never the token. */
async function apiGet(base, params, dir) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${base}?${qs}`, { headers: { authorization: `Bearer ${await accessToken(dir)}` } });
    if (res.ok) return res.json();
    const j = await res.json().catch(() => ({}));
    const msg = (j.error && (j.error.message || j.error.status)) || res.statusText;
    if ((res.status === 429 || res.status >= 500) && attempt < 4) { await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt)); continue; }
    const err = new Error(`${new URL(base).host} ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
}

module.exports = { SCOPES, storeDir, isInside, assertOutsideRepo, loadClient, readToken, authorize, accessToken, apiGet };
