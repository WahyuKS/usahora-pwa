#!/usr/bin/env node
// USAHORA license tool (for the seller only, never shipped in the app).
//
//   node tools/license-sign/sign.js init
//       Creates the signing key pair in tools/license-sign/keys/ (git-ignored) and prints the PUBLIC key
//       to put in frontend/src/license/public-key.ts. Run once. Back up private.pem somewhere safe:
//       without it you cannot issue licenses that existing app builds accept.
//
//   node tools/license-sign/sign.js issue --name "Toko Maju Jaya" [--email pembeli@mail.com] [--order SHP-123]
//       Prints a license code for one buyer. Send it to the buyer after payment.
//
//   node tools/license-sign/sign.js verify <code>
//       Checks a code against the public key (useful for support).
//
// The private key path can be overridden with USAHORA_LICENSE_KEY=/path/to/private.pem.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const KEY_DIR = path.join(__dirname, "keys");
const PRIV = process.env.USAHORA_LICENSE_KEY || path.join(KEY_DIR, "private.pem");
const PUB = path.join(KEY_DIR, "public.pem");
const PREFIX = "USAHORA-";

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const rawPublic = (key) => (key.type === "public" ? key : crypto.createPublicKey(key)).export({ format: "der", type: "spki" }).subarray(-32);

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const cmd = process.argv[2];
if (cmd === "init") {
  if (fs.existsSync(PRIV)) {
    console.error(`Kunci sudah ada: ${PRIV}\nTidak ditimpa. Hapus manual hanya jika Anda yakin (lisensi lama akan tetap valid hanya untuk build lama).`);
    process.exit(1);
  }
  fs.mkdirSync(KEY_DIR, { recursive: true });
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  fs.writeFileSync(PRIV, privateKey.export({ format: "pem", type: "pkcs8" }), { mode: 0o600 });
  fs.writeFileSync(PUB, publicKey.export({ format: "pem", type: "spki" }));
  console.log(`Kunci privat : ${PRIV}  (RAHASIA, simpan cadangannya, jangan di-commit)`);
  console.log(`Kunci publik : ${b64url(rawPublic(publicKey))}`);
  console.log("Masukkan kunci publik ke frontend/src/license/public-key.ts lalu build ulang.");
} else if (cmd === "issue") {
  const name = (arg("name") || "").trim();
  if (name.length < 2) {
    console.error('Wajib: --name "Nama pembeli / usaha"');
    process.exit(1);
  }
  if (!fs.existsSync(PRIV)) {
    console.error(`Kunci privat tidak ditemukan (${PRIV}). Jalankan "init" dulu atau set USAHORA_LICENSE_KEY.`);
    process.exit(1);
  }
  const payload = {
    p: "usahora",
    v: 1,
    id: crypto.randomUUID().slice(0, 8).toUpperCase(),
    name,
    email: arg("email") || undefined,
    order: arg("order") || undefined,
    edition: "lifetime",
    issued: new Date().toISOString().slice(0, 10),
  };
  const body = Buffer.from(JSON.stringify(payload));
  const sig = crypto.sign(null, body, crypto.createPrivateKey(fs.readFileSync(PRIV)));
  console.log(`${PREFIX}${b64url(body)}.${b64url(sig)}`);
  console.error(`(lisensi ${payload.id} untuk ${name})`);
} else if (cmd === "pubkey") {
  console.log(b64url(rawPublic(crypto.createPublicKey(fs.readFileSync(PUB)))));
} else if (cmd === "verify") {
  const code = (process.argv[3] || "").replace(/\s+/g, "");
  const [b, s] = code.slice(PREFIX.length).split(".");
  const from = (x) => Buffer.from(x.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const ok = crypto.verify(null, from(b), crypto.createPublicKey(fs.readFileSync(PUB)), from(s));
  console.log(ok ? `VALID: ${from(b).toString()}` : "TIDAK VALID");
  process.exit(ok ? 0 : 1);
} else {
  console.log("Perintah: init | pubkey | issue --name \"...\" [--email ...] [--order ...] | verify <kode>");
}
