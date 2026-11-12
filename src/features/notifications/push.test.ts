import { describe, expect, it } from "vitest";
import { deviceLabel } from "./push";

describe("deviceLabel", () => {
  it("iPhone · Safari", () => expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1")).toBe("iPhone · Safari"));
  it("Android · Chrome", () => expect(deviceLabel("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36")).toBe("Android · Chrome"));
  it("Windows · Edge", () => expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0")).toBe("Windows · Edge"));
  it("unbekannt → Dieses Gerät", () => expect(deviceLabel("curl/8")).toBe("Dieses Gerät"));
});
