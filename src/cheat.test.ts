import { parseQuery } from './cheatQuery';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}：得到 ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`);
  }
}

// URL 门控是唯一入口；其他参数不能单独启动作弊器。
for (const gate of ['', '?', '?cheat', '?cheat=0', '?cheat=false', '?cheat=TRUE', '?cheat=yes']) {
  const parsed = parseQuery(`${gate}${gate.includes('?') ? '&' : '?'}god=1&stone=33&contrib=44&level=30&realm=金丹&exp=满&quest=skip&spawn=item:fox_tail&unlock=skills`);
  eq(parsed.enabled, false, `${gate || '空 URL'} 不启用`);
  eq(parsed.god, false, '关闭时不启用无敌');
  for (const key of ['stones', 'contrib', 'realm', 'level'] as const) eq(parsed[key], undefined, `关闭时不解析 ${key}`);
  eq(parsed.fillExp, false, '关闭时不满修');
  for (const key of ['quests', 'spawns', 'unlocks'] as const) eq(parsed[key], [], `关闭时不解析 ${key}`);
}

for (const enabled of ['1', 'true']) {
  const parsed = parseQuery(`?cheat=${enabled}&god=1&stone=&contrib`);
  eq(parsed.enabled, true, `cheat=${enabled} 启用`);
  eq(parsed.god, true, 'god=1 启用无敌');
  eq(parsed.stones, 999999, '空 stone 用默认数额');
  eq(parsed.contrib, 999999, '空 contrib 用默认数额');
}
const combined = parseQuery('?map=qingyun_village&debug=1&__xt=1&cheat=true&god=1&stone=123&contrib=0&realm=%E7%AD%91%E5%9F%BA%E6%9C%9F&level=30&exp=%E6%BB%A1&quest=accept:q_bamboo&quest=complete:q_awaken&quest=skip&spawn=mon:demon_fox&spawn=item:fox_tailx3&unlock=skills,outfits');
eq(combined.enabled, true, '既有 map/debug/__xt 不干扰入口');
eq(combined.stones, 123, '解析灵石');
eq(combined.contrib, 0, '允许零贡献');
eq(combined.realm, '筑基期', 'URL 解码境界');
eq(combined.level, 30, '解析等级');
eq(combined.fillExp, true, '解析中文满修');
eq(combined.quests, ['accept:q_bamboo', 'complete:q_awaken', 'skip'], '保留重复任务参数及顺序');
eq(combined.spawns, ['mon:demon_fox', 'item:fox_tailx3'], '保留重复刷怪/物参数及数量');
eq(combined.unlocks, ['skills', 'outfits'], '解析逗号解锁列表');
const absent = parseQuery('?cheat=1');
eq(absent.god, false, '无 god 参数默认不无敌');
eq(absent.stones, undefined, '缺省 stone 不改资源');
eq(absent.contrib, undefined, '缺省 contrib 不改资源');
eq(absent.fillExp, false, '无 exp 参数不满修');
for (const value of ['-1', '1.5', 'NaN', 'Infinity', '9007199254740992', 'oops']) {
  const parsed = parseQuery(`?cheat=1&stone=${value}&contrib=${value}&level=${value}`);
  eq(parsed.stones, undefined, `拒绝非法灵石 ${value}`);
  eq(parsed.contrib, undefined, `拒绝非法贡献 ${value}`);
  eq(parsed.level, undefined, `拒绝非法等级 ${value}`);
}
eq(parseQuery('?cheat=1&level=0').level, undefined, '等级必须至少为 1');
eq(parseQuery('?cheat=1&stone=0').stones, 0, '允许灵石清零');
eq(parseQuery('?cheat=1&god=true&exp=100').god, false, 'god 仅识别约定的 1');
eq(parseQuery('?cheat=1&exp=100').fillExp, false, 'exp 仅识别满');
console.log(`作弊器 URL 参数自测通过：${assertions} 项断言`);
