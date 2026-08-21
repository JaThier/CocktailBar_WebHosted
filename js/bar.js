import {
  createFirebaseClient,
  addCocktail,
  updateCocktail,
  deleteCocktail,
  listenToCocktails,
  listenToInventory,
  listenToOrders,
  updateInventory,
  updateOrder,
  deleteOrder,
  addEvent,
  updateEvent,
  listenToEvents,
} from './firebase.js?v=3';
import { generateCocktailId, normalizeStrength } from './cocktail-utils.js?v=3';
import { parseBarKey, loadConfig, normalizeCocktailProperties, isCocktailAvailable, escapeHtml, getCocktailImageCandidates, sortCocktailsByName, getIngredientNames } from './shared.js?v=3';

const state = {
  barKey: 'default',
  config: null,
  cocktails: [],
  inventory: {},
  orders: [],
  events: [],
  activeTab: 'cocktails',
  searchQuery: '',
  museumArchiveSearchQuery: '',
  museumSelectedFilterKey: null,
  selectedCocktailId: null,
  museumArchiveSelectedCocktailId: null,
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
  'Hausmarke',
  'Bartenders Favourite',
];

const isMuseumView = window.location.pathname.toLowerCase().endsWith('/bar-museum.html');

const barNameElement = document.querySelector('#bar-name');
const barStatusElement = document.querySelector('#bar-status');
const guestLink = document.querySelector('#guest-link');
const museumGuestLink = document.querySelector('#museum-guest-link');
const barLink = document.querySelector('#bar-link');
const accessPanelElement = document.querySelector('#access-panel');
const unlockButton = document.querySelector('#unlock-bar');
const passwordInput = document.querySelector('#bar-password');
const dashboardElement = document.querySelector('#bar-dashboard');
const tabContentElement = document.querySelector('#tab-content');
const tabButtons = Array.from(document.querySelectorAll('.tab-button'));

function getStorageKey(key) {
  return `cocktailbar-${key}-${state.barKey}`;
}

function resetBarState() {
  state.cocktails = [];
  state.inventory = {};
  state.orders = [];
  state.events = [];
}

function loadStoredState() {
  const savedOrders = JSON.parse(localStorage.getItem(getStorageKey('orders')) || 'null');
  state.orders = Array.isArray(savedOrders) ? savedOrders : [];
}

function getConfiguredBarKey() {
  return state.config?.barId || state.barKey;
}

function getGuestViewUrl() {
  const guestUrl = new URL('./index.html', window.location.href);
  guestUrl.searchParams.set('bar', getConfiguredBarKey());
  return guestUrl;
}

function getBarViewUrl() {
  const barUrl = new URL('./bar.html', window.location.href);
  barUrl.searchParams.set('bar', getConfiguredBarKey());
  return barUrl;
}

function getFilterDefinitionContent() {
  const defaults = {
    'Erfrischend': {
      text: 'Ein erfrischender Cocktail für warme Tage.',
      bullets: ['Kühl serviert', 'Durstlöschend'],
    },
    'Exotisch': {
      text: 'Urlaubsfeeling im Glas mit tropischen Früchten.',
      bullets: ['Fruchtig', 'Ausgefallen'],
    },
    'Aromatisch': {
      text: 'Besondere Geschmackskomposition mit tiefem Aroma.',
      bullets: ['Vielschichtig', 'Kräftig im Duft'],
    },
    'Fruchtig': {
      text: 'Fokus auf fruchtigen Noten und Säften.',
      bullets: ['Süffig', 'Natürliche Süße'],
    },
    'Würzig': {
      text: 'Ein Cocktail mit Charakter und leichten Gewürznoten.',
      bullets: ['Kräftiger Abgang', 'Wärmendes Profil'],
    },
    'Nussig': {
      text: 'Samtige und nussige Aromen für ein volles Mundgefühl.',
      bullets: ['Weich', 'Vollmundig'],
    },
    'Spritzig': {
      text: 'Lebendig und frisch durch Kohlensäure.',
      bullets: ['Prickelnd', 'Belebend'],
    },
    'Cremig': {
      text: 'Ein weicher, sahniger Cocktail mit Dichte.',
      bullets: ['Samtig', 'Sättigend'],
    },
    'Raffiniert': {
      text: 'Ein feiner, durchdachter Cocktail mit Twist.',
      bullets: ['Elegant', 'Besondere Zutaten'],
    },
    'Klassiker': {
      text: 'Zeitlose und weltweit bekannte Rezepturen.',
      bullets: ['Bewährt', 'Immer eine gute Wahl'],
    },
    'Classy': {
      text: 'Ein stilvoller Drink für besondere Anlässe.',
      bullets: ['Sauber', 'Vornehm'],
    },
    'Bitter': {
      text: 'Ein herber Drink für Freunde kräftiger Aromen.',
      bullets: ['Herb', 'Kontrastreich'],
    },
    'Süß': {
      text: 'Ein angenehm süßer Drink für Liebhaber von Desserts.',
      bullets: ['Zugänglich', 'Gefällig'],
    },
    'Sauer': {
      text: 'Ein frischer Drink mit dominanter Zitrusnote.',
      bullets: ['Belebend', 'Klar'],
    },
    'Hausmarke': {
      text: 'Spezielle Eigenkreationen unserer Bar.',
      bullets: ['Nur hier erhältlich', 'Besonders zu empfehlen'],
    },
    'Bartenders Favourite': {
      text: 'Eine persönliche Empfehlung des Barkeepers.',
      bullets: ['Lieblingsdrink', 'Besonders lecker'],
    },
  };

  const configured = state.config?.museum?.filterDefinitions || {};
  return { ...defaults, ...configured };
}

function getFilterDefinitionBulletPoints(filterKey) {
  return getFilterDefinitionContent()[filterKey]?.bullets || [
    `Passt zur Kategorie ${filterKey} im Bar-Museum.`,
    'Hilft bei der schnellen Einordnung passender Cocktails.',
    'Dient im Bar-Museum als kompakte Erklärung zur Filterkategorie.',
  ];
}

function getFilterDefinitionStorageKey() {
  return getStorageKey('filter-definitions');
}

function getFilterDefinitionKeys() {
  return Array.from(new Set(cocktailPropertyOptions)).sort((left, right) => left.localeCompare(right, 'de', { sensitivity: 'base' }));
}

function loadFilterDefinitions() {
  const contentByFilter = getFilterDefinitionContent();

  return getFilterDefinitionKeys().reduce((definitions, filterKey) => {
    definitions[filterKey] = contentByFilter[filterKey]?.text || `Beispieltext_${filterKey}`;
    return definitions;
  }, {});
}

function saveFilterDefinitions() {
  localStorage.setItem(getFilterDefinitionStorageKey(), JSON.stringify(state.filterDefinitions || {}));
}

