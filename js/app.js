import { createFirebaseClient, listenToCocktails, listenToInventory, addOrder } from './firebase.js';
import { generateCocktailId, normalizeStrength } from './cocktail-utils.js';

const state = {
  config: null,
  cocktails: [],
  inventory: {},
  filteredCocktails: [],
  activeFilterKeys: [],
  cart: [],
  barKey: 'default',
  selectedCocktailId: null,
};

const cocktailPropertyOptions = [
  'Erfrischend',
  'Exotisch',
  'Aromatisch',
  'Fruchtig',
  'Würzig',
  'Spritzig',
  'Cremig',
  'Raffiniert',
  'Klassiker',
  'Classy',
  'Bitter',
  'Süß',
  'Sauer',
  'Bartenders Favourite',
];

let guestNameInput = null;
let orderButton = null;
const barNameElement = document.querySelector('#bar-name');
const barEyebrowElement = document.querySelector('#bar-eyebrow');
const barStatusElement = document.querySelector('#bar-status');
const cocktailListElement = document.querySelector('#cocktail-list');
const cocktailDetailElement = document.querySelector('#cocktail-detail');
const cocktailCountElement = document.querySelector('#cocktail-count');
const cartItemsElement = document.querySelector('#cart-items');
const cartCountElement = document.querySelector('#cart-count');
const filterGroup = document.querySelector('#filter-group');
const barLink = document.querySelector('#bar-link');

function parseBarKey() {
  const params = new URLSearchParams(window.location.search);
  return params.get('bar') || 'default';
}

function getStorageKey(key, barKey = state.barKey) {
  return `cocktailbar-${key}-${barKey}`;
}

async function loadConfig(barKey) {
  const candidates = [
    `./config/${barKey}.json`,
    `/config/${barKey}.json`,
    `./config/default.json`,
    `/config/default.json`,
  ];

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

  throw new Error('Es konnte keine Konfiguration gefunden werden.');
}

function normalizeCocktailProperties(cocktail) {
  if (!cocktail || !Array.isArray(cocktail.properties)) {
    return [];
  }

  return cocktail.properties.filter(Boolean).map((property) => String(property).trim()).filter(Boolean);
}

function getIngredientNames(cocktail) {
  if (!Array.isArray(cocktail?.ingredients)) {
    return [];
  }

  return cocktail.ingredients
    .map((ingredient) => {
      if (typeof ingredient === 'string') {
        return ingredient.trim();
      }

      if (ingredient && typeof ingredient === 'object') {
        return String(ingredient.name || '').trim();
      }

      return '';
    })
    .filter(Boolean);
}

function isCocktailAvailable(cocktail) {
  const ingredients = getIngredientNames(cocktail);

  if (!ingredients.length) {
    return true;
  }

  return ingredients.every((ingredient) => state.inventory[ingredient] !== false);
}

function getAvailablePropertyFilters() {
  const propertyValues = new Set(cocktailPropertyOptions);

  state.cocktails.forEach((cocktail) => {
    normalizeCocktailProperties(cocktail).forEach((property) => propertyValues.add(property));
  });

  return Array.from(propertyValues).sort((left, right) => left.localeCompare(right));
}

function isFilterActive(filterKey) {
  return state.activeFilterKeys.includes(filterKey);
}

