"""本窗写前/写后保护核验；仅接受 Flag 注释和 Progress 精确四行。"""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


before = json.loads((OUT / 'protected-before-task.json').read_text())
directories = json.loads((OUT / 'protected-directories-before-task.json').read_text())
after = {name: sha(Path(name)) for name in before}
allowed = [str(ROOT / 'src/EnhanceOpenFlag.ts'), str(ROOT / 'src/Progress.ts')]
changed = [name for name in before if before[name] != after[name]]
unauthorized = [name for name in changed if name not in allowed]
flag = (ROOT / 'src/EnhanceOpenFlag.ts').read_text()
assert flag == ('/** 正式恒关；仅 Vite SSR 开态夹具图可由 resolve/load 内存模块注入 true。 */\n'
                'export function isEnhanceOpenForFixture(): boolean { return false; }\n')
progress = (ROOT / 'src/Progress.ts').read_text()
for line in [
    "import { isValidEnhanceProgress, type EnhanceProgress } from './EnhanceProgress';",
    "  if (has('enhance') && !isValidEnhanceProgress(saved.enhance)) return false;",
    '  /** 仅承载明确授权的强化夹具事实；缺袋旧档不补建，读回不结算。 */',
    '  enhance: EnhanceProgress | undefined = undefined;',
]:
    assert progress.count(line + '\n') == 1, line
    progress = progress.replace(line + '\n', '')
assert hashlib.sha256(progress.encode()).hexdigest() == before[str(ROOT / 'src/Progress.ts')]
for name, expected in directories.items():
    directory = Path(name)
    current = sorted(str(path.relative_to(directory)) for path in directory.rglob('*') if path.is_file())
    assert current == expected, name
assert not unauthorized, unauthorized
result = {
    'passed': True, 'protectedFiles': len(before), 'protectedDirectories': len(directories),
    'authorizedChanges': changed, 'unauthorizedDifferences': unauthorized,
    'EnhanceClosedPreserved': True, 'oldEnhanceClosedQaPreserved': True,
    'formalOpen': False, 'softOpened': False, 'released': False,
}
(OUT / 'protected-after-task.json').write_text(json.dumps(after, ensure_ascii=False, indent=2) + '\n')
(OUT / 'protected-diff.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(result, ensure_ascii=False))
