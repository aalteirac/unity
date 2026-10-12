import { describe, expect, it } from 'vitest';
import { sourceExcerpts } from '../apps/web/src/features/deployment/sourceExcerpts';
import { extractExcerpt } from '../apps/web/src/features/deployment/extractExcerpt';
describe('bounded deployment source excerpts', () => {
  it('calculates line references from exactly the displayed source', () => {
    expect(extractExcerpt('import x;\nSTART\nbody\nEND\n', 'example.ts', 'START', 'END')).toEqual({ path: 'example.ts', startLine: 2, endLine: 3, code: 'START\nbody' });
  });
  it('fails loudly for missing, duplicate, or overlong markers', () => {
    expect(() => extractExcerpt('START\nbody', 'example.ts', 'START', 'END')).toThrow();
    expect(() => extractExcerpt('START\nSTART\nEND', 'example.ts', 'START', 'END')).toThrow();
    expect(() => extractExcerpt('START\n' + 'body\n'.repeat(40) + 'END', 'example.ts', 'START', 'END')).toThrow();
  });
  it('includes actual bounded evidence for all four implementation sections', () => {
    expect(sourceExcerpts).toHaveLength(4);
    for (const excerpt of sourceExcerpts) {
      expect(excerpt.code.split('\n')).toHaveLength(excerpt.endLine - excerpt.startLine + 1);
      expect(excerpt.endLine - excerpt.startLine).toBeLessThanOrEqual(35);
    }
    expect(sourceExcerpts[0].code).toContain("'APPLICATION PACKAGE'");
    expect(sourceExcerpts[1].code).toContain('WHERE ${identifier(unityIdColumn)}');
    expect(sourceExcerpts[1].code).toContain('GRANT SELECT ON VIEW');
    expect(sourceExcerpts[2].code).toContain('PUBLISH=FALSE REVIEW=FALSE');
    expect(sourceExcerpts[3].code).toContain('job.products[product] =');
  });
});