function toggleFilter(filterKey) {
  if (filterKey === 'all') {
    state.activeFilterKeys = [];
    renderFilters();
    renderCocktails();
    return;
  }

  if (filterKey.startsWith('strength:')) {
    const strengthFilterIndex = state.activeFilterKeys.findIndex((key) => key.startsWith('strength:'));
    const isSameFilterActive = strengthFilterIndex >= 0 && state.activeFilterKeys[strengthFilterIndex] === filterKey;

    if (strengthFilterIndex >= 0) {
      state.activeFilterKeys = state.activeFilterKeys.filter((key) => !key.startsWith('strength:'));
    }

    if (!isSameFilterActive) {
      state.activeFilterKeys.push(filterKey);
    }

    renderFilters();
    renderCocktails();
    return;
  }

  if (filterKey === 'alcoholic' || filterKey === 'non-alcoholic') {
    const alcoholFilterIndex = state.activeFilterKeys.findIndex((key) => key === 'alcoholic' || key === 'non-alcoholic');
    const isSameFilterActive = alcoholFilterIndex >= 0 && state.activeFilterKeys[alcoholFilterIndex] === filterKey;

    if (alcoholFilterIndex >= 0) {
      state.activeFilterKeys = state.activeFilterKeys.filter((key) => key !== 'alcoholic' && key !== 'non-alcoholic');
    }

    if (!isSameFilterActive) {
      state.activeFilterKeys.push(filterKey);
    }

    renderFilters();
    renderCocktails();
    return;
  }

  if (isFilterActive(filterKey)) {
    state.activeFilterKeys = state.activeFilterKeys.filter((key) => key !== filterKey);
  } else {
    state.activeFilterKeys = state.activeFilterKeys.filter((key) => key !== 'all');
    state.activeFilterKeys.push(filterKey);
  }

  renderFilters();
  renderCocktails();
}

function renderFilters() {
  if (!filterGroup) {
    return;
  }

  const propertyFilters = getAvailablePropertyFilters();
  const strengthFilters = [
    { key: 'strength:mild', label: 'mild' },
    { key: 'strength:ausgewogen', label: 'ausgewogen' },
    { key: 'strength:intensiv', label: 'intensiv' },
  ];

  const filters = [
    { key: 'all', label: 'Alle' },
    { key: 'alcoholic', label: 'Alkoholisch' },
    { key: 'non-alcoholic', label: 'Alkoholfrei' },
    ...strengthFilters,
    ...propertyFilters.map((property) => ({ key: property, label: property })),
  ];

  filterGroup.innerHTML = filters
    .map((filter) => {
      const isActive = filter.key === 'all'
        ? state.activeFilterKeys.length === 0
        : isFilterActive(filter.key);

      let filterClass = 'filter-chip';

      if (filter.key === 'all') {
        filterClass += ' filter-chip-all';
      } else if (filter.key === 'alcoholic' || filter.key === 'non-alcoholic') {
        filterClass += ' filter-chip-alcohol';
      } else if (filter.key.startsWith('strength:')) {
        filterClass += ' filter-chip-strength';
      } else {
        filterClass += ' filter-chip-property';
      }

      if (isActive) {
        filterClass += ' active';
      }

      return `
        <button class="${filterClass}" data-filter="${filter.key}" type="button">
          ${filter.label}
        </button>
      `;
    })
    .join('');

  filterGroup.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      toggleFilter(button.dataset.filter);
    });
  });
}

function getFilteredCocktails() {
  let filteredCocktails = state.cocktails.filter((cocktail) => isCocktailAvailable(cocktail));

  const alcoholFilter = state.activeFilterKeys.find((filterKey) => filterKey === 'alcoholic' || filterKey === 'non-alcoholic');

  if (alcoholFilter === 'alcoholic') {
    filteredCocktails = filteredCocktails.filter((cocktail) => cocktail.alcoholic);
  } else if (alcoholFilter === 'non-alcoholic') {
    filteredCocktails = filteredCocktails.filter((cocktail) => !cocktail.alcoholic);
  }

  const propertyFilters = state.activeFilterKeys.filter((filterKey) => {
    return filterKey !== 'alcoholic'
      && filterKey !== 'non-alcoholic'
      && !filterKey.startsWith('strength:');
  });

  const strengthFilter = state.activeFilterKeys.find((filterKey) => filterKey.startsWith('strength:'));

  if (strengthFilter) {
    const selectedStrength = strengthFilter.replace('strength:', '');
    filteredCocktails = filteredCocktails.filter((cocktail) => normalizeStrength(cocktail.strength) === selectedStrength);
  }

  if (propertyFilters.length) {
    filteredCocktails = filteredCocktails.filter((cocktail) => propertyFilters.every((property) => normalizeCocktailProperties(cocktail).includes(property)));
  }

  return filteredCocktails;
}

