import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const out = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(out, '../../..');
const loader = '--import=' + path.join(out, 'regression-register.mjs');
const names = ['v06p1-enchant-open','v06p1-enchant-closed','v06p1-enhance-open','v06p1-enhance-closed','v06p1-forge-open','v06p1-forge-closed','v06p1-market-closed','v06d-closed','v06c-closed'];
const outputVars = ['ENCHANT_OPEN_OUT','ENCHANT_CLOSED_OUT','XT_ENHANCE_QA_OUT','ENHANCE_CLOSED_OUT','OUT_DIR','FORGE_CLOSED_OUT','MARKET_CLOSED_OUT','OUT_DIR','OUT_DIR'];
const requested = process.argv.slice(2); const selected = requested.length ? requested : names;
const results = [];
async function run(name) {
 const index = names.indexOf(name); if (index < 0) throw Error('unknown regression ' + name);
 const suiteOut = path.join(out, name), environment = {[outputVars[index]]: suiteOut, NODE_OPTIONS:loader};
 await fs.mkdir(suiteOut, {recursive:true});
 const command = ['npm','run','test:'+name], startedAt = new Date().toISOString();
 const result = await new Promise((resolve,reject)=>{
  const child = spawn(command[0], command.slice(1), {cwd:root,env:{...process.env,...environment},stdio:['ignore','pipe','pipe']});
  const chunks=[]; child.stdout.on('data', c=>chunks.push(c)); child.stderr.on('data',c=>chunks.push(c));
  child.on('error', reject); child.on('close',(exitCode,signal)=>resolve({exitCode,signal,output:Buffer.concat(chunks).toString()}));
 });
 await fs.writeFile(path.join(out,name+'.log'),result.output);
 const match=result.output.match(/tests ok:\s*(\d+)\s*assertions/u);
 const row={name,command,cwd:root,environment,stdin:'/dev/null',startedAt,finishedAt:new Date().toISOString(),exitCode:result.exitCode,signal:result.signal,assertions:match?Number(match[1]):null,outputDirectory:suiteOut};
 await fs.writeFile(path.join(out,name+'.result.json'),JSON.stringify(row,null,2)+'\n');
 console.log(JSON.stringify(row)); if(result.exitCode!==0)console.log(result.output.slice(-7000)); results.push(row);
}
let cursor=0;
await Promise.all(Array.from({length:Math.min(3,selected.length)},async()=>{while(cursor<selected.length)await run(selected[cursor++]);}));
const all=[];
for (const name of names) { try {all.push(JSON.parse(await fs.readFile(path.join(out,name+'.result.json'),'utf8')));}catch(error){if(error.code!=='ENOENT')throw error;} }
const summary={passed:all.length===names.length&&all.every(row=>row.exitCode===0&&row.assertions>0),cwd:root,stdin:'/dev/null',totalAssertions:all.reduce((sum,row)=>sum+(row.assertions??0),0),results:all,productModuleTransformations:[],legacyFilesWritten:false,notRun:['snapshot','build','sync','release']};
await fs.writeFile(path.join(out,'regression-summary.json'),JSON.stringify(summary,null,2)+'\n');
process.exitCode=results.every(row=>row.exitCode===0)?0:1;
