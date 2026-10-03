import os from 'node:os';

const url=process.env.SFU_HEALTH_URL||'http://127.0.0.1:41000/health';
const minWorkers=Number(process.env.CAPACITY_MIN_WORKERS||4);
const minRamGb=Number(process.env.CAPACITY_MIN_RAM_GB||16);
const minCpu=Number(process.env.CAPACITY_MIN_CPU||4);
const targetRooms=Number(process.env.TARGET_PARALLEL_ROOMS||10);

const out={ok:true,checks:[],warnings:[]};
function check(name,ok,detail){
  out.checks.push({name,ok,detail});
  if(!ok)out.ok=false;
}
const cpu=os.cpus().length;
const ramGb=os.totalmem()/1024/1024/1024;
check('CPU',cpu>=minCpu,`${cpu} logical CPU (minimum ${minCpu})`);
check('RAM',ramGb>=minRamGb,`${ramGb.toFixed(1)} GB (minimum ${minRamGb} GB)`);

try{
  const r=await fetch(url,{signal:AbortSignal.timeout(5000)});
  const h=await r.json();
  check('SFU health',Boolean(r.ok&&h.ok),`HTTP ${r.status}`);
  check('Workers',Number(h.workers)>=minWorkers,`${h.workers} workers (minimum ${minWorkers})`);
  check('Parallel rooms config',Number(h.capacity?.maxActiveRooms||0)>=targetRooms,`${h.capacity?.maxActiveRooms||0} max rooms / target ${targetRooms}`);
  check('RTC TCP fallback',h.rtcTcp===true,h.rtcTcp?'enabled':'disabled');
  check('RTC ports',Array.isArray(h.rtcPorts)&&h.rtcPorts.length>=minWorkers,JSON.stringify(h.rtcPorts||[]));
  if(Array.isArray(h.warnings))out.warnings.push(...h.warnings);
}catch(e){
  check('SFU health',false,e.message);
}
console.log(JSON.stringify(out,null,2));
process.exitCode=out.ok?0:2;
