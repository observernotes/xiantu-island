"""Run the seven authorized regressions with stdin closed and isolated QA output."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
RUNS = {
    "forge-open": "OUT_DIR",
    "forge-closed": "FORGE_CLOSED_OUT",
    "enhance-open": "XT_ENHANCE_QA_OUT",
    "enhance-closed": "ENHANCE_CLOSED_OUT",
    "enchant-open": "ENCHANT_OPEN_OUT",
    "enchant-closed": "ENCHANT_CLOSED_OUT",
    "market-closed": "MARKET_CLOSED_OUT",
}


def run_one(name):
    command = ["npm", "run", "test:v06p1-" + name]
    env = dict(os.environ)
    for key in set(RUNS.values()) | {"OUT", "OUT_DIR", "ENCHANT_OPEN_OUT", "NODE_OPTIONS"}:
        env.pop(key, None)
    env[RUNS[name]] = str(OUT / name)
    started = time.time()
    with (OUT / (name + ".log")).open("w", encoding="utf-8") as log:
        result = subprocess.run(command, cwd=ROOT, env=env, stdin=subprocess.DEVNULL,
                                stdout=log, stderr=subprocess.STDOUT, check=False)
    evidence_file = OUT / name / ("v06p1-" + name + "-evidence.json")
    evidence = json.loads(evidence_file.read_text()) if evidence_file.exists() else {}
    row = {"command": " ".join(command), "cwd": str(ROOT), "stdin": "/dev/null",
           "exitCode": result.returncode, "passed": result.returncode == 0,
           "durationSeconds": round(time.time() - started, 3),
           "assertions": evidence.get("assertions"), "log": str(OUT / (name + ".log")),
           "evidence": str(evidence_file)}
    (OUT / (name + ".result.json")).write_text(json.dumps(row, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(row, ensure_ascii=False), flush=True)
    return row


if __name__ == "__main__":
    selected = sys.argv[1:] or list(RUNS)
    if any(name not in RUNS for name in selected):
        raise SystemExit("Unknown authorized regression")
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(run_one, selected))
    results = [json.loads((OUT / (name + ".result.json")).read_text()) for name in RUNS]
    summary = {"passed": all(row["passed"] for row in results), "results": results,
               "assertions": sum(row["assertions"] or 0 for row in results),
               "productModuleTransformations": [], "oldQaOutputsWritten": False,
               "boundary": "分解 soft-open ≠ 进包 ≠ 发版；fixture ≠ 正式；release v0.6.12 另令"}
    (OUT / "regression-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    raise SystemExit(0 if summary["passed"] else 1)
