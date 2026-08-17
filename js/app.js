import { createFirebaseClient, listenToCocktails, listenToInventory, listenToOrders, addOrder } from './firebase.js';
import { generateCocktailId, normalizeStrength } from './cocktail-utils.js';
import { parseBarKey, loadConfig, normalizeCocktailProperties, getIngredientNames, isCocktailAvailable, sortCocktailsByName } from './shared.js';

const state = {
  config: null,
  cocktails: [],
  inventory: {},
  filteredCocktails: [],
  orders: [],
  activeFilterKeys: [],
  searchQuery: '',
  guestView: 'full',
  cart: [],
  barKey: 'default',
  selectedCocktailId: null,
  selectedOrderId: null,
};

const cocktailPropertyOptions = [
  'Erfrischend',
  'Exotisch',
  'Aromatisch',
  'Fruchtig',
  'Würzig',
  'Nussig',
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
const filterSearchInput = document.querySelector('#filter-search');
const filterGroup = document.querySelector('#filter-group');
const guestFilterPanel = document.querySelector('#guest-filter-panel');
const cocktailSectionTitleElement = document.querySelector('#cocktail-section-title');
const guestViewTabButtons = Array.from(document.querySelectorAll('[data-guest-view-tab]'));
const barLink = document.querySelector('#bar-link');
const museumLink = document.querySelector('#museum-link');

function getStorageKey(key, barKey = state.barKey) {
  return `cocktailbar-${key}-${barKey}`;
}

function isDailyCocktail(cocktail) {
  return cocktail?.daily === true;
}

function getCocktailStrengthValue(cocktail) {
  return normalizeStrength(cocktail?.strength || (cocktail?.alcoholic === false ? 'alkoholfrei' : 'ausgewogen'));
}

function getCocktailStrengthLabel(cocktail) {
  const strength = getCocktailStrengthValue(cocktail);

  if (strength === 'alkoholfrei') {
    return 'Alkoholfrei';
  }

  if (strength === 'intensiv') {
    return 'Intensiv';
  }

  if (strength === 'mild') {
    return 'Mild';
  }

  return 'Ausgewogen';
}

function getCocktailStrengthDescription(cocktail) {
  const strength = getCocktailStrengthValue(cocktail);

  if (strength === 'alkoholfrei') {
    return 'alkoholfreier';
  }

  return `${getCocktailStrengthLabel(cocktail).toLowerCase()}er`;
}

function setGuestView(view) {
  if (state.guestView === view) {
    return;
  }

  state.guestView = view;

  guestViewTabButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.guestViewTab === view);
  });

  if (guestFilterPanel) {
    guestFilterPanel.hidden = view !== 'full';
    if (view !== 'full') {
      guestFilterPanel.open = false;
    }
  }

  if (cocktailSectionTitleElement) {
    if (view === 'daily') {
      cocktailSectionTitleElement.textContent = 'Tageskarte';
    } else if (view === 'orders') {
      cocktailSectionTitleElement.textContent = 'Bestellungen';
    } else {
      cocktailSectionTitleElement.textContent = 'Cocktails';
    }
  }

  renderFilters();
  renderView();
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function matchesSearchQuery(cocktail, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return true;
  }

  const haystack = normalizeSearchText([
    cocktail?.name || '',
    getIngredientNames(cocktail).join(' '),
  ].join(' '));

  if (haystack.includes(normalizedQuery)) {
    return true;
  }

  const tokens = normalizedQuery.split(' ').filter(Boolean);
  return tokens.length > 1 && tokens.every((token) => haystack.includes(token));
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

  if (state.guestView === 'daily') {
    filterGroup.innerHTML = '';
    return;
  }

  const propertyFilters = getAvailablePropertyFilters();
  const strengthFilters = [
    { key: 'strength:alkoholfrei', label: 'alkoholfrei' },
    { key: 'strength:mild', label: 'mild' },
    { key: 'strength:ausgewogen', label: 'ausgewogen' },
    { key: 'strength:intensiv', label: 'intensiv' },
  ];

  const filters = [
    { key: 'all', label: 'Alle' },
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
  let filteredCocktails = state.cocktails.filter((cocktail) => isCocktailAvailable(cocktail, state.inventory));

  if (state.guestView === 'daily') {
    return filteredCocktails.filter((cocktail) => isDailyCocktail(cocktail));
  }

  const propertyFilters = state.activeFilterKeys.filter((filterKey) => {
    return !filterKey.startsWith('strength:');
  });

  const strengthFilter = state.activeFilterKeys.find((filterKey) => filterKey.startsWith('strength:'));

  if (strengthFilter) {
    const selectedStrength = strengthFilter.replace('strength:', '');
    filteredCocktails = filteredCocktails.filter((cocktail) => normalizeStrength(cocktail.strength) === selectedStrength);
  }

  if (propertyFilters.length) {
    filteredCocktails = filteredCocktails.filter((cocktail) => propertyFilters.every((property) => normalizeCocktailProperties(cocktail).includes(property)));
  }

  if (state.searchQuery) {
    filteredCocktails = filteredCocktails.filter((cocktail) => matchesSearchQuery(cocktail, state.searchQuery));
  }

  return sortCocktailsByName(filteredCocktails);
}

