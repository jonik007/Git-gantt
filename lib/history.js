const COMMIT_PREFIX = 'COMMIT\x1f';

function normalizeDiffPath(raw) {
  const brace = /^(.*)\{.* => (.*)\}(.*)$/.exec(raw);
  if (brace) return `${brace[1]}${brace[2]}${brace[3]}`;
  const arrow = raw.split(' => ');
  return arrow.length === 2 ? arrow[1] : raw;
}

function parseNumstat(line) {
  const match = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
  if (!match) return null;
  return {
    additions: match[1] === '-' ? null : Number(match[1]),
    deletions: match[2] === '-' ? null : Number(match[2]),
    path: normalizeDiffPath(match[3])
  };
}

function toChangeKind(code) {
  const letter = String(code || '')[0];
  if (letter === 'A') return 'A';
  if (letter === 'D') return 'D';
  return 'U';
}

function parseNameStatus(line) {
  const match = /^([ACDMRTUXB][0-9]*)\t(.+)$/.exec(line);
  if (!match) return null;
  const code = match[1];
  let path = match[2];
  let previousPath = null;
  if (code[0] === 'R' || code[0] === 'C') {
    const tab = path.indexOf('\t');
    if (tab !== -1) {
      previousPath = path.slice(0, tab);
      path = path.slice(tab + 1);
    }
  }
  return { path, previousPath, status: toChangeKind(code) };
}

function inferStatus(file) {
  if (file.status) return file.status;
  if (file.additions === 0 && file.deletions > 0) return 'D';
  if (file.additions > 0 && file.deletions === 0) return 'A';
  return 'U';
}

function mergeNameStatus(commits, text) {
  const byHash = new Map(commits.map((commit) => [commit.hash, commit]));
  let current = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    if (line.startsWith(COMMIT_PREFIX)) {
      current = byHash.get(line.split('\x1f')[1]) || null;
      continue;
    }
    if (!current || !line.trim()) continue;
    const parsed = parseNameStatus(line);
    if (!parsed) continue;
    const existing = current.files.find((file) => file.path === parsed.path);
    if (existing) {
      existing.status = parsed.status;
      if (parsed.previousPath) existing.previousPath = parsed.previousPath;
    } else {
      current.files.push({
        path: parsed.path,
        previousPath: parsed.previousPath,
        additions: null,
        deletions: null,
        status: parsed.status
      });
    }
  }
  for (const commit of commits) {
    for (const file of commit.files) file.status = inferStatus(file);
  }
  return commits;
}

function extractCoauthors(body) {
  if (!body) return [];
  return [...body.matchAll(/^Co-authored-by:\s*(.+?)\s*$/gim)].map((match) => match[1].trim());
}

function parseLog(text) {
  if (!text || !text.trim()) return [];
  const commits = [];
  let current = null;

  const flush = () => {
    if (!current) return;
    current.body = current.bodyLines.join('\n').trim();
    delete current.bodyLines;
    current.coauthors = extractCoauthors(current.body);
    commits.push(current);
    current = null;
  };

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith(COMMIT_PREFIX)) {
      flush();
      const parts = line.split('\x1f');
      current = {
        hash: parts[1] || '',
        short: parts[2] || '',
        parents: (parts[3] || '').split(' ').filter(Boolean),
        author: parts[4] || '',
        email: parts[5] || '',
        authoredAt: parts[6] || '',
        committedAt: parts[7] || '',
        refs: (parts[8] || '').split(',').map((ref) => ref.trim()).filter(Boolean),
        subject: parts.slice(9).join('\x1f'),
        bodyLines: [],
        files: []
      };
      continue;
    }
    if (!current || !line.trim()) continue;
    const file = parseNumstat(line);
    if (file) current.files.push(file);
    else current.bodyLines.push(line);
  }

  flush();
  return commits;
}

function branchRank(name) {
  if (name === 'main' || name === 'master') return 0;
  if (name === 'без ветки') return 2;
  return 1;
}

function trunkName(branches) {
  const names = new Set(branches.map((branch) => branch.name));
  if (names.has('main')) return 'main';
  if (names.has('master')) return 'master';
  return null;
}

function assignLanes(commits, branches) {
  const sets = branches.map((branch) => ({
    name: branch.name,
    set: new Set(branch.commits),
    count: branch.commits.length
  }));
  const laneMap = new Map(branches.map((branch) => [branch.name, []]));
  const trunk = trunkName(branches);

  for (const commit of commits) {
    const owners = sets.filter((branch) => branch.set.has(commit.hash));
    let laneName = 'без ветки';
    const onTrunk = trunk && owners.find((branch) => branch.name === trunk);
    if (onTrunk) {
      laneName = trunk;
    } else if (owners.length) {
      owners.sort((a, b) => (
        a.count - b.count
        || branchRank(a.name) - branchRank(b.name)
        || a.name.localeCompare(b.name)
      ));
      laneName = owners[0].name;
    }
    if (!laneMap.has(laneName)) laneMap.set(laneName, []);
    laneMap.get(laneName).push(commit);
  }

  return [...laneMap.entries()]
    .filter(([, tasks]) => tasks.length)
    .map(([name, tasks]) => ({
      name,
      tasks: tasks.slice().sort((a, b) => Date.parse(a.authoredAt) - Date.parse(b.authoredAt))
    }))
    .sort((a, b) => branchRank(a.name) - branchRank(b.name) || a.name.localeCompare(b.name));
}

function timelineDomain(commits, now = new Date()) {
  const times = commits
    .flatMap((commit) => [Date.parse(commit.authoredAt), Date.parse(commit.committedAt)])
    .filter(Number.isFinite);
  const nowMs = now.getTime();
  if (!times.length) {
    return {
      start: new Date(nowMs - 7 * 86400000).toISOString(),
      end: new Date(nowMs + 86400000).toISOString()
    };
  }
  const min = Math.min(...times);
  const max = Math.max(...times, nowMs);
  const span = Math.max(max - min, 86400000);
  const pad = Math.max(span * 0.1, 36 * 3600000);
  return {
    start: new Date(min - pad).toISOString(),
    end: new Date(max + pad).toISOString()
  };
}

function summarize(commits, branches) {
  const authors = new Set(commits.map((commit) => commit.email || commit.author));
  const files = new Set();
  for (const commit of commits) {
    for (const file of commit.files) files.add(file.path);
  }
  return {
    commits: commits.length,
    branches: branches.length,
    authors: authors.size,
    files: files.size
  };
}

module.exports = {
  parseLog,
  assignLanes,
  timelineDomain,
  summarize,
  extractCoauthors,
  parseNameStatus,
  mergeNameStatus,
  normalizeDiffPath
};
