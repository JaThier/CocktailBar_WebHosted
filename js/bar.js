import {
  createFirebaseClient,
  addCocktail,
  updateCocktail,
  deleteCocktail,
  listenToCocktails,
} from './firebase.js';

const state = {
  barKey: 'default',
  config: null,
  cocktails: [],
  inventory: {},
  orders: [],
  activeTab: 'cocktails',
};

const barNameElement = document.querySelector('#bar-name');
const barStatusElement = document.querySelector('#bar-status');
const barLink = document.querySelector('#bar-link');
const accessPanelElement = document.querySelector('#access-panel');
const unlockButton = document.querySelector('#unlock-bar');
const passwordInput = document.querySelector('#bar-password');
const dashboardElement = document.querySelector('#bar-dashboard');
const tabContentElement = document.querySelector('#tab-content');
const tabButtons = Array.from(document.querySelectorAll('.tab-button'));

function parseBarKey() {
  const params = new URLSearchParams(window.location.search);
  return params.get('bar') || 'default';
}

function getConfigCandidates(barKey) {
  const pageBaseUrl = new URL('./', window.location.href);

  return [
    `./config/${barKey}.json`,
    `/config/${barKey}.json`,
    new URL(`./config/${barKey}.json`, pageBaseUrl).toString(),
    `./config/default.json`,
    `/config/default.json`,
    new URL('./config/default.json', pageBaseUrl).toString(),
  ];
}

async function loadConfig(barKey) {
  const candidates = getConfigCandidates(barKey);

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, { cache: 'no-store' });
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn(`Konfiguration konnte nicht geladen werden: ${candidate}`, error);
    }
  }

  throw new Error('Keine Konfiguration gefunden.');
}

function getStorageKey(key) {
  return `cocktailbar-${key}-${state.barKey}`;
}

function resetBarState() {
  state.cocktails = [];
  state.inventory = {};
  state.orders = [];
}

function loadStoredState() {
  const saved = JSON.parse(localStorage.getItem(getStorageKey('state')) || 'null');
  const savedOrders = JSON.parse(localStorage.getItem(getStorageKey('orders')) || 'null');

  state.inventory = saved?.inventory && typeof saved.inventory === 'object' ? saved.inventory : {};
  state.orders = Array.isArray(savedOrders) ? savedOrders : [];
}

function saveState() {
  localStorage.setItem(getStorageKey('state'), JSON.stringify({
    inventory: state.inventory,
    orders: state.orders,
  }));
  localStorage.setItem(getStorageKey('orders'), JSON.stringify(state.orders));
}

function ensureAccess() {
  const sessionKey = getStorageKey('access');
  if (sessionStorage.getItem(sessionKey) === 'true') {
    return true;
  }

  if (accessPanelElement && dashboardElement) {
    accessPanelElement.hidden = false;
    dashboardElement.hidden = true;
  }

  return false;
}

function unlockBar() {
  const sessionKey = getStorageKey('access');
  const enteredPassword = passwordInput?.value || '';
  const expectedPassword = state.config?.barPassword || '';

  if (enteredPassword === expectedPassword || !expectedPassword) {
    sessionStorage.setItem(sessionKey, 'true');
    if (accessPanelElement && dashboardElement) {
      accessPanelElement.hidden = true;
      dashboardElement.hidden = false;
    }
    init();
    return;
  }

  alert('Falsches Passwort.');
}

function setActiveTab(tab) {
  state.activeTab = tab;
  tabButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tab);
  });
  renderContent();
}

function getAllIngredients() {
  return Array.from(new Set(state.cocktails.flatMap((cocktail) => Array.isArray(cocktail.ingredients) ? cocktail.ingredients : []))).sort();
}

