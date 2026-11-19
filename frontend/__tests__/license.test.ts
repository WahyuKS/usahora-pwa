/// <reference types="jest" />
// License codes and trial. Uses a throwaway key pair: no valid production license is ever in the repo.
// @ts-ignore -- Node built-in, test only
import { generateKeyPairSync, sign } from "crypto";

import { LICENSE_PUBLIC_KEY } from "@/src/license/public-key";
import { TRIAL_DAYS, trialState } from "@/src/license/state";
import { fromB64url, verifyLicense } from "@/src/license/verify";

declare const Buffer: any; // Node global (tests run in Node)

const b64url = (b: any) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const PUB = b64url(publicKey.export({ format: "der", type: "spki" }).subarray(-32));
const issue = (payload: object, key = privateKey) => {
  const body = Buffer.from(JSON.stringify(payload));
  return `USAHORA-${b64url(body)}.${b64url(sign(null, body, key))}`;
};
const DEV = "ABCD-EFGH-JKMN";
const good = { p: "usahora", v: 2, id: "AB12CD34", name: "Toko Maju Jaya", device: DEV, edition: "lifetime", issued: "2026-11-19" };

describe("license code verification", () => {
  it("accepts a code signed by the matching key (same format as tools/license-sign/sign.js)", () => {
    const r = verifyLicense(issue(good), DEV, PUB);
    expect(r).toEqual({ ok: true, payload: good });
  });

  it("accepts names with non-ASCII characters", () => {
    const r = verifyLicense(issue({ ...good, name: "Warung Bu Siti — Café Ñ" }), DEV, PUB);
    expect(r.ok && r.payload.name).toBe("Warung Bu Siti — Café Ñ");
  });

  it("tolerates spaces, line breaks and a lower-case prefix from copy-paste", () => {
    const code = issue(good);
    const messy = ` usahora-${code.slice(8, 40)}\n${code.slice(40)}  `;
    expect(verifyLicense(messy, DEV, PUB).ok).toBe(true);
  });

  it("rejects a tampered payload (e.g. changed name)", () => {
    const code = issue(good);
    const [body, sig] = code.slice(8).split(".");
    const forged = b64url(Buffer.from(JSON.stringify({ ...good, name: "Orang Lain" })));
    expect(verifyLicense(`USAHORA-${forged}.${sig}`, DEV, PUB).ok).toBe(false);
    expect(body).not.toBe(forged);
  });

  it("rejects a code signed with another key", () => {
    const other = generateKeyPairSync("ed25519").privateKey;
    expect(verifyLicense(issue(good, other), DEV, PUB)).toEqual({ ok: false, error: "Kode lisensi tidak valid." });
  });

  it("rejects a validly signed payload that is not a USAHORA license", () => {
    expect(verifyLicense(issue({ ...good, p: "lain" }), DEV, PUB).ok).toBe(false);
  });

  it("rejects garbage with a clear message and never throws", () => {
    for (const bad of ["", "halo", "USAHORA-", "USAHORA-abc", "USAHORA-a.b", "USAHORA-!!!.###"]) {
      const r = verifyLicense(bad, DEV, PUB);
      expect(r.ok).toBe(false);
    }
  });

  it("the bundled production public key is a valid 32-byte key", () => {
    expect(fromB64url(LICENSE_PUBLIC_KEY)).toHaveLength(32);
  });
});

describe("license is bound to one device", () => {
  it("is rejected on another device, with the device IDs in the message", () => {
    const r = verifyLicense(issue(good), "ZZZZ-YYYY-XXXX", PUB);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("ABCD-EFGH-JKMN");
  });

  it("an old code without a device ID is rejected (e.g. codes issued before device binding)", () => {
    const { device: _d, ...old } = good;
    const r = verifyLicense(issue({ ...old, v: 1 }), DEV, PUB);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("tanpa ID perangkat");
  });

  it("the device ID cannot be swapped without breaking the signature", () => {
    const code = issue(good);
    const [, sig] = code.slice(8).split(".");
    const forged = b64url(Buffer.from(JSON.stringify({ ...good, device: "ZZZZ-YYYY-XXXX" })));
    expect(verifyLicense(`USAHORA-${forged}.${sig}`, "ZZZZ-YYYY-XXXX", PUB).ok).toBe(false);
  });
});

describe("device ID", () => {
  it("is created once, readable, and stays the same", async () => {
    jest.resetModules();
    jest.doMock("expo-crypto", () => ({ randomUUID: () => require("crypto").randomUUID() }));
    const { getDeviceId, isDeviceId, __resetDeviceIdCache } = require("@/src/license/device");
    const a = await getDeviceId();
    expect(isDeviceId(a)).toBe(true);
    expect(a).not.toMatch(/[01ILOU]/);
    __resetDeviceIdCache();
    expect(await getDeviceId()).toBe(a); // read back from storage
  });

  it("normalises what a buyer types", () => {
    const { normaliseDeviceId } = require("@/src/license/device");
    expect(normaliseDeviceId(" abcd efgh-jkmn ")).toBe("ABCD-EFGH-JKMN");
  });
});

describe("trial", () => {
  const DAY = 86_400_000;
  const start = Date.UTC(2026, 10, 1);

  it(`lasts ${TRIAL_DAYS} days`, () => {
    expect(trialState(start, start, start).daysLeft).toBe(TRIAL_DAYS);
    expect(trialState(start, start, start + 13.5 * DAY)).toMatchObject({ daysLeft: 1, expired: false });
    expect(trialState(start, start, start + TRIAL_DAYS * DAY).expired).toBe(true);
  });

  it("turning the device clock back does not extend the trial", () => {
    const lastSeen = start + 15 * DAY; // app was opened on day 15 (expired)
    expect(trialState(start, lastSeen, start + 2 * DAY).expired).toBe(true);
  });
});