function saveState() {
  localStorage.setItem(getStorageKey('orders'), JSON.stringify(state.orders));
}

function setAccessState(isUnlocked) {
  if (accessPanelElement && dashboardElement) {
    accessPanelElement.hidden = isUnlocked;
    dashboardElement.hidden = !isUnlocked;
    accessPanelElement.style.display = isUnlocked ? 'none' : '';
    dashboardElement.style.display = isUnlocked ? '' : 'none';
  }
}

function ensureAccess() {
  const sessionKey = getStorageKey('access');
  if (sessionStorage.getItem(sessionKey) === 'true') {
    return true;
  }

  setAccessState(false);
  return false;
}

function unlockBar() {
  const sessionKey = getStorageKey('access');
  const enteredPassword = passwordInput?.value || '';
  const expectedPassword = state.config?.barPassword || '';

  if (enteredPassword === expectedPassword || !expectedPassword) {
    sessionStorage.setItem(sessionKey, 'true');
    setAccessState(true);
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
  const activeCocktails = state.cocktails.filter(c => !c.notAvailable);
  return Array.from(new Set(activeCocktails.flatMap((cocktail) => getIngredientNameList(cocktail)))).sort();
}

function attachCocktailImages() {
  const cards = tabContentElement?.querySelectorAll('.editor-card') || [];

  cards.forEach((card) => {
    const imageHost = card.querySelector('[data-image-host]');
    if (!imageHost) {
      return;
    }

    const cocktailId = card.dataset.cocktailId;
    const cocktail = state.cocktails.find((item) => item.id === cocktailId);
    if (!cocktail) {
      imageHost.innerHTML = '';
      return;
    }

    const candidates = getCocktailImageCandidates(cocktail, state.config?.barId || state.barKey);
    if (!candidates.length) {
      imageHost.innerHTML = '';
      return;
    }

    let index = 0;
    const image = document.createElement('img');
    image.className = 'editor-image';
    image.alt = (cocktail.name || 'Cocktail').replace(/"/g, '&quot;');

    const tryNextCandidate = () => {
      if (index >= candidates.length) {
        imageHost.innerHTML = '';
        return;
      }

      image.src = candidates[index];
      index += 1;
    };

    image.onerror = tryNextCandidate;
    image.onload = () => {
      imageHost.innerHTML = '';
      imageHost.appendChild(image);
    };

    tryNextCandidate();
  });
}

function parseIngredientDetail(detailValue) {
  const trimmed = String(detailValue || '').trim();

  if (!trimmed) {
    return { amount: '', unit: '' };
  }

  const amountMatch = trimmed.match(/^([0-9.,/]+(?:\s+[0-9.,/]+)*)\s*(.*)$/);

  if (!amountMatch) {
    return { amount: '', unit: trimmed };
  }

  return {
    amount: amountMatch[1].trim(),
    unit: amountMatch[2].trim(),
  };
}

function normalizeIngredients(cocktail) {
  if (!cocktail || !Array.isArray(cocktail.ingredients)) {
    return [];
  }

  return cocktail.ingredients
    .map((ingredient) => {
      if (typeof ingredient === 'string') {
        return { name: ingredient, amount: '', unit: '' };
      }

      if (ingredient && typeof ingredient === 'object') {
        return {
          name: String(ingredient.name || '').trim(),
          amount: String(ingredient.amount || '').trim(),
          unit: String(ingredient.unit || '').trim(),
        };
      }

      return { name: '', amount: '', unit: '' };
    })
    .filter((ingredient) => ingredient.name || ingredient.amount || ingredient.unit);
}

function getIngredientNameList(cocktail) {
  return normalizeIngredients(cocktail)
    .map((ingredient) => ingredient.name)
    .filter(Boolean);
}

function getIngredientDisplayEntries(cocktail) {
  return normalizeIngredients(cocktail).map((ingredient) => {
    const detailParts = [ingredient.amount, ingredient.unit].filter(Boolean);
    const detailText = detailParts.join(' ');
    return [ingredient.name, detailText].filter(Boolean).join(' · ');
  });
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
    getIngredientNameList(cocktail).join(' '),
  ].join(' '));

  if (haystack.includes(normalizedQuery)) {
    return true;
  }

  const tokens = normalizedQuery.split(' ').filter(Boolean);
  return tokens.length > 1 && tokens.every((token) => haystack.includes(token));
}

function getFilteredCocktails() {
  const allCocktails = sortCocktailsByName(state.cocktails);

  if (!state.searchQuery) {
    return allCocktails;
  }

  return allCocktails.filter((cocktail) => matchesSearchQuery(cocktail, state.searchQuery));
}

