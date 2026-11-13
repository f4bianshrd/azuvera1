import { describe, expect, it } from "vitest";
import { addMonthsClamped, computeStatuses, instructionKpis, topicStatus, type DueRecord, type DueTopic } from "./due";

const topic = (p: Partial<DueTopic> = {}): DueTopic => ({ id: "t", interval_months: 12, is_optional: false, is_active: true, ...p });
const rec = (given_on: string, status = "confirmed", id = given_on): DueRecord => ({ id, topic_id: "t", given_on, status });

describe("Fälligkeit der Unterweisungen (B1, Abschnitt 2)", () => {
  it("Nachweis 10.01.2026, Intervall 12, volljährig: fällig am 10.01.2027 mit 14 Tagen Vorlauf", () => {
    const r = [rec("2026-01-10")];
    expect(topicStatus(topic(), r, null, "2026-12-26")).toMatchObject({ due_on: "2027-01-10", state: "valid" });
    expect(topicStatus(topic(), r, null, "2026-12-27")?.state).toBe("due_soon");
    expect(topicStatus(topic(), r, null, "2027-01-10")?.state).toBe("due_soon");
    expect(topicStatus(topic(), r, null, "2027-01-11")?.state).toBe("overdue");
  });

  it("unter 18 am Tag des Nachweises: höchstens 6 Monate", () => {
    const s = topicStatus(topic(), [rec("2026-03-01")], "2008-05-15", "2026-04-01");
    expect(s).toMatchObject({ effective_months: 6, due_on: "2026-09-01" });
  });

  it("31.08.2026 plus 6 Monate ergibt das Monatsende 28.02.2027", () => {
    expect(addMonthsClamped("2026-08-31", 6)).toBe("2027-02-28");
    expect(topicStatus(topic({ interval_months: 6 }), [rec("2026-08-31")], null, "2026-09-01")?.due_on).toBe("2027-02-28");
  });

  it("zählt den jüngsten Nachweis", () => {
    expect(topicStatus(topic(), [rec("2026-01-10"), rec("2026-03-20", "submitted")], null, "2026-04-01")?.last_given_on).toBe("2026-03-20");
  });

  it("Entwürfe und zurückgewiesene Nachweise zählen nicht", () => {
    expect(topicStatus(topic(), [rec("2026-01-10", "draft"), rec("2026-02-10", "rejected")], null, "2026-04-01")?.state).toBe("open");
    expect(topicStatus(topic({ is_optional: true }), [rec("2026-01-10", "draft")], null, "2026-04-01")?.state).toBe("optional");
  });

  it("ohne Intervall: valid und ohne Fälligkeit", () => {
    expect(topicStatus(topic({ interval_months: null }), [rec("2020-01-01")], null, "2026-04-01")).toMatchObject({ state: "valid", due_on: null });
  });

  it("inaktive Themen erscheinen nur mit Nachweis", () => {
    expect(computeStatuses([topic({ is_active: false })], [], null, "2026-04-01")).toHaveLength(0);
    expect(computeStatuses([topic({ is_active: false })], [rec("2026-01-10")], null, "2026-04-01")).toHaveLength(1);
  });

  it("Kennzahlen: Themen 'Je nach Betrieb' zählen erst mit Nachweis", () => {
    const topics = [topic({ id: "a" }), topic({ id: "b" }), topic({ id: "c", is_optional: true })];
    const none = instructionKpis(computeStatuses(topics, [], null, "2026-04-01"));
    expect(none).toMatchObject({ done: 0, total: 2, open: 2 });
    const withOptional = instructionKpis(computeStatuses(topics, [{ id: "1", topic_id: "c", given_on: "2026-04-01", status: "submitted" }], null, "2026-04-01"));
    expect(withOptional).toMatchObject({ done: 1, total: 3, open: 2 });
  });
});
