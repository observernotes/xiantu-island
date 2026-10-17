#!/usr/bin/env python3
"""本窗检查，显式 /dev/null 输入与独立输出，禁 snapshot/build/sync/release。"""
import datetime
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path('/workspace/xiantu/wt/dev')
SHARED = Path('/workspace/xiantu')
OUT = ROOT/'qa/out_v06p1_enchant_open_fixture'
CHECKS = {
    'tsc': (['npx','tsc','--noEmit'],ROOT,{}),
    'v06p1-enchant-open': (['npm','run','test:v06p1-enchant-open'],ROOT,{}),
    'v06p1-enchant-closed': (['npm','run','test:v06p1-enchant-closed'],ROOT,{'ENCHANT_CLOSED_OUT':str(OUT/'regression/enchant-closed')}),
    'v06p1-enhance-open': (['npm','run','test:v06p1-enhance-open'],ROOT,{'XT_ENHANCE_QA_OUT':str(OUT/'regression/enhance-open')}),
    'v06p1-enhance-closed': (['npm','run','test:v06p1-enhance-closed'],ROOT,{'ENHANCE_CLOSED_OUT':str(OUT/'regression/enhance-closed')}),
    'v06p1-forge-open': (['npm','run','test:v06p1-forge-open'],ROOT,{'OUT_DIR':str(OUT/'regression/forge-open')}),
    'v06p1-forge-closed': (['npm','run','test:v06p1-forge-closed'],ROOT,{'FORGE_CLOSED_OUT':str(OUT/'regression/forge-closed')}),
    'v06p1-market-closed': (['npm','run','test:v06p1-market-closed'],ROOT,{'MARKET_CLOSED_OUT':str(OUT/'regression/market-closed')}),
    'v06d-closed': (['npm','run','test:v06d-closed'],ROOT,{'OUT_DIR':str(OUT/'regression/v06d-closed')}),
    'v06c-closed': (['npm','run','test:v06c-closed'],ROOT,{'OUT_DIR':str(OUT/'regression/v06c-closed')}),
    'datalint-shared': (['python3',str(SHARED/'qa/tools/datalint.py')],SHARED,{}),
    'datalint-snapshot': (['python3',str(SHARED/'qa/tools/datalint.py')],ROOT/'data',{}),
    'json-shared': (['python3','-c','import subprocess; [subprocess.run(["python3","-m","json.tool","balance/"+n],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,check=True) for n in ["materials.json","items.json","strings_zh.json"]]; print("3 JSON PASS")'],SHARED,{}),
    'json-snapshot': (['python3','-c','import subprocess; [subprocess.run(["python3","-m","json.tool","balance/"+n],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,check=True) for n in ["materials.json","items.json","strings_zh.json"]]; print("3 JSON PASS")'],ROOT/'data',{}),
    'diff-check': (['git','diff','--check'],ROOT,{}),
}

def run(name):
    command,cwd,extra=CHECKS[name]
    env=os.environ.copy()
    for n in ['OUT_DIR','XT_ENHANCE_QA_OUT','ENHANCE_CLOSED_OUT','FORGE_CLOSED_OUT','MARKET_CLOSED_OUT','NODE_OPTIONS']:
        env.pop(n,None)
    env['PYTHONDONTWRITEBYTECODE']='1'
    env.update(extra)
    if name in ['v06p1-enhance-open','v06p1-enhance-closed','v06p1-forge-open','v06p1-forge-closed','v06p1-market-closed','v06d-closed','v06c-closed']:
        hook=OUT/'regression-register.mjs'
        assert hook.is_file(), '历史测试的精确内存期望适配尚未完成'
        env['NODE_OPTIONS']='--import='+str(hook)
        env['ENCHANT_REGRESSION_CASE']=name
        env['ENCHANT_REGRESSION_OUT']=str(OUT/'regression'/name.removeprefix('v06p1-'))
    started=datetime.datetime.now(datetime.timezone.utc).isoformat()
    with (OUT/(name+'.log')).open('w',encoding='utf-8') as log:
        result=subprocess.run(command,cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
    output=(OUT/(name+'.log')).read_text()
    counts=re.findall(r'tests ok:\s*(\d+)\s+assertions',output)
    record=dict(command=command,cwd=str(cwd),environment={k:env[k] for k in [*extra,'NODE_OPTIONS','ENCHANT_REGRESSION_CASE','ENCHANT_REGRESSION_OUT'] if k in env},
        stdin='/dev/null',startedAt=started,exitCode=result.returncode,assertions=int(counts[-1]) if counts else None)
    (OUT/(name+'.result.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'check':name,**record},ensure_ascii=False),flush=True)
    if result.returncode: print(output[-3500:],flush=True)
    return result.returncode

if __name__=='__main__':
    sys.exit(max((run(n) for n in sys.argv[1:]),default=0))
