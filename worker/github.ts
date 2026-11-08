// GitHub Contents API client: the review endpoint commits one YAML file per
// review to `main`, which triggers the site build once the owner publishes it.
import { bytesToBase64 } from './tokens';
import type { ReviewRepo } from './types';

export const GITHUB_API = 'https://api.github.com';
export const GITHUB_TIMEOUT_MS = 15_000;
export const GITHUB_BRANCH = 'main';
const USER_AGENT = 'racines-en-partage-worker';

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

export function createGitHubRepo(
  token: string,
  repo: string,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  timeoutMs = GITHUB_TIMEOUT_MS,
): ReviewRepo {
  return {
    async createFile(path, content, message) {
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      let res: Response;
      try {
        res = await fetchImpl(`${GITHUB_API}/repos/${repo}/contents/${encodedPath}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': USER_AGENT,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message,
            content: bytesToBase64(new TextEncoder().encode(content)),
            branch: GITHUB_BRANCH,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const reason = err instanceof Error ? err.name : 'unknown';
        throw new GitHubError(`GitHub request failed (${reason})`);
      }
      if (res.status === 200 || res.status === 201) return 'created';
      // Creating a path that exists without its `sha` is refused with 422.
      if (res.status === 422) return 'exists';
      throw new GitHubError(`GitHub refused the file: HTTP ${res.status}`, res.status);
    },
  };
}
