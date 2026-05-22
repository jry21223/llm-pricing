// ===== State =====
let pricingData = null;
let currentLang = 'zh';
let currentSort = { col: 'input', dir: 'asc' };

const i18n = {
  zh: {
    title: '各大模型 API 每百万 Token 价格实时对比，数据每日自动更新',
    searchPlaceholder: '搜索模型或厂商...',
    sortLabel: '排序：',
    colProvider: '厂商',
    colModel: '模型',
    colInput: 'Input (每百万Token)',
    colCached: '缓存命中',
    colOutput: 'Output (每百万Token)',
    colContext: '上下文',
    sectionTitle: '厂商概览',
    emptyData: '暂无数据',
    loading: '加载中...',
    updateAt: '数据更新于',
    toBeFetched: '待抓取',
    models: '个模型',
    footerNote: '数据仅供参考，准确价格请以各厂商官网为准。',
    noResult: '没有找到匹配的模型',
  },
  en: {
    title: 'LLM API pricing per 1M tokens, auto-updated daily',
    searchPlaceholder: 'Search model or provider...',
    sortLabel: 'Sort:',
    colProvider: 'Provider',
    colModel: 'Model',
    colInput: 'Input (/1M tokens)',
    colCached: 'Cached Input',
    colOutput: 'Output (/1M tokens)',
    colContext: 'Context',
    sectionTitle: 'Providers Overview',
    emptyData: 'No data',
    loading: 'Loading...',
    updateAt: 'Updated at',
    toBeFetched: 'Pending',
    models: 'models',
    footerNote: 'Prices are for reference only. Check official sites for accurate pricing.',
    noResult: 'No matching models found',
  }
};

// ===== Data Loading =====
async function loadData() {
  try {
    const resp = await fetch('pricing.json?_=' + Date.now());
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    pricingData = await resp.json();
    document.getElementById('dataStatus').textContent = 
      `${i18n[currentLang].updateAt}: ${pricingData.lastUpdated}`;
    document.getElementById('updateBadge').textContent = 
      `📅 ${pricingData.lastUpdated}`;
    renderTable();
    renderCards();
  } catch (e) {
    document.getElementById('dataStatus').textContent = `❌ 数据加载失败: ${e.message}`;
    document.getElementById('tableBody').innerHTML = 
      `<tr><td colspan="6" class="loading-cell">❌ ${e.message}</td></tr>`;
  }
}

// ===== Filtering =====
function filterModels() {
  renderTable();
}

function getFilteredModels() {
  const q = (document.getElementById('searchInput').value || '').toLowerCase().trim();
  const results = [];
  
  for (const p of pricingData.providers) {
    for (const m of p.models) {
      const match = !q || 
        m.name.toLowerCase().includes(q) || 
        p.provider.toLowerCase().includes(q);
      if (match) {
        results.push({ provider: p, model: m });
      }
    }
  }
  return results;
}

// ===== Sorting =====
function sortBy(col) {
  if (currentSort.col === col) {
    currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.col = col;
    currentSort.dir = 'asc';
  }
  document.getElementById('sortSelect').value = 
    col + '-' + currentSort.dir;
  renderTable();
}

// Handle sort select change
document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('sortSelect');
  if (sel) {
    sel.addEventListener('change', () => {
      const [col, dir] = sel.value.split('-');
      currentSort.col = col;
      currentSort.dir = dir;
      renderTable();
    });
  }
});

function sortModels(models, col, dir) {
  const m = dir === 'asc' ? 1 : -1;
  
  return [...models].sort((a, b) => {
    let va, vb;
    switch (col) {
      case 'provider':
        va = a.provider.provider;
        vb = b.provider.provider;
        return va.localeCompare(vb) * m;
      case 'name':
        va = a.model.name;
        vb = b.model.name;
        return va.localeCompare(vb) * m;
      case 'input':
        va = a.model.input ?? Infinity;
        vb = b.model.input ?? Infinity;
        return (va - vb) * m;
      case 'cachedInput':
        va = a.model.cachedInput ?? Infinity;
        vb = b.model.cachedInput ?? Infinity;
        return (va - vb) * m;
      case 'output':
        va = a.model.output ?? Infinity;
        vb = b.model.output ?? Infinity;
        return (va - vb) * m;
      case 'context':
        va = a.model.contextWindow ?? Infinity;
        vb = b.model.contextWindow ?? Infinity;
        return (va - vb) * m;
      default:
        return 0;
    }
  });
}

// ===== Rendering =====
function fmtPrice(v, currency = 'USD') {
  if (v === undefined || v === null) return null;
  const prefix = currency === 'USD' ? '$' : '¥';
  if (v < 0.01) return `${prefix}${v.toFixed(4)}`;
  if (v < 1) return `${prefix}${v.toFixed(3)}`;
  return `${prefix}${v.toFixed(2)}`;
}

