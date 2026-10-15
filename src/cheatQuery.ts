export interface CheatQuery {
  enabled: boolean;
  god: boolean;
  stones?: number;
  contrib?: number;
  realm?: string;
  level?: number;
  fillExp: boolean;
  quests: string[];
  spawns: string[];
  unlocks: string[];
}

/** 只认显式开启；其他参数在普通入口下完全忽略。 */
export function parseQuery(search: string): CheatQuery {
  const q = new URLSearchParams(search);
  const enabled = q.get('cheat') === '1' || q.get('cheat') === 'true';
  const result: CheatQuery = { enabled, god: false, fillExp: false, quests: [], spawns: [], unlocks: [] };
  if (!enabled) return result;
  const number = (key: string, min: number, fallback?: number) => {
    if (!q.has(key)) return undefined;
    const raw = q.get(key)!.trim();
    const n = raw === '' ? fallback : Number(raw);
    return n !== undefined && Number.isSafeInteger(n) && n >= min ? n : undefined;
  };
  result.god = q.get('god') === '1';
  result.stones = number('stone', 0, 999999);
  result.contrib = number('contrib', 0, 999999);
  result.realm = q.get('realm')?.trim() || undefined;
  result.level = number('level', 1);
  result.fillExp = q.get('exp') === '满';
  result.quests = q.getAll('quest');
  result.spawns = q.getAll('spawn');
  result.unlocks = q.getAll('unlock').flatMap(value => value.split(',').map(id => id.trim()).filter(Boolean));
  return result;
}
