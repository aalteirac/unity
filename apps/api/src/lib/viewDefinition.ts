// Locate the defining AS outside strings, quoted identifiers, and comments.
// Comparison stays intentionally strict; unfamiliar Snowflake rewrites fail closed.
export function viewBody(ddl: string): string {
  let index = 0;
  while (index < ddl.length) {
    const character = ddl[index];
    if (character === "'" || character === '"') {
      const quote = character; index++;
      let closed = false;
      while (index < ddl.length) {
        if (ddl[index] === '\\' && quote === "'") { index += 2; continue; }
        if (ddl[index] === quote) {
          if (ddl[index + 1] === quote) { index += 2; continue; }
          index++; closed = true; break;
        }
        index++;
      }
      if (!closed) throw new Error('Unrecognized view DDL.');
      continue;
    }
    if (ddl.startsWith('--', index)) { const next = ddl.indexOf('\n', index + 2); index = next < 0 ? ddl.length : next + 1; continue; }
    if (ddl.startsWith('/*', index)) { const next = ddl.indexOf('*/', index + 2); if (next < 0) throw new Error('Unrecognized view DDL.'); index = next + 2; continue; }
    if (/[a-z_]/i.test(character)) {
      const start = index;
      while (index < ddl.length && /[a-z0-9_]/i.test(ddl[index])) index++;
      if (ddl.slice(start, index).toUpperCase() === 'AS') return ddl.slice(index).trim().replace(/;$/, '');
    } else index++;
  }
  throw new Error('Unrecognized view DDL.');
}