import { escapeHtml } from './shared.js?v=3';

// "1" ist der öffentliche Test-Key von TheCocktailDB
const API_URL = 'https://www.thecocktaildb.com/api/json/v1/1/search.php';
const TIMEOUT_MS = 8000;
const LETTERS = [...'abcdefghijklmnopqrstuvwxyz0123456789'];
const ERROR_TEXT = 'TheCocktailDB ist gerade nicht erreichbar. Bitte später erneut versuchen.';

// API-Glasnamen -> Stichwort in Id oder Name eines Glases aus dem Gläser-Tab
const GLASS_KEYWORDS = [
  ['highball', 'highball'],
  ['collins', 'highball'],
  ['old-fashioned', 'tumbler'],
  ['old fashioned', 'tumbler'],
  ['whiskey', 'tumbler'],
  ['cocktail glass', 'martini'],
  ['martini', 'martini'],
  ['coupe', 'coupe'],
  ['margarita', 'margarita'],
  ['hurricane', 'hurricane'],
  ['copper mug', 'mule'],
  ['balloon', 'copa'],
  ['cordial', 'likoer'],
];

let glasses = [];
const letterCache = new Map();

const note = (text) => `<p class="empty-state">${text}</p>`;

function findGlass(apiGlassName) {
  const name = apiGlassName.toLowerCase();
  const [, keyword] = GLASS_KEYWORDS.find(([key]) => name.includes(key)) || [];
  return keyword ? glasses.find((glass) => `${glass.id} ${glass.name}`.toLowerCase().includes(keyword)) : null;
}

