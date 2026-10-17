import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const out=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(out,'../../..');
const names=['v06p1-attr-ui-closed','v06p1-attr-ui-binding-success','v06p1-attr-ui-map-api','v06p1-attr-ui-map-services',
 'v06p1-forge-closed','v06p1-enhance-closed','v06p1-enchant-closed','v06p1-salvage-closed',
 'v06p1-forge-open','v06p1-enhance-open','v06p1-enchant-open','v06p1-salvage-open','v06p1-market-closed','v06c-closed','v06d-closed'];
const config=JSON.parse(await fs.readFile(path.join(out,'pinned-inputs.json'),'utf8'));
const hash=v=>createHash('sha256').update(v).digest('hex');
for(const [file,pin] of Object.entries(config.pins))assert.equal(hash(await fs.readFile(path.join(root,file))),pin,'frozen regression input '+file);
for(const [file,row] of Object.entries(config.restore))assert.equal(hash(await fs.readFile(path.join(root,'src',file))),row.currentSha,'current product baseline '+file);
for(const [file,pin] of Object.entries(config.currentProducts))assert.equal(hash(await fs.readFile(path.join(root,file))),pin,'prior authorized product current exact bytes '+file);
const selected=process.argv.slice(2).length?process.argv.slice(2):names;
for(const name of selected){
 assert.ok(names.includes(name));
 try {
  const previous=JSON.parse(await fs.readFile(path.join(out,name+'.result.json'),'utf8'));
  if(previous.exitCode!==0){
   const attempt=path.join(out,'attempts',previous.startedAt.replace(/[:.]/g,'-'));await fs.mkdir(attempt,{recursive:true});
   for(const suffix of ['.log','.result.json'])await fs.copyFile(path.join(out,name+suffix),path.join(attempt,name+suffix));
  }
 }catch(error){if(error.code!=='ENOENT')throw error;}
 const suiteOut=path.join(out,name);await fs.mkdir(suiteOut,{recursive:true});
 const env={...process.env,NODE_OPTIONS:'--import='+path.join(out,'regression-register.mjs')};
 for(const key of ['FORGE_CLOSED_OUT','ENHANCE_CLOSED_OUT','ENCHANT_CLOSED_OUT','SALVAGE_CLOSED_OUT','SALVAGE_OPEN_OUT','ENCHANT_OPEN_OUT','XT_ENHANCE_QA_OUT','MARKET_CLOSED_OUT','OUT_DIR','OUT'])env[key]=suiteOut;
 const command=['npm','run','test:'+name],startedAt=new Date().toISOString();
 const result=await new Promise((resolve,reject)=>{
  const child=spawn(command[0],command.slice(1),{cwd:root,env,stdio:['ignore','pipe','pipe']});
  const chunks=[];child.stdout.on('data',c=>chunks.push(c));child.stderr.on('data',c=>chunks.push(c));
  child.on('error',reject);child.on('close',(exitCode,signal)=>resolve({exitCode,signal,output:Buffer.concat(chunks).toString()}));
 });
 await fs.writeFile(path.join(out,name+'.log'),result.output);
 const match=result.output.match(/(?:tests ok:|PASS:)\s*(\d+)\s*assertions/u);
 const row={name,command,cwd:root,stdin:'/dev/null',startedAt,finishedAt:new Date().toISOString(),exitCode:result.exitCode,signal:result.signal,assertions:match?Number(match[1]):null,log:path.join(out,name+'.log'),outputDirectory:suiteOut};
 await fs.writeFile(path.join(out,name+'.result.json'),JSON.stringify(row,null,2)+'\n');console.log(JSON.stringify(row));
 if(result.exitCode!==0)console.log(result.output.slice(-6000));
}
const results=[];for(const name of names){try{results.push(JSON.parse(await fs.readFile(path.join(out,name+'.result.json'),'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}}
const summary={passed:results.length===names.length&&results.every(r=>r.exitCode===0),results,totalAssertions:results.reduce((n,r)=>n+(r.assertions??0),0),productModuleTransformations:[],oldQaOutputsWritten:false,notRun:['snapshot','build','sync','release']};
await fs.writeFile(path.join(out,'regression-summary.json'),JSON.stringify(summary,null,2)+'\n');
process.exitCode=results.filter(r=>selected.includes(r.name)).every(r=>r.exitCode===0)?0:1;
