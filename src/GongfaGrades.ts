/** 功法品阶的只读入口；配置失效仅停用品阶修正，旧技能仍走原规则。 */
export const GONGFA_GRADE_IDS = Object.freeze(['huang', 'xuan', 'di', 'tian'] as const);
export type GongfaGradeId = typeof GONGFA_GRADE_IDS[number];
export interface GongfaSkillSource { readonly id: string; readonly damageRatio?: number }
export interface GongfaGrade {
  readonly id: GongfaGradeId; readonly nameKey: string; readonly levelCap: number;
  readonly effectMul: number; readonly balanceTodo: readonly string[];
}
export interface GongfaBinding {
  readonly skillId: string; readonly initialGrade: GongfaGradeId; readonly capMode: 'legacy';
  readonly effectMode: 'none' | 'damage_ratio'; readonly enabled: boolean;
}
interface FutureGate { readonly enabled: boolean; readonly [key: string]: unknown }
interface FutureProfile extends FutureGate { readonly id: string }
export interface GongfaGradesConfig {
  readonly version: 'v0.5'; readonly enabled: boolean;
  readonly rules: {
    readonly gradeOrder: readonly GongfaGradeId[]; readonly missingBinding: 'legacy'; readonly scope: 'playthrough';
    readonly masteryRulesRef: 'skills.rules'; readonly sourceOwnership: 'originating_system';
  };
  readonly grades: readonly GongfaGrade[]; readonly bindings: readonly GongfaBinding[];
  readonly future: {
    readonly version: 'v0.7'; readonly study: FutureGate; readonly epiphany: FutureGate;
    readonly upgradeProfiles: readonly FutureProfile[]; readonly assemblyProfiles: readonly FutureProfile[];
    readonly recipes: readonly FutureProfile[]; readonly variants: readonly FutureProfile[];
  };
}
export interface GongfaGradesValidation { readonly config: GongfaGradesConfig | null; readonly errors: readonly string[] }

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const gradeId = (value: unknown): value is GongfaGradeId => typeof value === 'string' && (GONGFA_GRADE_IDS as readonly string[]).includes(value);
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** 不猜缺失值；缺绑定合法。future 仅检查门禁及身份，不消费未实现玩法的预算。 */
export function parseGongfaGradesConfig(raw: unknown,
  skills?: readonly GongfaSkillSource[] | Readonly<Record<string, GongfaSkillSource>>): GongfaGradesValidation {
  const errors: string[] = [];
  const check = (valid: boolean, path: string, message: string) => { if (!valid) errors.push(`gongfa_grades.json ${path}: ${message}`); };
  if (!record(raw)) return freeze({ config: null, errors: ['gongfa_grades.json $: 必须为对象'] });
  check(raw.version === 'v0.5', '$.version', '仅支持 v0.5');
  check(typeof raw.enabled === 'boolean', '$.enabled', '必须为 boolean');
  const rules = record(raw.rules) ? raw.rules : {};
  check(record(raw.rules), '$.rules', '缺失或不是对象');
  check(Array.isArray(rules.gradeOrder) && rules.gradeOrder.length === GONGFA_GRADE_IDS.length
    && GONGFA_GRADE_IDS.every((id, index) => rules.gradeOrder instanceof Array && rules.gradeOrder[index] === id),
  '$.rules.gradeOrder', '必须依次为 huang / xuan / di / tian');
  for (const [key, expected] of Object.entries({ missingBinding: 'legacy', scope: 'playthrough',
    masteryRulesRef: 'skills.rules', sourceOwnership: 'originating_system' })) {
    check(rules[key] === expected, `$.rules.${key}`, `必须为 ${expected}`);
  }

  const grades = Array.isArray(raw.grades) ? raw.grades : [];
  check(Array.isArray(raw.grades) && grades.length === GONGFA_GRADE_IDS.length, '$.grades', '必须完整配置四阶');
  let priorCap = 0, priorMul = 1;
  Array.from(grades).forEach((row, index) => {
    const p = `$.grades[${index}]`;
    if (!record(row)) { check(false, p, '必须为对象'); return; }
    check(row.id === GONGFA_GRADE_IDS[index], `${p}.id`, '必须与 gradeOrder 顺序一一对应');
    check(gradeId(row.id) && row.nameKey === `gongfa.grade.${row.id}`, `${p}.nameKey`, '必须引用对应 gongfa.grade 文案');
    const capValid = positive(row.levelCap) && Number.isSafeInteger(row.levelCap);
    check(capValid, `${p}.levelCap`, '必须为正安全整数');
    if (capValid) { check((row.levelCap as number) >= priorCap, `${p}.levelCap`, '各阶上限必须单调不降'); priorCap = row.levelCap as number; }
    const mulValid = positive(row.effectMul) && row.effectMul >= 1;
    check(mulValid, `${p}.effectMul`, '必须为不弱化原技能的有限直接乘数');
    if (mulValid) { check((row.effectMul as number) >= priorMul, `${p}.effectMul`, '各阶倍率必须单调不降'); priorMul = row.effectMul as number; }
    check(Array.isArray(row.balanceTodo) && row.balanceTodo.length === 0, `${p}.balanceTodo`, '本期使用字段必须已回填，清单为 []');
  });

  const skillIndex = skills ? new Map((Array.isArray(skills) ? skills : Object.values(skills)).map(skill => [skill.id, skill])) : null;
  const bindings = Array.isArray(raw.bindings) ? raw.bindings : [];
  check(Array.isArray(raw.bindings), '$.bindings', '必须为数组；缺绑定沿 legacy');
  const seenSkills = new Set<string>();
  Array.from(bindings).forEach((binding, index) => {
    const p = `$.bindings[${index}]`;
    if (!record(binding)) { check(false, p, '必须为对象'); return; }
    check(text(binding.skillId), `${p}.skillId`, '必须为非空技能 id');
    if (text(binding.skillId)) {
      check(!seenSkills.has(binding.skillId), `${p}.skillId`, '技能绑定重复'); seenSkills.add(binding.skillId);
      if (skillIndex) {
        const skill = skillIndex.get(binding.skillId);
        check(!!skill, `${p}.skillId`, '必须引用 skills 现有技能');
        if (skill && binding.effectMode === 'damage_ratio') check(positive(skill.damageRatio), `${p}.effectMode`, 'damage_ratio 必须引用有合法根 damageRatio 的技能');
      }
    }
    check(gradeId(binding.initialGrade), `${p}.initialGrade`, '必须引用现有品阶');
    check(binding.capMode === 'legacy', `${p}.capMode`, 'v0.5 仅接入 legacy；grade 尚无迁移消费者');
    check(binding.effectMode === 'none' || binding.effectMode === 'damage_ratio', `${p}.effectMode`, '必须为 none / damage_ratio');
    check(typeof binding.enabled === 'boolean', `${p}.enabled`, '必须为 boolean');
  });

  const future = record(raw.future) ? raw.future : {};
  check(record(raw.future), '$.future', '缺失或不是对象');
  check(future.version === 'v0.7', '$.future.version', '必须为 v0.7');
  for (const key of ['study', 'epiphany']) {
    const block = future[key];
    check(record(block), `$.future.${key}`, '缺失或不是对象');
    check(record(block) && typeof block.enabled === 'boolean', `$.future.${key}.enabled`, '必须为 boolean');
  }
  const profileIds = new Map<string, Set<string>>();
  for (const key of ['upgradeProfiles', 'assemblyProfiles', 'recipes', 'variants']) {
    const rows = Array.isArray(future[key]) ? future[key] as unknown[] : [];
    check(Array.isArray(future[key]), `$.future.${key}`, '必须为数组');
    const seen = new Set<string>(); profileIds.set(key, seen);
    Array.from(rows).forEach((row, index) => {
      const p = `$.future.${key}[${index}]`;
      if (!record(row)) { check(false, p, '必须为对象'); return; }
      check(text(row.id), `${p}.id`, '必须为非空 id');
      if (text(row.id)) { check(!seen.has(row.id), `${p}.id`, 'id 重复'); seen.add(row.id); }
      check(typeof row.enabled === 'boolean', `${p}.enabled`, '必须为 boolean');
      if (key === 'upgradeProfiles') {
        check(gradeId(row.fromGrade), `${p}.fromGrade`, '必须引用现有品阶');
        check(gradeId(row.toGrade), `${p}.toGrade`, '必须引用现有品阶');
        if (gradeId(row.fromGrade) && gradeId(row.toGrade)) check(GONGFA_GRADE_IDS.indexOf(row.toGrade) === GONGFA_GRADE_IDS.indexOf(row.fromGrade) + 1,
          `${p}.toGrade`, '只允许相邻逐阶提升');
      } else if (key === 'assemblyProfiles') check(gradeId(row.grade), `${p}.grade`, '必须引用现有品阶');
      else {
        check(text(row.skillId) && (!skillIndex || skillIndex.has(row.skillId)), `${p}.skillId`, '必须引用技能 id');
        if (key === 'recipes') {
          check(row.kind === 'assembly' || row.kind === 'upgrade', `${p}.kind`, '必须为 assembly / upgrade');
          const ids = profileIds.get(row.kind === 'assembly' ? 'assemblyProfiles' : 'upgradeProfiles');
          check(text(row.profileId) && !!ids?.has(row.profileId), `${p}.profileId`, '必须引用对应类型的模板');
        }
      }
    });
  }
  if (errors.length) return freeze({ config: null, errors });
  try {
    // 不冻结调用方的 JSON，也不向旧技能或存档写品阶字段。
    const config = JSON.parse(JSON.stringify(raw)) as GongfaGradesConfig;
    return freeze({ config, errors });
  } catch {
    return freeze({ config: null, errors: ['gongfa_grades.json $: 必须为可复制的 JSON 配置'] });
  }
}

