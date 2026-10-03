const urls=String(process.env.SFU_HEALTH_URLS||'').split(',').map(x=>x.trim()).filter(Boolean);
const targetRooms=Math.max(1,Number(process.env.TARGET_PARALLEL_ROOMS||50));
const expectedPeers=Math.max(targetRooms*20,Number(process.env.CAPACITY_EXPECTED_PEERS||1000));
const minHealthy=Math.max(1,Number(process.env.CAPACITY_MIN_HEALTHY_NODES||3));

if(!urls.length){console.error('SFU_HEALTH_URLS majburiy');process.exit(2)}

const rows=[];
for(const url of urls){
  try{
    const r=await fetch(url,{signal:AbortSignal.timeout(5000)});
    const h=await r.json();
    rows.push({url,ok:Boolean(r.ok&&h?.ok),nodeId:h?.nodeId||url,workers:Number(h?.workers||0),rooms:Number(h?.rooms||0),peers:Number(h?.peers||0),rtcTcp:h?.rtcTcp===true,maxRooms:Number(h?.capacity?.maxActiveRooms||0),maxPeers:Number(h?.capacity?.maxTotalPeers||0),ready:Boolean(h?.capacity?.readyForTarget),warnings:h?.warnings||[]});
  }catch(e){rows.push({url,ok:false,error:e.message,workers:0,rooms:0,peers:0,maxRooms:0,maxPeers:0,rtcTcp:false})}
}

const healthy=rows.filter(x=>x.ok);
const totals=healthy.reduce((a,x)=>({workers:a.workers+x.workers,rooms:a.rooms+x.rooms,peers:a.peers+x.peers,maxRooms:a.maxRooms+x.maxRooms,maxPeers:a.maxPeers+x.maxPeers}),{workers:0,rooms:0,peers:0,maxRooms:0,maxPeers:0});
const checks=[
  {name:'Healthy SFU nodes',ok:healthy.length>=minHealthy,detail:`${healthy.length}/${urls.length}, minimum ${minHealthy}`},
  {name:'Aggregate room capacity',ok:totals.maxRooms>=targetRooms,detail:`${totals.maxRooms} / target ${targetRooms}`},
  {name:'Aggregate peer capacity',ok:totals.maxPeers>=expectedPeers,detail:`${totals.maxPeers} / expected ${expectedPeers}`},
  {name:'RTC TCP fallback',ok:healthy.length>0&&healthy.every(x=>x.rtcTcp),detail:healthy.map(x=>`${x.nodeId}:${x.rtcTcp?'on':'off'}`).join(', ')},
  {name:'Workers available',ok:totals.workers>=minHealthy*4,detail:`${totals.workers} total workers`}
];
const out={ok:checks.every(x=>x.ok),targetRooms,expectedPeers,totals,checks,nodes:rows};
console.log(JSON.stringify(out,null,2));
process.exitCode=out.ok?0:2;