function renderCocktailsTab(options = {}) {
  const { preserveSearchFocus = false, searchSelectionStart = null, searchSelectionEnd = null } = options;
  const ingredients = getAllIngredients();
  const filteredCocktails = getFilteredCocktails();
  const previousListScrollTop = tabContentElement?.querySelector('.cocktail-list')?.scrollTop || 0;

  if (!filteredCocktails.length) {
    state.selectedCocktailId = null;
  } else if (!filteredCocktails.some((cocktail) => cocktail.id === state.selectedCocktailId)) {
    state.selectedCocktailId = filteredCocktails[0].id;
  }

  const selectedCocktail = filteredCocktails.find((cocktail) => cocktail.id === state.selectedCocktailId) || null;

  tabContentElement.innerHTML = `
    <div class="section-title">
      <h3>Cocktails bearbeiten</h3>
      <button class="primary-button" id="add-cocktail" type="button">+ Cocktail hinzufügen</button>
    </div>
    <label class="filter-search-field">
      <span>Cocktail suchen</span>
      <input id="bartender-cocktail-search" type="search" placeholder="Name oder Zutat" value="${escapeHtml(state.searchQuery)}" />
    </label>
    <div class="cocktail-layout">
      <div class="cocktail-list" aria-label="Cocktail-Liste">
        ${filteredCocktails.length ? filteredCocktails.map((cocktail) => {
    const isAvailable = isCocktailAvailable(cocktail, state.inventory);
    return `
            <button class="cocktail-list-item ${selectedCocktail?.id === cocktail.id ? 'active' : ''} ${isAvailable ? '' : 'disabled'}" type="button" data-role="select-cocktail" data-id="${cocktail.id}">
              <span>${cocktail.name || 'Unbenannter Cocktail'}</span>
              <span class="badge">${isAvailable ? getCocktailStrengthLabel(cocktail) : 'Nicht verfügbar'}</span>
            </button>
          `;
  }).join('') : '<p class="empty-state">Noch keine Cocktails angelegt.</p>'}
      </div>
      <div class="cocktail-detail-panel">
        ${selectedCocktail ? `
          <div class="editor-card" data-cocktail-id="${selectedCocktail.id}">
            <div class="editor-main-layout">
              <div class="editor-image-column">
                <div class="editor-image-host" data-image-host></div>
                <div class="editor-image-actions" style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem; width: 100%; max-width: 140px;">
                  <button class="secondary-button" data-action="upload-image" type="button" style="padding: 0.4rem; font-size: 0.85rem;">Bild hochladen</button>
                  ${selectedCocktail.image ? '<button class="danger-button" data-action="remove-image" type="button" style="padding: 0.4rem; font-size: 0.85rem;">Bild entfernen</button>' : ''}
                  <input type="file" class="image-upload-input" accept="image/*" style="display: none;" />
                </div>
              </div>
              <div class="editor-grid">
                <label class="editor-row">
                  <span>Name</span>
                  <input type="text" data-field="name" value="${(selectedCocktail.name || '').replace(/"/g, '&quot;')}" />
                </label>
                <div class="editor-row">
                  <span>Zutaten</span>
                  <div class="ingredient-list" data-ingredient-list>
                    ${normalizeIngredients(selectedCocktail).length ? normalizeIngredients(selectedCocktail).map((ingredient, index) => `
                      <div class="ingredient-row" data-ingredient-index="${index}" draggable="true" style="display: flex; flex-wrap: nowrap; align-items: center; gap: 0.5rem; width: 100%; max-width: 100%; margin-bottom: 0.5rem;">
                        <span class="drag-handle" style="cursor: grab; user-select: none; display: flex; align-items: center; justify-content: center; color: var(--text-muted, #888); flex: 1; min-width: 0; width: 0;" title="Verschieben">☰</span>
                        <input type="text" data-field="ingredient-name" value="${escapeHtml(ingredient.name)}" placeholder="Name" style="flex: 5; min-width: 0; width: 0;" />
                        <input type="text" data-field="ingredient-detail" value="${escapeHtml([ingredient.amount, ingredient.unit].filter(Boolean).join(' '))}" placeholder="Menge / Einheit" style="flex: 2; min-width: 0; width: 0;" />
                        <button class="danger-button" data-action="remove-ingredient" type="button" style="flex: 2; min-width: 0; width: 0; padding: 0.5rem 0;">×</button>
                      </div>
                    `).join('') : '<p class="empty-state">Noch keine Zutaten angelegt.</p>'}
                    <button class="secondary-button" data-action="add-ingredient" type="button">+</button>
                  </div>
                </div>
                <label class="editor-row">
                  <span>Kommentar für die Bestellübersicht</span>
                  <textarea data-field="comment" rows="3">${escapeHtml(selectedCocktail.comment || '')}</textarea>
                </label>
                <div class="editor-row">
                  <span>Eigenschaften</span>
                  <div class="property-options">
                    ${cocktailPropertyOptions.map((property) => `
                      <label class="property-chip">
                        <input type="checkbox" data-property="${property}" ${normalizeCocktailProperties(selectedCocktail).includes(property) ? 'checked' : ''} />
                        <span>${property}</span>
                      </label>
                    `).join('')}
                  </div>
                </div>
                <label class="editor-row">
                  <span>Stärke</span>
                  <select data-field="strength">
                    <option value="alkoholfrei" ${getCocktailStrengthValue(selectedCocktail) === 'alkoholfrei' ? 'selected' : ''}>alkoholfrei</option>
                    <option value="mild" ${selectedCocktail.strength === 'mild' ? 'selected' : ''}>mild</option>
                    <option value="ausgewogen" ${selectedCocktail.strength === 'ausgewogen' || !selectedCocktail.strength ? 'selected' : ''}>ausgewogen</option>
                    <option value="intensiv" ${selectedCocktail.strength === 'intensiv' ? 'selected' : ''}>intensiv</option>
                  </select>
                </label>
                <label>
                  <input type="checkbox" data-field="daily" ${selectedCocktail.daily ? 'checked' : ''} /> Tageskarte
                </label>
                <label>
                  <input type="checkbox" data-field="notAvailable" ${selectedCocktail.notAvailable ? 'checked' : ''} /> Nicht verfügbar
                </label>
              </div>
            </div>
            <div class="editor-actions">
              <button class="primary-button" data-action="save" data-id="${selectedCocktail.id}" type="button">Speichern</button>
              <button class="danger-button" data-action="remove" data-id="${selectedCocktail.id}" type="button">Entfernen</button>
            </div>
          </div>
        ` : '<p class="empty-state">Noch keine Cocktails angelegt.</p>'}
      </div>
    </div>
  `;

  attachCocktailImages();

  const searchInput = tabContentElement.querySelector('#bartender-cocktail-search');
  if (searchInput) {
    searchInput.value = state.searchQuery;
    if (preserveSearchFocus) {
      searchInput.focus();
      if (typeof searchSelectionStart === 'number' && typeof searchSelectionEnd === 'number') {
        searchInput.setSelectionRange(searchSelectionStart, searchSelectionEnd);
      }
    }

    searchInput.addEventListener('input', (event) => {
      const target = event.target;
      state.searchQuery = event.target.value;
      renderContent({
        preserveSearchFocus: true,
        searchSelectionStart: target.selectionStart,
        searchSelectionEnd: target.selectionEnd,
      });
    });
  }

  requestAnimationFrame(() => {
    const cocktailList = tabContentElement?.querySelector('.cocktail-list');
    if (cocktailList) {
      cocktailList.scrollTop = previousListScrollTop;
    }
  });

  const addButton = tabContentElement.querySelector('#add-cocktail');
  if (addButton) {
    addButton.addEventListener('click', async () => {
      try {
        const newCocktail = {
          name: 'Neuer Cocktail',
          ingredients: [],
          daily: false,
          notAvailable: false,
          available: true,
          strength: 'ausgewogen',
          comment: '',
        };
        const savedCocktail = await addCocktail(state.config?.barId || state.barKey, newCocktail);
        if (savedCocktail?.id) {
          state.cocktails = [...state.cocktails.filter((cocktail) => cocktail.id !== savedCocktail.id), savedCocktail];
          state.selectedCocktailId = savedCocktail.id;
          renderContent();
        }
      } catch (error) {
        console.error('Cocktail konnte nicht gespeichert werden.', error);
        alert('Cocktail konnte nicht gespeichert werden.');
      }
    });
  }
}

