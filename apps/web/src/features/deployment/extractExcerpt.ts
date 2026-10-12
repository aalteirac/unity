export type SourceExcerpt = { path: string; startLine: number; endLine: number; code: string };
export function extractExcerpt(source: string, path: string, startMarker: string, endMarker: string, includeEndLines = 0): SourceExcerpt {
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  const starts = lines.flatMap((line, index) => line.includes(startMarker) ? [index] : []);
  if (starts.length !== 1) throw new Error(`Source excerpt needs one start marker: ${path}`);
  const start = starts[0];
  const ends = lines.flatMap((line, index) => index > start && line.includes(endMarker) ? [index] : []);
  if (ends.length !== 1 || ends[0] - start > 35) throw new Error(`Source excerpt needs one bounded end marker: ${path}`);
  const end = ends[0] + includeEndLines;
  if (!Number.isInteger(includeEndLines) || includeEndLines < 0 || end > lines.length || end - start > 35) throw new Error(`Source excerpt exceeds bounds: ${path}`);
  return { path, startLine: start + 1, endLine: end, code: lines.slice(start, end).join('\n') };
}