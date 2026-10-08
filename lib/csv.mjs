/* Shared RFC-4180 CSV parser: quoted fields, embedded commas/newlines, ""
 * escapes. Used by the ActBlue sync cron and the admin contacts importer.
 * Edge-runtime safe (no Node APIs). */

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); }
  return rows;
}

/* Header-keyed objects: first row becomes the keys. */
export function parseCsvObjects(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(values => {
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
}

/* The other direction: rows -> CSV text. `columns` is [[header, key | fn]].
 * Every field is quoted, which is the safe choice for free text with commas
 * and newlines. Used by the admin exports. */
export function toCsv(rows, columns) {
  const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const head = columns.map(([h]) => cell(h)).join(',');
  const body = rows.map((r) => columns
    .map(([, k]) => cell(typeof k === 'function' ? k(r) : r[k]))
    .join(','));
  return [head, ...body].join('\r\n');
}
