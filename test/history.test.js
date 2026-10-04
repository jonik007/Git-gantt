const assert = require('assert');
const path = require('path');
const test = require('node:test');
const { parseLog, assignLanes, timelineDomain, mergeNameStatus, parseNameStatus } = require('../lib/history');
const { buildFileTree } = require('../public/file-tree');
const { loadRepository } = require('../lib/repository');

const FIXTURE = [
  'COMMIT\x1ffullhash\x1fabc1234\x1f\x1fCursor Agent\x1fcursoragent@cursor.com\x1f2026-09-06T11:00:37+03:00\x1f2026-09-06T11:00:37+03:00\x1fHEAD -> main, origin/main\x1fInitial commit',
  'Co-authored-by: jonik007 <jonik007@users.noreply.github.com>',
  '1\t0\tREADME.md',
  '',
  'COMMIT\x1fsecondhash\x1fdef5678\x1ffullhash\x1fCursor Agent\x1fcursoragent@cursor.com\x1f2026-10-04T19:00:00+03:00\x1f2026-10-04T19:00:00+03:00\x1fHEAD -> feature\x1fAdd gantt view',
  '12\t1\tserver.js',
  '-\t-\tassets/logo.bin'
].join('\n');

test('parseLog reads subjects, files, and co-authors', () => {
  const commits = parseLog(FIXTURE);
  assert.equal(commits.length, 2);
  assert.equal(commits[0].subject, 'Initial commit');
  assert.equal(commits[0].short, 'abc1234');
  assert.deepEqual(commits[0].parents, []);
  assert.deepEqual(commits[0].refs, ['HEAD -> main', 'origin/main']);
  assert.deepEqual(commits[0].files, [{ additions: 1, deletions: 0, path: 'README.md' }]);
  assert.deepEqual(commits[0].coauthors, ['jonik007 <jonik007@users.noreply.github.com>']);
  assert.equal(commits[1].parents[0], 'fullhash');
  assert.equal(commits[1].files[1].path, 'assets/logo.bin');
  assert.equal(commits[1].files[1].additions, null);
});

test('mergeNameStatus marks added, updated, and deleted files', () => {
  const commits = parseLog(FIXTURE);
  mergeNameStatus(commits, [
    'COMMIT\x1ffullhash',
    'A\tREADME.md',
    'COMMIT\x1fsecondhash',
    'M\tserver.js',
    'A\tassets/logo.bin',
    'D\tremoved.txt',
    'R100\told.js\tlib/new.js'
  ].join('\n'));
  assert.equal(commits[0].files[0].status, 'A');
  assert.equal(commits[1].files.find((file) => file.path === 'server.js').status, 'U');
  assert.equal(commits[1].files.find((file) => file.path === 'assets/logo.bin').status, 'A');
  assert.equal(commits[1].files.find((file) => file.path === 'removed.txt').status, 'D');
  const renamed = commits[1].files.find((file) => file.path === 'lib/new.js');
  assert.equal(renamed.status, 'U');
  assert.equal(renamed.previousPath, 'old.js');
  assert.equal(parseNameStatus('C80\ta\tb').status, 'U');
});

test('buildFileTree nests directories and rolls up one status', () => {
  const tree = buildFileTree([
    { path: 'lib/history.js', status: 'A' },
    { path: 'lib/repository.js', status: 'A' },
    { path: 'README.md', status: 'U' },
    { path: 'old.txt', status: 'D' }
  ]);
  assert.equal(tree.status, null);
  assert.deepEqual(tree.files.map((file) => file.name), ['old.txt', 'README.md']);
  assert.equal(tree.directories[0].name, 'lib');
  assert.equal(tree.directories[0].status, 'A');
  assert.deepEqual(tree.directories[0].files.map((file) => file.path), ['lib/history.js', 'lib/repository.js']);
});

test('assignLanes keeps commits that are on main on main', () => {
  const commits = [
    { hash: 'initial', authoredAt: '2026-09-06T11:00:37+03:00' },
    { hash: 'feature-work', authoredAt: '2026-10-04T19:00:00+03:00' },
    { hash: 'merged', authoredAt: '2026-10-04T20:00:00+03:00' },
    { hash: 'unmerged', authoredAt: '2026-10-04T21:00:00+03:00' }
  ];
  const lanes = assignLanes(commits, [
    { name: 'main', commits: ['initial', 'feature-work', 'merged'] },
    { name: 'cursor/git-gantt-view-c562', commits: ['initial'] },
    { name: 'feature', commits: ['initial', 'feature-work', 'merged', 'unmerged'] }
  ]);
  assert.deepEqual(lanes.map((lane) => lane.name), ['main', 'feature']);
  assert.deepEqual(lanes[0].tasks.map((task) => task.hash), ['initial', 'feature-work', 'merged']);
  assert.deepEqual(lanes[1].tasks.map((task) => task.hash), ['unmerged']);
});

test('timelineDomain includes the commit and the present', () => {
  const domain = timelineDomain([
    { authoredAt: '2026-09-06T08:00:37.000Z', committedAt: '2026-09-06T08:00:37.000Z' }
  ], new Date('2026-10-04T12:00:00.000Z'));
  assert.ok(Date.parse(domain.start) < Date.parse('2026-09-06T08:00:37.000Z'));
  assert.ok(Date.parse(domain.end) > Date.parse('2026-10-04T12:00:00.000Z'));
});

test('loadRepository reads this checkout', () => {
  const data = loadRepository(path.join(__dirname, '..'));
  assert.equal(data.repo, 'Git-gantt');
  const tasks = data.lanes.flatMap((lane) => lane.tasks);
  const initial = tasks.find((task) => task.hash === '1c0ab561fc1283265609edceb6c4ded810aa5060');
  assert.ok(initial, 'initial commit is missing');
  assert.equal(initial.subject, 'Initial commit');
  assert.equal(initial.files.find((file) => file.path === 'README.md').status, 'A');
  const updatedReadme = tasks.find((task) => task.files.some((file) => file.path === 'README.md' && file.status === 'U'));
  assert.ok(updatedReadme, 'a later README edit should be marked updated');
  assert.ok(initial.coauthors.some((name) => name.includes('jonik007')));
  const mainLane = data.lanes.find((lane) => lane.name === 'main');
  assert.ok(mainLane.tasks.some((task) => task.hash === initial.hash));
  assert.ok(Date.parse(data.domain.start) < Date.parse(initial.authoredAt));
});
