import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js';
import {
  getDatabase,
  ref,
  push,
  set,
  update,
  remove,
  onValue,
} from 'https://www.gstatic.com/firebasejs/12.17.0/firebase-database.js';

let activeFirebaseConfig = null;
let cachedApp = null;
let cachedDatabase = null;

function buildClient(config) {
  const firebaseConfig = config?.firebase || config || {};
  const databaseURL = firebaseConfig.databaseURL || '';
  const isConfigured = Boolean(databaseURL);

  if (!isConfigured) {
    return {
      config: firebaseConfig,
      isConfigured: false,
      app: null,
      database: null,
    };
  }

  if (!cachedApp || cachedApp.options?.databaseURL !== databaseURL) {
    cachedApp = initializeApp(firebaseConfig, `cocktailbar-${databaseURL}`);
    cachedDatabase = getDatabase(cachedApp);
  }

  return {
    config: firebaseConfig,
    isConfigured: true,
    app: cachedApp,
    database: cachedDatabase,
  };
}

export function createFirebaseClient(config) {
  activeFirebaseConfig = config?.firebase || config || {};
  return buildClient(activeFirebaseConfig);
}

function getActiveClient() {
  return buildClient(activeFirebaseConfig || {});
}

function getCocktailsPath(barId) {
  const safeBarId = String(barId || 'default').trim() || 'default';
  return `bars/${encodeURIComponent(safeBarId)}/cocktails`;
}

export async function addCocktail(barId, cocktailData) {
  const client = getActiveClient();
  if (!client.isConfigured || !client.database) {
    throw new Error('Firebase ist nicht konfiguriert.');
  }

  const cocktailsRef = ref(client.database, getCocktailsPath(barId));
  const newCocktailRef = push(cocktailsRef);
  const nextCocktail = {
    ...cocktailData,
    id: newCocktailRef.key,
    createdAt: cocktailData?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await set(newCocktailRef, nextCocktail);
  return nextCocktail;
}

export async function updateCocktail(barId, cocktailId, cocktailData) {
  const client = getActiveClient();
  if (!client.isConfigured || !client.database) {
    throw new Error('Firebase ist nicht konfiguriert.');
  }

  const cocktailRef = ref(client.database, `${getCocktailsPath(barId)}/${encodeURIComponent(cocktailId)}`);
  const nextCocktail = {
    ...cocktailData,
    id: cocktailData?.id || cocktailId,
    updatedAt: new Date().toISOString(),
  };

  await update(cocktailRef, nextCocktail);
  return nextCocktail;
}

export async function deleteCocktail(barId, cocktailId) {
  const client = getActiveClient();
  if (!client.isConfigured || !client.database) {
    throw new Error('Firebase ist nicht konfiguriert.');
  }

  const cocktailRef = ref(client.database, `${getCocktailsPath(barId)}/${encodeURIComponent(cocktailId)}`);
  await remove(cocktailRef);
}

export function listenToCocktails(barId, callback) {
  const client = getActiveClient();
  if (!client.isConfigured || !client.database) {
    callback([]);
    return () => {};
  }

  const cocktailsRef = ref(client.database, getCocktailsPath(barId));
  return onValue(cocktailsRef, (snapshot) => {
    const cocktails = [];

    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        const cocktail = child.val() || {};
        cocktails.push({
          ...cocktail,
          id: child.key,
        });
      });
    }

    callback(cocktails);
  }, (error) => {
    console.error('Cocktails konnten nicht geladen werden.', error);
    callback([]);
  });
}

function getInventoryPath(barId) {
  const safeBarId = String(barId || 'default').trim() || 'default';
  return `bars/${encodeURIComponent(safeBarId)}/inventory`;
}

export async function updateInventory(barId, inventoryData) {
  const client = getActiveClient();
  if (!client.isConfigured || !client.database) {
    throw new Error('Firebase ist nicht konfiguriert.');
  }

  const inventoryRef = ref(client.database, getInventoryPath(barId));
  await update(inventoryRef, inventoryData);
  return inventoryData;
}

export function listenToInventory(barId, callback) {
  const client = getActiveClient();
  if (!client.isConfigured || !client.database) {
    callback({});
    return () => {};
  }

  const inventoryRef = ref(client.database, getInventoryPath(barId));
  return onValue(inventoryRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() || {} : {});
  }, (error) => {
    console.error('Inventardaten konnten nicht geladen werden.', error);
    callback({});
  });
}
