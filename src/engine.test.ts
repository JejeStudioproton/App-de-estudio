import { describe,it,expect } from "vitest";
import { applyReview, createConcept, createSubject, dueCount, initialState, normalizeState, planSession, scheduleReview } from "./engine";
import type { ReviewEvent } from "./domain";
describe("motor de aprendizaje FORMA",()=>{
  it("normaliza datos incompletos sin romper la aplicación",()=>{const s=normalizeState({subjects:[{id:"s",name:"Mate"}],concepts:[],reviews:[]});expect(s.version).toBe(3);expect(s.subjects[0].archived).toBe(false);});
  it("programa primer repaso al día siguiente",()=>{const c=createConcept({subjectId:"s",title:"x"});const d=scheduleReview(c,3,new Date("2026-01-01T12:00:00Z"));expect(d.intervalDays).toBe(1);expect(d.dueAt.startsWith("2026-01-02")).toBe(true);});
  it("un recuerdo fallido vuelve a intervalo corto",()=>{const c=createConcept({subjectId:"s",title:"x",intervalDays:21,repetitions:4});const d=scheduleReview(c,0,new Date("2026-01-01T12:00:00Z"));expect(d.intervalDays).toBe(1);expect(d.lapses).toBe(1);});
  it("prioriza conceptos vencidos",()=>{const a=createConcept({subjectId:"s",title:"vencido",dueAt:"2020-01-01"});const b=createConcept({subjectId:"s",title:"futuro",dueAt:"2030-01-01"});expect(planSession([a,b],[],25,Date.parse("2026-01-01"))[0].conceptId).toBe(a.id);});
  it("cuenta solo conceptos vencidos",()=>{const a=createConcept({subjectId:"s",title:"a",dueAt:"2020-01-01"});const b=createConcept({subjectId:"s",title:"b",dueAt:"2030-01-01"});expect(dueCount([a,b],Date.parse("2026-01-01"))).toBe(1);});
  it("aplica una evaluación y registra evidencia",()=>{const subject=createSubject("Ciencias");const c=createConcept({subjectId:subject.id,title:"Célula"});const state={...initialState(),subjects:[subject],concepts:[c]};const e:ReviewEvent={id:"r1",conceptId:c.id,subjectId:subject.id,at:"2026-01-01T12:00:00Z",method:"active-recall",skill:"memory",rating:3,confidence:1,responseSeconds:20,hintUsed:false,answerQuality:.9,errorTags:[]};const next=applyReview(state,e);expect(next.reviews).toHaveLength(1);expect(next.concepts[0].memory).toBeGreaterThan(0);});
});
