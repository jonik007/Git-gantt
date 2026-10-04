const assert = require('assert');
const path = require('path');
const test = require('node:test');
const { parseLog, assignLanes, timelineDomain } = require('../lib/history');
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

test('assignLanes keeps shared history on the shorter branch', () => {
  const commits = [
    { hash: 'a', authoredAt: '2026-09-06T11:00:37+03:00' },
    { hash: 'b', authoredAt: '2026-10-04T19:00:00+03:00' }
  ];
  const lanes = assignLanes(commits, [
    { name: 'main', commits: ['a'] },
    { name: 'feature', commits: ['a', 'b'] }
  ]);
  assert.deepEqual(lanes.map((lane) => lane.name), ['main', 'feature']);
  assert.deepEqual(lanes[0].tasks.map((task) => task.hash), ['a']);
  assert.deepEqual(lanes[1].tasks.map((task) => task.hash), ['b']);
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
  assert.ok(initial.files.some((file) => file.path === 'README.md'));
  assert.ok(initial.coauthors.some((name) => name.includes('jonik007')));
  assert.ok(data.lanes.some((lane) => lane.name === 'main'));
  assert.ok(Date.parse(data.domain.start) < Date.parse(initial.authoredAt));
});
