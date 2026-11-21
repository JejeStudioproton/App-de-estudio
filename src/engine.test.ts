import { describe,it,expect } from "vitest";
import { applyReview, createConcept, createSubject, dueCount, initialState, isEarlyReview, normalizeState, planSession, scheduleReview } from "./engine";
import type { ReviewEvent } from "./domain";
import { addDays, localDateString, studyDay } from "./dates";
describe("motor de aprendizaje FORMA",()=>{
  it("normaliza datos incompletos sin romper la aplicación",()=>{const s=normalizeState({subjects:[{id:"s",name:"Mate"}],concepts:[],reviews:[]});expect(s.version).toBe(3);expect(s.subjects[0].archived).toBe(false);});
  it("programa primer repaso al día siguiente",()=>{const c=createConcept({subjectId:"s",title:"x"});const d=scheduleReview(c,3,new Date("2026-01-01T12:00:00Z"));expect(d.intervalDays).toBe(1);expect(localDateString(new Date(d.dueAt))).toBe(addDays(studyDay(new Date("2026-01-01T12:00:00Z")),1));});
  it("un recuerdo fallido vuelve a intervalo corto",()=>{const c=createConcept({subjectId:"s",title:"x",intervalDays:21,repetitions:4});const d=scheduleReview(c,0,new Date("2026-01-01T12:00:00Z"));expect(d.intervalDays).toBe(1);expect(d.lapses).toBe(1);});
  it("prioriza conceptos vencidos",()=>{const a=createConcept({subjectId:"s",title:"vencido",dueAt:"2020-01-01"});const b=createConcept({subjectId:"s",title:"futuro",dueAt:"2030-01-01"});expect(planSession([a,b],[],25,Date.parse("2026-01-01"))[0].conceptId).toBe(a.id);});
  it("cuenta solo conceptos vencidos",()=>{const a=createConcept({subjectId:"s",title:"a",dueAt:"2020-01-01"});const b=createConcept({subjectId:"s",title:"b",dueAt:"2030-01-01"});expect(dueCount([a,b],Date.parse("2026-01-01"))).toBe(1);});
  it("aplica una evaluación y registra evidencia",()=>{const subject=createSubject("Ciencias");const c=createConcept({subjectId:subject.id,title:"Célula"});const state={...initialState(),subjects:[subject],concepts:[c]};const e:ReviewEvent={id:"r1",conceptId:c.id,subjectId:subject.id,at:"2026-01-01T12:00:00Z",method:"active-recall",skill:"memory",rating:3,confidence:1,responseSeconds:20,hintUsed:false,answerQuality:.9,errorTags:[]};const next=applyReview(state,e);expect(next.reviews).toHaveLength(1);expect(next.concepts[0].memory).toBeGreaterThan(0);});
});

describe("repaso espaciado: fechas e intervalos", () => {
  const local = (d: number, h: number) => new Date(2026, 2, d, h, 0, 0);
  const reviewed = (interval: number, reps: number, last: Date) =>
    createConcept({ subjectId: "s", title: "x", intervalDays: interval, repetitions: reps, lastReviewedAt: last.toISOString(), dueAt: new Date(2026, 2, 10 + interval, 4).toISOString() });

  it("«mañana» vence al empezar el día siguiente, no a la misma hora", () => {
    const d = scheduleReview(createConcept({ subjectId: "s", title: "x" }), 3, local(10, 21));
    const due = new Date(d.dueAt);
    expect(localDateString(due)).toBe("2026-03-11");
    expect(due.getHours()).toBe(4);
    // Estudiando a las 9:00 del día siguiente ya cuenta como pendiente.
    const c = createConcept({ subjectId: "s", title: "x", dueAt: d.dueAt });
    expect(dueCount([c], local(11, 9).getTime())).toBe(1);
    expect(dueCount([c], local(10, 23).getTime())).toBe(0);
  });

  it("estudiar de madrugada programa el repaso como si fuera la noche anterior", () => {
    const d = scheduleReview(createConcept({ subjectId: "s", title: "x" }), 3, local(11, 1));
    expect(localDateString(new Date(d.dueAt))).toBe("2026-03-11");
  });

  it("un repaso que vence esta tarde ya cuenta como pendiente por la mañana", () => {
    const c = createConcept({ subjectId: "s", title: "x", dueAt: local(10, 21).toISOString() });
    expect(dueCount([c], local(10, 9).getTime())).toBe(1);
  });

  it("«con dudas» alarga el intervalo en cada repaso en vez de quedarse en un día", () => {
    let c = createConcept({ subjectId: "s", title: "x" });
    const intervals: number[] = [];
    for (let day = 1, i = 0; i < 6; i++) {
      const now = new Date(2026, 0, day, 12);
      const d = scheduleReview(c, 2, now);
      intervals.push(d.intervalDays);
      c = { ...c, ...d, lastReviewedAt: now.toISOString() };
      day += d.intervalDays;
    }
    expect(intervals).toEqual([1, 2, 3, 4, 5, 7]);
  });

  it("«con seguridad» crece 1, 3 y después algo más del doble, con tope", () => {
    let c = createConcept({ subjectId: "s", title: "x" });
    const intervals: number[] = [];
    for (let day = 1, i = 0; i < 9; i++) {
      const now = new Date(2026, 0, day, 12);
      const d = scheduleReview(c, 3, now);
      intervals.push(d.intervalDays);
      c = { ...c, ...d, lastReviewedAt: now.toISOString() };
      day += d.intervalDays;
    }
    expect(intervals).toEqual([1, 3, 6, 13, 28, 60, 129, 180, 180]);
  });

  it("acertar un repaso adelantado no cambia la fecha ni el intervalo", () => {
    const sameDay = reviewed(1, 1, local(10, 9));
    expect(isEarlyReview(sameDay, local(10, 18))).toBe(true);
    expect(scheduleReview(sameDay, 3, local(10, 18))).toEqual({ dueAt: sameDay.dueAt, intervalDays: 1, repetitions: 1, lapses: 0 });

    const longInterval = reviewed(10, 4, local(10, 9));
    expect(isEarlyReview(longInterval, local(13, 9))).toBe(true);
    expect(scheduleReview(longInterval, 2, local(13, 9)).dueAt).toBe(longInterval.dueAt);
    // Casi a tiempo (8 de 10 días) ya cuenta como repaso normal.
    expect(isEarlyReview(longInterval, local(18, 9))).toBe(false);
    expect(scheduleReview(longInterval, 3, local(18, 9)).intervalDays).toBe(22);
  });

  it("fallar un repaso adelantado sí lo devuelve a mañana", () => {
    const c = reviewed(10, 4, local(10, 9));
    const d = scheduleReview(c, 0, local(11, 9));
    expect(d).toMatchObject({ intervalDays: 1, repetitions: 0, lapses: 1 });
    expect(localDateString(new Date(d.dueAt))).toBe("2026-03-12");
  });

  it("un concepto nuevo o recién fallado nunca se trata como adelantado", () => {
    expect(isEarlyReview(createConcept({ subjectId: "s", title: "x" }), local(10, 9))).toBe(false);
    expect(isEarlyReview(reviewed(1, 0, local(10, 9)), local(10, 10))).toBe(false);
  });
});

