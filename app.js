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
    colSource: '来源',
    sectionTitle: '厂商概览',
    emptyData: '暂无数据',
    loading: '加载中...',
    updateAt: '数据更新于',
    toBeFetched: '待抓取',
    models: '个模型',
    footerNote: '数据仅供参考，准确价格请以各厂商官网为准。',
    noResult: '没有找到匹配的模型',
    official: '官方',
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
    colSource: 'Source',
    sectionTitle: 'Providers Overview',
    emptyData: 'No data',
    loading: 'Loading...',
    updateAt: 'Updated at',
    toBeFetched: 'Pending',
    models: 'models',
    footerNote: 'Prices are for reference only. Check official sites for accurate pricing.',
    noResult: 'No matching models found',
    official: 'Official',
  }
};

// ===== Data Loading =====
function renderUpdateStatus() {
  if (!pricingData) return;
  const date = pricingData.lastUpdated || '—';
  document.getElementById('dataStatus').textContent =
    `${i18n[currentLang].updateAt}: ${date}`;
  document.getElementById('updateBadge').textContent = `📅 ${date}`;
}

async function loadData() {
  try {
    const resp = await fetch('pricing.json?_=' + Date.now());
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    pricingData = await resp.json();
    renderUpdateStatus();
    renderTable();
    renderCards();
  } catch (e) {
    document.getElementById('dataStatus').textContent = `❌ ${e.message}`;
    document.getElementById('tableBody').innerHTML = 
      `<tr><td colspan="7" class="loading-cell">❌ ${e.message}</td></tr>`;
  }
}

// ===== Grouping Logic =====
function getGroupedModels() {
  // Build groups: group together providers sharing the same `group` field
  const groups = new Map();
  
  for (const p of pricingData.providers) {
    const g = p.group || p.provider;
    if (!groups.has(g)) {
      groups.set(g, {
        group: g,
        color: p.color,
        sourceProviders: []
      });
    }
    const grp = groups.get(g);
    grp.sourceProviders.push({
      provider: p.provider,
      providerUrl: p.providerUrl,
      source: p.models[0]?.source === 'OpenRouter' ? 'OpenRouter' : (p.models[0]?.source || '官方'),
      models: p.models || []
    });
  }
  
  return Array.from(groups.values());
}

function getAllFlattened() {
  const result = [];
  for (const g of getGroupedModels()) {
    for (const sp of g.sourceProviders) {
      for (const m of sp.models) {
        result.push({
          group: g.group,
          groupColor: g.color,
          provider: sp.provider,
          providerUrl: sp.providerUrl,
          source: sp.source,
          ...m
        });
      }
    }
  }
  return result;
}

// ===== Filtering & Sorting =====
function filterModels() { renderTable(); }

function getFilteredModels() {
  const q = (document.getElementById('searchInput').value || '').toLowerCase().trim();
  const all = getAllFlattened();
  
  if (!q) return all;
  
  return all.filter(m => 
    m.name.toLowerCase().includes(q) || 
    m.provider.toLowerCase().includes(q) ||
    m.group.toLowerCase().includes(q)
  );
}

function sortBy(col) {
  if (currentSort.col === col) {
    currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.col = col;
    currentSort.dir = 'asc';
  }
  document.getElementById('sortSelect').value = col + '-' + currentSort.dir;
  renderTable();
}

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
      case 'group':
        va = a.group || '';
        vb = b.group || '';
        return va.localeCompare(vb) * m;
      case 'source':
        va = a.source || '';
        vb = b.source || '';
        return va.localeCompare(vb) * m;
      case 'name':
        va = a.name || '';
        vb = b.name || '';
        return va.localeCompare(vb) * m;
      case 'input':
        va = a.input ?? Infinity;
        vb = b.input ?? Infinity;
        return (va - vb) * m;
      case 'cachedInput':
        va = a.cachedInput ?? Infinity;
        vb = b.cachedInput ?? Infinity;
        return (va - vb) * m;
      case 'output':
        va = a.output ?? Infinity;
        vb = b.output ?? Infinity;
        return (va - vb) * m;
      case 'context':
        va = a.contextWindow ?? Infinity;
        vb = b.contextWindow ?? Infinity;
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

function escHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function renderTable() {
  const tbody = document.getElementById('tableBody');
  const filtered = getFilteredModels();
  const sorted = sortModels(filtered, currentSort.col, currentSort.dir);
  
  document.querySelectorAll('#pricingTable th').forEach(th => th.classList.remove('sort-active'));
  const activeTh = document.querySelector(`#pricingTable th[data-col="${currentSort.col}"]`);
  if (activeTh) activeTh.classList.add('sort-active');

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">🔍 ${i18n[currentLang].noResult}</td></tr>`;
    return;
  }

  // Group rows visually: track when group changes
  let lastGroup = null;
  let html = '';
  
  for (const m of sorted) {
    const isOfficial = m.source === '官方' || !m.source;
    const color = m.groupColor || '#888';
    
    // Group header row
    if (m.group !== lastGroup) {
      lastGroup = m.group;
      html += `<tr class="group-header">
        <td colspan="7">
          <span class="group-dot" style="background:${color}"></span>
          <span class="group-name">${escHtml(m.group)}</span>
        </td>
      </tr>`;
    }
    
    // Skip models without pricing data
    if (m.input === undefined || m.input === null) {
      // Show a "pending" row only once per provider
      // Skip to avoid clutter
      continue;
    }
    
    const inputStr = fmtPrice(m.input, m.currency);
    const cachedStr = fmtPrice(m.cachedInput, m.currency);
    const outputStr = fmtPrice(m.output, m.currency);
    const ctxStr = fmtContext(m.contextWindow);
    const sourceLabel = isOfficial ? i18n[currentLang].official : m.source;
    
    html += `<tr class="model-row ${isOfficial ? 'official-row' : 'reseller-row'}">
      <td>
        <div class="provider-cell">
          <span class="provider-source-badge ${isOfficial ? 'badge-official' : 'badge-reseller'}">${escHtml(sourceLabel)}</span>
          <span class="provider-name-sub">${escHtml(isOfficial ? '' : m.provider)}</span>
        </div>
      </td>
      <td>
        <div class="model-name">${escHtml(m.name)}</div>
        ${m.note ? `<div class="model-note">${escHtml(m.note)}</div>` : ''}
      </td>
      <td><span class="price-value ${m.currency === 'CNY' ? 'cny' : 'usd'}">${inputStr || '—'}</span></td>
      <td><span class="price-value ${m.currency === 'CNY' ? 'cny' : 'usd'}">${cachedStr || '—'}</span></td>
      <td><span class="price-value ${m.currency === 'CNY' ? 'cny' : 'usd'}">${outputStr || '—'}</span></td>
      <td><span class="context-value">${ctxStr}</span></td>
      <td>
        ${!isOfficial ? `<span class="source-label">${escHtml(sourceLabel)}</span>` : ''}
      </td>
    </tr>`;
  }

  tbody.innerHTML = html;
}

