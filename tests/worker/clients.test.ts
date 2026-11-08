// The HTTP clients behind the injected services, against a fake fetch.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResendAudience } from '../../worker/email/resend';
import { GitHubError, createGitHubRepo } from '../../worker/github';
import { TURNSTILE_ENDPOINT, createTurnstile } from '../../worker/turnstile';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function fakeFetch(...responses: Array<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = responses.shift() ?? new Response('{}', { status: 200 });
    if (next instanceof Error) throw next;
    return next;
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('Turnstile', () => {
  it('posts secret, response and remoteip form-encoded to siteverify', async () => {
    const { fetchImpl, calls } = fakeFetch(json({ success: true }));
    expect(await createTurnstile('sec', fetchImpl).verify('tok', '203.0.113.7')).toBe(true);
    expect(calls[0]!.url).toBe(TURNSTILE_ENDPOINT);
    expect(calls[0]!.init.method).toBe('POST');
    const form = calls[0]!.init.body as URLSearchParams;
    expect(Object.fromEntries(form)).toEqual({
      secret: 'sec',
      response: 'tok',
      remoteip: '203.0.113.7',
    });
  });

  it('skipped entirely without a secret', async () => {
    const { fetchImpl, calls } = fakeFetch();
    expect(await createTurnstile('', fetchImpl).verify(undefined, null)).toBe(true);
    expect(await createTurnstile(undefined, fetchImpl).verify('x', null)).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('fails without a token, on success false, on HTTP errors and on network errors', async () => {
    const { fetchImpl, calls } = fakeFetch(
      json({ success: false, 'error-codes': ['invalid-input-response'] }),
      new Response('', { status: 500 }),
      new Error('offline'),
    );
    const t = createTurnstile('sec', fetchImpl);
    expect(await t.verify(undefined, null)).toBe(false);
    expect(await t.verify('x'.repeat(2049), null)).toBe(false);
    expect(calls).toHaveLength(0);
    expect(await t.verify('tok', null)).toBe(false);
    expect(await t.verify('tok', null)).toBe(false);
    expect(await t.verify('tok', null)).toBe(false);
    expect(Object.fromEntries(calls[0]!.init.body as URLSearchParams)).not.toHaveProperty(
      'remoteip',
    );
  });
});

describe('GitHub Contents API', () => {
  const path = 'src/content/reviews/poudre-de-moringa-100g--E5F6G7H8.yml';

  it('PUTs the base64 file on main with the API headers', async () => {
    const { fetchImpl, calls } = fakeFetch(json({ content: {} }, 201));
    const repo = createGitHubRepo('ghp_x', 'ngawang21/racines-en-partage', fetchImpl);
    expect(await repo.createFile(path, "author: 'Gaëlle'\n", 'content: avis client sur x')).toBe(
      'created',
    );
    expect(calls[0]!.url).toBe(
      `https://api.github.com/repos/ngawang21/racines-en-partage/contents/${path}`,
    );
    expect(calls[0]!.init.method).toBe('PUT');
    expect(calls[0]!.init.headers).toMatchObject({
      Authorization: 'Bearer ghp_x',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': expect.any(String),
    });
    const sent = JSON.parse(calls[0]!.init.body as string);
    expect(sent).toEqual({
      message: 'content: avis client sur x',
      content: Buffer.from("author: 'Gaëlle'\n", 'utf8').toString('base64'),
      branch: 'main',
    });
  });

  it('422 (the path exists) means "exists"', async () => {
    const { fetchImpl } = fakeFetch(json({ message: '"sha" wasn\'t supplied.' }, 422));
    expect(await createGitHubRepo('t', 'o/r', fetchImpl).createFile(path, 'x', 'm')).toBe('exists');
  });

  it('other statuses and network errors throw GitHubError', async () => {
    const { fetchImpl } = fakeFetch(json({}, 401), new Error('offline'));
    const repo = createGitHubRepo('t', 'o/r', fetchImpl);
    await expect(repo.createFile(path, 'x', 'm')).rejects.toMatchObject({
      name: 'GitHubError',
      status: 401,
    });
    await expect(repo.createFile(path, 'x', 'm')).rejects.toBeInstanceOf(GitHubError);
  });
});

describe('Resend audience', () => {
  it('POSTs { email, unsubscribed: false } to the audience contacts', async () => {
    const { fetchImpl, calls } = fakeFetch(json({ id: 'c_1' }, 201));
    await new ResendAudience('re_key', 'aud_123', fetchImpl).addContact('awa@example.com');
    expect(calls[0]!.url).toBe('https://api.resend.com/audiences/aud_123/contacts');
    expect(calls[0]!.init.headers).toMatchObject({ Authorization: 'Bearer re_key' });
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      email: 'awa@example.com',
      unsubscribed: false,
    });
  });

  it('"already exists" is a success', async () => {
    const { fetchImpl } = fakeFetch(
      json({ statusCode: 409, name: 'validation_error', message: 'Contact already exists' }, 409),
    );
    await expect(
      new ResendAudience('k', 'a', fetchImpl).addContact('awa@example.com'),
    ).resolves.toBeUndefined();
  });

  it('other refusals and network errors reject', async () => {
    const { fetchImpl } = fakeFetch(
      json({ name: 'restricted_api_key', message: 'nope' }, 401),
      json({ message: 'already exists' }, 500),
      new Error('offline'),
    );
    const audience = new ResendAudience('k', 'a', fetchImpl);
    await expect(audience.addContact('a@example.com')).rejects.toMatchObject({ status: 401 });
    await expect(audience.addContact('a@example.com')).rejects.toMatchObject({ status: 500 });
    await expect(audience.addContact('a@example.com')).rejects.toThrow('Resend request failed');
  });
});
