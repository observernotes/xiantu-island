import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
const root='/workspace/xiantu/wt/dev',out=path.join(root,'qa/out_v06p1_enchant_soft_open');
const jobs={
 tsc:{command:['npx','tsc','--noEmit']},
 'v06p1-enchant-open':{script:'test:v06p1-enchant-open',env:{ENCHANT_OPEN_OUT:out}},
 'v06p1-enchant-closed':{script:'test:v06p1-enchant-closed',env:{ENCHANT_CLOSED_OUT:path.join(out,'regressions/enchant-closed')}},
 'v06p1-enhance-open':{script:'test:v06p1-enhance-open',env:{XT_ENHANCE_QA_OUT:path.join(out,'regressions/enhance-open')}},
 'v06p1-enhance-closed':{script:'test:v06p1-enhance-closed',env:{ENHANCE_CLOSED_OUT:path.join(out,'regressions/enhance-closed')}},
 'v06p1-forge-open':{script:'test:v06p1-forge-open',env:{OUT_DIR:path.join(out,'regressions/forge-open')}},
 'v06p1-forge-closed':{script:'test:v06p1-forge-closed',env:{FORGE_CLOSED_OUT:path.join(out,'regressions/forge-closed')}},
 'v06p1-market-closed':{script:'test:v06p1-market-closed',env:{MARKET_CLOSED_OUT:path.join(out,'regressions/market-closed')}},
 'v06d-closed':{script:'test:v06d-closed',env:{OUT_DIR:path.join(out,'regressions/v06d-closed'),NODE_OPTIONS:'--import='+path.join(out,'legacy-regression-register.mjs')}},
 'v06c-closed':{script:'test:v06c-closed',env:{NODE_OPTIONS:'--import='+path.join(out,'legacy-regression-register.mjs')}},
 'datalint-shared':{command:['python3','/workspace/xiantu/qa/tools/datalint.py'],cwd:'/workspace/xiantu',env:{PYTHONDONTWRITEBYTECODE:'1'}},
 'datalint-snapshot':{command:['python3','/workspace/xiantu/qa/tools/datalint.py'],cwd:path.join(root,'data'),env:{PYTHONDONTWRITEBYTECODE:'1'}},
 'diff-check':{command:['git','diff','--check']},
};
const requested=process.argv.slice(2);
const results=await Promise.all(requested.map(async name=>{
 const job=jobs[name];if(!job)throw Error('unknown job '+name);
 const command=job.command??['npm','run',job.script],cwd=job.cwd??root,startedAt=new Date().toISOString();
 const result=await new Promise((resolve,reject)=>{const child=spawn(command[0],command.slice(1),{cwd,env:{...process.env,...job.env},stdio:['ignore','pipe','pipe']});const chunks=[];child.stdout.on('data',c=>chunks.push(c));child.stderr.on('data',c=>chunks.push(c));child.on('error',reject);child.on('close',(exitCode,signal)=>resolve({exitCode,signal,output:Buffer.concat(chunks).toString()}));});
 await fs.writeFile(path.join(out,name+'.log'),result.output);
 const matches=[...result.output.matchAll(/(?:通过\s*|断言[：:]?\s*|assertions["':\s]+)(\d+)/gu)];
 const total=result.output.match(/tests ok:\s*(\d+)\s*assertions/u);
 const row={name,command,cwd,environment:job.env??{},stdin:'/dev/null',startedAt,finishedAt:new Date().toISOString(),exitCode:result.exitCode,signal:result.signal,assertions:total?Number(total[1]):matches.length?Number(matches.at(-1)[1]):null};
 await fs.writeFile(path.join(out,name+'.result.json'),JSON.stringify(row,null,2)+'\n');
 console.log(JSON.stringify(row));if(result.exitCode!==0)console.log(result.output.slice(-5000));return row;
}));
process.exitCode=results.every(row=>row.exitCode===0)?0:1;
