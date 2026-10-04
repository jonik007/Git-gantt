const { execFileSync } = require('child_process');
const path = require('path');
const { parseLog, assignLanes, timelineDomain, summarize } = require('./history');

const LOG_FORMAT = [
  'COMMIT%x1f%H',
  '%h',
  '%P',
  '%an',
  '%ae',
  '%aI',
  '%cI',
  '%D',
  '%s'
].join('%x1f');

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
}

function repositoryName(root) {
  try {
    const url = git(['remote', 'get-url', 'origin'], root).trim();
    const match = /\/([^/]+?)(?:\.git)?$/.exec(url);
    if (match) return decodeURIComponent(match[1]);
  } catch {
    // A checkout without origin keeps the directory name.
  }
  return path.basename(root);
}

function loadRepository(cwd = process.cwd(), now = new Date()) {
  const root = git(['rev-parse', '--show-toplevel'], cwd).trim();
  const log = git([
    'log',
    '--all',
    '--numstat',
    `--pretty=format:${LOG_FORMAT}%n%b`
  ], root);
  const commits = parseLog(log);
  const refText = git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], root).trim();
  const branchNames = refText ? refText.split('\n').filter(Boolean) : [];
  const branches = branchNames.map((name) => ({
    name,
    commits: git(['rev-list', name], root).trim().split('\n').filter(Boolean)
  }));

  return {
    repo: repositoryName(root),
    generatedAt: now.toISOString(),
    domain: timelineDomain(commits, now),
    stats: summarize(commits, branches),
    lanes: assignLanes(commits, branches)
  };
}

module.exports = { loadRepository };
