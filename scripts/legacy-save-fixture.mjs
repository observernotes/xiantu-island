import assert from 'node:assert/strict';

// Historical unit suites exercise synchronous localStorage transactions and failure
// injection. Override only this SSR module graph; release JSON stays untouched.
// Keep test:save-slots and its open-state async slot assertions outside this fixture.
export async function legacySaveFixture(server) {
  const { featureFlags, setFeatureFlag } = await server.ssrLoadModule('/src/features.ts');
  const released = featureFlags();
  setFeatureFlag('indexedDbSaves', false);
  assert.deepEqual(featureFlags(), { ...released, indexedDbSaves: false });
  console.log('legacy save fixture: indexedDbSaves=false (SSR memory override only)');
  return () => setFeatureFlag('indexedDbSaves', released.indexedDbSaves);
}
