/**
 * 台南美食地圖網站 - 核心邏輯
 * 遵循 AGENTS.md 規範：純原生 ES6+、無外部建置依賴、相對路徑載入
 */

const DATA_URL = './data/stores.json';
const FALLBACK_IMAGE_PATH = './assets/images/placeholder.webp';
const TAINAN_CENTER_COORDS = [22.9997, 120.2270];
const DEFAULT_ZOOM = 13;

// 若 placeholder.webp 遺失時的最終 Data URI 備援確保零破圖
const EMERGENCY_SVG_PLACEHOLDER =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='450' viewBox='0 0 800 450'%3E%3Crect fill='%23EFECE6' width='800' height='450'/%3E%3Ctext fill='%238C8275' font-family='sans-serif' font-size='28' font-weight='bold' x='50%25' y='48%25' text-anchor='middle'%3E%E5%8F%B0%E5%8D%97%E7%BE%8E%E9%A3%9F%E5%9C%B0%E5%9C%96%3C/text%3E%3Ctext fill='%23A89F91' font-family='sans-serif' font-size='18' x='50%25' y='57%25' text-anchor='middle'%3E%E5%B0%9A%E7%84%A1%E5%BA%97%E5%AE%B6%E5%AF%A6%E6%8B%8D%E7%85%A7%E7%89%87%3C/text%3E%3C/svg%3E";

// 全域狀態
let allStores = [];
let map = null;
let markersLayer = null;
let markersById = {};
let activeStoreId = null;

let currentFilters = {
  search: '',
  district: 'all',
  price: 'all',
  category: 'all'
};

// 初始化應用程式
document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  bindEvents();
  await loadStoresData();
});

/**
 * 初始化 Leaflet 地圖（採用 CartoDB Positron 淺色現代風格圖磚）
 */
function initMap() {
  map = L.map('map', {
    center: TAINAN_CENTER_COORDS,
    zoom: DEFAULT_ZOOM,
    zoomControl: true
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
}

/**
 * 載入 stores.json 店家資料
 */
async function loadStoresData() {
  const listEl = document.getElementById('store-list');
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    allStores = await response.json();
    populateDistrictFilter(allStores);
    applyFiltersAndRender();
  } catch (error) {
    console.error('載入店家資料失敗：', error);
    listEl.innerHTML = `
      <div class="empty-state">
        <p>無法載入店家資料，請確認是否透過本地伺服器（如 Live Server）或 GitHub Pages 開啟網頁。</p>
      </div>
    `;
  }
}

/**
 * 動態產生台南行政區下拉選單選項（依實際資料出現之行政區）
 */
function populateDistrictFilter(stores) {
  const districtSelect = document.getElementById('district-filter');
  const districts = [...new Set(stores.map((store) => store.district))];

  districts.forEach((district) => {
    const option = document.createElement('option');
    option.value = district;
    option.textContent = district;
    districtSelect.appendChild(option);
  });
}

/**
 * 綁定搜尋、篩選與手機版視圖切換事件
 */
function bindEvents() {
  const searchInput = document.getElementById('search-input');
  const districtSelect = document.getElementById('district-filter');
  const priceSelect = document.getElementById('price-filter');
  const resetBtn = document.getElementById('reset-filters-btn');
  const categoryChips = document.getElementById('category-chips');
  const mobileToggleBtn = document.getElementById('mobile-view-toggle');

  searchInput.addEventListener('input', (e) => {
    currentFilters.search = e.target.value.trim().toLowerCase();
    applyFiltersAndRender();
  });

  districtSelect.addEventListener('change', (e) => {
    currentFilters.district = e.target.value;
    applyFiltersAndRender();
  });

  priceSelect.addEventListener('change', (e) => {
    currentFilters.price = e.target.value;
    applyFiltersAndRender();
  });

  categoryChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;

    document.querySelectorAll('.chip').forEach((c) => c.classList.remove('chip--active'));
    chip.classList.add('chip--active');

    currentFilters.category = chip.dataset.category;
    applyFiltersAndRender();
  });

  resetBtn.addEventListener('click', () => {
    currentFilters = { search: '', district: 'all', price: 'all', category: 'all' };
    searchInput.value = '';
    districtSelect.value = 'all';
    priceSelect.value = 'all';

    document.querySelectorAll('.chip').forEach((c) => c.classList.remove('chip--active'));
    document.querySelector('.chip[data-category="all"]').classList.add('chip--active');

    map.flyTo(TAINAN_CENTER_COORDS, DEFAULT_ZOOM);
    applyFiltersAndRender();
  });

  // 手機版地圖/列表模式切換
  mobileToggleBtn.addEventListener('click', () => {
    const mapSection = document.getElementById('map-section');
    const isMapVisible = mapSection.classList.toggle('is-visible');

    if (isMapVisible) {
      mobileToggleBtn.textContent = '📋 返回列表模式';
      setTimeout(() => map.invalidateSize(), 100);
    } else {
      mobileToggleBtn.textContent = '🗺️ 切換地圖模式';
    }
  });
}

/**
 * 執行多條件過濾並重新渲染卡片與地圖圖釘
 */
function applyFiltersAndRender() {
  const filtered = allStores.filter((store) => {
    const matchDistrict =
      currentFilters.district === 'all' || store.district === currentFilters.district;
    const matchPrice =
      currentFilters.price === 'all' || store.priceRange === currentFilters.price;
    const matchCategory =
      currentFilters.category === 'all' || store.category === currentFilters.category;

    const keyword = currentFilters.search;
    const matchSearch =
      !keyword ||
      store.name.toLowerCase().includes(keyword) ||
      store.district.toLowerCase().includes(keyword) ||
      store.review.toLowerCase().includes(keyword) ||
      store.recommendedDishes.some((dish) => dish.toLowerCase().includes(keyword)) ||
      store.tags.some((tag) => tag.toLowerCase().includes(keyword));

    return matchDistrict && matchPrice && matchCategory && matchSearch;
  });

  document.getElementById('store-count').textContent = `共 ${filtered.length} 間推薦`;
  renderStoreCards(filtered);
  renderMapMarkers(filtered);
}

