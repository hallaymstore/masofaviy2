import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {computeFairShares,viewerWeight,workerLoadScore,roomsPerWorker,shouldUpdateCap} from '../media-server/fair-share.js';

test('equal viewers get equal shares of the egress budget',()=>{
  const viewers=Array.from({length:100},(_,i)=>({id:'v'+i,weight:1}));
  const s=computeFairShares(viewers,100e6,{min:300000,max:2500000});
  assert.equal(new Set(s.values()).size,1);assert.equal(s.get('v0'),1000000);
});
test('capped viewers release surplus to the rest (water-filling)',()=>{
  const viewers=[{id:'a',weight:1,max:500000},{id:'b',weight:1},{id:'c',weight:1}];
  const s=computeFairShares(viewers,3e6,{min:100000,max:5e6});
  assert.equal(s.get('a'),500000);assert.equal(s.get('b'),1250000);assert.equal(s.get('c'),1250000);
});
test('overloaded node keeps every viewer at the audio-safe floor',()=>{
  const viewers=Array.from({length:2000},(_,i)=>({id:'v'+i,weight:1}));
  const s=computeFairShares(viewers,200e6,{min:300000,max:2500000});
  assert.ok([...s.values()].every(x=>x===300000));
});
test('50 parallel rooms of 30 students share 800 Mbit/s fairly',()=>{
  const viewers=[];for(let r=0;r<50;r++){viewers.push({id:r+'t',weight:viewerWeight('teacher',{studentCount:30}),max:6e6});for(let i=0;i<30;i++)viewers.push({id:r+'s'+i,weight:1})}
  const s=computeFairShares(viewers,800e6,{min:300000,max:2500000});
  const students=[...s.entries()].filter(([k])=>k.includes('s')).map(([,v])=>v);
  assert.equal(Math.min(...students),Math.max(...students));assert.ok(students[0]>=450000);
  assert.ok([...s.values()].reduce((a,b)=>a+b,0)<=800e6);
});
test('teacher weight grows with class size but is capped',()=>{
  assert.equal(viewerWeight('student'),1);assert.equal(viewerWeight('teacher',{studentCount:0}),1);
  assert.equal(viewerWeight('teacher',{studentCount:30}),3);assert.equal(viewerWeight('teacher',{studentCount:200}),4);
});
test('worker sizing fits the parallel-room target and prefers least loaded workers',()=>{
  assert.equal(roomsPerWorker(50,4,3),15);assert.equal(roomsPerWorker(8,4,8),8);
  assert.ok(workerLoadScore({rooms:2,peers:10})<workerLoadScore({rooms:1,peers:40}));
  assert.equal(shouldUpdateCap(1000000,1050000),false);assert.equal(shouldUpdateCap(1000000,800000),true);assert.equal(shouldUpdateCap(undefined,1),true);
});
test('SFU applies fair caps to recv transports and reports them',()=>{
  const sfu=fs.readFileSync(new URL('../media-server/server.js',import.meta.url),'utf8');
  assert.match(sfu,/setMaxOutgoingBitrate\(cap\)/);assert.match(sfu,/rebalanceFairShare\(\)/);assert.match(sfu,/fairShare:\{egressBudgetMbps/);
});
test('teacher-only live controls are hidden for students',()=>{
  const css=fs.readFileSync(new URL('../public/premium-ui.css',import.meta.url),'utf8');
  for(const id of ['callAttendance','callParticipants','callViewMode','callScreen','callLab','raisedHandSpotlight'])assert.ok(css.includes('#'+id),id);
});
