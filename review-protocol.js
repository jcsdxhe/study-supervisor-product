'use strict';

const LIMITS={items:8,text:1200,question:1800,explanation:2400};

function text(value,limit=LIMITS.text){return typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,limit):''}
function list(value,limit=LIMITS.items){return Array.isArray(value)?value.map(item=>text(item)).filter(Boolean).slice(0,limit):[]}

function cleanClassReview(raw,options={}){
  const wanted={summary:Boolean(options.summary),homework:Boolean(options.homework||options.answers),answers:Boolean(options.answers)};
  const source=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  let summary=null,homework=[],answers=[];
  if(wanted.summary){
    const item=source.summary&&typeof source.summary==='object'?source.summary:{};
    summary={overview:text(item.overview),studentQuestions:list(item.studentQuestions),weaknesses:list(item.weaknesses),nextProblemTypes:list(item.nextProblemTypes),nextActions:list(item.nextActions)};
  }
  if(wanted.homework&&Array.isArray(source.homework))homework=source.homework.slice(0,6).map((item,index)=>({
    id:text(item?.id,30)||`q${index+1}`,
    type:text(item?.type,80),
    difficulty:['基础','进阶','挑战'].includes(item?.difficulty)?item.difficulty:'基础',
    question:text(item?.question,LIMITS.question),
    objective:text(item?.objective,300)
  })).filter(item=>item.question);
  if(wanted.answers&&Array.isArray(source.answers)){
    const ids=new Set(homework.map(item=>item.id));
    answers=source.answers.slice(0,6).map(item=>({homeworkId:text(item?.homeworkId,30),answer:text(item?.answer,LIMITS.question),explanation:text(item?.explanation,LIMITS.explanation)})).filter(item=>ids.has(item.homeworkId)&&(item.answer||item.explanation));
  }
  return{summary,homework,answers};
}

module.exports={cleanClassReview};
