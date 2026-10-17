from pathlib import Path
import subprocess,json,time
root=Path.cwd(); out=root/'qa/out_v06p1_smith_services_closed'; audit=out/'audit'
commands=[('tsc',['npx','tsc','--noEmit']),('diff-check',['git','diff','--check']),('protection',['python3',str(audit/'check-protection.py')])]
results=[]
for name,command in commands:
 start=time.time(); result=subprocess.run(command,cwd=root,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 (audit/f'{name}.log').write_bytes(result.stdout)
 row={'name':name,'command':command,'cwd':str(root),'stdin':'/dev/null','exitCode':result.returncode,'durationSeconds':round(time.time()-start,3),'log':str(audit/f'{name}.log')}
 (audit/f'{name}.result.json').write_text(json.dumps(row,ensure_ascii=False,indent=2)+'\n');results.append(row)
 print(name,result.returncode,result.stdout.decode()[-1800:]);assert result.returncode==0
