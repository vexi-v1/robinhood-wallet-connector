#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, cp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const exec = promisify(execFile);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const selected = process.argv.slice(2);
const cases = selected.length ? selected : ['wagmi-v2', 'wagmi-v3', 'rainbowkit', 'onboard'];
for (const name of cases) if (!['wagmi-v2', 'wagmi-v3', 'rainbowkit', 'onboard'].includes(name)) throw new Error(`Unknown matrix case: ${name}`);
const directory = await mkdtemp(join(tmpdir(), 'robinhood-framework-matrix-'));
const artifacts = {};
const results = [];

async function command(file, args, cwd, log) {
  try {
    const result = await exec(file, args, {
      cwd,
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, CI: 'true', VITE_WC_PROJECT_ID: process.env.VITE_WC_PROJECT_ID ?? '00000000000000000000000000000000' },
    });
    if (log) await writeFile(log, result.stdout + result.stderr);
    return result.stdout;
  } catch (error) {
    if (log) await writeFile(log, String(error.stdout ?? '') + String(error.stderr ?? '') + String(error));
    throw error;
  }
}

for (const name of ['core', 'wagmi', 'rainbowkit', 'web3-onboard']) {
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
  await cp(join(example, 'src'), join(target, 'src'), { recursive: true });
  await cp(join(example, 'index.html'), join(target, 'index.html'));
  await cp(join(example, 'tsconfig.json'), join(target, 'tsconfig.json'));
  await cp(join(repository, 'tests/frameworks/consumer.test.mjs'), join(target, 'consumer.test.mjs'));
  await cp(join(repository, 'tests/frameworks', name === 'onboard' ? 'onboard-types.ts' : 'wagmi-types.ts'), join(target, 'src/contract-types.ts'));
  try {
    console.log(`${name}: installing packed packages and actual framework dependencies`);
    await command('npm', ['install', '--no-audit', '--no-fund'], target, join(target, 'install.log'));
    await command('npm', ['run', 'build'], target, join(target, 'build.log'));
    await command(process.execPath, ['--test', 'consumer.test.mjs'], target, join(target, 'tests.log'));
    const versions = JSON.parse(await command('npm', ['ls', '--depth=0', '--json'], target));
    results.push({ name, status: 'passed', elapsedMs: Date.now() - started, dependencies: Object.fromEntries(Object.entries(versions.dependencies).map(([key, value]) => [key, value.version])), directory: target });
    console.log(`${name}: production build, public type contracts, and runtime lifecycle tests passed`);
  } catch (error) {
    results.push({ name, status: 'failed', elapsedMs: Date.now() - started, directory: target, message: error.message });
    console.error(`${name}: FAILED; inspect ${target}`);
  }
}
const report = { generatedAt: new Date().toISOString(), directory, artifacts, results };
await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Report: ${join(directory, 'report.json')}`);
if (results.some((result) => result.status !== 'passed')) process.exitCode = 1;
