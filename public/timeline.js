(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GitGanttTimeline = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function spreadCommitPositions(times, start, end, width, minGap) {
    const usable = Math.max(width - 12, 0);
    const count = times.length;
    if (!count) return [];
    const span = Math.max(end - start, 1);
    const ideal = times.map((time) => {
      const instant = Math.min(Math.max(time, start), end);
      return ((instant - start) / span) * usable;
    });
    if (count === 1) return ideal;

    const gap = Math.min(minGap, usable / (count - 1));
    const needed = (count - 1) * gap;
    const origin = Math.min(ideal[0], Math.max(0, usable - needed));
    const extra = Math.max(usable - origin - needed, 0);
    const idealGaps = ideal.slice(1).map((position, index) => Math.max(position - ideal[index], 0));
    const idealSum = idealGaps.reduce((sum, value) => sum + value, 0);
    const positions = [origin];
    for (let index = 1; index < count; index += 1) {
      const share = idealSum > 0 ? idealGaps[index - 1] / idealSum : 1 / (count - 1);
      positions.push(positions[index - 1] + gap + extra * share);
    }
    positions[positions.length - 1] = Math.min(positions[positions.length - 1], usable);
    return positions;
  }

  return { spreadCommitPositions };
});