function renderCocktailsTab() {
  const ingredients = getAllIngredients();

  tabContentElement.innerHTML = `
    <div class="section-title">
      <h3>Cocktails bearbeiten</h3>
      <button class="primary-button" id="add-cocktail" type="button">+ Cocktail hinzufügen</button>
    </div>
    <div class="editor-list">
      ${state.cocktails.length ? state.cocktails.map((cocktail) => `
        <div class="editor-card" data-cocktail-id="${cocktail.id}">
          <div class="editor-grid">
            <label class="editor-row">
              <span>Name</span>
              <input type="text" data-field="name" value="${(cocktail.name || '').replace(/"/g, '&quot;')}" />
            </label>
            <label class="editor-row">
              <span>Zutaten (mit Komma trennen)</span>
              <textarea data-field="ingredients" rows="3">${(Array.isArray(cocktail.ingredients) ? cocktail.ingredients.join(', ') : '').replace(/"/g, '&quot;')}</textarea>
            </label>
            <label>
              <input type="checkbox" data-field="alcoholic" ${cocktail.alcoholic ? 'checked' : ''} /> Alkoholisch
            </label>
            <label>
              <input type="checkbox" data-field="available" ${cocktail.available !== false ? 'checked' : ''} /> Verfügbar
            </label>
          </div>
          <div class="editor-actions">
            <button class="primary-button" data-action="save" data-id="${cocktail.id}" type="button">Speichern</button>
            <button class="danger-button" data-action="remove" data-id="${cocktail.id}" type="button">Entfernen</button>
          </div>
        </div>
      `).join('') : '<p class="empty-state">Noch keine Cocktails angelegt.</p>'}
    </div>
    <p class="empty-state">Verfügbare Zutaten aus der Liste: ${ingredients.length ? ingredients.join(', ') : 'noch keine'}</p>
  `;

  tabContentElement.querySelector('#add-cocktail').addEventListener('click', async () => {
    try {
      const newCocktail = {
        id: `cocktail-${Date.now()}`,
        name: 'Neuer Cocktail',
        ingredients: [],
        alcoholic: true,
        available: true,
      };
      const createdCocktail = await addCocktail(state.config?.barId || state.barKey, newCocktail);
      state.cocktails = [...state.cocktails, createdCocktail];
      renderCocktailsTab();
    } catch (error) {
      console.error('Cocktail konnte nicht gespeichert werden.', error);
      alert('Cocktail konnte nicht gespeichert werden.');
    }
  });
}

function renderInventoryTab() {
  const ingredients = getAllIngredients();

  tabContentElement.innerHTML = `
    <div class="section-title">
      <h3>Vorratskammer</h3>
    </div>
    <div class="inventory-list">
      ${ingredients.length ? ingredients.map((ingredient) => `
        <label class="inventory-item">
          <span>${ingredient}</span>
          <input type="checkbox" data-ingredient="${ingredient}" ${state.inventory[ingredient] !== false ? 'checked' : ''} />
        </label>
      `).join('') : '<p class="empty-state">Noch keine Zutaten vorhanden.</p>'}
    </div>
  `;
}

function renderOrdersTab() {
  tabContentElement.innerHTML = `
    <div class="section-title">
      <h3>Bestellungen</h3>
      <span>${state.orders.length}</span>
    </div>
    <div class="order-list">
      ${state.orders.length ? state.orders.map((order) => `
        <div class="order-card">
          <strong>${order.guestName || 'Kunde'}</strong>
          <div>${order.items.map((item) => item.name).join(', ')}</div>
          <small>${new Date(order.createdAt).toLocaleString('de-DE')}</small>
          <div class="order-actions">
            <button class="danger-button" data-action="delete-order" data-id="${order.id}" type="button">Löschen</button>
          </div>
        </div>
      `).join('') : '<p class="empty-state">Noch keine Bestellungen.</p>'}
    </div>
  `;
}

function renderContent() {
  if (!tabContentElement) {
    return;
  }

  if (state.activeTab === 'inventory') {
    renderInventoryTab();
    return;
  }

  if (state.activeTab === 'orders') {
    renderOrdersTab();
    return;
  }

  renderCocktailsTab();
}

function bindTabEvents() {
  tabButtons.forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
  });
}

