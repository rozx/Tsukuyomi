import { describe, expect, it } from 'bun:test';
import { Octokit } from '@octokit/rest';

describe('Octokit gists.update body serialization', () => {
  it('preserves null values in files object', async () => {
    let capturedBody: string | undefined;
    const fakeFetch = (_url: string, init: any) => {
      capturedBody = init.body;
      return Promise.resolve(
        new Response(
          JSON.stringify({ id: 'x', updated_at: '2026-04-16T00:00:00Z', html_url: 'https://x' }),
          { status: 200, headers: { etag: 'e1', 'content-type': 'application/json' } },
        ),
      );
    };
    const octokit = new Octokit({ auth: 'test-token', request: { fetch: fakeFetch as any } });

    await octokit.rest.gists.update({
      gist_id: 'test',
      description: 'desc',
      files: {
        'a.json': null as any,
        'b.json': null as any,
        'c.json': null as any,
        'd.json': null as any,
        'manifest.json': { content: '{"schemaVersion":2}' },
      },
    });

    expect(capturedBody).toBeTruthy();
    const parsed = JSON.parse(capturedBody!);
    console.info('[octokit body]', JSON.stringify(parsed, null, 2));
    expect(parsed.files).toBeDefined();
    expect(Object.keys(parsed.files)).toContain('a.json');
    expect(Object.keys(parsed.files)).toContain('manifest.json');
    expect(parsed.files['a.json']).toBeNull();
    expect(parsed.files['manifest.json']).toEqual({ content: '{"schemaVersion":2}' });
  });
});