function renderCards() {
  const container = document.getElementById('providerCards');
  const groups = getGroupedModels();
  
  container.innerHTML = groups.map(g => {
    const allModels = g.sourceProviders.flatMap(sp => sp.models);
    const hasModels = allModels.length > 0;
    const hasPrice = allModels.some(m => m.input !== undefined && m.input !== null);
    const prices = allModels.filter(m => m.input !== undefined).map(m => m.input);
    const minPrice = prices.length ? Math.min(...prices) : null;
    const maxPrice = prices.length ? Math.max(...prices) : null;
    const sources = [...new Set(g.sourceProviders.map(sp => sp.source || '官方'))].join(', ');
    
    const name = g.group || '';
    
    return `<div class="provider-card">
      <div class="provider-card-header">
        <span class="card-dot" style="background:${g.color}"></span>
        <span class="provider-card-name">${escHtml(name)}</span>
      </div>
      <div class="provider-card-stats">
        ${hasModels 
          ? `<span>${allModels.length} ${i18n[currentLang].models}</span>
             <span>来源: ${sources}</span>` +
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
  
  const ths = document.querySelectorAll('#pricingTable th');
  const cols = ['group', 'name', 'input', 'cached', 'output', 'context', 'source'];
  const labels = [t.colProvider, t.colModel, t.colInput, t.colCached, t.colOutput, t.colContext, t.colSource];
  ths.forEach((th, i) => {
    if (i < labels.length) {
      const iconSpan = th.querySelector('.sort-icon');
      th.innerHTML = `${labels[i]} `;
      if (iconSpan) th.appendChild(iconSpan);
    }
  });
  
  if (pricingData) {
    renderUpdateStatus();
    renderTable();
  }
}

// ===== Subscription Plans =====
function renderPlans() {
  const container = document.getElementById('planContainer');
  const plans = pricingData.subscriptionPlans;
  
  if (!plans || plans.length === 0) {
    container.innerHTML = '<div class="plan-pending">暂无订阅套餐数据</div>';
    return;
  }
  
  container.innerHTML = plans.map(p => {
    const hasPrice = p.price !== null && p.price !== undefined;
    
    return `<div class="plan-card">
      <div class="plan-header">
        <span class="plan-provider">${escHtml(p.provider)}</span>
        <span class="plan-type">${escHtml(p.planType)}</span>
      </div>
      ${hasPrice ? `<div class="plan-price-box">
        <span class="plan-price">${p.currency === 'CNY' ? '¥' : '$'}${p.price}</span>
        <span class="plan-period">/ ${escHtml(p.period)}</span>
      </div>` : `<div class="plan-price-box">
        <span class="plan-price" style="color:var(--text-secondary);font-size:1rem;">待定</span>
      </div>`}
      <div class="plan-details">
        <p><strong>支持模型：</strong>${escHtml(p.models)}</p>
        <p><strong>额度限制：</strong>${escHtml(p.limits)}</p>
      </div>
      <div class="plan-note">${escHtml(p.note)}</div>
    </div>`;
  }).join('');
}

// ===== Token Plan Table =====
function renderTokenPlans() {
  const container = document.getElementById('tokenContainer');
  const all = pricingData.subscriptionPlans;
  const plans = (all || []).filter(p => p.planType.toLowerCase().includes('token'));
  
  if (plans.length === 0) {
    container.innerHTML = '<div class="plan-pending">暂无 Token Plan 数据</div>';
    return;
  }
  
  // Group by provider
  const groups = {};
  for (const p of plans) {
    if (!groups[p.provider]) groups[p.provider] = [];
    groups[p.provider].push(p);
  }
  
  let html = '<table class="token-table"><thead><tr>' +
    '<th>厂商</th><th>套餐</th><th>价格</th><th>额度</th><th>说明</th>' +
    '</tr></thead><tbody>';
  
  for (const [provider, items] of Object.entries(groups)) {
    html += `<tr class="provider-header"><td colspan="5">${escHtml(provider)}</td></tr>`;
    for (const p of items) {
      html += `<tr>
        <td></td>
        <td><strong>${escHtml(p.planType)}</strong></td>
        <td><span class="token-price">¥${p.price}</span> <span class="token-period">/${escHtml(p.period)}</span></td>
        <td>${escHtml(p.limits)}</td>
        <td>${escHtml(p.note)}</td>
      </tr>`;
    }
  }
  
  html += '</tbody></table>';
  container.innerHTML = html;
}

// ===== Active Deals =====
function renderDeals() {
  const container = document.getElementById('dealsContainer');
  const deals = pricingData.activeDeals;
  if (!deals || deals.length === 0) {
    container.innerHTML = '<div class="free-empty">暂无促销活动</div>';
    return;
  }
  container.innerHTML = deals.map(d => {
    const type = d.type || 'discount';
    const isFree = d.type === 'free' || d.price === 0;
    const badge = isFree
      ? '<span class="deal-free-badge">🎉 免费</span>'
      : type === 'plan'
        ? '<span class="deal-plan-badge">套餐</span>'
        : type === 'new_user'
          ? '<span class="deal-free-badge">免费</span>'
          : d.discount
            ? `<span class="deal-discount-badge">-${escHtml(d.discount)}</span>`
            : '';
    return `<div class="deal-card deal-type-${type}">
      <div class="deal-vendor">${escHtml(d.vendor)}</div>
      <div class="deal-name">${escHtml(d.deal)}</div>
      ${badge}
      <div class="deal-detail">${d.current ? escHtml('现价: ' + d.current) : ''}${d.note ? ' · ' + escHtml(d.note) : ''}</div>
      ${d.expires && d.expires !== 'None' && d.expires !== '长期' ? `<div class="deal-expires">⏰ 截止: ${escHtml(d.expires)}</div>` : ''}
    </div>`;
  }).join('');
}

// ===== Free Models =====
function renderFreeModels() {
  const container = document.getElementById('freeContainer');
  const free = pricingData.freeModels;
  if (!free || free.length === 0) {
    container.innerHTML = '<div class="free-empty">暂无免费模型数据</div>';
    return;
  }
  container.innerHTML = free.map(m => `<div class="free-card">
    <div class="free-model-name">${escHtml(m.model)}</div>
    <div class="free-provider">${escHtml(m.provider)} · <span class="free-source-badge">${escHtml(m.source)}</span></div>
    <div class="free-detail">${escHtml(m.note)}${m.contextWindow ? ' · ' + fmtContext(m.contextWindow) : ''}</div>
  </div>`).join('');
}

// ===== Channels =====
function renderChannels() {
  const container = document.getElementById('channelContainer');
  const chs = pricingData.channels;
  if (!chs || chs.length === 0) {
    container.innerHTML = '<div class="free-empty">暂无渠道数据</div>';
    return;
  }
  container.innerHTML = chs.map(ch => `<div class="channel-card">
    <div class="channel-card-header">
      <span class="channel-name">${escHtml(ch.name)}</span>
      <span class="channel-type">${escHtml(ch.type)}</span>
    </div>
    <div class="channel-features">${escHtml(ch.features)}</div>
    <div class="channel-pricing">${escHtml(ch.pricing)}</div>
  </div>`).join('');
}

// Extend loadData to render all sections
const _origLoadData = loadData;
loadData = async function() {
  await _origLoadData();
  if (pricingData) {
    if (pricingData.activeDeals) renderDeals();
    if (pricingData.subscriptionPlans) {
      renderPlans();
      renderTokenPlans();
    }
    if (pricingData.freeModels) renderFreeModels();
    if (pricingData.channels) renderChannels();
  }
};

// ===== Init =====
document.addEventListener('DOMContentLoaded', loadData);
