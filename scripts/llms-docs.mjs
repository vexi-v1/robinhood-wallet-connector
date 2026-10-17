#!/usr/bin/env node
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = 'https://github.com/vexi-v1/robinhood-wallet-connector';
const raw = 'https://raw.githubusercontent.com/vexi-v1/robinhood-wallet-connector/main/';
const output = 'llms-full.txt';
const sources = [
  'README.md',
  'docs/ai-integration.md',
  'packages/core/README.md',
  'packages/wagmi/README.md',
  'packages/rainbowkit/README.md',
  'packages/web3-onboard/README.md',
  'examples/vanilla/README.md',
  'examples/wagmi-v2/README.md',
  'examples/wagmi-v3/README.md',
  'examples/rainbowkit/README.md',
  'examples/onboard/README.md',
  'docs/architecture.md',
  'docs/verification.md',
  'docs/dependency-notes.md',
  'CONTRIBUTING.md',
  'AGENTS.md',
];
const mode = process.argv[2];
if (!['generate', 'check'].includes(mode) || process.argv.length !== 3) {
  console.error('Usage: node scripts/llms-docs.mjs <generate|check>');
  process.exit(1);
}

const read = (file) => readFile(resolve(root, file), 'utf8');
const encodePath = (file) => file.split('/').map(encodeURIComponent).join('/');