function renderMuseumEventsTab() {
  const events = state.events || [];

  const grandTotalStats = {};
  events.forEach(event => {
    const stats = event.statistics || {};
    Object.keys(stats).forEach(cocktailId => {
      grandTotalStats[cocktailId] = (grandTotalStats[cocktailId] || 0) + stats[cocktailId];
    });
  });

  const getCocktailName = (id) => {
    const cocktail = state.cocktails.find(c => c.id === id);
    return cocktail ? cocktail.name : 'Unbekannter Cocktail';
  };

  const renderStats = (statsObj) => {
    const sortedIds = Object.keys(statsObj).sort((a, b) => statsObj[b] - statsObj[a]);
    if (sortedIds.length === 0) return '<p class="empty-state">Noch keine Daten.</p>';

    return `
      <ul style="list-style: none; padding: 0; margin: 0;">
        ${sortedIds.map(id => `
          <li style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--color-secondary-surface);">
            <span>${escapeHtml(getCocktailName(id))}</span>
            <strong>${statsObj[id]}x</strong>
          </li>
        `).join('')}
      </ul>
    `;
  };

  tabContentElement.innerHTML = `
    <div class="section-title">
      <h3>Event-Statistiken</h3>
      <span>Gesamt über alle Events</span>
    </div>
    
    <details style="background: var(--color-surface); padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem;">
      <summary style="font-weight: bold; cursor: pointer; outline: none; margin: -1.5rem; padding: 1.5rem;">Gesamtstatistik ausklappen</summary>
      <div style="margin-top: 1.5rem;">
        ${renderStats(grandTotalStats)}
      </div>
    </details>

    <div class="section-title">
      <h3>Einzelne Events</h3>
    </div>
    
    <div style="display: flex; flex-direction: column; gap: 1rem;">
      ${events.length ? [...events].reverse().map(event => `
        <div style="border: 1px solid var(--border-color, #ddd); padding: 1rem; border-radius: 8px;">
          <h4 style="margin-top: 0; margin-bottom: 0.5rem;">
            ${event.status === 'active' ? '🔴 Aktives Event' : `✅ ${escapeHtml(event.name || 'Abgeschlossenes Event')}`}
          </h4>
          <p style="font-size: 0.9em; color: var(--text-muted, #666); margin-top: 0; margin-bottom: 1rem;">
            Start: ${new Date(event.createdAt).toLocaleString('de-DE')}
            ${event.endTime ? `<br>Ende: ${new Date(event.endTime).toLocaleString('de-DE')}` : ''}
          </p>
          ${renderStats(event.statistics || {})}
        </div>
      `).join('') : '<p class="empty-state">Bisher keine Events gestartet.</p>'}
    </div>
  `;
}

