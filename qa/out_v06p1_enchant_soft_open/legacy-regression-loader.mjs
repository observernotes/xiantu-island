// 仅适配既有 v06c/v06d 测试源码的历史八键期望；真实表、产品模块和断言实现均不变。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const qa=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(qa,'../..');
const names=['v06c-closed','v06d-closed'];
const urls=new Map(names.map(n=>[pathToFileURL(path.join(root,'scripts',n+'-test.mjs')).href,n]));
const old='d7361af3f4a61e4a6e751e8f4474ec1fbbf2409ddc0fc964e93bd351a75a1e09',current='6f2443f87db77dcaf88f565f87c38849c5dde482dc77592102acb64695258dd9';
const sha=s=>createHash('sha256').update(s).digest('hex');
export async function load(url,context,nextLoad){
 const result=await nextLoad(url,context),name=urls.get(url);if(!name)return result;
 const original=String(result.source);let source=original;const changes=[];
 function replace(label,before,after){assert.equal(source.split(before).length-1,1,label+' exact occurrence');source=source.replace(before,after);changes.push({label,before,after,occurrences:1});}
 replace('historical strings delta proof',"import assert from 'node:assert/strict';",`import assert from 'node:assert/strict';
import { createHash as enchantProofHash } from 'node:crypto';
function stripEnchantClosedAddition(raw) {
 const digest = x => enchantProofHash('sha256').update(x).digest('hex');
 if(digest(raw)==='${old}')return raw;
 assert.equal(digest(raw),'${current}','real current 952-key strings authority');
 assert.equal(Object.keys(JSON.parse(raw)).length,952);
 const block=raw.match(/,\\n(?: {2}"enchant\\.closed\\.[^\\n]+\\n?){8}/gu);
 assert.equal(block?.length,1,'only exact appended eight enchant lines');
 const previous=raw.replace(block[0],'\\n');
 assert.equal(digest(previous),'${old}','exact bytes restore historical 944 keys');
 return previous;
}`);
 replace('current strings authority SHA',"'balance/strings_zh.json': '"+old+"'","'balance/strings_zh.json': '"+current+"'");
 if(name==='v06d-closed'){
 replace('current roots 952 keys','eq(entries.length, 944,','eq(entries.length, 952,');
 replace('historical formal chain','const preFormal = rawStrings.replace(','const preFormal = stripEnchantClosedAddition(rawStrings).replace(');
 replace('game comparison historical bytes',"const preFormal = sharedBytes.get(name).toString('utf8').replace(","const preFormal = stripEnchantClosedAddition(sharedBytes.get(name).toString('utf8')).replace(");
 replace('game historical SHA','eq(hash(gameStrings), expectedSha[name],',`eq(hash(gameStrings), '${old}',`);
 replace('game historical full bytes',"eq(gameStrings, sharedBytes.get(name).toString('utf8'),","eq(gameStrings, stripEnchantClosedAddition(sharedBytes.get(name).toString('utf8')),");
 }else{
 replace('current roots 952 keys','eq(Object.keys(strings).length, 944,','eq(Object.keys(strings).length, 952,');
 replace('historical formal chain',"const preFormal = sharedBytes.get('balance/strings_zh.json').toString('utf8').replace(","const preFormal = stripEnchantClosedAddition(sharedBytes.get('balance/strings_zh.json').toString('utf8')).replace(");
 }
 await fs.mkdir(path.join(qa,'regressions',name),{recursive:true});
 await fs.writeFile(path.join(qa,'regressions',name,'compatibility-source-adaptations.json'),JSON.stringify({runner:name,originalSha:sha(original),adaptedSha:sha(source),changes,realDiskRead:true,productModuleTransformations:[],diskWritten:false,assertionWrapperChanged:false},null,2)+'\n');
 return {...result,source};
}
