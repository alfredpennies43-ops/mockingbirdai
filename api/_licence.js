// Shared licence-key signing. Keys look like: MB1-<base64url(json)>.<base64url(ed25519 signature)>
// The app verifies them offline with the matching public key.
import { createPrivateKey, sign } from "node:crypto";

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

function privateKeyFromSeed(b64) {
  const seed = Buffer.from((b64 || "").trim(), "base64");
  if (seed.length !== 32) throw new Error("LICENSE_PRIVATE_KEY must be the 32-byte base64 key from secrets/LICENSE_PRIVATE_KEY.txt");
  return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: "der", type: "pkcs8" });
}

const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function makeLicence({ email, name, order, issuedAt = new Date() }, seedB64 = process.env.LICENSE_PRIVATE_KEY) {
  const payload = { p: "mockingbird-mac", e: email, o: order, t: Math.floor(new Date(issuedAt).getTime() / 1000) };
  if (name) payload.n = name;
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const sig = sign(null, body, privateKeyFromSeed(seedB64));
  return `MB1-${b64url(body)}.${b64url(sig)}`;
}

export function licenceEmail({ name, key }) {
  const hi = name ? `Hi ${name.split(" ")[0]},` : "Hi,";
  const text = `${hi}

Thanks for buying Mockingbird. Here is your licence key:

${key}

To activate: open Mockingbird → Settings → Licence (or click "Buy or enter licence"), paste the key and press Activate.
You can use it on up to 3 of your Macs. Keep this email — you'll need the key if you reinstall.

Download: https://mockingbird.ai/#download
Questions: reply to this email or write to hello@mockingbird.ai

— Mockingbird`;
  const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;margin:auto;color:#111">
<p>${hi}</p><p>Thanks for buying <b>Mockingbird</b>. Here is your licence key:</p>
<pre style="white-space:pre-wrap;word-break:break-all;background:#f4f1f8;border:1px solid #e3dcef;border-radius:10px;padding:14px;font-size:13px">${key}</pre>
<p><b>To activate:</b> open Mockingbird → Settings → Licence, paste the key and press <i>Activate</i>.</p>
<p>You can use it on up to 3 of your Macs. Keep this email — you'll need the key if you reinstall.</p>
<p><a href="https://mockingbird.ai/#download" style="color:#ff2d78">Download Mockingbird</a> · Questions? Reply to this email.</p>
<p style="color:#888">— Mockingbird</p></div>`;
  return { text, html };
}