// Process prose only. Code fences and inline code remain verbatim in the bundle.
function mapProse(markdown, transform) {
  let fence;
  return markdown.split('\n').map((line) => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      return line;
    }
    if (marker) {
      fence = marker[1];
      return line;
    }
    const spans = [];
    const prose = line.replace(/(`+).*?\1/g, (span) => {
      spans.push(span);
      return `\0CODE${spans.length - 1}\0`;
    });
    return transform(prose).replace(/\0CODE(\d+)\0/g, (_, index) => spans[Number(index)]);
  }).join('\n');
}

// The documentation uses inline links, reference definitions and URL autolinks.
function mapLinks(markdown, transform) {
  return mapProse(markdown, (line) => line
    .replace(/(!?\[[^\]\n]*\]\()(<[^>\n]+>|[^\s)]+)(\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\)/g,
      (_, prefix, target, title = '') => `${prefix}${transform(target.replace(/^<|>$/g, ''))}${title})`)
    .replace(/^( {0,3}\[[^\]]+\]:\s*)(<[^>]+>|\S+)/g,
      (_, prefix, target) => `${prefix}${transform(target.replace(/^<|>$/g, ''))}`)
    .replace(/<(https?:\/\/[^>\s]+)>/g, (_, target) => `<${transform(target)}>`));
}

// Historical commit links and other sites are deliberately not checked offline.
function localTarget(href, source) {
  let local = href;
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) {
    if (href.startsWith(`${raw}`)) local = href.slice(raw.length);
    else if (href.startsWith(raw.replace('/main/', '/refs/heads/main/'))) local = href.slice(raw.replace('/main/', '/refs/heads/main/').length);
    else if (href === repository || href.startsWith(`${repository}#`) || href === `${repository}/` || href.startsWith(`${repository}/#`)) local = `README.md${href.includes('#') ? href.slice(href.indexOf('#')) : ''}`;
    else {
      const prefix = [`${repository}/blob/main/`, `${repository}/tree/main/`, `${repository}/raw/refs/heads/main/`].find((prefix) => href.startsWith(prefix));
      if (!prefix) return undefined;
      local = href.slice(prefix.length);
    }
    source = 'README.md';
  }
  const hash = local.indexOf('#');
  const fragment = hash < 0 ? '' : local.slice(hash + 1);
  const target = (hash < 0 ? local : local.slice(0, hash)).split('?')[0];
  const file = target
    ? posix.normalize(posix.join(target.startsWith('/') ? '' : posix.dirname(source), decodeURIComponent(target).replace(/^\//, '')))
    : source;
  if (file === '..' || file.startsWith('../') || file.includes('\0')) throw new Error(`${source}: link escapes the repository: ${href}`);
  return { file, fragment };
}

const directories = new Set();
const documents = [];
async function collect(directory = '') {
  const ignored = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.cache', '.vite', 'artifacts', 'test-results']);
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    const file = posix.join(directory, entry.name);
    if (entry.isDirectory() && !ignored.has(entry.name)) {
      directories.add(file);
      await collect(file);
    } else if (entry.isFile() && (file.endsWith('.md') || file === 'llms.txt')) documents.push(file);
  }
}
await collect();

function publicLink(href, source) {
  const target = localTarget(href, source);
  if (!target) return href;
  const base = directories.has(target.file) ? `${repository}/tree/main/` : raw;
  return `${base}${encodePath(target.file)}${target.fragment ? `#${target.fragment}` : ''}`;
}

const parts = await Promise.all(sources.map(async (source) =>
  `# Source: ${source}\n\nSource URL: ${raw}${encodePath(source)}\n\n${mapLinks(await read(source), (href) => publicLink(href, source)).trim()}\n`));
const generated = '# Robinhood Wallet Connector — full documentation\n\n'
  + '> Generated from the repository documentation. Edit the source files, then run `npm run docs:generate`; do not edit this file directly. `npm run docs:check` checks freshness and local documentation links.\n\n'
  + `Documentation index: ${raw}llms.txt\n\n`
  + 'Each section names its original source. Links point to public main-branch documents; code samples are preserved verbatim. This bundle contains guides and recorded evidence summaries, not the full source code or raw test logs.\n\n'
  + parts.join('\n---\n\n');

if (mode === 'generate') {
  await writeFile(resolve(root, output), generated);
  console.log(`Generated ${output} from ${sources.length} source documents.`);
} else {
  const problems = [];
  if (await read(output).catch(() => '') !== generated) problems.push(`${output} is missing or stale. Run npm run docs:generate and commit the result.`);
  const anchors = new Map();
  async function getAnchors(file) {
    if (anchors.has(file)) return anchors.get(file);
    const ids = new Set();
    const counts = new Map();
    // Retain inline code text when deriving GitHub-style heading fragments.
    let fence;
    for (const line of (await read(file)).split('\n')) {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (fence) {
        if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
        continue;
      }
      if (marker) { fence = marker[1]; continue; }
      for (const match of line.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) ids.add(match[1]);
      const heading = line.match(/^ {0,3}#{1,6}\s+(.+?)\s*#*$/);
      if (!heading) continue;
      const slug = heading[1].toLowerCase().replace(/<[^>]*>/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '').replace(/\s/g, '-');
      const count = counts.get(slug) ?? 0;
      counts.set(slug, count + 1);
      ids.add(`${slug}${count ? `-${count}` : ''}`);
    }
    anchors.set(file, ids);
    return ids;
  }
  for (const source of [...documents.sort(), output]) {
    const links = new Set();
    mapLinks(await read(source).catch(() => ''), (href) => { links.add(href); return href; });
    for (const href of links) {
      try {
        const target = localTarget(href, source);
        if (!target) continue;
        const metadata = await stat(resolve(root, target.file));
        const anchorFile = metadata.isDirectory() ? posix.join(target.file, 'README.md') : target.file;
        if (target.fragment && (anchorFile.endsWith('.md') || anchorFile.endsWith('.txt')) && !(await getAnchors(anchorFile)).has(decodeURIComponent(target.fragment))) throw new Error(`missing heading #${target.fragment} in ${anchorFile}`);
      } catch (error) {
        problems.push(`${source}: ${href}: ${error.code === 'ENOENT' ? 'target does not exist' : error.message}`);
      }
    }
  }
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
  } else console.log(`Documentation checks passed: ${documents.length} documents, generated bundle and local link targets.`);
}