async function updateCocktailInFirebase(cocktailId, patch) {
  const cocktail = state.cocktails.find((item) => item.id === cocktailId);
  if (!cocktail) {
    return;
  }

  const updatedCocktail = {
    ...cocktail,
    ...patch,
  };

  state.cocktails = state.cocktails.map((item) => (item.id === cocktailId ? updatedCocktail : item));
  try {
    await updateCocktail(state.config?.barId || state.barKey, cocktailId, updatedCocktail);
  } catch (error) {
    console.error('Cocktail konnte nicht gespeichert werden.', error);
  }
}

function bindContentEvents() {
  tabContentElement.addEventListener('input', (event) => {
    const target = event.target;
    const card = target.closest('.editor-card');

    if (!card) {
      return;
    }

    card.classList.add('is-dirty');
  });

  tabContentElement.addEventListener('change', (event) => {
    const target = event.target;
    const card = target.closest('.editor-card');

    if (card) {
      card.classList.add('is-dirty');
      return;
    }

    if (target.dataset.ingredient) {
      state.inventory[target.dataset.ingredient] = target.checked;
      saveState();
    }
  });

  tabContentElement.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) {
      return;
    }

    if (button.dataset.action === 'save') {
      const card = button.closest('.editor-card');
      const cocktailId = card?.dataset.cocktailId;
      if (!cocktailId || !card) {
        return;
      }

      const nameInput = card.querySelector('[data-field="name"]');
      const ingredientsInput = card.querySelector('[data-field="ingredients"]');
      const alcoholicInput = card.querySelector('[data-field="alcoholic"]');
      const availableInput = card.querySelector('[data-field="available"]');

      const patch = {
        name: nameInput?.value.trim() || 'Neuer Cocktail',
        ingredients: (ingredientsInput?.value || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        alcoholic: alcoholicInput?.checked || false,
        available: availableInput?.checked !== false,
      };

      try {
        await updateCocktailInFirebase(cocktailId, patch);
        card.classList.remove('is-dirty');
      } catch (error) {
        console.error('Cocktail konnte nicht gespeichert werden.', error);
        alert('Cocktail konnte nicht gespeichert werden.');
      }
      return;
    }

    if (button.dataset.action === 'remove') {
      try {
        await deleteCocktail(state.config?.barId || state.barKey, button.dataset.id);
        state.cocktails = state.cocktails.filter((cocktail) => cocktail.id !== button.dataset.id);
        renderContent();
      } catch (error) {
        console.error('Cocktail konnte nicht gelöscht werden.', error);
        alert('Cocktail konnte nicht gelöscht werden.');
      }
      return;
    }

    if (button.dataset.action === 'delete-order') {
      state.orders = state.orders.filter((order) => order.id !== button.dataset.id);
      saveState();
      renderContent();
    }
  });
}

async function init() {
  const nextBarKey = parseBarKey();
  state.barKey = nextBarKey;

  try {
    state.config = await loadConfig(state.barKey);
  } catch (error) {
    if (barStatusElement) {
      barStatusElement.textContent = error.message;
    }
    return;
  }

  createFirebaseClient(state.config);

  const sessionKey = getStorageKey('access');
  if (sessionStorage.getItem(sessionKey) !== 'true') {
    ensureAccess();
    return;
  }

  if (accessPanelElement && dashboardElement) {
    accessPanelElement.hidden = true;
    dashboardElement.hidden = false;
  }

  try {
    if (barLink) {
      const guestUrl = new URL('./index.html', window.location.href);
      guestUrl.searchParams.set('bar', state.barKey);
      barLink.href = guestUrl.toString();
    }
    barNameElement.textContent = state.config.barName || 'Cocktail Bar';
    barStatusElement.textContent = state.config.isOpen === false ? 'Bar geschlossen' : 'Bar geöffnet';
    resetBarState();
    loadStoredState();
    bindTabEvents();
    bindContentEvents();

    listenToCocktails(state.config.barId || state.barKey, (cocktails) => {
      state.cocktails = Array.isArray(cocktails) ? cocktails : [];
      renderContent();
    });

    renderContent();
  } catch (error) {
    barStatusElement.textContent = error.message;
  }
}

if (unlockButton) {
  unlockButton.addEventListener('click', unlockBar);
}

if (passwordInput) {
  passwordInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      unlockBar();
    }
  });
}

init();