function getCocktailImageMarkup(cocktail) {
  const safeAlt = (cocktail.name || 'Cocktail').replace(/"/g, '&quot;');
  const slug = generateCocktailId(cocktail.name || cocktail.id || 'cocktail');
  const localImagePath = `./config/images/${state.barKey}/${slug}.jpg`;
  const remoteImage = cocktail.image || '';
  const imageSource = localImagePath;

  return `<img src="${imageSource}" alt="${safeAlt}" onerror="this.onerror=null; this.src='${remoteImage}';" />`;
}

function getCocktailDescription(cocktail) {
  if (cocktail.description) {
    return cocktail.description;
  }

  const ingredients = getIngredientNames(cocktail).length
    ? getIngredientNames(cocktail).join(', ')
    : 'frische Zutaten';

  return `${cocktail.name} ist ein ${cocktail.alcoholic ? 'alkoholischer' : 'alkoholfreier'} Cocktail mit ${ingredients}.`;
}

function bindCustomerOrderControls() {
  guestNameInput = document.querySelector('#guest-name');
  orderButton = document.querySelector('#order-button');

  if (guestNameInput) {
    guestNameInput.value = localStorage.getItem('guestName') || '';
    guestNameInput.addEventListener('input', (event) => {
      localStorage.setItem('guestName', event.target.value);
    });
  }

  if (orderButton) {
    orderButton.replaceWith(orderButton.cloneNode(true));
    orderButton = document.querySelector('#order-button');
    orderButton.addEventListener('click', handleOrder);
  }
}

function renderCocktailDetail() {
  if (!cocktailDetailElement) {
    return;
  }

  const selectedCocktail = state.filteredCocktails.find((cocktail) => cocktail.id === state.selectedCocktailId) || state.filteredCocktails[0] || null;

  if (!selectedCocktail) {
    cocktailDetailElement.innerHTML = '<p class="empty-state">Keine Cocktails in dieser Ansicht.</p>';
    return;
  }

  cocktailDetailElement.innerHTML = `
    <div class="cocktail-detail-title">
      <h3>${selectedCocktail.name}</h3>
      <span class="badge">${selectedCocktail.alcoholic ? 'Alkoholisch' : 'Alkoholfrei'}</span>
    </div>
    ${getCocktailImageMarkup(selectedCocktail)}
    <p>${getCocktailDescription(selectedCocktail)}</p>
    <p><strong>Zutaten:</strong> ${getIngredientNames(selectedCocktail).length ? getIngredientNames(selectedCocktail).join(' · ') : 'Keine Angaben'}</p>
    <div class="customer-order-panel">
      <label class="field">
        <span>Name oder Tisch</span>
        <input id="guest-name" type="text" placeholder="Name oder Tischnummer" value="${(localStorage.getItem('guestName') || '').replace(/"/g, '&quot;')}" />
      </label>
      <button id="order-button" class="primary-button" type="button">Bestellen</button>
    </div>
  `;

  bindCustomerOrderControls();
}

function renderCocktails() {
  state.filteredCocktails = getFilteredCocktails();

  if (cocktailCountElement) {
    cocktailCountElement.textContent = `${state.filteredCocktails.length}`;
  }

  if (!state.filteredCocktails.length) {
    if (cocktailListElement) {
      cocktailListElement.innerHTML = '<p class="empty-state">Keine Cocktails in dieser Ansicht.</p>';
    }
    renderCocktailDetail();
    return;
  }

  if (!state.selectedCocktailId || !state.filteredCocktails.some((cocktail) => cocktail.id === state.selectedCocktailId)) {
    state.selectedCocktailId = state.filteredCocktails[0].id;
  }

  if (!cocktailListElement) {
    renderCocktailDetail();
    return;
  }

  cocktailListElement.innerHTML = state.filteredCocktails
    .map((cocktail) => `
      <button class="cocktail-list-item ${state.selectedCocktailId === cocktail.id ? 'active' : ''} ${cocktail.available === false ? 'disabled' : ''}" type="button" data-id="${cocktail.id}">
        <span>${cocktail.name}</span>
        <span class="badge">${cocktail.available === false ? 'Ausverkauft' : cocktail.alcoholic ? 'Alkoholisch' : 'Alkoholfrei'}</span>
      </button>
    `)
    .join('');

  cocktailListElement.querySelectorAll('button[data-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedCocktailId = button.dataset.id;
      renderCocktails();
    });
  });

  renderCocktailDetail();
}

