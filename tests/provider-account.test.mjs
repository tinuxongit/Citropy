import './fixtures/isolated-data.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { store } from '../server/store.ts';
import { removeProviderAccount, resolveProviderAccount, usableProviderAccount } from '../server/provider-account.ts';
import { prepareAccountHome, withAccountHome } from '../server/provider-account-home.ts';
import { lstat, mkdir, mkdtemp, readlink, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { activeAccountId, hasUsableAccount, providerAccount } from '../shared/provider-account.ts';

const defaultModels = [{ id: 'default-model', label: 'Default' }];
const accountModels = [{ id: 'account-model', label: 'Account' }];
const provider = (overrides = {}) => ({
  id: 'codex',
  label: 'Codex',
  available: true,
  enabled: true,
  models: defaultModels,
  supportsPermissionPrompt: true,
  instances: [
    { id: 'work', name: 'Work', available: true, models: accountModels },
    { id: 'offline', name: 'Offline', available: false, models: accountModels },
  ],
  ...overrides,
});

test('providerAccount resolves the default account', () => {
  const account = providerAccount(provider());
  assert.equal(account.instance, undefined);
  assert.equal(account.models, defaultModels);
  assert.equal(account.usable, true);
});

test('providerAccount resolves a listed account', () => {
  const account = providerAccount(provider({ available: false }), 'work');
  assert.equal(account.instance?.id, 'work');
  assert.equal(account.models, accountModels);
  assert.equal(account.usable, true);
  assert.equal(providerAccount(provider(), 'offline').usable, false);
});

test('providerAccount treats a missing account as unusable with no models', () => {
  const account = providerAccount(provider(), 'missing');
  assert.equal(account.instance, undefined);
  assert.deepEqual(account.models, []);
  assert.equal(account.usable, false);
  assert.deepEqual(providerAccount(undefined), { instance: undefined, models: [], usable: false });
});

test('providerAccount treats a disabled provider as unusable', () => {
  assert.equal(providerAccount(provider({ enabled: false })).usable, false);
  assert.equal(providerAccount(provider({ enabled: false }), 'work').usable, false);
});

test('hasUsableAccount accepts a default or an available account on an enabled provider', () => {
  assert.equal(hasUsableAccount(provider()), true);
  assert.equal(hasUsableAccount(provider({ available: false })), true);
  assert.equal(hasUsableAccount(provider({ available: false, instances: [{ id: 'offline', name: 'Offline', available: false, models: [] }] })), false);
  assert.equal(hasUsableAccount(provider({ available: false, instances: undefined })), false);
  assert.equal(hasUsableAccount(provider({ enabled: false })), false);
});

test('activeAccountId uses the account chosen in settings, then the main account', () => {
  assert.equal(activeAccountId(provider({ activeInstanceId: 'work' })), 'work');
  assert.equal(activeAccountId(provider()), undefined);
  assert.equal(activeAccountId(provider({ available: false })), 'work');
  assert.equal(hasUsableAccount(provider({ activeInstanceId: 'offline' })), false);
});

test('the chosen account is saved per provider and cleared when the account is removed', t => {
  const instance = store.saveProviderInstance({ provider: 'codex', name: 'Chosen', environment: {} });
  t.after(() => { if (store.providerInstances.has(instance.id)) store.removeProviderInstance(instance.id); });
  assert.throws(() => store.setActiveAccount('claude', instance.id), /Provider account not found/);
  store.setActiveAccount('codex', instance.id);
  assert.equal(store.activeAccounts.get('codex'), instance.id);
  store.removeProviderInstance(instance.id);
  assert.equal(store.activeAccounts.has('codex'), false);
});

test('usableProviderAccount rejects unusable accounts', () => {
  assert.equal(usableProviderAccount(provider(), 'work').models, accountModels);
  assert.throws(() => usableProviderAccount(provider(), 'offline'), /enabled, installed provider account/);
  assert.throws(() => usableProviderAccount(undefined), /enabled, installed provider account/);
});

test('resolveProviderAccount checks the stored account against the provider', t => {
  t.after(() => store.providerInstances.delete('stored'));
  store.providerInstances.set('stored', { id: 'stored', name: 'Stored', provider: 'codex', binary: '/bin/codex', environment: { KEY: 'value' } });
  const { instance, launch } = resolveProviderAccount('codex', 'stored');
  assert.equal(instance?.id, 'stored');
  assert.deepEqual(launch, { instanceId: 'stored', binary: '/bin/codex', environment: { KEY: 'value' } });
  assert.deepEqual(resolveProviderAccount('codex'), { instance: undefined, launch: { instanceId: undefined, binary: undefined, environment: undefined } });
  assert.throws(() => resolveProviderAccount('claude', 'stored'), /account is unavailable/);
  assert.throws(() => resolveProviderAccount('codex', 'missing'), /account is unavailable/);
});

test('a new terminal account gets its own sign-in folder that shares the main settings', async t => {
  const main = await mkdtemp(join(tmpdir(), 'citropy-claude-main-'));
  t.after(() => rm(main, { recursive: true, force: true }));
  process.env.CLAUDE_CONFIG_DIR = main;
  await writeFile(join(main, 'settings.json'), '{}');
  await mkdir(join(main, 'skills'));
  await writeFile(join(main, '.credentials.json'), '{}');

  const input = withAccountHome({ provider: 'claude', name: 'Work', environment: {} });
  const folder = input.environment.CLAUDE_CONFIG_DIR;
  assert.match(folder, new RegExp(`^${process.env.CITROPY_DATA_DIR}`));
  assert.deepEqual(withAccountHome({ provider: 'claude', name: 'Own', environment: { CLAUDE_CONFIG_DIR: '/elsewhere' } }).environment, { CLAUDE_CONFIG_DIR: '/elsewhere' });
  assert.deepEqual(withAccountHome({ id: 'x', provider: 'claude', name: 'Edit', environment: {} }).environment, {});
  assert.deepEqual(withAccountHome({ provider: 'antigravity', name: 'App', environment: {} }).environment, {});

  const instance = store.saveProviderInstance(input);
  await prepareAccountHome(instance);
  assert.equal(await readlink(join(folder, 'settings.json')), join(main, 'settings.json'));
  assert.equal((await lstat(join(folder, 'skills'))).isSymbolicLink(), true);
  await assert.rejects(stat(join(folder, '.credentials.json')), { code: 'ENOENT' });

  await removeProviderAccount(instance.id);
  await assert.rejects(stat(folder), { code: 'ENOENT' });
  assert.equal((await stat(join(main, 'settings.json'))).isFile(), true);
});

test('removing an account leaves a folder the user chose', async t => {
  const own = await mkdtemp(join(tmpdir(), 'citropy-codex-own-'));
  t.after(() => rm(own, { recursive: true, force: true }));
  const instance = store.saveProviderInstance(withAccountHome({ provider: 'codex', name: 'Own', environment: { CODEX_HOME: own } }));
  await prepareAccountHome(instance);
  await removeProviderAccount(instance.id);
  assert.equal((await stat(own)).isDirectory(), true);
});
