import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root='/workspace/xiantu/wt/dev', out=path.join(root,'qa/out_v06p1_enchant_soft_open');
const sha=b=>createHash('sha256').update(b).digest('hex');
const mode=process.argv[2];
const targets=['enhance.json','recipes.json','materials.json','items.json','strings_zh.json','npcs.json','life_skills.json','enhance_protect_charm.json'];
const expected=['d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954','1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f','86ae4e29bacee6b3847081caf415001f584bd4d037aa46d72f1accd14e00b98d','dc0ba49591183b2cc7fd8af551c6b91f91e2a596be217bc6e9a608832482de99','6f2443f87db77dcaf88f565f87c38849c5dde482dc77592102acb64695258dd9','2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6','204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b','0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772'];
const srcExpected={'src/EnhanceOpenFlag.ts':'d7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e','src/ForgeOpenFlag.ts':'0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e','src/EnchantClosed.ts':'15870998e95f8f41ab4fb3e6c30dc17a82019502276084f4610800be5927e730','src/data.ts':'aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a'};
const files={},missing=[],frozen=[];
async function add(p){try{files[p]=sha(await fs.readFile(p));}catch(e){if(e.code==='ENOENT')missing.push(p);else throw e;}}
async function walk(p){try{const rows=await fs.readdir(p,{withFileTypes:true});for(const row of rows){const f=path.join(p,row.name);if(row.isDirectory())await walk(f);else if(row.isFile())await add(f);}}catch(e){if(e.code==='ENOENT')missing.push(p);else throw e;}}
for(const dataRoot of ['/workspace/xiantu',path.join(root,'data'),'/workspace/xiantu/game/data']){
 for(const dir of ['balance','maps'])await walk(path.join(dataRoot,dir));
 for(let i=0;i<targets.length && dataRoot!=='/workspace/xiantu/game/data';i++){
 const p=path.join(dataRoot,'balance',targets[i]);if(files[p]!==expected[i])throw Error('frozen SHA mismatch '+p);frozen.push({path:p,sha:files[p],MATCH:true});}
}
for(const [file,expect] of Object.entries(srcExpected)){const p=path.join(root,file);await add(p);if(files[p]!==expect)throw Error('source SHA mismatch '+file);frozen.push({path:p,sha:files[p],MATCH:true});}
for(const file of ['src/EnchantGate.ts','src/EnchantProgress.ts','src/Progress.ts','src/EnhanceGate.ts','src/EnhanceProgress.ts','src/ForgeGate.ts','src/ShopPanel.ts','src/features.ts','data/features.json','package.json','tsconfig.json'])await add(path.join(root,file));
for(const dir of ['qa/out_v06p1_enchant_closed','qa/out_v06p1_enchant_open_fixture','qa/out_p13ppppp_enchant_closed_5bee47d','qa/out_p13ppppp_enchant_open_b4764a8']){await walk(path.join(root,dir));await walk(path.join('/workspace/xiantu',dir));}
// 全部既有 QA 与待审产物均记录，只排除当前窗口。
for(const dir of await fs.readdir(path.join(root,'qa'),{withFileTypes:true}))if(dir.isDirectory()&&dir.name.startsWith('out_')&&dir.name!=='out_v06p1_enchant_soft_open')await walk(path.join(root,'qa',dir.name));
await walk(path.join(root,'data/art/sprites/_pending/secret_rest_r1'));
const flagPath=path.join(root,'src/EnchantOpenFlag.ts'),flag=sha(await fs.readFile(flagPath));
const output={mode,base:'feece9916733dbc705d4d57882ff924449e2efd7',files,missing:missing.sort(),frozen,EnchantOpenFlag:{sha:flag,value:(await fs.readFile(flagPath,'utf8')).includes('return true;')}};
await fs.writeFile(path.join(out,`protected-${mode}.json`),JSON.stringify(output,null,2)+'\n');
if(mode==='before'){if(flag!=='825776ba9adcf7f085806bf54ed35ef4254f0a40be64851e2fa66e37f71e5994')throw Error('Enchant before mismatch');}
else{
 const before=JSON.parse(await fs.readFile(path.join(out,'protected-before.json'),'utf8'));
 const diff=[...new Set([...Object.keys(before.files),...Object.keys(files)])].filter(p=>before.files[p]!==files[p]).map(p=>({path:p,before:before.files[p],after:files[p]}));
 const missingMatch=JSON.stringify(before.missing)===JSON.stringify(output.missing);
 const changed=execFileSync('git',['diff','feece9916733dbc705d4d57882ff924449e2efd7','--name-only','-z'],{cwd:root,stdio:['ignore','pipe','pipe']}).toString().split('\0').filter(Boolean);
 const allowed=['src/EnchantOpenFlag.ts','src/scenes/GameScene.ts','src/v06p1-enchant-open.test.ts','src/v06p1-enchant-closed.test.ts','src/v06p1-forge-open.test.ts','src/v06p1-enhance-open.test.ts','scripts/v06p1-enchant-open-test.mjs','scripts/v06p1-enchant-soft-open-compat-proof.mjs','scripts/v06p1-enchant-closed-test.mjs','scripts/v06p1-enhance-open-test.mjs','scripts/v06p1-enhance-closed-test.mjs','scripts/v06p1-forge-open-test.mjs','scripts/v06p1-forge-closed-test.mjs','scripts/v06p1-market-closed-test.mjs','status/炼器阁.md'];
 const unauthorized=changed.filter(p=>!allowed.includes(p)&&!p.startsWith('qa/out_v06p1_enchant_soft_open/')&&!/^reports\/炼器阁\/V06P1_ENCHANT_SOFT_OPEN_(HANDOFF|RESULT)\.md$/u.test(p));
 const passed=diff.length===0&&missingMatch&&unauthorized.length===0&&output.EnchantOpenFlag.value;
 const result={passed,checks:Object.keys(files).length+frozen.length+3,frozen,priorFiles:Object.keys(before.files).length,unchanged:Object.keys(files).length,differences:diff,missingMatch,changed,unauthorized,EnhanceOpenFlagPreserved:true,ForgeOpenFlagPreserved:true,enhanceJsonPreserved:true,EnchantOpenFlag:output.EnchantOpenFlag};
 await fs.writeFile(path.join(out,'protection-check.json'),JSON.stringify(result,null,2)+'\n');
 if(!passed)throw Error(JSON.stringify(result));
}
console.log(JSON.stringify({mode,files:Object.keys(files).length,frozen:frozen.length,EnchantOpenFlag:output.EnchantOpenFlag,passed:true}));
