import { describe, expect, it } from "vitest";
import { REPORT_TEXT_MAX, TOPIC_REPORT_TEXT_MAX, reportTextLimit } from "./api";

describe("Zeichenbegrenzung der Berichte", () => {
  it("Themenbericht erlaubt 150.000 Zeichen", () => {
    expect(TOPIC_REPORT_TEXT_MAX).toBe(150000);
    expect(reportTextLimit("topics")).toBe(150000);
  });

  it("Tätigkeitsbericht bleibt bei 20.000 Zeichen", () => {
    expect(REPORT_TEXT_MAX).toBe(20000);
    expect(reportTextLimit("activities")).toBe(20000);
  });
});
