const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const FULL_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const state = {
  data: null,
  selected: null
};

const repoLine = document.querySelector('#repo-line');
const stats = document.querySelector('#stats');
const scale = document.querySelector('#scale');
const lanes = document.querySelector('#lanes');
const detailTitle = document.querySelector('#detail-title');
const detailCopy = document.querySelector('#detail-copy');
const detailMeta = document.querySelector('#detail-meta');
const filesHeading = document.querySelector('#files-heading');
const detailFiles = document.querySelector('#detail-files');
const treeTitle = document.querySelector('#tree-title');
const fileTree = document.querySelector('#file-tree');

const STATUS_LABEL = {
  A: 'Добавлен',
  U: 'Изменён',
  D: 'Удалён'
};

function ru(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} ${few}`;
  return `${count} ${many}`;
}

function formatAxis(ms) {
  const date = new Date(ms);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

function formatStamp(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.exec(iso);
  if (!match) return iso;
  const offset = match[6] === 'Z' ? 'UTC' : `UTC${match[6].replace(':00', '')}`;
  return `${Number(match[3])} ${FULL_MONTHS[Number(match[2]) - 1]} ${match[1]}, ${match[4]}:${match[5]} (${offset})`;
}

function chooseTicks(start, end) {
  const span = Math.max(end - start, 1);
  const steps = [3600000, 3 * 3600000, 6 * 3600000, 12 * 3600000, 86400000, 2 * 86400000, 7 * 86400000, 14 * 86400000, 30 * 86400000];
  const raw = span / 6;
  const step = steps.find((candidate) => raw <= candidate) || steps[steps.length - 1];
  const ticks = [];
  for (let time = Math.ceil(start / step) * step; time < end; time += step) ticks.push(time);
  return ticks;
}

function allTasks() {
  return state.data.lanes.flatMap((lane) => lane.tasks.map((task) => ({ ...task, lane: lane.name })));
}

function renderStats() {
  const { stats: figures, repo } = state.data;
  repoLine.textContent = `${repo}: коммиты на шкале времени, до сегодняшнего дня.`;
  const items = [
    ['Коммиты', figures.commits],
    ['Ветки', figures.branches],
    ['Авторы', figures.authors],
    ['Файлы', figures.files]
  ];
  stats.hidden = false;
  stats.replaceChildren(...items.map(([label, value]) => {
    const wrap = document.createElement('div');
    const term = document.createElement('span');
    term.className = 'stat-label';
    term.textContent = label;
    const number = document.createElement('strong');
    number.className = 'stat-value';
    number.textContent = String(value);
    wrap.append(term, number);
    return wrap;
  }));
}

function renderEmpty() {
  lanes.replaceChildren();
  const note = document.createElement('p');
  note.className = 'status';
  note.textContent = 'В этом репозитории ещё нет коммитов.';
  lanes.append(note);
}

function renderChart() {
  const start = Date.parse(state.data.domain.start);
  const end = Date.parse(state.data.domain.end);
  const span = Math.max(end - start, 1);
  scale.replaceChildren();
  lanes.replaceChildren();
  if (!state.data.lanes.length) {
    renderEmpty();
    return;
  }

  const probe = document.createElement('div');
  probe.className = 'lane';
  const probeGutter = document.createElement('div');
  probeGutter.className = 'gutter';
  const probeTrack = document.createElement('div');
  probeTrack.className = 'track';
  probe.append(probeGutter, probeTrack);
  lanes.append(probe);
  const width = probeTrack.getBoundingClientRect().width || 640;
  probe.remove();

  const xFor = (time) => ((time - start) / span) * width;
  const ticks = chooseTicks(start, end);
  const today = Date.now();
  const todayX = xFor(today);
  const showToday = today >= start && today <= end;
  for (const tick of ticks) {
    if (showToday && Math.abs(xFor(tick) - todayX) < 72) continue;
    const mark = document.createElement('span');
    mark.className = 'tick';
    mark.style.left = `${xFor(tick)}px`;
    mark.textContent = formatAxis(tick);
    scale.append(mark);
  }
  if (showToday) {
    const label = document.createElement('span');
    label.className = 'today-label';
    label.style.left = `${todayX}px`;
    label.textContent = 'Сегодня';
    scale.append(label);
  }

  for (const lane of state.data.lanes) {
    const row = document.createElement('div');
    row.className = 'lane';
    const gutter = document.createElement('div');
    gutter.className = 'gutter';
    const name = document.createElement('div');
    name.className = 'branch';
    name.textContent = lane.name;
    const count = document.createElement('div');
    count.className = 'lane-count';
    count.textContent = ru(lane.tasks.length, 'коммит', 'коммита', 'коммитов');
    gutter.append(name, count);

    const track = document.createElement('div');
    track.className = 'track';
    for (const tick of ticks) {
      const line = document.createElement('span');
      line.className = 'grid';
      line.style.left = `${xFor(tick)}px`;
      track.append(line);
    }
    if (today >= start && today <= end) {
      const line = document.createElement('span');
      line.className = 'today';
      line.style.left = `${xFor(today)}px`;
      track.append(line);
    }

    const placed = placeTasks(lane.tasks, xFor, width);
    track.style.height = `${Math.max(placed.rows, 1) * 48 + 20}px`;
    for (const item of placed.items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `task${item.side === 'left' ? ' label-left' : ''}`;
      button.dataset.hash = item.task.hash;
      button.style.left = `${item.left}px`;
      button.style.top = `${item.row * 48 + 14}px`;
      button.title = item.task.subject || item.task.short;
      if (state.selected === item.task.hash) button.classList.add('is-selected');
      const mark = document.createElement('span');
      mark.className = 'mark';
      mark.style.width = `${item.width}px`;
      const label = document.createElement('span');
      label.className = 'label';
      label.style.maxWidth = `${item.labelWidth}px`;
      label.textContent = item.task.subject || item.task.short;
      button.append(mark, label);
      button.addEventListener('click', () => selectTask(item.task, lane.name));
      track.append(button);
    }

    row.append(gutter, track);
    lanes.append(row);
  }
}

function placeTasks(tasks, xFor, width) {
  const rowEnds = [];
  const items = tasks.map((task) => {
    const authored = Date.parse(task.authoredAt);
    const committed = Math.max(Date.parse(task.committedAt) || authored, authored);
    const left = Math.max(0, Math.min(xFor(authored), Math.max(0, width - 12)));
    const bar = Math.min(Math.max(xFor(committed) - left, 12), Math.max(12, width - left));
    const preferred = Math.min(420, ((task.subject || task.short).length * 7.4) + 8);
    const roomRight = Math.max(0, width - (left + bar) - 12);
    const roomLeft = Math.max(0, left - 12);
    const side = roomRight >= preferred || roomRight >= roomLeft ? 'right' : 'left';
    const labelWidth = Math.max(48, Math.min(preferred, side === 'right' ? roomRight : roomLeft));
    const start = side === 'left' ? left - labelWidth : left;
    const end = side === 'right' ? left + bar + labelWidth : left + bar;
    let row = rowEnds.findIndex((edge) => start >= edge + 8);
    if (row < 0) {
      row = rowEnds.length;
      rowEnds.push(end);
    } else {
      rowEnds[row] = Math.max(rowEnds[row], end);
    }
    return { task, row, left, width: bar, side, labelWidth };
  });
  return { items, rows: Math.max(rowEnds.length, 1) };
}

function diffText(file) {
  if (file.additions === null || file.deletions === null) return 'бинарный';
  return `+${file.additions} −${file.deletions}`;
}

function selectTask(task, laneName) {
  state.selected = task.hash;
  for (const button of lanes.querySelectorAll('.task')) {
    button.classList.toggle('is-selected', button.dataset.hash === task.hash);
  }
  detailTitle.textContent = task.subject || task.short;
  detailCopy.hidden = true;
  detailMeta.hidden = false;
  const rows = [
    ['Хеш', task.short],
    ['Ветка', laneName],
    ['Автор', task.author],
    ['Дата', formatStamp(task.authoredAt)]
  ];
  if (task.coauthors?.length) rows.push(['Соавторы', task.coauthors.join(', ')]);
  if (task.refs?.length) rows.push(['Метки', task.refs.join(', ')]);
  detailMeta.replaceChildren();
  for (const [label, value] of rows) {
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value;
    if (label === 'Хеш') description.className = 'hash';
    detailMeta.append(term, description);
  }
  filesHeading.hidden = false;
  renderFileTree(task);
  detailFiles.replaceChildren(...task.files.map((file) => {
    const item = document.createElement('li');
    const path = document.createElement('span');
    path.textContent = file.path;
    const diff = document.createElement('span');
    diff.className = 'diff';
    diff.textContent = diffText(file);
    item.append(path, diff);
    return item;
  }));
  if (!task.files.length) {
    const item = document.createElement('li');
    item.textContent = 'Нет изменённых файлов';
    detailFiles.append(item);
  }
}

function badge(status) {
  const mark = document.createElement('span');
  mark.className = `badge badge-${status.toLowerCase()}`;
  mark.textContent = status;
  mark.title = STATUS_LABEL[status] || status;
  return mark;
}

function renderFileTree(task) {
  treeTitle.textContent = task.subject || task.short;
  fileTree.replaceChildren();
  if (!task.files.length) {
    const note = document.createElement('p');
    note.className = 'tree-empty';
    note.textContent = 'В этом коммите нет изменённых файлов.';
    fileTree.append(note);
    return;
  }
  fileTree.append(renderTreeLevel(GitGanttTree.buildFileTree(task.files)));
}

function renderTreeLevel(node) {
  const list = document.createElement('ul');
  list.className = 'tree-list';
  for (const directory of node.directories) {
    const item = document.createElement('li');
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'tree-row';
    row.setAttribute('aria-expanded', 'true');
    const twisty = document.createElement('span');
    twisty.className = 'twisty';
    twisty.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'tree-name';
    name.textContent = directory.name;
    row.append(twisty);
    if (directory.status) row.append(badge(directory.status));
    row.append(name);
    const children = renderTreeLevel(directory);
    row.addEventListener('click', () => {
      const open = row.getAttribute('aria-expanded') === 'true';
      row.setAttribute('aria-expanded', String(!open));
      children.hidden = open;
    });
    item.append(row, children);
    list.append(item);
  }
  for (const file of node.files) {
    const item = document.createElement('li');
    const row = document.createElement('div');
    row.className = 'tree-row';
    const twisty = document.createElement('span');
    twisty.className = 'twisty';
    const name = document.createElement('span');
    name.className = 'tree-name';
    name.textContent = file.name;
    row.append(twisty, badge(file.status), name);
    item.append(row);
    list.append(item);
  }
  return list;
}

function showError(message) {
  repoLine.textContent = message;
  lanes.replaceChildren();
  const note = document.createElement('p');
  note.className = 'status';
  note.textContent = message;
  lanes.append(note);
}

async function init() {
  try {
    const response = await fetch('/api/history');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    document.title = `Git Gantt — ${state.data.repo}`;
    renderStats();
    renderChart();
    const initial = allTasks().find((task) => task.subject === 'Initial commit') || allTasks()[0];
    if (initial) selectTask(initial, initial.lane);
    window.addEventListener('resize', renderChart);
  } catch (error) {
    showError('Не удалось прочитать git-историю.');
  }
}

init();
