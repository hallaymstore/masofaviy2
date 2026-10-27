// Weighted max-min fair split of the node's egress budget across viewers (recv transports).
// Every viewer gets the same share per unit of weight; a viewer capped at `max` frees its surplus for the
// others (water-filling), and nobody drops below `min` so audio + the lowest video layer always fit.
// mediasoup then picks simulcast/SVC layers that fit each viewer's cap, so one heavy room or one fast
// client cannot starve the other parallel lessons on the same server.
export function computeFairShares(viewers=[],budgetBps,{min=300000,max=2500000}={}){
  const out=new Map();
  let pending=viewers.filter(v=>v&&v.id&&Number(v.weight)>0);
  let budget=Math.max(0,Number(budgetBps)||0);
  // Rooms that cannot even reach the floor still get the floor: audio continuity beats the budget.
  while(pending.length){
    const totalWeight=pending.reduce((s,v)=>s+Number(v.weight),0);
    const unit=budget/totalWeight;
    const capped=pending.filter(v=>unit*v.weight>=(v.max??max));
    if(!capped.length){
      for(const v of pending)out.set(v.id,Math.max(v.min??min,Math.floor(unit*v.weight)));
      break;
    }
    for(const v of capped){const cap=v.max??max;out.set(v.id,cap);budget-=cap}
    pending=pending.filter(v=>!capped.includes(v));
    budget=Math.max(0,budget);
  }
  return out;
}

// Viewer weight: teachers/staff watch a grid of student cameras, students watch the lecture (teacher + screen).
export function viewerWeight(role,{studentCount=0}={}){
  if(role==='student')return 1;
  // A teacher's grid grows with the class but is capped: student tiles use low simulcast layers.
  return Math.min(4,1+Math.ceil(Math.max(0,studentCount)/15));
}

// Rooms are placed on the least loaded worker; a worker's load is its peers plus a fixed per-room overhead.
export function workerLoadScore({rooms=0,peers=0}){return peers+rooms*6}

// How many rooms a worker may host so the target number of parallel lessons fits on the node.
export function roomsPerWorker(targetRooms,workers,configured=0){
  const needed=Math.ceil(Math.max(1,targetRooms)/Math.max(1,workers))+2;
  return Math.max(2,Number(configured)||0,needed);
}

// Only touch a transport when its cap moves by more than `ratio`, to avoid re-probing churn.
export function shouldUpdateCap(previous,next,ratio=0.12){
  if(!previous)return true;
  return Math.abs(next-previous)/previous>ratio;
}