/** 只供已按等级求出的根 damageRatio 使用一次；派生伤害不再调用。 */
export function effectMul(config: GongfaGradesConfig | null, skillId: string): number {
  if (!config?.enabled) return 1;
  const binding = config.bindings.find(row => row.skillId === skillId);
  if (!binding?.enabled || binding.effectMode !== 'damage_ratio') return 1;
  return config.grades.find(row => row.id === binding.initialGrade)?.effectMul ?? 1;
}

/** 本轮所有 capMode 均为 legacy：原 maxLevel 与后续原上限奖励保持权威。 */
export function levelCap(_config: GongfaGradesConfig | null, _skillId: string, legacyMaxLevel: number): number {
  return legacyMaxLevel;
}

export type GongfaFutureKind = 'study' | 'epiphany' | 'upgrade' | 'assembly';
export interface GongfaFutureAvailability { readonly available: false; readonly reason: 'config' | 'disabled' | 'unimplemented' }
/** 即使克隆表打开未来门禁，也没有已实现事务可执行。 */
export function futureAvailability(config: GongfaGradesConfig | null, kind: GongfaFutureKind, profileId?: string): GongfaFutureAvailability {
  if (!config) return Object.freeze({ available: false, reason: 'config' });
  if (!config.enabled) return Object.freeze({ available: false, reason: 'disabled' });
  const gate = kind === 'study' || kind === 'epiphany' ? config.future[kind]
    : config.future[kind === 'upgrade' ? 'upgradeProfiles' : 'assemblyProfiles'].find(row => row.id === profileId);
  return Object.freeze({ available: false, reason: gate?.enabled ? 'unimplemented' : 'disabled' });
}
