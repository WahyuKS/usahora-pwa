// PUBLIC key used to verify license codes (Ed25519, base64url, 32 bytes).
// Only the public key lives in the app. The private key stays with the seller
// (tools/license-sign/keys/private.pem, git-ignored). Print it with: node tools/license-sign/sign.js pubkey
export const LICENSE_PUBLIC_KEY = "7p4IiiVLDskwj4GIpl-s1tj9WgCHGF--LuS6KrRSrLY";
