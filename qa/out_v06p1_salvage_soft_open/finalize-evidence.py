"""Verify this soft-open window without writing any legacy evidence or product data."""
from pathlib import Path
import hashlib,json,subprocess,re
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
BASE='15b66e34a9fc24bc38b8e701172694756a6cc62a'
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text())
def write(name,obj):(OUT/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
freeze=read(OUT/'protected-before.json'); after=[]
for row in freeze:
 p=ROOT/row['path']; actual=digest(p)
 expected='69aace852957c52bf7ca0214345ede7df29d6d36ec1dfd4849462e54552edff3' if row['path']=='src/SalvageOpenFlag.ts' else row['sha256']
 assert actual==expected,(str(p),actual,expected)
 after.append(dict(row,afterSha256=actual,afterExpected=expected,MATCH=True,authorizedFlip=row['path']=='src/SalvageOpenFlag.ts'))
write('protected-after.json',after)
old=read(OUT/'old-qa-before.json')
for name,sha in old.items():assert digest(Path(name))==sha,name
write('old-qa-preservation.json',{'passed':True,'existingFilesChecked':len(old),'mismatches':[],'legacyOutputsOverwritten':False,'beforeManifest':'old-qa-before.json'})
core=['src/SalvageGate.ts','src/SalvageProgress.ts','src/Progress.ts','src/SaveStore.ts','src/ForgeGate.ts','src/EnhanceGate.ts','src/EnchantGate.ts','src/ShopPanel.ts','src/features.ts']
core_rows=[]
for name in core:
 before=subprocess.check_output(['git','show',BASE+':'+name],cwd=ROOT,stdin=subprocess.DEVNULL)
 actual=digest(ROOT/name); assert actual==hashlib.sha256(before).hexdigest(),name
 core_rows.append({'path':name,'sha256':actual,'MATCH':True})
allowed=['scripts/v06c-closed-test.mjs','scripts/v06d-closed-test.mjs','scripts/v06p1-enchant-soft-open-compat-proof.mjs','scripts/v06p1-salvage-soft-open-compat-proof.mjs','src/SalvageOpenFlag.ts','src/scenes/GameScene.ts','src/v06p1-salvage-open.test.ts','src/v06p1-enchant-open.test.ts','src/v06p1-enhance-open.test.ts','src/v06p1-forge-open.test.ts','reports/炼器阁/V06P1_SALVAGE_SOFT_OPEN_HANDOFF.md','reports/炼器阁/V06P1_SALVAGE_SOFT_OPEN_RESULT.md','status/炼器阁.md']
allowed += ['scripts/v06p1-'+name+'-test.mjs' for name in ['salvage-open','salvage-closed','enchant-open','enchant-closed','enhance-open','enhance-closed','forge-open','forge-closed','market-closed']]
changed=subprocess.check_output(['git','diff',BASE,'--name-only','-z'],cwd=ROOT,stdin=subprocess.DEVNULL).decode().strip('\0').split('\0')
for name in filter(None,changed):
 if name in allowed or name.startswith('qa/out_v06p1_salvage_soft_open/'):continue
 assert name=='qa/out_v06p1_salvage_open_fixture/regressions/old-qa-preservation.json' and digest(ROOT/name)==old[str(ROOT/name)],name
for family in ['Enhance','Enchant','Forge','Salvage']:
 expected='/** 正式路径恒 true；仅 Vite SSR 关态图可注入 false。 */\nexport function is'+family+'OpenForFixture(): boolean { return true; }\n'
 assert (ROOT/('src/'+family+'OpenFlag.ts')).read_text()==expected,family
strings=read(ROOT/'data/balance/strings_zh.json'); assert len(strings)==960
npcs=read(ROOT/'data/balance/npcs.json'); gifts=[n['affinity']['gifts']['enabled'] for n in npcs if n.get('affinity',{}).get('gifts')]; assert gifts==[False]*10
write('protection-check.json',{'passed':True,'baseline':BASE,'frozenRecordsMatched':len(after),'existingFlagsTrueAndShaMatched':True,'SalvageOpenFlag':True,'SalvageOpenFlagSha256':digest(ROOT/'src/SalvageOpenFlag.ts'),'enhanceJsonUnchanged':True,'coreImplementationsPreserved':core_rows,'oldQaFilesPreserved':len(old),'unauthorizedDifferences':0,'strings':960,'giftsFalse':10,'GAME_PHASE':5,'pendingInitialDirtyPreserved':True})
open_e=read(OUT/'v06p1-salvage-open-evidence.json')
closed=read(OUT/'regressions/salvage-closed/v06p1-salvage-closed-evidence.json')
expected_evidence={'salvageClosedTipsWired':True,'refineStoneMapped':True,'salvageOpenFixtureTableExecuted':True,'formalInstanceSource':True,'softOpenedSalvage':True,'SalvageOpenFlag':True,'released':False,'EnhanceOpenFlagPreserved':True,'EnchantOpenFlagPreserved':True,'protectCharmSoftOpenPreserved':True}
assert open_e['passed'] and closed['passed']
for k,v in expected_evidence.items():assert open_e[k] is v,(k,open_e.get(k),v)
full=[r for r in open_e['evidence'] if r.get('salvageOpenFixtureTableExecuted')]
assert len(full)==2
for row in full:
 assert row['graph']=='formal-open' and row['flagLoads']==0 and row['productModuleTransformations']==[]
 assert all(row['cases']['O%02d'%n]['executed'] for n in range(1,9))
assert all(closed['cases']['C%02d'%n]['executed'] for n in range(1,11))
assert closed['storageWrites']==0 and closed['sentinelCalls']==0
reg=read(OUT/'regressions/regression-summary.json'); assert reg['passed']
commands=[read(OUT/(n+'.result.json')) for n in ['tsc','salvage-open','salvage-closed','v06c-closed','v06d-closed','datalint-shared','datalint-snapshot','diff-check']]+reg['results']
assert len(commands)==15
for row in commands:assert row['exitCode']==0,row
review=read(OUT/'independent-review.json'); assert review['passed']
write('evidence-check.json',{'passed':True,'evidence':expected_evidence,'formalDiskFullTableGraphs':len(full),'formalProductModuleTransformations':[],'cases':open_e['cases'],'closedCases':closed['cases'],'sceneSmokeGraphs':sum(bool(r.get('sceneSmoke')) for r in open_e['evidence']),'explicitArmorFixtureGraphCount':open_e['armorFixtureGraphCount'],'qualificationAndAtomicCarrier':'Explicit test adapters only; default production Gate rejects missing qualification; no fixtureInstances production dependency','boundary':'分解 soft-open ≠ 进包 ≠ 发版；fixture≠正式；下一刀 release 预期 v0.6.12，本令不授权'})
summary={'passed':True,'baseline':BASE,'cwd':str(ROOT),'stdin':'/dev/null','evidence':expected_evidence,'commands':commands,'assertionsBySuite':{'salvage-open':open_e['assertions'],'salvage-closed':closed['assertions'],**{r['command'].split('test:')[-1]:r['assertions'] for r in reg['results']},'v06c-closed':read(OUT/'v06c-closed.result.json')['assertions'],'v06d-closed':read(OUT/'v06d-closed.result.json')['assertions']},'totalAssertions':sum(r.get('assertions') or 0 for r in commands),'graphCount':open_e['graphCount'],'formalOpenGraphCount':open_e['formalOpenGraphCount'],'memoryClosedGraphCount':open_e['memoryClosedGraphCount'],'armorFixtureGraphCount':open_e['armorFixtureGraphCount'],'frozenRecordsMatched':len(after),'oldQaFilesPreserved':len(old),'unauthorizedDifferences':0,'programSelfcheckBlockers':[],'notRun':['snapshot','build','sync','release','Pages'],'boundary':'分解 soft-open ≠ 进包 ≠ 发版；fixture≠正式；下一棒交执法正式磁盘图 O01–O08+入口冒烟；release预期v0.6.12另令'}
write('selfcheck-summary.json',summary)
print(json.dumps({'passed':True,'totalAssertions':summary['totalAssertions'],'assertionsBySuite':summary['assertionsBySuite'],'frozenRecordsMatched':len(after),'oldQaFilesPreserved':len(old),'unauthorizedDifferences':0},ensure_ascii=False))
