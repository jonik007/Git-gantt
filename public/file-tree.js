(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GitGanttTree = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function buildFileTree(files) {
    const root = { directories: new Map(), files: [] };
    for (const file of files || []) {
      const parts = String(file.path || '').split('/').filter(Boolean);
      if (!parts.length) continue;
      let node = root;
      for (let index = 0; index < parts.length - 1; index += 1) {
        const name = parts[index];
        if (!node.directories.has(name)) {
          node.directories.set(name, { directories: new Map(), files: [] });
        }
        node = node.directories.get(name);
      }
      node.files.push({
        name: parts[parts.length - 1],
        path: file.path,
        status: file.status || 'U'
      });
    }
    return freezeNode(root, '');
  }

  function freezeNode(node, name) {
    const directories = [...node.directories.entries()]
      .map(([dirName, dir]) => freezeNode(dir, dirName))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const files = node.files.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const statuses = new Set();
    for (const directory of directories) {
      if (directory.status) statuses.add(directory.status);
    }
    for (const file of files) statuses.add(file.status);
    return {
      name,
      status: statuses.size === 1 ? [...statuses][0] : null,
      directories,
      files
    };
  }

  return { buildFileTree };
});
