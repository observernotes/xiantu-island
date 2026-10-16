import { featureEnabled } from './features';

type SlotKey = 1 | 2 | 3;
export interface SavePanelSlot {
  slot: SlotKey;
  data?: Record<string, unknown> | null;
  lastSaveAt?: number;
}

/** The scene owns loading/restarting; this panel only presents three manual slots. */
export interface SaveSlotsPanelController {
  listSlots(): Promise<SavePanelSlot[]>;
  activeSlot(): number;
  saveSlot(slot: SlotKey): Promise<boolean>;
  loadSlot(slot: SlotKey): Promise<boolean>;
  deleteSlot(slot: SlotKey): Promise<boolean>;
  exportSlot(slot: SlotKey): Promise<Blob | null>;
  importSlot(slot: SlotKey, file: File): Promise<boolean>;
  onVisibilityChange?(visible: boolean): void;
}

/** Lightweight DOM entry, hidden completely while the release flag is closed. */
export function installSaveSlotsPanel(controller: SaveSlotsPanelController): (() => void) | undefined {
  if (!featureEnabled('indexedDbSaves')) return undefined;
  const entry = document.createElement('button');
  entry.type = 'button';
  entry.textContent = '存档';
  entry.setAttribute('aria-haspopup', 'dialog');
  entry.setAttribute('aria-expanded', 'false');
  entry.style.cssText = 'position:fixed;right:12px;top:12px;z-index:1100;padding:8px 14px;background:#243b39;color:#fff;border:1px solid #c9b983;border-radius:5px;cursor:pointer';
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,.7);display:none;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';
  const panel = document.createElement('section');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', '存档');
  panel.style.cssText = 'font:16px/1.5 sans-serif;max-width:660px;width:100%;max-height:90vh;overflow:auto;padding:22px;box-sizing:border-box;background:#f5f0dc;color:#252c27;border:2px solid #8f8156;border-radius:8px';
  const heading = document.createElement('h2');
  heading.textContent = '存档';
  heading.style.margin = '0 0 8px';
  const description = document.createElement('p');
  description.textContent = '三个手动存档位。读档将替换当前进度，请先保存。';
  const rows = document.createElement('div');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.style.minHeight = '1.5em';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '关闭';
  panel.append(heading, description, rows, status, close);
  overlay.append(panel);
  document.body.append(entry, overlay);
  let busy = false;
  let removed = false;

  const actionButton = (label: string, run: () => void, disabled = false): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.disabled = disabled;
    button.style.cssText = 'margin:4px 6px 4px 0;padding:6px 10px;cursor:pointer';
    button.addEventListener('click', run);
    return button;
  };

  const refresh = async (): Promise<void> => {
    const slots = await controller.listSlots();
    if (removed) return;
    rows.replaceChildren();
    for (const slot of [1, 2, 3] as const) {
      const saved = slots.find(value => value.slot === slot);
      const data = saved?.data;
      const row = document.createElement('div');
      row.style.cssText = 'padding:10px 0;border-bottom:1px solid #bcb69c';
      const summary = document.createElement('p');
      summary.style.margin = '0 0 6px';
      const timestamp = saved?.lastSaveAt;
      const time = typeof timestamp === 'number' && Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : '时间未知';
      summary.textContent = `存档 ${slot}${controller.activeSlot() === slot ? ' · 当前' : ''}：${data ? `${typeof data.name === 'string' ? data.name : '少年'} · ${typeof data.level === 'number' ? data.level : 1} 级 · ${time}` : '空'}`;
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.hidden = true;
      input.setAttribute('aria-label', `导入存档 ${slot}`);
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        input.value = '';
        if (!file || busy) return;
        if (data && !window.confirm(`导入将覆盖存档 ${slot}，是否继续？`)) return;
        void operate(() => controller.importSlot(slot, file), '导入成功。');
      });
      row.append(summary,
        actionButton('存入', () => {
          if (busy || data && !window.confirm(`将当前进度写入存档 ${slot}，是否覆盖？`)) return;
          void operate(() => controller.saveSlot(slot), '保存成功。');
        }),
        actionButton('读档', () => {
          if (busy || !window.confirm(`读取存档 ${slot} 并替换当前进度？`)) return;
          void operate(() => controller.loadSlot(slot), '读档成功。');
        }, !data),
        actionButton('删除', () => {
          if (busy || !window.confirm(`永久删除存档 ${slot}？`)) return;
          void operate(() => controller.deleteSlot(slot), '已删除。');
        }, !data),
        actionButton('导出', () => {
          if (busy) return;
          void operate(async () => {
            const blob = await controller.exportSlot(slot);
            if (!blob) return false;
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `xiantu-slot-${slot}.json`;
            link.hidden = true;
            document.body.append(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            return true;
          }, '已导出。');
        }, !data),
        actionButton('导入', () => { if (!busy) input.click(); }), input);
      rows.append(row);
    }
  };

  const operate = async (run: () => Promise<boolean>, success: string): Promise<void> => {
    if (busy) return;
    busy = true;
    panel.setAttribute('aria-busy', 'true');
    status.textContent = '正在处理…';
    try {
      const ok = await run();
      await refresh();
      status.textContent = ok ? success : '操作失败，存档未确认写入，请重试。';
    } catch {
      status.textContent = '操作失败，请重试。';
    } finally { busy = false; panel.removeAttribute('aria-busy'); }
  };
  const show = (): void => {
    const wasHidden = overlay.style.display === 'none';
    overlay.style.display = 'flex';
    entry.setAttribute('aria-expanded', 'true');
    if (wasHidden) controller.onVisibilityChange?.(true);
    status.textContent = '正在读取…';
    close.focus();
    void refresh().then(() => { status.textContent = ''; }, () => { status.textContent = '读取存档失败，请关闭后重试。'; });
  };
  const hide = (): void => {
    if (!busy) {
      overlay.style.display = 'none';
      entry.setAttribute('aria-expanded', 'false');
      controller.onVisibilityChange?.(false);
      entry.focus();
    }
  };
  entry.addEventListener('click', show);
  close.addEventListener('click', hide);
  overlay.addEventListener('click', event => { if (event.target === overlay) hide(); });
  // Keep panel actions from also triggering game shortcuts underneath it.
  overlay.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') hide();
    if (event.key === 'Tab') {
      const focusable = Array.from(panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  overlay.addEventListener('keyup', event => event.stopPropagation());
  if (new URLSearchParams(window.location.search).get('saves') === '1') show();
  return () => {
    removed = true;
    if (overlay.style.display !== 'none') controller.onVisibilityChange?.(false);
    entry.remove();
    overlay.remove();
  };
}
