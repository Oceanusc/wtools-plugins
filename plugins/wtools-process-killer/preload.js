(() => {
  let pending;
  function refresh() {
    if (!pending) pending = request({ op: "snapshot" }).finally(() => { pending = undefined; });
    return pending;
  }

  async function request(data) {
    const response = await fetch("/_atools/processes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    const units = ["B", "KiB", "MiB", "GiB", "TiB"];
    const unit = Math.min(units.length - 1, Math.floor(Math.log2(bytes) / 10));
    return (bytes / 1024 ** unit).toFixed(1) + " " + units[unit];
  }

  function score(row, query) {
    if (!query) return 1;
    if (/^:\d+$/.test(query)) return row.ports.some(item => item.port === Number(query.slice(1))) ? 5 : 0;
    if (/^\d+$/.test(query)) {
      if (row.ports.some(item => item.port === Number(query))) return 5;
      if (row.pid === Number(query)) return 4;
    }
    const name = row.name.toLowerCase();
    if (name === query) return 3;
    if (name.startsWith(query)) return 2;
    return Number(name.includes(query) || row.path.toLowerCase().includes(query));
  }

  const sort = {
    name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
    ports: (a, b) => a.ports.length - b.ports.length,
    mem: (a, b) => a.mem - b.mem
  };

  window.processService = {
    platform: "win32",
    refresh,
    formatBytes,
    filterRows(rows, input) {
      const query = input.trim().toLowerCase();
      return rows.filter(row => score(row, query));
    },
    sortRows: (rows, key, ascending) =>
      [...rows].sort((a, b) => (ascending ? 1 : -1) * sort[key](a, b) || a.pid - b.pid),
    details: (pid, identity) => request({ op: "details", pid, identity }),
    showInFolder: (pid, identity) => request({ op: "reveal", pid, identity }),
    change: (pid, identity, restart) => request({ op: "change", pid, identity, restart })
  };

  (window.wtools || window.utools).onMainPush(async ({ code, payload }) => {
    if (code !== "search" || typeof payload !== "string" || !payload.trim()) return [];
    const query = payload.trim().toLowerCase();
    const port = Number(query.replace(/^:/, ""));
    const { rows } = await refresh();
    return rows.map(row => ({ row, score: score(row, query) }))
      .filter(item => item.score)
      .sort((a, b) => b.score - a.score || b.row.mem - a.row.mem || a.row.pid - b.row.pid)
      .slice(0, 12)
      .map(({ row }) => {
        const endpoints = [...row.ports]
          .sort((a, b) => Number(b.port === port) - Number(a.port === port))
          .slice(0, 3).map(item => item.protocol + " " + item.port);
        return {
          text: `[${row.pid}] ${row.name} · ${endpoints.join(" / ") || formatBytes(row.mem)}`,
          title: row.path || row.name
        };
      });
  }, () => true);
})();
