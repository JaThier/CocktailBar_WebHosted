import { createFirebaseClient } from './firebase.js';

const state = {
  config: null,
  cocktails: [],
  filteredCocktails: [],
  filter: 'all',
  cart: [],
};

const guestNameInput = document.querySelector('#guest-name');
const barNameElement = document.querySelector('#bar-name');
const barEyebrowElement = document.querySelector('#bar-eyebrow');
const barStatusElement = document.querySelector('#bar-status');
const cocktailListElement = document.querySelector('#cocktail-list');
const cocktailCountElement = document.querySelector('#cocktail-count');
const cartItemsElement = document.querySelector('#cart-items');
const cartCountElement = document.querySelector('#cart-count');
const orderButton = document.querySelector('#order-button');
const filterGroup = document.querySelector('#filter-group');

function parseBarKey() {
  const params = new URLSearchParams(window.location.search);
  return params.get('bar') || 'default';
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

function renderFilters() {
  const filters = [
    { key: 'all', label: 'Alle' },
    { key: 'alcoholic', label: 'Alkoholisch' },
    { key: 'non-alcoholic', label: 'Alkoholfrei' },
  ];

  filterGroup.innerHTML = filters
    .map(
      (filter) => `
        <button class="filter-chip ${state.filter === filter.key ? 'active' : ''}" data-filter="${filter.key}" type="button">
          ${filter.label}
        </button>
      `
    )
    .join('');

  filterGroup.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.filter;
      renderFilters();
      renderCocktails();
    });
  });
}

function getFilteredCocktails() {
  if (state.filter === 'alcoholic') {
    return state.cocktails.filter((cocktail) => cocktail.alcoholic);
  }

  if (state.filter === 'non-alcoholic') {
    return state.cocktails.filter((cocktail) => !cocktail.alcoholic);
  }

  return state.cocktails;
}

function renderCocktails() {
  state.filteredCocktails = getFilteredCocktails();
  cocktailCountElement.textContent = `${state.filteredCocktails.length}`;

  if (!state.filteredCocktails.length) {
    cocktailListElement.innerHTML = '<p class="empty-state">Keine Cocktails in dieser Ansicht.</p>';
    return;
  }

  cocktailListElement.innerHTML = state.filteredCocktails
    .map((cocktail) => `
      <article class="cocktail-card ${cocktail.available === false ? 'disabled' : ''}">
        <img src="${cocktail.image}" alt="${cocktail.name}" />
        <div class="cocktail-content">
          <div class="cocktail-topline">
            <h3>${cocktail.name}</h3>
            <span class="badge">${cocktail.alcoholic ? 'Alkoholisch' : 'Alkoholfrei'}</span>
          </div>
          <p>${cocktail.ingredients.join(' · ')}</p>
          <button class="secondary-button" type="button" data-id="${cocktail.id}" ${cocktail.available === false ? 'disabled' : ''}>
            ${cocktail.available === false ? 'Ausverkauft' : 'Zum Warenkorb'}
          </button>
        </div>
      </article>
    `)
    .join('');

  cocktailListElement.querySelectorAll('button[data-id]').forEach((button) => {
    button.addEventListener('click', () => addToCart(button.dataset.id));
  });
}

function renderCart() {
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

  alert(`Bestellung gesendet:\n${message}`);
  state.cart = [];
  renderCart();
}

async function init() {
  try {
    const config = await loadConfig(parseBarKey());
    state.config = config;

    document.title = config.barName || 'Cocktail Bar';
    barEyebrowElement.textContent = config.barName || 'Cocktail Bar';
    barNameElement.textContent = config.barName || 'Cocktail Bar';
    barStatusElement.textContent = config.isOpen === false ? 'Bar aktuell geschlossen' : 'Bar geöffnet';
    state.cocktails = Array.isArray(config.cocktails) ? config.cocktails : [];

    if (config.isOpen === false) {
      orderButton.style.display = 'none';
      barStatusElement.textContent = 'Bar aktuell geschlossen';
    } else {
      orderButton.style.display = 'inline-flex';
    }

    renderFilters();
    renderCocktails();
    renderCart();

    guestNameInput.value = localStorage.getItem('guestName') || '';
    guestNameInput.addEventListener('input', (event) => {
      localStorage.setItem('guestName', event.target.value);
    });

    orderButton.addEventListener('click', handleOrder);
  } catch (error) {
    barStatusElement.textContent = error.message;
    cocktailListElement.innerHTML = '<p class="empty-state">Die Konfiguration konnte nicht geladen werden.</p>';
  }
}

init();
