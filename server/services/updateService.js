/**
 * @file server/services/updateService.js
 * @description 更新清单请求、重试、重定向与 GitHub 备用源处理。
 */
import http from 'http';
import https from 'https';

export const DEFAULT_UPDATE_URL = 'https://raw.githubusercontent.com/Privatexiao/OmniDev/main/update.json';

const MAX_REDIRECTS = 4;
const MAX_RESPONSE_BYTES = 1024 * 1024;

function addCacheBuster(rawUrl) {
  const url = new URL(rawUrl);
  url.searchParams.set('_t', Date.now().toString());
  return url.toString();
}

function githubFallbackSources(rawUrl) {
  const url = new URL(rawUrl);
  if (url.hostname !== 'raw.githubusercontent.com') return [];

  const [owner, repo, ref, ...fileParts] = url.pathname.split('/').filter(Boolean);
  if (!owner || !repo || !ref || fileParts.length === 0) return [];

  const filePath = fileParts.join('/');
  return [
    {
      label: 'jsdelivr',
      url: `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/${filePath}`,
      installUrl: `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/${filePath}`
    },
    {
      label: 'github-api',
      url: `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${encodeURIComponent(ref)}`,
      installUrl: rawUrl,
      headers: { Accept: 'application/vnd.github.raw+json' }
    }
  ];
}

export function buildUpdateSources(rawUrl) {
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('更新地址仅支持 HTTP 或 HTTPS');
  }
  return [
    { label: 'primary', url: rawUrl, installUrl: rawUrl },
    ...githubFallbackSources(rawUrl)
  ];
}

function parseManifest(body) {
  let data = JSON.parse(body);
  if (data?.encoding === 'base64' && typeof data.content === 'string') {
    data = JSON.parse(Buffer.from(data.content.replace(/\s/g, ''), 'base64').toString('utf8'));
  }
  if (!data || typeof data !== 'object' || !String(data.version || '').trim()) {
    throw new Error('更新清单缺少有效版本号');
  }
  return data;
}

function requestManifest(rawUrl, headers = {}, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const url = new URL(addCacheBuster(rawUrl));
    const client = url.protocol === 'https:' ? https : http;
    const request = client.get(url, {
      family: 4,
      timeout: 6000,
      headers: {
        'User-Agent': 'OmniDev-Updater',
        'Cache-Control': 'no-cache',
        Accept: 'application/json',
        ...headers
      }
    }, response => {
      const statusCode = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(statusCode) && response.headers.location) {
        response.resume();
        if (redirectCount >= MAX_REDIRECTS) return reject(new Error('更新源重定向次数过多'));
        const target = new URL(response.headers.location, url).toString();
        return resolve(requestManifest(target, headers, redirectCount + 1));
      }
      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        return reject(new Error(`请求失败，HTTP 状态码: ${statusCode}`));
      }

      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
        if (Buffer.byteLength(body, 'utf8') > MAX_RESPONSE_BYTES) {
          response.destroy(new Error('更新清单内容过大'));
        }
      });
      response.on('end', () => {
        try {
          resolve(parseManifest(body));
        } catch (error) {
          reject(error);
        }
      });
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('请求更新源超时')));
    request.on('error', reject);
  });
}

export async function fetchUpdateManifest(rawUrl) {
  const errors = [];
  for (const source of buildUpdateSources(rawUrl)) {
    const attempts = source.label === 'primary' ? 2 : 1;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const data = await requestManifest(source.url, source.headers);
        return { data, source: source.label, installUrl: source.installUrl };
      } catch (error) {
        errors.push(`${source.label}#${attempt}: ${error.message}`);
      }
    }
  }
  throw new Error(errors.join('；'));
}
