import { describe, expect, it } from "vitest";
import { dueLabel, todaySummary } from "./today";
import { concept, ev } from "./test-helpers";
import type { ReviewEvent } from "./domain";

/** Instante local (mes en base 1). */
const at = (d: number, h = 18, m = 3) => new Date(2026, m - 1, d, h, 0, 0);
const review = (date: Date, conceptId = "c1"): ReviewEvent => ({ ...ev({ rating: 3, conceptId }), at: date.toISOString() });

describe("resumen de hoy", () => {
  it("cuenta como pendiente lo que vence hoy aunque sea a una hora posterior", () => {
    const now = at(10, 9);
    const s = todaySummary(
      [
        concept({ id: "a", title: "esta tarde", dueAt: at(10, 21).toISOString() }),
        concept({ id: "b", title: "atrasado", dueAt: at(3).toISOString(), estimatedMinutes: 5 }),
        concept({ id: "c", title: "mañana", dueAt: at(11, 9).toISOString() }),
      ],
      [],
      now,
    );
    expect(s.due).toBe(2);
    expect(s.dueMinutes).toBe(3 + 5);
    expect(s.next).toBeUndefined();
  });

  it("sin pendientes indica cuándo es el próximo repaso y cuántos conceptos trae", () => {
    const s = todaySummary(
      [
        concept({ id: "a", title: "a", dueAt: at(13).toISOString() }),
        concept({ id: "b", title: "b", dueAt: at(13, 5).toISOString() }),
        concept({ id: "c", title: "c", dueAt: at(20).toISOString() }),
      ],
      [],
      at(10),
    );
    expect(s.due).toBe(0);
    expect(s.next).toEqual({ inDays: 3, count: 2 });
  });

  it("cuenta los repasos y los conceptos distintos de hoy", () => {
    const s = todaySummary([], [review(at(10, 8)), review(at(10, 9)), review(at(10, 10), "c2"), review(at(9, 10))], at(10, 18));
    expect(s.reviewsToday).toBe(3);
    expect(s.conceptsToday).toBe(2);
    expect(s.studiedToday).toBe(true);
  });

  it("la racha cuenta días seguidos y no se rompe por no haber estudiado todavía hoy", () => {
    const reviews = [review(at(7)), review(at(8)), review(at(9))];
    expect(todaySummary([], reviews, at(10, 9)).streak).toBe(3);
    expect(todaySummary([], [...reviews, review(at(10, 8))], at(10, 9)).streak).toBe(4);
    // Un día entero sin estudiar sí la rompe.
    expect(todaySummary([], reviews, at(11, 9)).streak).toBe(0);
    expect(todaySummary([], [], at(10)).streak).toBe(0);
  });

  it("estudiar de madrugada cuenta como el día anterior", () => {
    const late = review(at(10, 1)); // 1:00 del día 10 → día de estudio 9
    const s = todaySummary([], [late], at(9, 23));
    expect(s.reviewsToday).toBe(1);
    expect(todaySummary([], [late], at(10, 12)).reviewsToday).toBe(0);
    expect(todaySummary([], [late], at(10, 12)).streak).toBe(1);
  });

  it("la semana tiene siete días, termina hoy y marca los días estudiados", () => {
    const s = todaySummary([], [review(at(10)), review(at(8)), review(at(1))], at(10));
    expect(s.week).toHaveLength(7);
    expect(s.week[6]).toMatchObject({ day: "2026-03-10", isToday: true, studied: true, label: "M" }); // 10-03-2026 es martes
    expect(s.week.map((d) => d.studied)).toEqual([false, false, false, false, true, false, true]);
    expect(s.weekDays).toBe(2);
  });

  it("ignora repasos con fecha inválida", () => {
    const bad = { ...review(at(10)), at: "basura" };
    expect(todaySummary([], [bad], at(10)).reviewsToday).toBe(0);
  });
});

describe("etiqueta de próximo repaso", () => {
  it("usa hoy, mañana, días y meses", () => {
    const now = at(10, 18);
    expect(dueLabel(at(10, 23).toISOString(), now)).toBe("hoy");
    expect(dueLabel(at(2).toISOString(), now)).toBe("hoy");
    expect(dueLabel(at(11, 4).toISOString(), now)).toBe("mañana");
    expect(dueLabel(at(15, 4).toISOString(), now)).toBe("en 5 días");
    expect(dueLabel(new Date(2026, 5, 10, 4).toISOString(), now)).toBe("en 3 meses");
    expect(dueLabel("basura", now)).toBe("sin fecha");
  });
});