function fmtContext(v) {
  if (!v) return '—';
  if (v >= 1000000) return `${(v / 10000).toFixed(0)}万`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
  return `${v}`;
}

function renderTable() {
  const tbody = document.getElementById('tableBody');
  const filtered = getFilteredModels();
  const sorted = sortModels(filtered, currentSort.col, currentSort.dir);
  
  // Update sort icons
  document.querySelectorAll('#pricingTable th').forEach(th => {
    th.classList.remove('sort-active');
  });
  const activeTh = document.querySelector(`#pricingTable th[data-col="${currentSort.col}"]`);
  if (activeTh) activeTh.classList.add('sort-active');

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">🔍 ${i18n[currentLang].noResult}</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map(item => {
    const p = item.provider;
    const m = item.model;
    const color = p.color || '#888';
    
    const inputStr = fmtPrice(m.input, m.currency);
    const cachedStr = fmtPrice(m.cachedInput, m.currency);
    const outputStr = fmtPrice(m.output, m.currency);
    const ctxStr = fmtContext(m.contextWindow);
    
    const hasPrice = m.input !== undefined && m.input !== null;
    
    if (!hasPrice) {
      return `<tr>
        <td>
          <div class="provider-cell">
            <span class="provider-dot" style="background:${color}"></span>
            <span class="provider-name">${escHtml(p.provider)}</span>
          </div>
        </td>
        <td><span class="model-name">${escHtml(m.name)}</span></td>
        <td colspan="4"><span class="price-empty">📌 ${i18n[currentLang].toBeFetched}</span></td>
      </tr>`;
    }
    
    return `<tr>
      <td>
        <div class="provider-cell">
          <span class="provider-dot" style="background:${color}"></span>
          <span class="provider-name">${escHtml(p.provider)}</span>
        </div>
      </td>
      <td>
        <div class="model-name">${escHtml(m.name)}</div>
        ${m.note ? `<div class="model-note">${escHtml(m.note)}</div>` : ''}
      </td>
      <td><span class="price-value usd">${inputStr || '—'}</span></td>
      <td><span class="price-value usd">${cachedStr || '—'}</span></td>
      <td><span class="price-value usd">${outputStr || '—'}</span></td>
      <td><span class="context-value">${ctxStr}</span></td>
    </tr>`;
  }).join('');
}

function escHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function renderCards() {
  const container = document.getElementById('providerCards');
  
  container.innerHTML = pricingData.providers.map(p => {
    const hasModels = p.models.length > 0;
    const hasPrice = p.models.some(m => m.input !== undefined && m.input !== null);
    const prices = p.models.filter(m => m.input !== undefined).map(m => m.input);
    const minPrice = prices.length ? Math.min(...prices) : null;
    const maxPrice = prices.length ? Math.max(...prices) : null;
    
    return `<div class="provider-card">
      <div class="provider-card-header">
        <span class="card-dot" style="background:${p.color}"></span>
        <span class="provider-card-name">${escHtml(p.provider)}</span>
        <a href="${escHtml(p.providerUrl)}" target="_blank" class="provider-card-link" rel="noopener">官网 ↗</a>
      </div>
      <div class="provider-card-stats">
        ${hasModels 
          ? `<span>${p.models.length} ${i18n[currentLang].models}</span>` +
            (hasPrice && minPrice !== null
              ? `<span>价格区间: $${minPrice.toFixed(3)} ~ $${maxPrice.toFixed(3)}</span>`
              : `<span>📌 ${i18n[currentLang].toBeFetched}</span>`)
          : `<span>📌 ${i18n[currentLang].toBeFetched}</span>`
        }
      </div>
    </div>`;
  }).join('');
}

// ===== Language =====
function toggleLang() {
  currentLang = currentLang === 'zh' ? 'en' : 'zh';
  document.getElementById('langToggle').textContent = currentLang === 'zh' ? 'EN' : '中文';
  applyLang();
}

function applyLang() {
  const t = i18n[currentLang];
  document.getElementById('subtitle').textContent = t.title;
  document.getElementById('searchInput').placeholder = t.searchPlaceholder;
  document.getElementById('sortLabel').textContent = t.sortLabel;
  document.getElementById('sectionTitle').textContent = t.sectionTitle;
  
  // Update table headers
  const ths = document.querySelectorAll('#pricingTable th');
  const cols = ['provider', 'name', 'input', 'cached', 'output', 'context'];
  const labels = [t.colProvider, t.colModel, t.colInput, t.colCached, t.colOutput, t.colContext];
  ths.forEach((th, i) => {
    if (i < labels.length) {
      const iconSpan = th.querySelector('.sort-icon');
      th.innerHTML = `${labels[i]} `;
      if (iconSpan) th.appendChild(iconSpan);
    }
  });
  
  if (pricingData) renderTable();
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', loadData);