async function fetchDrinks(query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}?${query}`, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const { drinks } = await response.json();
    return Array.isArray(drinks) ? drinks : [];
  } finally {
    clearTimeout(timer);
  }
}

function getDrinksByLetter(letter) {
  if (!letterCache.has(letter)) {
    letterCache.set(letter, fetchDrinks(`f=${letter}`).catch((error) => {
      letterCache.delete(letter);
      throw error;
    }));
  }
  return letterCache.get(letter);
}

// Der kostenlose Key filtert nur nach einer Zutat, daher wird die ganze DB einmal geladen und lokal durchsucht
const getAllDrinks = () => Promise.all(LETTERS.map(getDrinksByLetter)).then((lists) => lists.flat());

function getIngredients(drink) {
  const items = [];
  for (let i = 1; i <= 15; i += 1) {
    const name = (drink[`strIngredient${i}`] || '').trim();
    if (name) {
      items.push({ name, measure: (drink[`strMeasure${i}`] || '').trim() });
    }
  }
  return items;
}

function renderDrink(drink) {
  const chips = [drink.strCategory, drink.strAlcoholic]
    .filter(Boolean)
    .map((label) => `<span class="property-chip">${escapeHtml(label)}</span>`);

  if (drink.strGlass) {
    const glass = findGlass(drink.strGlass);
    const label = escapeHtml(drink.strGlass);
    chips.push(glass
      ? `<span class="property-chip cocktaildb-glass-link" role="button" tabindex="0" data-glass-id="${escapeHtml(glass.id)}" title="Im Gläser-Tab ansehen">${label}</span>`
      : `<span class="property-chip">${label}</span>`);
  }

  return `
    <div class="cocktaildb-detail">
      <article class="cocktaildb-card">
        ${drink.strDrinkThumb ? `<img class="cocktaildb-image" src="${escapeHtml(drink.strDrinkThumb)}/small" alt="${escapeHtml(drink.strDrink)}" decoding="async" />` : ''}
        <div class="cocktaildb-content">
          <h3>${escapeHtml(drink.strDrink)}</h3>
          <div class="property-options">${chips.join('')}</div>
          <ul class="cocktaildb-ingredients">
            ${getIngredients(drink).map(({ name, measure }) => `<li>${escapeHtml(`${measure} ${name}`.trim())}</li>`).join('')}
          </ul>
          <p class="cocktaildb-instructions">${escapeHtml(drink.strInstructionsDE || drink.strInstructions || '')}</p>
        </div>
      </article>
    </div>
  `;
}

export function mountCocktailDbTab(container, { glasses: glassList = [], onOpenGlass } = {}) {
  glasses = glassList;

  container.innerHTML = `
    <div class="cocktaildb-panel">
      <section class="cocktaildb-column">
        <h3 class="cocktaildb-column-title">Cocktail suchen</h3>
        <form id="cocktaildb-form" class="cocktaildb-search">
          <div class="cocktaildb-field">
            <input id="cocktaildb-input" class="cocktaildb-input" type="text" placeholder="z. B. Margarita" autocomplete="off" required />
            <ul id="cocktaildb-suggestions" class="cocktaildb-suggestions" role="listbox" hidden></ul>
          </div>
          <button class="primary-button" type="submit">Suchen</button>
        </form>
        <div id="cocktaildb-results" class="cocktaildb-results"></div>
      </section>
      <div class="cocktaildb-divider" aria-hidden="true"></div>
      <section class="cocktaildb-column">
        <h3 class="cocktaildb-column-title">Vorschläge nach Zutaten</h3>
        <div class="cocktaildb-search">
          <div class="cocktaildb-field">
            <input id="cocktaildb-ingredient-input" class="cocktaildb-input" type="text" placeholder="Englisch, mit Komma: rum, mint" autocomplete="off" />
          </div>
        </div>
        <p id="cocktaildb-match-status" class="empty-state" hidden></p>
        <ul id="cocktaildb-matches" class="cocktaildb-matches" hidden></ul>
        <div id="cocktaildb-match-result" class="cocktaildb-results"></div>
      </section>
    </div>
  `;

  const $ = (id) => container.querySelector(`#cocktaildb-${id}`);
  const [form, input, suggestions, results] = ['form', 'input', 'suggestions', 'results'].map($);
  const [ingredientInput, matchStatus, matchesList, matchResult] = ['ingredient-input', 'match-status', 'matches', 'match-result'].map($);
  let nameMatches = [];
  let ingredientMatches = [];

  const fail = (error) => {
    console.error('TheCocktailDB-Anfrage fehlgeschlagen.', error);
    return ERROR_TEXT;
  };

  const setStatus = (text = '') => {
    matchStatus.textContent = text;
    matchStatus.hidden = !text;
  };

  // Links: Vorschläge, sobald der erste Buchstabe feststeht
  const updateSuggestions = async () => {
    const query = input.value.trim().toLowerCase();
    if (!/^[a-z0-9]/.test(query)) {
      suggestions.hidden = true;
      return;
    }

    try {
      const drinks = await getDrinksByLetter(query[0]);
      // Veraltete Antwort verwerfen, falls inzwischen weitergetippt wurde
      if (input.value.trim().toLowerCase() !== query) {
        return;
      }

      nameMatches = drinks
        .filter((drink) => drink.strDrink.toLowerCase().startsWith(query))
        .sort((a, b) => a.strDrink.localeCompare(b.strDrink));
      suggestions.innerHTML = nameMatches
        .map((drink, index) => `<li role="option" data-index="${index}">${escapeHtml(drink.strDrink)}</li>`)
        .join('');
      suggestions.hidden = !nameMatches.length;
    } catch (error) {
      suggestions.hidden = true;
      results.innerHTML = note(fail(error));
    }
  };

  input.addEventListener('input', updateSuggestions);
  input.addEventListener('focus', updateSuggestions);
  input.addEventListener('blur', () => { suggestions.hidden = true; });

  // Verhindert, dass der Klick auf die Liste das Eingabefeld vorher den Fokus verlieren lässt
  suggestions.addEventListener('mousedown', (event) => event.preventDefault());
  suggestions.addEventListener('click', (event) => {
    const item = event.target.closest('li');
    const drink = item && nameMatches[Number(item.dataset.index)];
    if (drink) {
      input.value = drink.strDrink;
      suggestions.hidden = true;
      results.innerHTML = renderDrink(drink);
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) {
      return;
    }

    suggestions.hidden = true;
    results.innerHTML = note('Suche läuft…');

    try {
      const drinks = await fetchDrinks(`s=${encodeURIComponent(query)}`);
      results.innerHTML = drinks.length ? drinks.map(renderDrink).join('') : note('Kein Cocktail gefunden.');
    } catch (error) {
      results.innerHTML = note(fail(error));
    }
  });

  // Rechts: alle Cocktails, die jede eingegebene Zutat enthalten
  const updateIngredientMatches = async () => {
    const query = ingredientInput.value;
    const wanted = query.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean);
    if (!wanted.length) {
      matchesList.hidden = true;
      setStatus();
      return;
    }

    setStatus('Cocktails werden geladen…');
    try {
      const drinks = await getAllDrinks();
      if (ingredientInput.value !== query) {
        return;
      }

      // Teiltreffer erlaubt: "rum" findet auch "Light rum" oder "Dark rum"
      ingredientMatches = drinks
        .map((drink) => ({ drink, names: getIngredients(drink).map(({ name }) => name.toLowerCase()) }))
        .filter(({ names }) => wanted.every((term) => names.some((name) => name.includes(term))))
        .sort((a, b) => a.names.length - b.names.length || a.drink.strDrink.localeCompare(b.drink.strDrink));

      setStatus(ingredientMatches.length ? '' : 'Keine Cocktails mit diesen Zutaten gefunden.');
      matchesList.hidden = !ingredientMatches.length;
      matchesList.innerHTML = ingredientMatches.length
        ? `<li class="cocktaildb-matches-title">${ingredientMatches.length} Vorschläge, weniger Zutaten zuerst</li>`
          + ingredientMatches.map(({ drink, names }, index) => `
            <li data-index="${index}">
              <strong>${escapeHtml(drink.strDrink)}</strong>
              <span>${names.length} Zutaten · ${escapeHtml(drink.strAlcoholic || '')}</span>
            </li>`).join('')
        : '';
    } catch (error) {
      matchesList.hidden = true;
      setStatus(fail(error));
    }
  };

  ingredientInput.addEventListener('input', updateIngredientMatches);
  // Daten schon beim Fokussieren laden, damit die Vorschläge beim Tippen sofort kommen
  ingredientInput.addEventListener('focus', () => getAllDrinks().catch(() => {}));

  matchesList.addEventListener('click', (event) => {
    const item = event.target.closest('li');
    const match = item && ingredientMatches[Number(item.dataset.index)];
    if (match) {
      matchResult.innerHTML = renderDrink(match.drink);
      matchResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  // Glas-Chips sind nur klickbar, wenn das Glas im Gläser-Tab existiert
  const openGlass = (event) => {
    const id = event.target.closest('[data-glass-id]')?.dataset.glassId;
    if (id && onOpenGlass && glasses.some((glass) => glass.id === id)) {
      event.preventDefault();
      onOpenGlass(id);
    }
  };
  const panel = container.querySelector('.cocktaildb-panel');
  panel.addEventListener('click', openGlass);
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      openGlass(event);
    }
  });
}
