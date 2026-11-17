import type { AppState, Skill } from "./domain";
import { SKILLS } from "./domain";
import { learningProfile, dueCount, daysUntil } from "./engine";
export function analytics(state:AppState, now=new Date()) {
  const profile = learningProfile(state.reviews);
  const bySkill = SKILLS.map((skill:Skill)=> {
    const relevant = state.reviews.filter(r=>r.skill===skill);
    const score = relevant.length ? relevant.reduce((sum,r)=>sum+r.answerQuality,0)/relevant.length : undefined;
    return {skill,score,count:relevant.length};
  });
  const subjects = state.subjects.map(subject=>{
    const concepts=state.concepts.filter(c=>c.subjectId===subject.id);
    const reviews=state.reviews.filter(r=>r.subjectId===subject.id);
    return {subject,concepts:concepts.length,due:dueCount(concepts,now.getTime()),mastery:concepts.length?concepts.reduce((s,c)=>s+c.mastery,0)/concepts.length:0,reviews:reviews.length,daysToExam:daysUntil(subject.examDate,now)};
  });
  return {profile,bySkill,subjects,totalConcepts:state.concepts.length,totalReviews:state.reviews.length,due:dueCount(state.concepts,now.getTime())};
}
