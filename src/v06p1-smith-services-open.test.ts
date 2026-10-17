// O01–O11 fixture orchestration; settlement stays in the existing four Gates.
import { runUiOpenCases } from './v06p1-smith-services-open-ui.test';
import { runGateOpenCases } from './v06p1-smith-services-open-gates.test';

export interface SmithOpenCaseRecord {
  executed: boolean;
  passed: boolean;
  blocked?: string;
  evidenceKeys: string[];
  evidence?: Record<string, unknown>;
}
export interface SmithOpenOptions {
  dataMode: string;
  graph: string;
  controls: {
    setRoute(value: Record<string, unknown>): void;
    setGate(name: string, value: boolean): void;
  };
}
type SuiteResult = Record<string, unknown>;

export async function runSmithServicesOpenTests(options: SmithOpenOptions) {
  const results = [await runUiOpenCases(options), await runGateOpenCases(options)] as unknown as SuiteResult[];
  const cases: Record<string, SmithOpenCaseRecord> = {};
  for (const result of results) {
    const records = (result.cases ?? result) as Record<string, SmithOpenCaseRecord>;
    for (const [id, row] of Object.entries(records)) {
      if (!/^O(?:0[1-9]|1[01])$/u.test(id)) continue;
      if (!row.executed || (!row.passed && !row.blocked) || !Array.isArray(row.evidenceKeys) || !row.evidenceKeys.length)
        throw new Error(`${options.graph}/${id}: missing executed PASS or explicit blocking evidence`);
      const old = cases[id];
      cases[id] = old ? { executed: old.executed && row.executed, passed: old.passed && row.passed,
        ...(old.blocked || row.blocked ? { blocked: [old.blocked, row.blocked].filter(Boolean).join('; ') } : {}),
        evidenceKeys: [...new Set([...old.evidenceKeys, ...row.evidenceKeys])],
        evidence: { ...old.evidence, ...row.evidence } } : row;
    }
  }
  for (let index = 1; index <= 11; index++) {
    const id = `O${String(index).padStart(2, '0')}`;
    if (!cases[id]?.executed) throw new Error(`${options.graph}/${id}: case was not executed`);
  }
  return { cases, suites: results, assertions: results.reduce((count, result) => count + (Number(result.assertions) || 0), 0) };
}
