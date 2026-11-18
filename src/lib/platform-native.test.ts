import { describe, expect, it } from "vitest";
import { getPlatformId } from "./platform";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
const IPAD_OLD = "Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";

describe("getPlatformId", () => {
  it("iPhone ist ios", () =>
    expect(getPlatformId({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe("ios"));
  it("iPad mit eigener Kennung ist ipados", () =>
    expect(getPlatformId({ userAgent: IPAD_OLD, maxTouchPoints: 5 })).toBe("ipados"));
  it("iPadOS mit Mac-Kennung und Touch ist ipados", () =>
    expect(getPlatformId({ userAgent: MAC, platform: "MacIntel", maxTouchPoints: 5 })).toBe(
      "ipados",
    ));
  it("Mac ohne bekannte Prozessorart ist macos_universal", () =>
    expect(getPlatformId({ userAgent: MAC, platform: "MacIntel", maxTouchPoints: 0 })).toBe(
      "macos_universal",
    ));
  it("Mac mit arm64 ist macos_arm", () =>
    expect(getPlatformId({ userAgent: MAC, arch: "arm64" })).toBe("macos_arm"));
  it("Mac mit x86_64 ist macos_intel", () =>
    expect(getPlatformId({ userAgent: MAC, arch: "x86_64" })).toBe("macos_intel"));
  it("alles andere ist ios", () =>
    expect(getPlatformId({ userAgent: "Mozilla/5.0 (Linux; Android 14)" })).toBe("ios"));
});
