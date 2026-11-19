/// <reference types="jest" />
// "Simpan cadangan" in plain language: share sheet on phones, download on laptops, cancel is not a backup.
jest.mock("expo-crypto", () => ({ randomUUID: () => require("crypto").randomUUID() }));
const mockShareText = jest.fn(async () => {});
jest.mock("@/src/lib/export", () => ({ shareText: (...a: any[]) => (mockShareText as any)(...a) }));

import { Platform } from "react-native";

import { backupFilename, backupMessage, exportBackupNow } from "@/src/data/backup-export";
import { getState, loadDB, unloadDB } from "@/src/data/store";

const business = { id: "b1", name: "Toko Maju Jaya!" };
const originalOS = Platform.OS;
const setNavigator = (ua: string, share?: jest.Mock) =>
  ((globalThis as any).navigator = { userAgent: ua, canShare: share ? () => true : undefined, share });

beforeEach(async () => {
  mockShareText.mockClear();
  (Platform as any).OS = "web";
  await loadDB("backup-test");
});
afterEach(() => {
  (Platform as any).OS = originalOS;
  delete (globalThis as any).navigator;
  unloadDB();
});

describe("backup file", () => {
  it("has a readable name with the business name and date", () => {
    expect(backupFilename("Toko Maju Jaya!")).toMatch(/^usahora-cadangan-toko-maju-jaya-\d{4}-\d{2}-\d{2}\.json$/);
    expect(backupFilename(undefined)).toMatch(/^usahora-cadangan-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it("phone browser: opens the share sheet (WhatsApp / Google Drive) with the file", async () => {
    const share = jest.fn(async () => {});
    setNavigator("Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile", share);
    const r = await exportBackupNow(business);
    expect(r.how).toBe("shared");
    expect(share).toHaveBeenCalledTimes(1);
    const arg = (share.mock.calls[0] as any)[0];
    expect(arg.files[0].name).toBe(r.filename);
    expect(mockShareText).not.toHaveBeenCalled();
    expect(getState().meta.lastBackupAt).toBeTruthy();
    expect(backupMessage(r)).toContain("Google Drive");
  });

  it("phone: closing the share sheet is not counted as a backup", async () => {
    const share = jest.fn(async () => { throw Object.assign(new Error("cancel"), { name: "AbortError" }); });
    setNavigator("iPhone Safari", share);
    const before = getState().meta.lastBackupAt;
    const r = await exportBackupNow(business);
    expect(r.how).toBe("cancelled");
    expect(backupMessage(r)).toBeNull();
    expect(getState().meta.lastBackupAt).toBe(before);
  });

  it("laptop: downloads to the Downloads folder and says so", async () => {
    setNavigator("Mozilla/5.0 (Windows NT 10.0) Chrome/130");
    const r = await exportBackupNow(business);
    expect(r.how).toBe("downloaded");
    expect(mockShareText).toHaveBeenCalledWith(expect.any(String), r.filename, "application/json");
    expect(backupMessage(r)).toContain("folder Download");
  });

  it("phone share failing for another reason falls back to download", async () => {
    const share = jest.fn(async () => { throw new Error("NotAllowed"); });
    setNavigator("Android Chrome", share);
    const r = await exportBackupNow(business);
    expect(r.how).toBe("downloaded");
    expect(mockShareText).toHaveBeenCalledTimes(1);
  });
});