function renderMuseumArchiveTab(options = {}) {
  const { preserveSearchFocus = false, searchSelectionStart = null, searchSelectionEnd = null } = options;

  let archivedCocktails = state.cocktails.filter((cocktail) => !isCocktailAvailable(cocktail, state.inventory));
  
  if (state.museumArchiveSearchQuery) {
    const q = state.museumArchiveSearchQuery.toLowerCase();
    archivedCocktails = archivedCocktails.filter((c) => {
      if (c.name && c.name.toLowerCase().includes(q)) return true;
      const ingredients = getIngredientNames(c);
      if (ingredients.some(i => i.toLowerCase().includes(q))) return true;
      return false;
    });
  }
  
  archivedCocktails = sortCocktailsByName(archivedCocktails);

  if (!archivedCocktails.length) {
    state.museumArchiveSelectedCocktailId = null;
  } else if (!archivedCocktails.some(c => c.id === state.museumArchiveSelectedCocktailId)) {
    state.museumArchiveSelectedCocktailId = archivedCocktails[0].id;
  }

  const selectedCocktail = archivedCocktails.find(c => c.id === state.museumArchiveSelectedCocktailId) || null;
  const previousListScrollTop = tabContentElement?.querySelector('.cocktail-list')?.scrollTop || 0;

  tabContentElement.innerHTML = `
    <div class="section-title">
      <h3>Cocktail-Archiv</h3>
      <span>Aktuell nicht verfügbare Cocktails</span>
    </div>
    <label class="filter-search-field">
      <span>Cocktail suchen</span>
      <input id="museum-archive-search" type="search" placeholder="Name oder Zutat" value="${escapeHtml(state.museumArchiveSearchQuery)}" />
    </label>
    <div class="cocktail-layout">
      <div class="cocktail-list" aria-label="Cocktail-Liste">
        ${archivedCocktails.length ? archivedCocktails.map((cocktail) => `
          <button class="cocktail-list-item ${selectedCocktail?.id === cocktail.id ? 'active' : ''}" type="button" data-role="select-archive-cocktail" data-id="${cocktail.id}">
            <span>${escapeHtml(cocktail.name || 'Unbenannter Cocktail')}</span>
          </button>
        `).join('') : '<p class="empty-state">Keine Cocktails im Archiv gefunden.</p>'}
      </div>
      <div class="cocktail-detail-panel">
        ${selectedCocktail ? `
          <div class="editor-card" data-cocktail-id="${selectedCocktail.id}">
            <div class="editor-main-layout">
              <div class="editor-image-column">
                <div class="editor-image-host" data-image-host style="pointer-events: none;"></div>
              </div>
              <div class="editor-grid" style="align-content: flex-start; gap: 1rem;">
                <h3 style="margin: 0; font-size: 1.5rem;">${escapeHtml(selectedCocktail.name || 'Unbenannter Cocktail')}</h3>
                <div style="font-size: 0.9rem; color: var(--text-muted, #666);">
                  <strong>Zutaten:</strong> ${getIngredientNames(selectedCocktail).length ? escapeHtml(getIngredientNames(selectedCocktail).join(' · ')) : 'Keine Angaben'}
                </div>
                ${normalizeCocktailProperties(selectedCocktail).length ? `
                  <div class="property-options" style="margin-top: 0.5rem; display: flex; flex-wrap: wrap; gap: 0.5rem;">
                    ${normalizeCocktailProperties(selectedCocktail).map(prop => `
                      <span class="property-chip" style="pointer-events: none; opacity: 0.8; font-size: 0.8rem; padding: 0.2rem 0.6rem; border-radius: 12px; background: var(--color-surface); border: 1px solid var(--color-secondary-surface);">
                        ${escapeHtml(prop)}
                      </span>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        ` : '<p class="empty-state">Bitte wählen Sie einen Cocktail aus.</p>'}
      </div>
    </div>
  `;

  attachCocktailImages();

  const searchInput = tabContentElement.querySelector('#museum-archive-search');
  if (searchInput) {
    searchInput.value = state.museumArchiveSearchQuery;
    if (preserveSearchFocus) {
      searchInput.focus();
      if (typeof searchSelectionStart === 'number' && typeof searchSelectionEnd === 'number') {
        searchInput.setSelectionRange(searchSelectionStart, searchSelectionEnd);
      }
    }

    searchInput.addEventListener('input', (event) => {
      const target = event.target;
      state.museumArchiveSearchQuery = event.target.value;
      renderMuseumArchiveTab({
        preserveSearchFocus: true,
        searchSelectionStart: target.selectionStart,
        searchSelectionEnd: target.selectionEnd,
      });
    });
  }

  requestAnimationFrame(() => {
    const cocktailList = tabContentElement?.querySelector('.cocktail-list');
    if (cocktailList) {
      cocktailList.scrollTop = previousListScrollTop;
    }
  });
}

function renderMuseumFilterDefinitionsTab() {
  const filterKeys = getFilterDefinitionKeys();

  if (!filterKeys.length) {
    tabContentElement.innerHTML = '<p class="empty-state">Keine Filterdefinitionen vorhanden.</p>';
    return;
  }

  if (!state.museumSelectedFilterKey || !filterKeys.includes(state.museumSelectedFilterKey)) {
    state.museumSelectedFilterKey = filterKeys[0];
  }

  const selectedFilterKey = state.museumSelectedFilterKey;
  const selectedFilterText = state.filterDefinitions?.[selectedFilterKey] || '';

  tabContentElement.innerHTML = `
    <div class="section-title">
      <h3>Filterdefinitionen</h3>
      <span>${filterKeys.length}</span>
    </div>
    <div class="museum-layout">
      <div class="museum-filter-list" aria-label="Filterliste">
        ${filterKeys.map((filterKey) => `
          <button class="cocktail-list-item museum-filter-item ${selectedFilterKey === filterKey ? 'active' : ''}" type="button" data-role="select-museum-filter" data-id="${filterKey}">
            <span>${filterKey}</span>
          </button>
        `).join('')}
      </div>
      <div class="museum-editor-panel">
        <label class="editor-row museum-editor-row">
          <span>${selectedFilterKey}</span>
          <p class="museum-filter-text">${escapeHtml(selectedFilterText)}</p>
        </label>
        <div class="museum-description-block" aria-label="Kurzbeschreibung">
          <ul>
            ${getFilterDefinitionBulletPoints(selectedFilterKey).map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
          </ul>
        </div>
      </div>
    </div>
  `;
}

function renderInventoryTab() {
  const ingredients = getAllIngredients();
  const allChecked = ingredients.length > 0 && ingredients.every((ingredient) => state.inventory[ingredient] !== false);

  tabContentElement.innerHTML = `
    <div class="section-title">
      <h3>Vorratskammer</h3>
    </div>
    ${ingredients.length ? `
    <div class="inventory-list" style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color, #ccc);">
      <label class="inventory-item">
        <input type="checkbox" data-action="toggle-all-ingredients" ${allChecked ? 'checked' : ''} />
        <span><strong>Alle auswählen</strong></span>
      </label>
    </div>
    ` : ''}
    <div class="inventory-list">
      ${ingredients.length ? ingredients.map((ingredient) => `
        <label class="inventory-item">
          <input type="checkbox" data-ingredient="${ingredient}" ${state.inventory[ingredient] !== false ? 'checked' : ''} />
          <span>${ingredient}</span>
        </label>
      `).join('') : '<p class="empty-state">Noch keine Zutaten vorhanden.</p>'}
    </div>
  `;
}

async function addIngredientToInventory(ingredientName) {
  const normalizedIngredient = String(ingredientName || '').trim();
  if (!normalizedIngredient) {
    return;
  }

  const nextInventoryState = {
    ...state.inventory,
    [normalizedIngredient]: true,
  };
  state.inventory = nextInventoryState;

  try {
    await updateInventory(state.config?.barId || state.barKey, {
      [normalizedIngredient]: true,
    });
  } catch (error) {
    console.error('Zutat konnte nicht in Firebase gespeichert werden.', error);
    alert('Zutat konnte nicht in Firebase gespeichert werden.');
  }
}

async function syncIngredientsToInventory(ingredientNames) {
  const normalizedIngredients = Array.from(new Set(
    (ingredientNames || [])
      .map((ingredient) => {
        if (typeof ingredient === 'string') {
          return ingredient.trim();
        }

        if (ingredient && typeof ingredient === 'object') {
          return String(ingredient.name || '').trim();
        }

        return '';
      })
      .filter(Boolean)
  ));

  if (!normalizedIngredients.length) {
    return;
  }

  const inventoryPatch = normalizedIngredients.reduce((result, ingredient) => {
    result[ingredient] = true;
    return result;
  }, {});

  state.inventory = {
    ...state.inventory,
    ...inventoryPatch,
  };

  try {
    await updateInventory(state.config?.barId || state.barKey, inventoryPatch);
  } catch (error) {
    console.error('Zutaten konnten nicht in Firebase gespeichert werden.', error);
    alert('Zutaten konnten nicht in Firebase gespeichert werden.');
  }
}

async function pruneUnusedIngredients() {
  const usedIngredients = Array.from(new Set(
    state.cocktails.flatMap((cocktail) => getIngredientNameList(cocktail))
  )).filter(Boolean);

  const inventoryPatch = Object.keys(state.inventory || {}).reduce((result, ingredient) => {
    if (!usedIngredients.includes(ingredient)) {
      result[ingredient] = null;
    }
    return result;
  }, {});

  if (!Object.keys(inventoryPatch).length) {
    return;
  }

  state.inventory = Object.fromEntries(
    Object.entries(state.inventory || {}).filter(([ingredient]) => usedIngredients.includes(ingredient))
  );

  try {
    await updateInventory(state.config?.barId || state.barKey, inventoryPatch);
  } catch (error) {
    console.error('Nicht verwendete Zutaten konnten nicht bereinigt werden.', error);
    alert('Nicht verwendete Zutaten konnten nicht bereinigt werden.');
  }
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

function attachOrderImage(selectedOrder) {
  const detailPanel = tabContentElement?.querySelector('.order-detail-panel');
  if (!detailPanel) {
    return;
  }

  const imageHost = detailPanel.querySelector('[data-order-image-host]');
  if (!imageHost) {
    return;
  }

  const firstItem = Array.isArray(selectedOrder?.items) ? selectedOrder.items[0] : null;
  const cocktail = state.cocktails.find((item) => item.id === firstItem?.id) || null;

  if (!cocktail) {
    imageHost.innerHTML = '';
    return;
  }

  const candidates = getCocktailImageCandidates(cocktail, state.config?.barId || state.barKey);
  if (!candidates.length) {
    imageHost.innerHTML = '';
    return;
  }

  let index = 0;
  const image = document.createElement('img');
  image.className = 'editor-image';
  image.alt = (cocktail.name || 'Cocktail').replace(/"/g, '&quot;');

  const tryNextCandidate = () => {
    if (index >= candidates.length) {
      imageHost.innerHTML = '';
      return;
    }

    image.src = candidates[index];
    index += 1;
  };

  image.onerror = tryNextCandidate;
  image.onload = () => {
    imageHost.innerHTML = '';
    imageHost.appendChild(image);
  };

  tryNextCandidate();
}

function renderOrdersTab() {
  if (!state.orders.length) {
    state.selectedOrderId = null;
  } else if (!state.orders.some((order) => order.id === state.selectedOrderId)) {
    state.selectedOrderId = state.orders[0].id;
  }

  const selectedOrder = state.orders.find((order) => order.id === state.selectedOrderId) || null;
  const firstItem = Array.isArray(selectedOrder?.items) ? selectedOrder.items[0] : null;
  const selectedCocktail = firstItem
    ? state.cocktails.find((cocktail) => cocktail.id === firstItem.id) || null
    : null;

  const activeEvent = state.events.find((e) => e.status === 'active');

  tabContentElement.innerHTML = `
    <div class="section-title">
      <h3>Bestellungen</h3>
      <span>${state.orders.length}</span>
    </div>
    <div style="margin-bottom: 1rem;">
      ${activeEvent ? `
        <div class="editor-row" style="background: var(--surface-2, #f5f5f5); padding: 1rem; border-radius: 8px;">
          <p style="margin: 0 0 0.5rem 0;"><strong>Aktives Event:</strong> Gestartet am ${new Date(activeEvent.createdAt).toLocaleString('de-DE')}</p>
          <button class="danger-button" data-action="end-event" data-id="${activeEvent.id}" type="button">Event beenden</button>
        </div>
      ` : `
        <button class="primary-button" data-action="start-event" type="button">Neues Event starten</button>
      `}
    </div>
    <div class="order-layout">
      <div class="cocktail-list" aria-label="Bestell-Liste">
        ${state.orders.length ? state.orders.map((order) => `
          <button class="cocktail-list-item ${selectedOrder?.id === order.id ? 'active' : ''}" type="button" data-role="select-order" data-id="${order.id}">
            <span>${order.guestName || 'Kunde'}</span>
            <span class="badge">${getOrderStatusLabel(order)}</span>
          </button>
        `).join('') : '<p class="empty-state">Noch keine Bestellungen.</p>'}
      </div>
      <div class="order-detail-panel">
        ${selectedOrder ? `
          <div class="order-card">
            <div class="order-detail-header">
              <div>
                <strong>${escapeHtml(selectedOrder.guestName || 'Kunde')}</strong>
                <div>${escapeHtml((selectedOrder.items || []).map((item) => item.name).join(', '))}</div>
                <small>${new Date(selectedOrder.createdAt).toLocaleString('de-DE')}</small>
              </div>
              <span class="badge">${getOrderStatusLabel(selectedOrder)}</span>
            </div>
            ${selectedCocktail ? `
              <div class="order-detail-main">
                <div class="editor-image-column">
                  <div class="order-image-host" data-order-image-host></div>
                </div>
                <div class="order-detail-content">
                  <h4>${escapeHtml(selectedCocktail.name || 'Cocktail')}</h4>
                  <p>${escapeHtml(selectedCocktail.description || `Ein ${getCocktailStrengthLabel(selectedCocktail).toLowerCase()}er Cocktail.`)}</p>
                  <p><strong>Rezept:</strong></p>
                  <div>${getIngredientDisplayEntries(selectedCocktail).length ? getIngredientDisplayEntries(selectedCocktail).map((entry) => `<div>${escapeHtml(entry)}</div>`).join('') : '<div>Keine Angaben</div>'}</div>
                  ${selectedCocktail.comment ? `<p><strong>Kommentar:</strong> ${escapeHtml(selectedCocktail.comment)}</p>` : ''}
                </div>
              </div>
            ` : '<p class="empty-state">Zu dieser Bestellung ist kein Cocktail mehr verfügbar.</p>'}
            <div class="order-actions">
              ${selectedOrder.status !== 'done' && selectedOrder.status !== 'in_progress' ? `
              <button class="primary-button" data-action="progress-order" data-id="${selectedOrder.id}" type="button">In Bearbeitung</button>
              ` : ''}
              ${selectedOrder.status === 'in_progress' ? `
              <button class="primary-button" data-action="finish-order" data-id="${selectedOrder.id}" type="button">Fertig</button>
              ` : ''}
              <button class="danger-button" data-action="delete-order" data-id="${selectedOrder.id}" type="button">Entfernen</button>
            </div>
          </div>
        ` : '<p class="empty-state">Noch keine Bestellungen.</p>'}
      </div>
    </div>
  `;

  attachOrderImage(selectedOrder);
}

function renderContent(options = {}) {
  if (!tabContentElement) {
    return;
  }

  if (isMuseumView) {
    if (state.activeTab === 'events') {
      renderMuseumEventsTab();
    } else if (state.activeTab === 'archive') {
      renderMuseumArchiveTab();
    } else {
      renderMuseumFilterDefinitionsTab();
    }
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

  renderCocktailsTab(options);
}

function bindTabEvents() {
  tabButtons.forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
  });
}

async function uploadImageToImgBB(file) {
  const apiKey = '42855a3501b3cdff3979818605f77eb3';
  const url = `https://api.imgbb.com/1/upload?key=${apiKey}`;
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Upload fehlgeschlagen');
  }

  const result = await response.json();
  return result.data.url;
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
  let draggedRow = null;

  tabContentElement.addEventListener('dragstart', (event) => {
    const row = event.target.closest('.ingredient-row');
    if (row && event.target.hasAttribute('draggable')) {
      draggedRow = row;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', '');
      setTimeout(() => row.style.opacity = '0.5', 0);
    }
  });

  tabContentElement.addEventListener('dragover', (event) => {
    if (!draggedRow) return;
    event.preventDefault();

    const list = event.target.closest('[data-ingredient-list]');
    if (!list) return;

    const targetRow = event.target.closest('.ingredient-row');
    if (targetRow && targetRow !== draggedRow) {
      const rect = targetRow.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (event.clientY < mid) {
        list.insertBefore(draggedRow, targetRow);
      } else {
        list.insertBefore(draggedRow, targetRow.nextSibling);
      }
    }
  });

  tabContentElement.addEventListener('dragend', (event) => {
    if (draggedRow) {
      draggedRow.style.opacity = '';
      const card = draggedRow.closest('.editor-card');
      if (card) {
        card.classList.add('is-dirty');
      }
      draggedRow = null;
    }
  });

  tabContentElement.addEventListener('input', (event) => {
    const target = event.target;
    const card = target.closest('.editor-card');

    if (!card) {
      return;
    }

    card.classList.add('is-dirty');
  });

  tabContentElement.addEventListener('change', async (event) => {
    const target = event.target;
    const card = target.closest('.editor-card');

    if (card) {
      card.classList.add('is-dirty');
      return;
    }

    if (target.dataset.action === 'toggle-all-ingredients') {
      const isChecked = target.checked;
      const checkboxes = tabContentElement.querySelectorAll('[data-ingredient]');
      const patch = {};

      checkboxes.forEach((cb) => {
        cb.checked = isChecked;
        const ingredient = cb.dataset.ingredient;
        state.inventory[ingredient] = isChecked;
        patch[ingredient] = isChecked;
      });

      try {
        await updateInventory(state.config?.barId || state.barKey, patch);
      } catch (error) {
        console.error('Inventar konnte nicht gespeichert werden.', error);
        alert('Inventar konnte nicht gespeichert werden.');
      }
      return;
    }

    if (target.dataset.ingredient) {
      const nextInventoryState = {
        ...state.inventory,
        [target.dataset.ingredient]: target.checked,
      };
      state.inventory = nextInventoryState;

      const selectAllCb = tabContentElement.querySelector('[data-action="toggle-all-ingredients"]');
      if (selectAllCb) {
        const checkboxes = Array.from(tabContentElement.querySelectorAll('[data-ingredient]'));
        selectAllCb.checked = checkboxes.every(cb => cb.checked);
      }

      try {
        await updateInventory(state.config?.barId || state.barKey, {
          [target.dataset.ingredient]: target.checked,
        });
      } catch (error) {
        console.error('Inventar konnte nicht gespeichert werden.', error);
        alert('Inventar konnte nicht gespeichert werden.');
      }
    }
  });

  tabContentElement.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) {
      return;
    }

    if (isMuseumView && button.dataset.role === 'select-museum-filter') {
      state.museumSelectedFilterKey = button.dataset.id;
      renderContent();
      return;
    }

    if (isMuseumView && button.dataset.role === 'select-archive-cocktail') {
      state.museumArchiveSelectedCocktailId = button.dataset.id;
      renderContent();
      return;
    }

    if (button.id === 'add-cocktail') {
      return;
    }

    if (button.dataset.role === 'select-cocktail') {
      state.selectedCocktailId = button.dataset.id;
      renderContent();
      return;
    }

    if (button.dataset.role === 'select-order') {
      state.selectedOrderId = button.dataset.id;
      renderContent();
      return;
    }

    if (button.dataset.action === 'save') {
      const card = button.closest('.editor-card');
      const cocktailId = card?.dataset.cocktailId;
      if (!cocktailId || !card) {
        return;
      }

      const nameInput = card.querySelector('[data-field="name"]');
      const commentInput = card.querySelector('[data-field="comment"]');
      const dailyInput = card.querySelector('[data-field="daily"]');
      const notAvailableInput = card.querySelector('[data-field="notAvailable"]');
      const strengthInput = card.querySelector('[data-field="strength"]');
      const ingredientRows = Array.from(card.querySelectorAll('[data-ingredient-index]'));

      const ingredients = ingredientRows
        .map((row) => {
          const name = row.querySelector('[data-field="ingredient-name"]')?.value?.trim() || '';
          const detailValue = row.querySelector('[data-field="ingredient-detail"]')?.value?.trim() || '';
          const { amount, unit } = parseIngredientDetail(detailValue);

          if (!name && !amount && !unit) {
            return null;
          }

          return { name, amount, unit };
        })
        .filter(Boolean);

      const patch = {
        name: nameInput?.value.trim() || 'Neuer Cocktail',
        id: generateCocktailId(nameInput?.value || 'Neuer Cocktail'),
        ingredients,
        properties: cocktailPropertyOptions.filter((property) => card.querySelector(`[data-property="${property}"]`)?.checked),
        daily: dailyInput?.checked || false,
        notAvailable: notAvailableInput?.checked || false,
        strength: normalizeStrength(strengthInput?.value),
        comment: commentInput?.value.trim() || '',
      };

      try {
        await syncIngredientsToInventory(patch.ingredients);
        await updateCocktailInFirebase(cocktailId, patch);
        card.classList.remove('is-dirty');
      } catch (error) {
        console.error('Cocktail konnte nicht gespeichert werden.', error);
        alert('Cocktail konnte nicht gespeichert werden.');
      }
      return;
    }

    if (button.dataset.action === 'add-ingredient') {
      const card = button.closest('.editor-card');
      if (!card) {
        return;
      }

      const list = card.querySelector('[data-ingredient-list]');
      if (!list) {
        return;
      }

      const currentRows = list.querySelectorAll('[data-ingredient-index]');
      const nextIndex = currentRows.length;
      const rowMarkup = `
        <div class="ingredient-row" data-ingredient-index="${nextIndex}" draggable="true" style="display: flex; flex-wrap: nowrap; align-items: center; gap: 0.5rem; width: 100%; max-width: 100%; margin-bottom: 0.5rem;">
          <span class="drag-handle" style="cursor: grab; user-select: none; display: flex; align-items: center; justify-content: center; color: var(--text-muted, #888); flex: 1; min-width: 0; width: 0;" title="Verschieben">☰</span>
          <input type="text" data-field="ingredient-name" value="" placeholder="Name" style="flex: 5; min-width: 0; width: 0;" />
          <input type="text" data-field="ingredient-detail" value="" placeholder="Menge / Einheit" style="flex: 2; min-width: 0; width: 0;" />
          <button class="danger-button" data-action="remove-ingredient" type="button" style="flex: 2; min-width: 0; width: 0; padding: 0.5rem 0;">×</button>
        </div>
      `;

      const addButton = list.querySelector('[data-action="add-ingredient"]');
      if (addButton) {
        addButton.insertAdjacentHTML('beforebegin', rowMarkup);
      } else {
        list.insertAdjacentHTML('beforeend', rowMarkup);
      }
      card.classList.add('is-dirty');
      return;
    }

    if (button.dataset.action === 'remove-ingredient') {
      const row = button.closest('[data-ingredient-index]');
      if (row) {
        row.remove();
        const card = button.closest('.editor-card');
        if (card) {
          card.classList.add('is-dirty');
        }
      }
      return;
    }

    if (button.dataset.action === 'remove') {
      const cocktailId = button.dataset.id;
      const targetCocktail = state.cocktails.find((cocktail) => cocktail.id === cocktailId);
      if (!targetCocktail) {
        return;
      }

      const confirmed = window.confirm(`Cocktail „${targetCocktail.name || 'Unbenannter Cocktail'}“ wirklich entfernen?`);
      if (!confirmed) {
        return;
      }

      try {
        await deleteCocktail(state.config?.barId || state.barKey, cocktailId);
        state.cocktails = state.cocktails.filter((cocktail) => cocktail.id !== cocktailId);
        await pruneUnusedIngredients();
        renderContent();
      } catch (error) {
        console.error('Cocktail konnte nicht gelöscht werden.', error);
        alert('Cocktail konnte nicht gelöscht werden.');
      }
      return;
    }

    if (button.dataset.action === 'upload-image') {
      const card = button.closest('.editor-card');
      if (!card) return;
      const fileInput = card.querySelector('.image-upload-input');
      if (!fileInput) return;

      fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        button.disabled = true;
        button.textContent = 'Lädt...';

        try {
          const imageUrl = await uploadImageToImgBB(file);
          const cocktailId = card.dataset.cocktailId;
          await updateCocktailInFirebase(cocktailId, { image: imageUrl });
          renderContent();
        } catch (error) {
          console.error('Bild-Upload fehlgeschlagen.', error);
          alert('Bild-Upload fehlgeschlagen.');
        } finally {
          button.disabled = false;
          button.textContent = 'Bild hochladen';
          fileInput.value = '';
        }
      };

      fileInput.click();
      return;
    }

    if (button.dataset.action === 'remove-image') {
      const card = button.closest('.editor-card');
      const cocktailId = card?.dataset.cocktailId;
      if (!cocktailId) return;

      const confirmed = window.confirm('Bisheriges Bild wirklich entfernen?');
      if (!confirmed) return;

      await updateCocktailInFirebase(cocktailId, { image: null });
      renderContent();
      return;
    }

    if (button.dataset.action === 'progress-order') {
      const orderId = button.dataset.id;
      const targetOrder = state.orders.find((order) => order.id === orderId);
      if (!targetOrder) {
        return;
      }

      const confirmed = window.confirm(`Bestellung von ${targetOrder.guestName || 'Kunde'} in Bearbeitung setzen?`);
      if (!confirmed) {
        return;
      }

      try {
        await updateOrder(state.config?.barId || state.barKey, orderId, { ...targetOrder, status: 'in_progress' });
      } catch (error) {
        console.error('Bestellung konnte nicht aktualisiert werden.', error);
        alert('Bestellung konnte nicht aktualisiert werden.');
      }
      return;
    }

    if (button.dataset.action === 'finish-order') {
      const orderId = button.dataset.id;
      const targetOrder = state.orders.find((order) => order.id === orderId);
      if (!targetOrder) {
        return;
      }

      const confirmed = window.confirm(`Bestellung von ${targetOrder.guestName || 'Kunde'} als fertig markieren?`);
      if (!confirmed) {
        return;
      }

      try {
        await updateOrder(state.config?.barId || state.barKey, orderId, { ...targetOrder, status: 'done' });

        // Check for active event to increment statistics
        const activeEvent = state.events.find((e) => e.status === 'active');
        if (activeEvent) {
          const stats = activeEvent.statistics || {};
          (targetOrder.items || []).forEach(item => {
            if (item.id) {
              stats[item.id] = (stats[item.id] || 0) + 1;
            }
          });
          await updateEvent(state.config?.barId || state.barKey, activeEvent.id, { statistics: stats });
        }
      } catch (error) {
        console.error('Bestellung konnte nicht aktualisiert werden.', error);
        alert('Bestellung konnte nicht aktualisiert werden.');
      }
      return;
    }

    if (button.dataset.action === 'start-event') {
      const confirmed = window.confirm('Möchtest du ein neues Event starten? Alle fertiggestellten Cocktails werden von nun an gezählt.');
      if (!confirmed) return;

      try {
        await addEvent(state.config?.barId || state.barKey, {
          status: 'active',
          statistics: {}
        });
      } catch (error) {
        console.error('Event konnte nicht gestartet werden.', error);
        alert('Event konnte nicht gestartet werden.');
      }
      return;
    }

    if (button.dataset.action === 'end-event') {
      const eventId = button.dataset.id;
      const targetEvent = state.events.find((e) => e.id === eventId);
      if (!targetEvent) return;

      const eventName = window.prompt('Event wirklich beenden? Bitte gib einen Namen für das Event ein (optional):', `Event vom ${new Date().toLocaleDateString('de-DE')}`);
      if (eventName === null) return; // Abgebrochen

      try {
        await updateEvent(state.config?.barId || state.barKey, eventId, {
          status: 'completed',
          name: eventName.trim() || `Event vom ${new Date().toLocaleDateString('de-DE')}`,
          endTime: new Date().toISOString()
        });
      } catch (error) {
        console.error('Event konnte nicht beendet werden.', error);
        alert('Event konnte nicht beendet werden.');
      }
      return;
    }

    if (button.dataset.action === 'delete-order') {
      const orderId = button.dataset.id;
      const targetOrder = state.orders.find((order) => order.id === orderId);
      if (!targetOrder) {
        return;
      }

      const confirmed = window.confirm(`Bestellung von ${targetOrder.guestName || 'Kunde'} wirklich entfernen?`);
      if (!confirmed) {
        return;
      }

      try {
        await deleteOrder(state.config?.barId || state.barKey, orderId);
      } catch (error) {
        console.error('Bestellung konnte nicht entfernt werden.', error);
        alert('Bestellung konnte nicht entfernt werden.');
      }
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

  const guestUrl = getGuestViewUrl();
  const barUrl = getBarViewUrl();

  if (guestLink) {
    guestLink.textContent = 'Gäste-Ansicht';
    guestLink.href = guestUrl.toString();
  }

  if (museumGuestLink) {
    museumGuestLink.textContent = 'Gäste-Ansicht';
    museumGuestLink.href = guestUrl.toString();
  }

  if (barLink) {
    barLink.textContent = isMuseumView ? 'Bar-Ansicht' : 'Gäste-Ansicht';
    barLink.href = isMuseumView ? barUrl.toString() : guestUrl.toString();
  }

  if (barNameElement) {
    barNameElement.textContent = isMuseumView ? (state.config.barName || 'Cocktail Bar') : (state.config.barName || 'Cocktail Bar');
  }

  if (barStatusElement) {
    barStatusElement.textContent = isMuseumView
      ? `${state.config.barName || 'Cocktail Bar'} · ${state.config.isOpen === false ? 'Bar-Museum geschlossen' : 'Bar-Museum geöffnet'}`
      : (state.config.isOpen === false ? 'Bar geschlossen' : 'Bar geöffnet');
  }

  const sessionKey = getStorageKey('access');
  if (!isMuseumView && sessionStorage.getItem(sessionKey) !== 'true') {
    ensureAccess();
    return;
  }

  setAccessState(true);

  try {
    resetBarState();
    loadStoredState();
    state.filterDefinitions = loadFilterDefinitions();
    if (isMuseumView) {
      state.activeTab = 'filterdefinitions';
      state.museumSelectedFilterKey = getFilterDefinitionKeys()[0] || null;
    }
    bindTabEvents();
    bindContentEvents();

    listenToCocktails(state.config.barId || state.barKey, (cocktails) => {
      state.cocktails = Array.isArray(cocktails) ? cocktails : [];
      renderContent();
    });

    listenToInventory(state.config.barId || state.barKey, (inventory) => {
      state.inventory = inventory && typeof inventory === 'object' ? inventory : {};
      renderContent();
    });

    listenToOrders(state.config.barId || state.barKey, (orders) => {
      state.orders = Array.isArray(orders) ? orders : [];
      renderContent();
    });

    listenToEvents(state.config.barId || state.barKey, (events) => {
      state.events = Array.isArray(events) ? events : [];
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
