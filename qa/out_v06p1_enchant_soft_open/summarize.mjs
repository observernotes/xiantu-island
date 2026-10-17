import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const out=path.dirname(new URL(import.meta.url).pathname);
const names=['tsc','v06p1-enchant-open','v06p1-enchant-closed','v06p1-enhance-open','v06p1-enhance-closed','v06p1-forge-open','v06p1-forge-closed','v06p1-market-closed','v06d-closed','v06c-closed','datalint-shared','datalint-snapshot','diff-check'];
const results=[];
for(const name of names){
 const p=path.join(out,name+'.result.json');
 const row=JSON.parse(await fs.readFile(p,'utf8'));
 row.name=name;
 const log=await fs.readFile(path.join(out,name+'.log'),'utf8');
 const match=log.match(/tests ok:\s*(\d+)\s*assertions/u);
 if(match)row.assertions=Number(match[1]);
 assert.equal(row.exitCode,0,name+' exit 0');assert.equal(row.stdin,'/dev/null',name+' stdin');
 await fs.writeFile(p,JSON.stringify(row,null,2)+'\n');
 results.push(row);
}
const evidence=JSON.parse(await fs.readFile(path.join(out,'v06p1-enchant-open-evidence.json'),'utf8'));
const expected={enchantClosedTipsWired:true,beastCoreMapped:true,enchantOpenFixtureTableExecuted:true,formalInstanceSource:true,softOpenedEnchant:true,EnchantOpenFlag:true,released:false,EnhanceOpenFlagPreserved:true,protectCharmSoftOpenPreserved:true};
for(const [key,value]of Object.entries(expected))assert.equal(evidence[key],value,key);
for(let i=1;i<=8;i++)assert.equal(evidence.cases['O0'+i].executed,true,'O0'+i);
const full=evidence.evidence.filter(row=>row.enchantOpenFixtureTableExecuted);
assert.equal(full.length,2);for(const row of full){assert.equal(row.graph,'formal-open');assert.equal(row.flagLoads,0);assert.equal(row.productionFixtureInstances,false);}
const formal=evidence.evidence.filter(row=>row.graph==='formal-open'),closed=evidence.evidence.filter(row=>row.graph==='memory-closed');
assert.equal(formal.length,32);assert.equal(closed.length,4);
for(const row of formal)assert.equal(row.flagLoads,0);
for(const row of closed)assert.equal(row.flagLoads,1);
const smokes=evidence.evidence.filter(row=>row.sceneSmoke);
assert.equal(smokes.length,8);
for(const row of smokes){assert.equal(row.sceneSmoke.sameHitForgeThenEnhanceThenEnchant,true);assert.equal(row.sceneSmoke.enchantNotStarved,true);assert.equal(row.sceneSmoke.saveWrites,0);}
const check={passed:true,...expected,hardGatesMatched:true,design:'design/29 §4.3 O01–O08',cases:evidence.cases,formalOpenGraphs:formal.length,memoryClosedGraphs:closed.length,fullTableGraphs:full.length,sceneSmokeGraphs:smokes.length,formalGraphFlagLoads:0,memoryClosedGraphFlagLoads:1,boundary:'附灵 soft-open ≠ 进包 ≠ 发版；fixture≠正式≠进包依据'};
await fs.writeFile(path.join(out,'evidence-check.json'),JSON.stringify(check,null,2)+'\n');
const protection=JSON.parse(await fs.readFile(path.join(out,'protection-check.json'),'utf8'));
assert.equal(protection.passed,true);assert.equal(protection.differences.length,0);assert.equal(protection.unauthorized.length,0);
const review=JSON.parse(await fs.readFile(path.join(out,'independent-review.json'),'utf8'));assert.equal(review.passed,true);
const summary={passed:true,base:'feece9916733dbc705d4d57882ff924449e2efd7',cwd:'/workspace/xiantu/wt/dev',stdin:'/dev/null',totalAssertions:results.reduce((sum,row)=>sum+(row.assertions??0),0),results,evidence:expected,formalOpenGraphs:formal.length,memoryClosedGraphs:closed.length,sceneSmokeGraphs:smokes.length,protectionChecks:protection.checks,unauthorizedDifferences:0,programSelfcheckBlockers:[],notRun:['snapshot','build','sync','release','Pages'],boundary:check.boundary};
await fs.writeFile(path.join(out,'selfcheck-summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({passed:summary.passed,totalAssertions:summary.totalAssertions,results:results.map(({name,exitCode,assertions})=>({name,exitCode,assertions})),evidence:expected}));