function getSortedOrders() {
  return [...(Array.isArray(state.orders) ? state.orders : [])].sort((left, right) => {
    const leftTime = new Date(left?.createdAt || 0).getTime();
    const rightTime = new Date(right?.createdAt || 0).getTime();
    return rightTime - leftTime;
  });
}

function getOrderItemsText(order) {
  const itemNames = Array.isArray(order?.items)
    ? order.items.map((item) => item?.name).filter(Boolean)
    : [];

  return itemNames.length ? itemNames.join(', ') : 'Keine Angaben';
}

function getOrderCocktailName(order) {
  const firstItem = Array.isArray(order?.items) ? order.items[0] : null;
  return firstItem?.name || 'Cocktail';
}

function getCocktailImageMarkup(cocktail) {
  const safeAlt = (cocktail.name || 'Cocktail').replace(/"/g, '&quot;');
  const slug = generateCocktailId(cocktail.name || cocktail.id || 'cocktail');
  const localImagePath = `./config/images/${state.barKey}/${slug}.png`;
  const remoteImage = cocktail.image || '';
  const imageSource = remoteImage || localImagePath;
  const fallback = remoteImage ? localImagePath : '';

  return `<img src="${imageSource}" alt="${safeAlt}" onerror="this.onerror=null; ${fallback ? `this.src='${fallback}';` : ''}" />`;
}

function getCocktailDescription(cocktail) {
  if (cocktail.description) {
    return cocktail.description;
  }

  const ingredients = getIngredientNames(cocktail).length
    ? getIngredientNames(cocktail).join(', ')
    : 'frische Zutaten';

  return `${cocktail.name} ist ein ${getCocktailStrengthDescription(cocktail)} Cocktail mit ${ingredients}.`;
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

  if (state.guestView === 'orders') {
    renderOrderDetail();
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
      <span class="badge">${getCocktailStrengthLabel(selectedCocktail)}</span>
    </div>
    <div class="cocktail-detail-main">
      <div class="cocktail-image-host">
        ${getCocktailImageMarkup(selectedCocktail)}
      </div>
      <div class="cocktail-detail-content">
        <p>${getCocktailDescription(selectedCocktail)}</p>
        <p><strong>Zutaten:</strong> ${getIngredientNames(selectedCocktail).length ? getIngredientNames(selectedCocktail).join(' · ') : 'Keine Angaben'}</p>
      </div>
    </div>
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

function renderOrderDetail() {
  if (!cocktailDetailElement) {
    return;
  }

  const sortedOrders = getSortedOrders();
  const selectedOrder = sortedOrders.find((order) => order.id === state.selectedOrderId) || sortedOrders[0] || null;

  if (!selectedOrder) {
    cocktailDetailElement.innerHTML = '<p class="empty-state">Noch keine Bestellungen.</p>';
    return;
  }

  cocktailDetailElement.innerHTML = `
    <div class="cocktail-detail-title">
      <h3>${selectedOrder.guestName || 'Kunde'}</h3>
      <span class="badge">${getOrderStatusLabel(selectedOrder)}</span>
    </div>
    <p><strong>Name/Tisch:</strong> ${selectedOrder.guestName || 'Kunde'}</p>
    <p><strong>Cocktail:</strong> ${getOrderItemsText(selectedOrder)}</p>
    <p><strong>Bestellt am:</strong> ${new Date(selectedOrder.createdAt).toLocaleString('de-DE')}</p>
    <p><strong>Status:</strong> ${getOrderStatusLabel(selectedOrder)}</p>
  `;
}

function getOrderStatusLabel(order) {
  if (order?.status === 'done') {
    return 'Fertig';
  }

  if (order?.status === 'in_progress') {
    return 'In Bearbeitung';
  }

  return 'Offen';
}

function renderOrdersTab() {
  const sortedOrders = getSortedOrders();

  if (!sortedOrders.length) {
    state.selectedOrderId = null;
  } else if (!sortedOrders.some((order) => order.id === state.selectedOrderId)) {
    state.selectedOrderId = sortedOrders[0].id;
  }

  if (cocktailCountElement) {
    cocktailCountElement.textContent = `${sortedOrders.length}`;
  }

  if (cocktailListElement) {
    cocktailListElement.innerHTML = sortedOrders.length
      ? sortedOrders.map((order) => `
        <button class="cocktail-list-item ${state.selectedOrderId === order.id ? 'active' : ''}" type="button" data-id="${order.id}">
          <span class="order-list-primary">
            <strong>${order.guestName || 'Kunde'}</strong>
            <span>${getOrderItemsText(order)}</span>
          </span>
          <span class="badge">${getOrderStatusLabel(order)}</span>
        </button>
      `).join('')
      : '<p class="empty-state">Noch keine Bestellungen.</p>';

    cocktailListElement.querySelectorAll('button[data-id]').forEach((button) => {
      button.addEventListener('click', () => {
        state.selectedOrderId = button.dataset.id;
        renderOrdersTab();
      });
    });
  }

  renderOrderDetail();
}

function renderCocktails() {
  if (state.guestView === 'orders') {
    renderOrdersTab();
    return;
  }

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
        <span class="badge">${cocktail.available === false ? 'Ausverkauft' : getCocktailStrengthLabel(cocktail)}</span>
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

function renderView() {
  if (state.guestView === 'orders') {
    renderOrdersTab();
    return;
  }

  renderCocktails();
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
    if (museumLink) {
      const museumUrl = new URL('./bar-museum.html', window.location.href);
      museumUrl.searchParams.set('bar', barKey);
      museumLink.href = museumUrl.toString();
    }
    const config = await loadConfig(barKey);
    state.config = config;
    createFirebaseClient(config);

    document.title = config.barName || 'Cocktail Bar';
    barEyebrowElement.textContent = config.barName || 'Cocktail Bar';
    barNameElement.textContent = config.barName || 'Cocktail Bar';
    barStatusElement.textContent = config.isOpen === false ? 'Bar aktuell geschlossen' : 'Bar geöffnet';

    guestViewTabButtons.forEach((button) => {
      button.addEventListener('click', () => setGuestView(button.dataset.guestViewTab));
    });

    if (guestFilterPanel) {
      guestFilterPanel.hidden = state.guestView === 'daily';
    }

    if (cocktailSectionTitleElement) {
      cocktailSectionTitleElement.textContent = 'Cocktails';
    }

    if (filterSearchInput) {
      filterSearchInput.value = state.searchQuery;
      filterSearchInput.addEventListener('input', (event) => {
        state.searchQuery = event.target.value;
        renderCocktails();
      });
    }

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

    listenToOrders(config.barId || barKey, (orders) => {
      state.orders = Array.isArray(orders) ? orders : [];
      if (state.guestView === 'orders') {
        renderView();
      }
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
