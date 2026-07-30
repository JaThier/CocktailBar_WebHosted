export function createFirebaseClient(config) {
  const firebaseConfig = config?.firebase || {};

  return {
    config: firebaseConfig,
    isConfigured: Boolean(firebaseConfig.databaseURL),
  };
}
