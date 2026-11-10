import type { Tower } from './towers';

export function formatRun(seconds: number) {
  const tenths = Math.floor(seconds * 10);
  return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, '0')}.${tenths % 10}`;
}

export function expeditionMenu(towers: Tower[], options: {
  canOpen(): boolean;
  records(): Record<string, number>;
  onOpen(): void;
  onClose(): void;
  onChoose(tower: Tower): void;
  onHome(): void;
}) {
  const dialog = document.querySelector<HTMLDialogElement>('#expeditionDialog')!;
  const list = dialog.querySelector('#expeditionList')!;
  const tally = dialog.querySelector('#expeditionTally')!;
  const button = document.getElementById('expeditionBtn')!;
  const shortcut = document.body.classList.contains('touch') ? '' : ' (P)';
  const cards = towers.map((tower, index) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'expedition-row';
    row.style.setProperty('--trail-color', tower.info.color);
    const number = document.createElement('span');
    number.className = 'expedition-number';
    number.textContent = String(index + 1).padStart(2, '0');
    number.setAttribute('aria-hidden', 'true');
    const description = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = tower.info.name;
    const hint = document.createElement('small');
    hint.textContent = tower.info.hint;
    description.append(title, hint);
    const record = document.createElement('span');
    record.className = 'expedition-record';
    row.append(number, description, record);
    row.addEventListener('click', () => {
      options.onChoose(tower);
      dialog.close();
    });
    list.append(row);
    return { tower, row, record };
  });
  const refresh = () => {
    const records = options.records();
    const done = cards.filter(({ tower }) => records[tower.id] !== undefined).length;
    tally.textContent = `${done} / ${cards.length} 완주`;
    for (const { tower, record, row } of cards) {
      const best = records[tower.id];
      record.textContent = best === undefined ? '도전 →' : formatRun(best);
      row.classList.toggle('recorded', best !== undefined);
    }
    button.textContent = `원정 지도${shortcut} · ${done}/${cards.length}`;
  };
  const open = () => {
    if (dialog.open || !options.canOpen()) return;
    refresh();
    options.onOpen();
    dialog.showModal();
  };
  button.addEventListener('click', open);
  dialog.addEventListener('close', options.onClose);
  dialog.querySelector('#expeditionClose')!.addEventListener('click', () => dialog.close());
  dialog.querySelector('#expeditionHome')!.addEventListener('click', () => {
    options.onHome();
    dialog.close();
  });
  addEventListener('keydown', e => {
    if (e.code !== 'KeyP' || e.repeat) return;
    if (dialog.open) dialog.close();
    else open();
  });
  refresh();
  return { dialog, refresh };
}
