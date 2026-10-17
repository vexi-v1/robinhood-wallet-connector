#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, cp, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const exec = promisify(execFile);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runBrowser = process.argv.includes('--browser');
const selected = process.argv.slice(2).filter((argument) => argument !== '--browser');
const available = ['vanilla', 'wagmi-v2', 'wagmi-v3', 'rainbowkit', 'onboard', 'appkit', 'connectkit', 'ethers', 'viem', 'thirdweb', 'dynamic', 'privy'];
const cases = selected.length ? selected : available;
for (const name of cases) if (!available.includes(name)) throw new Error(`Unknown matrix case: ${name}`);
const directory = await mkdtemp(join(tmpdir(), 'robinhood-framework-matrix-'));
const artifacts = {};
const results = [];

async function command(file, args, cwd, log) {
  try {
    const result = await exec(file, args, {
      cwd,
      maxBuffer: 16 * 1024 * 1024,
      env: {
        ...process.env, CI: 'true',
        VITE_WC_PROJECT_ID: '00000000000000000000000000000000',
        VITE_THIRDWEB_CLIENT_ID: '00000000000000000000000000000000',
        VITE_DYNAMIC_ENVIRONMENT_ID: '00000000-0000-4000-8000-000000000000',
        VITE_PRIVY_APP_ID: 'c000000000000000000000000',
      },
    });
    if (log) await writeFile(log, result.stdout + result.stderr);
    return result.stdout;
  } catch (error) {
    if (log) await writeFile(log, String(error.stdout ?? '') + String(error.stderr ?? '') + String(error));
    throw error;
  }
}

const inputs = {};
async function fingerprint(path) {
  for (const entry of await readdir(join(repository, path), { withFileTypes: true })) {
    const file = `${path}/${entry.name}`;
    if (entry.isDirectory()) await fingerprint(file);
    else if (entry.isFile()) inputs[file] = createHash('sha256').update(await readFile(join(repository, file))).digest('hex');
  }
}
await fingerprint('tests/frameworks');
for (const name of ['core', 'wagmi', 'rainbowkit', 'web3-onboard', 'thirdweb', 'dynamic', 'privy']) {
  await fingerprint(`packages/${name}/src`);
  for (const file of ['package.json', 'tsconfig.json']) {
    const path = `packages/${name}/${file}`;
    inputs[path] = createHash('sha256').update(await readFile(join(repository, path))).digest('hex');
  }
}
for (const name of cases) {
  if (name !== 'vanilla') await fingerprint(`examples/${name}/src`);
  const files = ['package.json', 'tsconfig.json', 'index.html'];
  if (name === 'vanilla') files.push('main.ts', 'fixture.ts', 'fixture.html', 'style.css');
  for (const file of files) {
    const path = `examples/${name}/${file}`;
    inputs[path] = createHash('sha256').update(await readFile(join(repository, path))).digest('hex');
  }
}
inputs['scripts/framework-matrix.mjs'] = createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
const source = {
  baseCommit: (await command('git', ['rev-parse', 'HEAD'], repository)).trim(),
  workingTreeModified: Boolean((await command('git', ['status', '--porcelain'], repository)).trim()),
  inputs,
};

for (const name of ['core', 'wagmi', 'rainbowkit', 'web3-onboard', 'thirdweb', 'dynamic', 'privy']) {
  const packagePath = join(repository, 'packages', name);
  const packed = JSON.parse(await command('npm', ['pack', '--json', '--pack-destination', directory], packagePath));
  const packedPackage = Array.isArray(packed) ? packed[0] : Object.values(packed)[0];
  const tarball = join(directory, packedPackage.filename);
  const manifest = JSON.parse(await readFile(join(packagePath, 'package.json'), 'utf8'));
  artifacts[manifest.name] = { path: tarball, sha256: createHash('sha256').update(await readFile(tarball)).digest('hex') };
}

console.log(`Packed-package framework matrix: ${directory}`);
for (const name of cases) {
  const started = Date.now();
  const target = join(directory, name);
  await mkdir(target);
  const example = join(repository, 'examples', name);
  const manifest = JSON.parse(await readFile(join(example, 'package.json'), 'utf8'));
  for (const dependency of Object.keys(manifest.dependencies)) {
    if (artifacts[dependency]) manifest.dependencies[dependency] = `file:${artifacts[dependency].path}`;
  }
  manifest.devDependencies['@types/node'] = '24.10.1';
  manifest.devDependencies.jsdom = '27.0.1';
  await writeFile(join(target, 'package.json'), JSON.stringify(manifest, null, 2));
  if (name === 'vanilla') {
    for (const file of ['main.ts', 'fixture.ts', 'fixture.html', 'style.css']) await cp(join(example, file), join(target, file));
  } else await cp(join(example, 'src'), join(target, 'src'), { recursive: true });
  await cp(join(example, 'index.html'), join(target, 'index.html'));
  await cp(join(example, 'tsconfig.json'), join(target, 'tsconfig.json'));
  const direct = name === 'ethers' || name === 'viem';
  const platform = ['vanilla', 'thirdweb', 'dynamic', 'privy'].includes(name);
  await cp(join(repository, 'tests/frameworks', platform ? 'platform-consumer.test.mjs' : direct ? 'provider-consumer.test.mjs' : 'consumer.test.mjs'), join(target, 'consumer.test.mjs'));
  const types = name === 'onboard' ? 'onboard' : direct || platform ? name : 'wagmi';
  await cp(join(repository, 'tests/frameworks', `${types}-types.ts`), join(target, name === 'vanilla' ? 'contract-types.ts' : 'src/contract-types.ts'));
  try {
    console.log(`${name}: installing packed packages and actual framework dependencies`);
    await command('npm', ['install', '--no-audit', '--no-fund'], target, join(target, 'install.log'));
    await command('npm', ['run', 'build'], target, join(target, 'build.log'));
    await command(process.execPath, ['--experimental-strip-types', '--test', '--test-timeout=60000', 'consumer.test.mjs'], target, join(target, 'tests.log'));
    const versions = JSON.parse(await command('npm', ['ls', '--depth=0', '--json'], target));
    results.push({ name, status: 'passed', elapsedMs: Date.now() - started, dependencies: Object.fromEntries(Object.entries(versions.dependencies).map(([key, value]) => [key, value.version])), directory: target });
    console.log(`${name}: production build, public type contracts, and runtime lifecycle tests passed`);
  } catch (error) {
    results.push({ name, status: 'failed', elapsedMs: Date.now() - started, directory: target, message: error.message });
    console.error(`${name}: FAILED; inspect ${target}`);
  }
}
for (const [path, hash] of Object.entries(inputs)) {
  if (createHash('sha256').update(await readFile(join(repository, path))).digest('hex') !== hash) {
    throw new Error(`Matrix input changed during verification: ${path}. Run again against stable inputs.`);
  }
}
const report = { generatedAt: new Date().toISOString(), directory, source, artifacts, results };
await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Report: ${join(directory, 'report.json')}`);
if (results.some((result) => result.status !== 'passed')) process.exitCode = 1;
else if (runBrowser) {
  console.log('Running browser checks against all selected packed consumers');
  console.log(await command(process.execPath, [join(repository, 'scripts/browser-integrations.mjs'), join(directory, 'report.json'), ...cases], repository, join(directory, 'browser.log')));
}
