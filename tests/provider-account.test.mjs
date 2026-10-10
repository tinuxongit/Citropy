import './fixtures/isolated-data.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { store } from '../server/store.ts';
import { resolveProviderAccount, usableProviderAccount } from '../server/provider-account.ts';
import { hasUsableAccount, providerAccount } from '../shared/provider-account.ts';

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
