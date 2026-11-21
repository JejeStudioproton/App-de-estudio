import { describe, expect, it } from "vitest";
import { addDays, daysBetween, daysUntil, isDueToday, localDateString, parseDay, studyDay, studyDayStart, studyDaysBetween } from "./dates";

describe("fechas por día natural", () => {
  it("valida fechas reales y rechaza inexistentes o mal formadas", () => {
    expect(parseDay("2026-02-28")).toBeDefined();
    expect(parseDay("2026-02-31")).toBeUndefined();
    expect(parseDay("2026-13-01")).toBeUndefined();
    expect(parseDay("01/02/2026")).toBeUndefined();
    expect(parseDay("")).toBeUndefined();
    expect(parseDay(undefined)).toBeUndefined();
  });
  it("reconoce el 29 de febrero solo en años bisiestos", () => {
    expect(parseDay("2028-02-29")).toBeDefined();
    expect(parseDay("2027-02-29")).toBeUndefined();
  });
  it("calcula diferencias de días sin errores por cambio de hora", () => {
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2); // cambio de hora de primavera en Europa
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2); // cambio de hora de otoño
    expect(daysBetween("2026-03-10", "2026-03-01")).toBe(-9);
    expect(daysBetween("mal", "2026-03-01")).toBeUndefined();
  });
  it("suma días cruzando meses y años", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
  });
  it("daysUntil: 0 el mismo día, sin importar la hora, y undefined sin fecha", () => {
    const morning = new Date(2026, 5, 10, 8, 0, 0);
    const night = new Date(2026, 5, 10, 23, 30, 0);
    expect(daysUntil("2026-06-10", morning)).toBe(0);
    expect(daysUntil("2026-06-10", night)).toBe(0);
    expect(daysUntil("2026-06-11", night)).toBe(1);
    expect(daysUntil("2026-06-09", morning)).toBe(-1);
    expect(daysUntil(undefined, morning)).toBeUndefined();
    expect(daysUntil("no-fecha", morning)).toBeUndefined();
  });
  it("localDateString usa la fecha local", () => {
    expect(localDateString(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("día de estudio", () => {
  const local = (d: number, h: number, min = 0) => new Date(2026, 2, d, h, min, 0);

  it("la madrugada pertenece al día anterior", () => {
    expect(studyDay(local(10, 3, 59))).toBe("2026-03-09");
    expect(studyDay(local(10, 4))).toBe("2026-03-10");
    expect(studyDay(local(10, 23, 59))).toBe("2026-03-10");
  });

  it("calcula el comienzo del día de estudio y de los siguientes", () => {
    const start = studyDayStart(local(10, 18));
    expect([localDateString(start), start.getHours(), start.getMinutes()]).toEqual(["2026-03-10", 4, 0]);
    expect(localDateString(studyDayStart(local(10, 2)))).toBe("2026-03-09");
    expect(localDateString(studyDayStart(local(10, 18), 3))).toBe("2026-03-13");
    // Cambia de mes sin problema.
    expect(localDateString(studyDayStart(local(30, 18), 3))).toBe("2026-04-02");
  });

  it("decide si un repaso toca hoy", () => {
    const now = local(10, 9).getTime();
    expect(isDueToday(local(10, 22).toISOString(), now)).toBe(true);
    expect(isDueToday(local(1, 9).toISOString(), now)).toBe(true);
    expect(isDueToday(local(11, 3).toISOString(), now)).toBe(true); // madrugada: sigue siendo el día 10
    expect(isDueToday(local(11, 4).toISOString(), now)).toBe(false);
    expect(isDueToday("basura", now)).toBe(false);
  });

  it("cuenta días de estudio entre dos instantes", () => {
    expect(studyDaysBetween(local(10, 9), local(10, 23))).toBe(0);
    expect(studyDaysBetween(local(10, 23), local(11, 2))).toBe(0);
    expect(studyDaysBetween(local(10, 23), local(11, 5))).toBe(1);
    expect(studyDaysBetween(local(10, 9), local(17, 9))).toBe(7);
  });
});

