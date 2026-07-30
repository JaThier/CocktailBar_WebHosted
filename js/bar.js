const barNameElement = document.querySelector('#bar-name');
const barStatusElement = document.querySelector('#bar-status');
const ordersListElement = document.querySelector('#orders-list');
const orderCountElement = document.querySelector('#order-count');

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

  throw new Error('Keine Konfiguration gefunden.');
}

async function init() {
  try {
    const config = await loadConfig(parseBarKey());
    barNameElement.textContent = config.barName || 'Cocktail Bar';
    barStatusElement.textContent = config.isOpen === false ? 'Bar geschlossen' : 'Bar geöffnet';
    orderCountElement.textContent = '0';
    ordersListElement.innerHTML = '<p class="empty-state">Die Echtzeit-Integration ist vorbereitet.</p>';
  } catch (error) {
    barStatusElement.textContent = error.message;
  }
}

init();
