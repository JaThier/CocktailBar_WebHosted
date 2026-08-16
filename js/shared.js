/**
 * Shared helpers for the guest and bartender entrypoints.
 * Keep this file limited to cross-cutting data and URL helpers.
 */

export function parseBarKey() {
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

export async function loadConfig(barKey) {
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

export function normalizeCocktailProperties(cocktail) {
  if (!cocktail || !Array.isArray(cocktail.properties)) {
    return [];
  }

  return cocktail.properties
    .filter(Boolean)
    .map((property) => String(property).trim())
    .filter(Boolean);
}

export function getIngredientNames(cocktail) {
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

export function sortCocktailsByName(cocktails) {
  return [...(Array.isArray(cocktails) ? cocktails : [])].sort((left, right) => {
    return String(left?.name || '').localeCompare(String(right?.name || ''), 'de', {
      sensitivity: 'base',
    });
  });
}

export function isCocktailAvailable(cocktail, inventory = {}) {
  const ingredients = getIngredientNames(cocktail);

  if (!ingredients.length) {
    return true;
  }

  return ingredients.every((ingredient) => inventory[ingredient] !== false);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getCocktailImageCandidates(cocktail, barFolder) {
  const baseNames = [];
  const sourceName = cocktail?.name || cocktail?.id || 'cocktail';
  const sourceId = cocktail?.id || 'cocktail';

  [sourceName, sourceId].forEach((value) => {
    const normalized = String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    if (normalized && !baseNames.includes(normalized)) {
      baseNames.push(normalized);
    }
  });

  return baseNames.flatMap((baseName) => [
    `./config/images/${barFolder}/${baseName}.png`,
    `./config/images/${barFolder}/${baseName}.png`,
  ]);
}

if (typeof document !== 'undefined') {
  const setupMobileOverlay = () => {
    if (document.getElementById('mobile-close-button')) return;
    const closeButton = document.createElement('button');
    closeButton.id = 'mobile-close-button';
    closeButton.className = 'mobile-close-button';
    closeButton.innerHTML = '&times; Zurück';
    document.body.appendChild(closeButton);

    document.addEventListener('click', (e) => {
      const item = e.target.closest('.cocktail-list-item');
      const isListItem = !!item;
      if (isListItem) {
        document.body.classList.add('overlay-open');
      }
      
      if (e.target.closest('#mobile-close-button') || e.target.closest('.tab-button') || e.target.closest('.bar-link')) {
        document.body.classList.remove('overlay-open');
      }
    }, { capture: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupMobileOverlay);
  } else {
    setupMobileOverlay();
  }
}