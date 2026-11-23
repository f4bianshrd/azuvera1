import { afterEach, describe, expect, it, vi } from "vitest";
import { apiUrl, WEB_APP_ORIGIN } from "./platform";

describe("apiUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("bleibt im Browser relativ", () => {
    vi.stubEnv("VITE_NATIVE_BUILD", "false");
    expect(apiUrl("/api/report-text")).toBe("/api/report-text");
  });

  it("zeigt in der Apple-App auf den Server von get.azuvera.de", () => {
    vi.stubEnv("VITE_NATIVE_BUILD", "true");
    expect(WEB_APP_ORIGIN).toBe("https://get.azuvera.de");
    expect(apiUrl("/api/delete-account")).toBe("https://get.azuvera.de/api/delete-account");
  });
});
