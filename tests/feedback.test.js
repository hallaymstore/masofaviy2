import test from 'node:test';
import assert from 'node:assert/strict';
import {FEEDBACK_MIN_RESPONSES,feedbackRating,feedbackPeriod,feedbackSummary} from '../feedback.js';

test('accept only integer ratings from 1 to 5',()=>{
  assert.equal(feedbackRating(5),5);
  assert.equal(feedbackRating('3'),3);
  for(const value of ['',null,undefined,0,6,3.5,'abc'])assert.throws(()=>feedbackRating(value));
});
test('academic period uses September in Uzbekistan',()=>{
  assert.equal(feedbackPeriod(new Date('2026-08-31T18:59:59Z')),'2025/2026');
  assert.equal(feedbackPeriod(new Date('2026-08-31T19:00:00Z')),'2026/2027');
});
test('small cohorts do not expose ratings',()=>{
  const a=feedbackSummary([{courseRating:5,teacherRating:2}]);
  assert.equal(a.visible,false);assert.equal(a.responses,1);assert.equal(a.minimum,FEEDBACK_MIN_RESPONSES);
  assert.equal(a.means,undefined);
});
test('aggregated summaries expose no learner identities',()=>{
  const rows=Array.from({length:5},(_,i)=>({respondentId:'private'+i,courseRating:i+1,teacherRating:5,platformRating:4}));
  const x=feedbackSummary(rows);
  assert.equal(x.visible,true);assert.equal(x.means.courseRating,3);assert.equal(x.means.teacherRating,5);
  assert.ok(!JSON.stringify(x).includes('private'));
});
