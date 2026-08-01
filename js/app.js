import { createFirebaseClient, listenToCocktails } from './firebase.js';
import { generateCocktailId } from './cocktail-utils.js';

const state = {
  config: null,
  cocktails: [],
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

const guestNameInput = document.querySelector('#guest-name');
const barNameElement = document.querySelector('#bar-name');
const barEyebrowElement = document.querySelector('#bar-eyebrow');
const barStatusElement = document.querySelector('#bar-status');
const cocktailListElement = document.querySelector('#cocktail-list');
const cocktailDetailElement = document.querySelector('#cocktail-detail');
const cocktailCountElement = document.querySelector('#cocktail-count');
const cartItemsElement = document.querySelector('#cart-items');
const cartCountElement = document.querySelector('#cart-count');
const orderButton = document.querySelector('#order-button');
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
  const filters = [
    { key: 'all', label: 'Alle' },
    { key: 'alcoholic', label: 'Alkoholisch' },
    { key: 'non-alcoholic', label: 'Alkoholfrei' },
    ...propertyFilters.map((property) => ({ key: property, label: property })),
  ];

  filterGroup.innerHTML = filters
    .map((filter) => {
      const isActive = filter.key === 'all'
        ? state.activeFilterKeys.length === 0
        : isFilterActive(filter.key);

      return `
        <button class="filter-chip ${isActive ? 'active' : ''}" data-filter="${filter.key}" type="button">
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
  let filteredCocktails = state.cocktails;

  const alcoholFilter = state.activeFilterKeys.find((filterKey) => filterKey === 'alcoholic' || filterKey === 'non-alcoholic');

  if (alcoholFilter === 'alcoholic') {
    filteredCocktails = filteredCocktails.filter((cocktail) => cocktail.alcoholic);
  } else if (alcoholFilter === 'non-alcoholic') {
    filteredCocktails = filteredCocktails.filter((cocktail) => !cocktail.alcoholic);
  }

  const propertyFilters = state.activeFilterKeys.filter((filterKey) => filterKey !== 'alcoholic' && filterKey !== 'non-alcoholic');

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

  const ingredients = Array.isArray(cocktail.ingredients) && cocktail.ingredients.length
    ? cocktail.ingredients.join(', ')
    : 'frische Zutaten';

  return `${cocktail.name} ist ein ${cocktail.alcoholic ? 'alkoholischer' : 'alkoholfreier'} Cocktail mit ${ingredients}.`;
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
    <p><strong>Zutaten:</strong> ${Array.isArray(selectedCocktail.ingredients) ? selectedCocktail.ingredients.join(' · ') : 'Keine Angaben'}</p>
  `;
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

function handleOrder() {
  if (!guestNameInput || !orderButton) {
    return;
  }

  const guestName = guestNameInput.value.trim();
  if (!state.cart.length) {
    alert('Wähle zuerst mindestens einen Cocktail aus.');
    return;
  }

  if (!guestName) {
    alert('Bitte gib einen Namen oder eine Tischnummer an.');
    return;
  }

  const firebaseClient = createFirebaseClient(state.config);
  const message = `Bestellung von ${guestName}: ${state.cart.map((item) => item.name).join(', ')}`;

  if (firebaseClient.isConfigured) {
    console.info('Firebase-Konfiguration vorhanden:', firebaseClient.config);
  }

  const order = {
    id: `order-${Date.now()}`,
    guestName,
    items: state.cart.map((item) => ({ id: item.id, name: item.name })),
    createdAt: new Date().toISOString(),
  };

  const storageKey = `cocktailbar-orders-${state.barKey}`;
  const existingOrders = JSON.parse(localStorage.getItem(storageKey) || '[]');
  existingOrders.push(order);
  localStorage.setItem(storageKey, JSON.stringify(existingOrders));

  alert(`Bestellung gesendet:\n${message}`);
  state.cart = [];
  renderCart();
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

    renderFilters();
    renderCocktails();
    renderCart();

    if (guestNameInput) {
      guestNameInput.value = localStorage.getItem('guestName') || '';
      guestNameInput.addEventListener('input', (event) => {
        localStorage.setItem('guestName', event.target.value);
      });
    }

    if (orderButton) {
      orderButton.addEventListener('click', handleOrder);
    }
  } catch (error) {
    barStatusElement.textContent = error.message;
    if (cocktailListElement) {
      cocktailListElement.innerHTML = '<p class="empty-state">Die Konfiguration konnte nicht geladen werden.</p>';
    }
  }
}

init();
