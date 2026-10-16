import { REALMS, TILED_MAPS } from './data';

export interface CheatPanelApi {
  readonly god: boolean;
  setGod(enabled: boolean): Promise<boolean>;
  setStones(n?: number): Promise<boolean>;
  setContrib(n?: number): Promise<boolean>;
  setRealm(value: string): Promise<boolean>;
  setLevel(n: number): Promise<boolean>;
  fillExp(): Promise<boolean>;
  acceptQuest(id: string): Promise<boolean>;
  completeQuest(id: string): Promise<boolean>;
  skipQuests(): Promise<boolean>;
  spawnMon(id: string): Promise<boolean>;
  spawnItem(id: string, n?: number): Promise<boolean>;
  unlockSkills(): Promise<boolean>;
  unlockOutfits(): Promise<boolean>;
  teleport(id: string): Promise<boolean>;
  nextRealm(): Promise<boolean>;
}

let removePanel: (() => void) | undefined;

/** 由 URL 门控模块安装一次；所有动作实时访问当前场景，切图不重建面板。 */
export function installPanel(api: CheatPanelApi): () => void {
  removePanel?.();
  const panel = document.createElement('aside');
  panel.id = 'xt-cheat-panel';
  panel.dataset.testid = 'cheat-panel';
  panel.setAttribute('aria-label', '内部作弊器');
  const style = document.createElement('style');
  style.textContent = `
    #xt-cheat-panel { position:fixed; right:12px; top:70px; z-index:10000; width:286px;
      max-width:calc(100vw - 24px); color:#f1e3c7; background:rgba(28,31,33,.95);
      border:1px solid #9b865b; border-radius:6px; font:12px/1.4 sans-serif;
      box-shadow:0 3px 12px #0006; box-sizing:border-box; }
    #xt-cheat-panel * { box-sizing:border-box; }
    #xt-cheat-panel [hidden] { display:none; }
    #xt-cheat-panel header { display:flex; align-items:center; gap:6px; padding:6px 8px; }
    #xt-cheat-panel header strong { flex:1; }
    #xt-cheat-panel .cheat-body { padding:0 8px 8px; max-height:calc(100vh - 130px); overflow:auto; }
    #xt-cheat-panel .cheat-row { display:flex; align-items:center; gap:4px; margin-top:6px; }
    #xt-cheat-panel .cheat-note { color:#c6b994; font-size:11px; }
    #xt-cheat-panel button, #xt-cheat-panel input, #xt-cheat-panel select {
      min-width:0; border:1px solid #786b51; border-radius:3px; padding:4px 5px;
      color:inherit; background:#343737; font:inherit; }
    #xt-cheat-panel button { white-space:nowrap; cursor:pointer; }
    #xt-cheat-panel button:hover { background:#525344; }
    #xt-cheat-panel button:focus-visible, #xt-cheat-panel input:focus, #xt-cheat-panel select:focus {
      outline:1px solid #e5bf69; outline-offset:1px; }
    #xt-cheat-panel input, #xt-cheat-panel select { flex:1; width:100%; }
    #xt-cheat-panel input[type=number] { width:65px; }
    #xt-cheat-panel .cheat-count { flex:0 0 48px; width:48px; }
    #xt-cheat-panel .cheat-status { margin-top:7px; min-height:17px; color:#b9dba6; overflow-wrap:anywhere; }
  `;
  panel.append(style);
  const header = document.createElement('header');
  const title = document.createElement('strong');
  title.textContent = '内部作弊器';
  const shortcut = document.createElement('span');
  shortcut.className = 'cheat-note';
  shortcut.textContent = '` / F2';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.dataset.cheatAction = 'toggle';
  header.append(title, shortcut, toggle);
  panel.append(header);
  const body = document.createElement('div');
  body.className = 'cheat-body';
  const note = document.createElement('div');
  note.className = 'cheat-note';
  note.textContent = '操作直接修改并保存当前存档';
  body.append(note);
  panel.append(body);
  const status = document.createElement('div');
  status.className = 'cheat-status';
  status.dataset.testid = 'cheat-status';
  status.setAttribute('role', 'status');

  function row() {
    const element = document.createElement('div');
    element.className = 'cheat-row';
    body.append(element);
    return element;
  }
  function input(parent: HTMLElement, id: string, label: string, value: string, type = 'text') {
    const element = document.createElement('input');
    element.type = type;
    element.id = `cheat-${id}`;
    element.setAttribute('aria-label', label);
    element.placeholder = label;
    element.value = value;
    element.autocomplete = 'off';
    if (type === 'number') { element.min = '0'; element.step = '1'; }
    parent.append(element);
    return element;
  }
  async function run(label: string, action: () => Promise<boolean>) {
    let success = false;
    try { success = await action(); }
    catch (error) { console.warn(`[Cheat] ${label}失败`, error); }
    syncGod();
    status.textContent = `${label}${success ? '：完成' : '：未执行，请检查 id 或数值'}`;
    status.style.color = success ? '#b9dba6' : '#efbc8f';
  }
  function button(parent: HTMLElement, id: string, label: string, action: () => Promise<boolean>) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.dataset.cheatAction = id;
    element.addEventListener('click', () => { void run(label, action); });
    parent.append(element);
    return element;
  }
  function select(parent: HTMLElement, id: string, label: string, options: Array<[string, string]>) {
    const element = document.createElement('select');
    element.id = `cheat-${id}`;
    element.setAttribute('aria-label', label);
    for (const [value, text] of options) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      element.append(option);
    }
    parent.append(element);
    return element;
  }
  const godRow = row();
  const godButton = button(godRow, 'god', '无敌：关', () => api.setGod(!api.god));
  const resource = input(godRow, 'resource', '资源数量', '999999', 'number');
  button(godRow, 'stones', '灵石', () => api.setStones(Number(resource.value)));
  button(godRow, 'contrib', '贡献', () => api.setContrib(Number(resource.value)));

  const realmRow = row();
  const realm = select(realmRow, 'realm', '境界', REALMS.map(value => [value.id, value.name]));
  button(realmRow, 'realm', '设境界', () => api.setRealm(realm.value));
  button(realmRow, 'next-realm', '升境', () => api.nextRealm());
  button(realmRow, 'exp', '满修', () => api.fillExp());
  const levelRow = row();
  const level = input(levelRow, 'level', '等级', '10', 'number');
  level.min = '1';
  button(levelRow, 'level', '设等级', () => api.setLevel(Number(level.value)));
  button(levelRow, 'skills', '技能全开', () => api.unlockSkills());
  button(levelRow, 'outfits', '五宗道袍', () => api.unlockOutfits());

  const questRow = row();
  const quest = input(questRow, 'quest', '任务 id', 'q_awaken');
  const questActions = row();
  button(questActions, 'accept-quest', '接任务', () => api.acceptQuest(quest.value.trim()));
  button(questActions, 'complete-quest', '完任务', () => api.completeQuest(quest.value.trim()));
  button(questActions, 'skip-quests', '完成当前主支线', () => api.skipQuests());

  const monRow = row();
  const monster = input(monRow, 'monster', '怪物 id', 'demon_fox');
  button(monRow, 'spawn-mon', '刷怪', () => api.spawnMon(monster.value.trim()));
  const itemRow = row();
  const item = input(itemRow, 'item', '物品 id', 'fox_tail');
  const count = input(itemRow, 'count', '物品数量', '1', 'number');
  count.className = 'cheat-count';
  count.min = '1';
  button(itemRow, 'spawn-item', '刷物', () => api.spawnItem(item.value.trim(), Number(count.value)));

  const mapRow = row();
  const mapOptions: Array<[string, string]> = Object.entries(TILED_MAPS).map(([id, map]) => {
    const name = map.properties?.find((property: { name: string }) => property.name === 'name')?.value;
    return [id, typeof name === 'string' ? name : id];
  });
  mapOptions.push(['field_test', '测试场 field_test']);
  const map = select(mapRow, 'map', '传送地图', mapOptions);
  button(mapRow, 'teleport', '传送', () => api.teleport(map.value));
  body.append(status);

  function syncGod() {
    godButton.textContent = `无敌：${api.god ? '开' : '关'}`;
    godButton.setAttribute('aria-pressed', String(api.god));
  }
  function setOpen(open: boolean) {
    if (!open && panel.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    body.hidden = !open;
    panel.dataset.open = String(open);
    toggle.textContent = open ? '收起' : '展开';
    toggle.setAttribute('aria-expanded', String(open));
  }
  toggle.addEventListener('click', () => setOpen(body.hidden));
  function onKey(event: KeyboardEvent) {
    if (event.code === 'Backquote' || event.key === '`' || event.key === 'F2') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) setOpen(body.hidden);
    } else if (event.target instanceof Node && panel.contains(event.target)) {
      // 在 window 捕获阶段拦住 Phaser 和 keyguard；保留默认行为供输入框打字。
      event.stopImmediatePropagation();
    }
  }
  function onKeyUp(event: KeyboardEvent) {
    if (event.target instanceof Node && panel.contains(event.target)) event.stopImmediatePropagation();
  }
  function onOutsidePointer(event: PointerEvent) {
    if (event.target instanceof Node && !panel.contains(event.target) && panel.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
    }
  }
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('pointerdown', onOutsidePointer, true);
  for (const event of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'wheel']) {
    panel.addEventListener(event, value => value.stopPropagation());
  }
  syncGod();
  setOpen(true);
  document.body.append(panel);
  const refresh = window.setInterval(syncGod, 500);
  const dispose = () => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('pointerdown', onOutsidePointer, true);
    window.clearInterval(refresh);
    panel.remove();
    if (removePanel === dispose) removePanel = undefined;
  };
  removePanel = dispose;
  return dispose;
}