/**
 * 圖片載入失敗時的容錯處理（退回 placeholder.webp -> 終極 SVG 備援）
 */
window.handleImageError = function (imgElement) {
  if (!imgElement.dataset.fallbackTried) {
    imgElement.dataset.fallbackTried = 'true';
    imgElement.src = FALLBACK_IMAGE_PATH;
  } else {
    imgElement.onerror = null;
    imgElement.src = EMERGENCY_SVG_PLACEHOLDER;
  }
};

/**
 * 渲染店家卡片列表
 */
function renderStoreCards(stores) {
  const listEl = document.getElementById('store-list');

  if (stores.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <p>找不到符合條件的台南美食店家，試試看放寬篩選條件吧！</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = stores
    .map((store) => {
      const imgSrc = store.coverImage && store.coverImage.trim() !== ''
        ? store.coverImage
        : FALLBACK_IMAGE_PATH;
      const altText = `${store.name} - ${store.recommendedDishes.join('、')}`;
      const ratingFormatted = Number(store.rating).toFixed(1);
      const isActiveClass = store.id === activeStoreId ? 'store-card--active' : '';

      return `
        <article class="store-card ${isActiveClass}" id="card-${store.id}" data-id="${store.id}">
          <div class="store-card__media">
            <img
              class="store-card__img"
              src="${imgSrc}"
              alt="${altText}"
              loading="lazy"
              onerror="handleImageError(this)"
            />
            <span class="store-card__district-badge">${store.district}</span>
            <div class="store-card__meta-badge">
              <span><span class="store-card__star">★</span> ${ratingFormatted}</span>
              <span>·</span>
              <span>${store.priceRange}</span>
            </div>
          </div>

          <div class="store-card__body">
            <div class="store-card__header">
              <h2 class="store-card__title">${store.name}</h2>
              <span class="store-card__category">${store.category}</span>
            </div>

            <div class="store-card__dishes">
              <span class="store-card__dishes-label">必點推薦：</span>${store.recommendedDishes.join('、')}
            </div>

            <p class="store-card__review">${store.review}</p>

            <div class="store-card__tags">
              ${store.tags.map((tag) => `<span class="store-card__tag">#${tag}</span>`).join('')}
            </div>

            <div class="store-card__footer">
              <span class="store-card__address" title="${store.address}">${store.address}</span>
              <div class="store-card__actions">
                <button
                  type="button"
                  class="btn-card btn-card--locate"
                  onclick="focusStoreOnMap('${store.id}')"
                >
                  📍 定位
                </button>
                <a
                  href="${store.googleMapsUrl}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="btn-card btn-card--maps"
                >
                  導航 ↗
                </a>
              </div>
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

/**
 * 渲染 Leaflet 地圖圖釘
 */
function renderMapMarkers(stores) {
  markersLayer.clearLayers();
  markersById = {};

  stores.forEach((store) => {
    const customIcon = L.divIcon({
      className: 'custom-tainan-pin',
      html: `<div style="
        background-color: #D95338;
        color: white;
        width: 30px;
        height: 30px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 2px solid #FFFFFF;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      "><span style="transform: rotate(45deg); font-size: 12px; font-weight: bold;">★</span></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -30]
    });

    const marker = L.marker([store.coords.lat, store.coords.lng], { icon: customIcon });

    const popupHtml = `
      <div class="map-popup">
        <div class="map-popup__title">${store.name}</div>
        <div class="map-popup__meta">${store.district} · ${store.category} · ★ ${Number(store.rating).toFixed(1)} (${store.priceRange})</div>
        <a href="${store.googleMapsUrl}" target="_blank" rel="noopener noreferrer" class="map-popup__link">開啟 Google Maps ↗</a>
      </div>
    `;

    marker.bindPopup(popupHtml);

    // 點擊地圖圖釘 -> 高亮並捲動至對應卡片
    marker.on('click', () => {
      highlightStoreCard(store.id, true);
    });

    marker.addTo(markersLayer);
    markersById[store.id] = marker;
  });
}

/**
 * 點擊卡片「定位」按鈕 -> 移動地圖並展開氣泡
 */
window.focusStoreOnMap = function (storeId) {
  const store = allStores.find((s) => s.id === storeId);
  if (!store) return;

  highlightStoreCard(storeId, false);

  // 若在手機版，自動切換至地圖視圖
  if (window.innerWidth < 768) {
    const mapSection = document.getElementById('map-section');
    const mobileToggleBtn = document.getElementById('mobile-view-toggle');
    mapSection.classList.add('is-visible');
    mobileToggleBtn.textContent = '📋 返回列表模式';
    setTimeout(() => map.invalidateSize(), 100);
  }

  map.flyTo([store.coords.lat, store.coords.lng], 16, {
    duration: 0.8
  });

  const marker = markersById[storeId];
  if (marker) {
    marker.openPopup();
  }
};

/**
 * 高亮指定店家卡片
 */
function highlightStoreCard(storeId, shouldScroll) {
  activeStoreId = storeId;

  document.querySelectorAll('.store-card').forEach((card) => {
    card.classList.remove('store-card--active');
  });

  const targetCard = document.getElementById(`card-${storeId}`);
  if (targetCard) {
    targetCard.classList.add('store-card--active');
    if (shouldScroll && window.innerWidth >= 768) {
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}