function renderCart() {
  if (!cartItemsElement || !cartCountElement) {
    return;
  }

  if (!state.cart.length) {
    cartItemsElement.innerHTML = 'Noch nichts ausgewählt.';
    cartCountElement.textContent = '0';
    return;
  }

  cartCountElement.textContent = `${state.cart.length}`;
  cartItemsElement.innerHTML = state.cart
    .map((item) => `<div class="cart-item">${item.name}</div>`)
    .join('');
}

function addToCart(cocktailId) {
  const cocktail = state.cocktails.find((item) => item.id === cocktailId);
  if (!cocktail || cocktail.available === false) {
    return;
  }

  state.cart.push(cocktail);
  renderCart();
}

async function handleOrder() {
  if (!guestNameInput || !orderButton) {
    return;
  }

  const selectedCocktail = state.filteredCocktails.find((cocktail) => cocktail.id === state.selectedCocktailId) || state.filteredCocktails[0] || null;
  const guestName = guestNameInput.value.trim();

  if (!selectedCocktail) {
    alert('Wähle zuerst einen Cocktail aus.');
    return;
  }

  if (!guestName) {
    alert('Bitte gib einen Namen oder eine Tischnummer an.');
    return;
  }

  const confirmed = window.confirm(`"${selectedCocktail.name}" wirklich bestellen?`);
  if (!confirmed) {
    return;
  }

  try {
    await addOrder(state.config?.barId || state.barKey, {
      guestName,
      items: [{ id: selectedCocktail.id, name: selectedCocktail.name }],
      createdAt: new Date().toISOString(),
      status: 'pending',
    });

    alert(`Bestellung gesendet:\n${selectedCocktail.name} für ${guestName}`);
  } catch (error) {
    console.error('Bestellung konnte nicht gespeichert werden.', error);
    alert('Bestellung konnte nicht gespeichert werden.');
  }
}

async function init() {
  try {
    const barKey = parseBarKey();
    state.barKey = barKey;
    if (barLink) {
      const barUrl = new URL('./bar.html', window.location.href);
      barUrl.searchParams.set('bar', barKey);
      barLink.href = barUrl.toString();
    }
    const config = await loadConfig(barKey);
    state.config = config;
    createFirebaseClient(config);

    document.title = config.barName || 'Cocktail Bar';
    barEyebrowElement.textContent = config.barName || 'Cocktail Bar';
    barNameElement.textContent = config.barName || 'Cocktail Bar';
    barStatusElement.textContent = config.isOpen === false ? 'Bar aktuell geschlossen' : 'Bar geöffnet';

    if (orderButton) {
      if (config.isOpen === false) {
        orderButton.style.display = 'none';
        barStatusElement.textContent = 'Bar aktuell geschlossen';
      } else {
        orderButton.style.display = 'inline-flex';
      }
    }

    listenToCocktails(config.barId || barKey, (cocktails) => {
      state.cocktails = Array.isArray(cocktails) ? cocktails : [];
      renderFilters();
      renderCocktails();
      renderCart();
    });

    listenToInventory(config.barId || barKey, (inventory) => {
      state.inventory = inventory && typeof inventory === 'object' ? inventory : {};
      renderFilters();
      renderCocktails();
      renderCart();
    });

    renderFilters();
    renderCocktails();
    renderCart();
  } catch (error) {
    barStatusElement.textContent = error.message;
    if (cocktailListElement) {
      cocktailListElement.innerHTML = '<p class="empty-state">Die Konfiguration konnte nicht geladen werden.</p>';
    }
  }
}

init();
