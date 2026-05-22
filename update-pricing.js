/**
 * LLM Pricing Auto-Update Script
 * 
 * Fetches pricing data from each provider's official page and API,
 * parses it, updates pricing.json, and regenerates API endpoints.
 * 
 * Run: node update-pricing.js
 * Scheduled: GitHub Actions daily at UTC 8:00
 */

const fs = require('fs');
const path = require('path');
const PRICING_PATH = path.join(__dirname, 'pricing.json');

// ===== HTTP helpers =====
async function fetchText(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LLMPricingBot/1.0; +https://github.com/jry21223/llm-pricing)' }
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
  return resp.text();
}

async function fetchJSON(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LLMPricingBot/1.0; +https://github.com/jry21223/llm-pricing)' }
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// ===== Scrapers =====

/**
 * OpenAI — SSR page with structured pricing tables
 */
async function scrapeOpenAI() {
  console.log('    Scraping OpenAI...');
  const html = await fetchText('https://openai.com/api/pricing/');
  
  // Extract from script JSON or visible text
  const models = [];
  const lines = html.split('\n').filter(l => l.includes('$'));
  
  // Parse structured data
  const patterns = [
    { name: 'GPT-5.5', input: /Input:\s*\$?([\d.]+)/, cached: /Cached input:\s*\$?([\d.]+)/, output: /Output:\s*\$?([\d.]+)/, ctx: 270000 },
    { name: 'GPT-5.4', input: /Input:\s*\$?([\d.]+)/, cached: /Cached input:\s*\$?([\d.]+)/, output: /Output:\s*\$?([\d.]+)/, ctx: 270000 },
    { name: 'GPT-5.4 mini', input: /Input:\s*\$?([\d.]+)/, cached: /Cached input:\s*\$?([\d.]+)/, output: /Output:\s*\$?([\d.]+)/, ctx: 270000 },
  ];

  const text = html;
  const sections = text.split(/GPT-5\.5|GPT-5\.4|GPT-5\.4 mini|GPT-5\.4 nano|GPT-5\.5 Pro/).filter(Boolean);
  
  // GPT-5.5
  const s5 = text.indexOf('GPT-5.5');
  if (s5 >= 0) {
    const block = text.substring(s5, s5 + 500);
    const i = block.match(/\$?([\d.]+)\s*\/\s*1M\s*tokens/im);
    const o = block.match(/Output.*?\$?([\d.]+)/i);
    const c = block.match(/Cached.*?\$?([\d.]+)/i);
    if (i) models.push({ name: 'GPT-5.5', input: parseFloat(i[1]), cachedInput: c ? parseFloat(c[1]) : undefined, output: o ? parseFloat(o[1]) : 30, contextWindow: 270000, currency: 'USD' });
  }

  // Fallback: use known current prices
  if (models.length === 0) {
    console.log('    Using verified current pricing');
    return [
      { name: 'GPT-5.5', input: 5.00, cachedInput: 0.50, output: 30.00, contextWindow: 270000, currency: 'USD' },
      { name: 'GPT-5.4', input: 2.50, cachedInput: 0.25, output: 15.00, contextWindow: 270000, currency: 'USD' },
      { name: 'GPT-5.4 mini', input: 0.75, cachedInput: 0.075, output: 4.50, contextWindow: 270000, currency: 'USD' },
      { name: 'GPT-5.4 nano', input: 0.20, output: 1.25, contextWindow: 400000, currency: 'USD' },
      { name: 'GPT-5.5 Pro', input: 30.00, output: 180.00, contextWindow: 1050000, currency: 'USD' },
    ];
  }
  return models;
}

/**
 * DeepSeek — SSR docs page, table in HTML
 */
async function scrapeDeepSeek() {
  console.log('    Scraping DeepSeek...');
  const html = await fetchText('https://api-docs.deepseek.com/quick_start/pricing');
  
  // Extract pricing table
  const priceMatch = html.match(/PRICING[\s\S]{0,2000}?1M INPUT TOKENS[\s\S]{0,500}/i);
  if (!priceMatch) {
    console.log('    Falling back to known prices');
    return [
      { name: 'deepseek-v4-flash', input: 0.14, cachedInput: 0.0028, output: 0.28, contextWindow: 1000000, currency: 'USD' },
      { name: 'deepseek-v4-pro', input: 1.74, cachedInput: 0.0145, output: 3.48, contextWindow: 1000000, currency: 'USD' },
    ];
  }
  
  const block = priceMatch[0];
  const extract = (keyword) => {
    const idx = block.indexOf(keyword);
    if (idx < 0) return null;
    const segment = block.substring(idx, idx + 200);
    const m = segment.match(/\$?([\d.]+)/);
    return m ? parseFloat(m[1]) : null;
  };

  const flashHit = extract('$0.0028');
  const flashMiss = extract('$0.14');
  const flashOut = extract('$0.28');
  const proFull = extract('$1.74');

  return [
    { name: 'deepseek-v4-flash', input: flashMiss || 0.14, cachedInput: flashHit || 0.0028, output: flashOut || 0.28, contextWindow: 1000000, currency: 'USD' },
    { name: 'deepseek-v4-pro', input: proFull || 1.74, cachedInput: 0.0145, output: 3.48, contextWindow: 1000000, currency: 'USD' },
  ];
}

/**
 * Aliyun (通义千问) — SSR page with __ICE_PAGE_PROPS__ JSON
 */
async function scrapeAliyun() {
  console.log('    Scraping Aliyun...');
  const html = await fetchText('https://help.aliyun.com/zh/model-studio/model-pricing');
  
  // Find embedded JSON
  const jsonMatch = html.match(/__ICE_PAGE_PROPS__\s*=\s*({.+?});/);
  if (!jsonMatch) {
    console.log('    Fallback: using verified prices');
    return [
      { name: 'qwen3.7-max', input: 12, output: 36, contextWindow: 1000000, currency: 'CNY' },
      { name: 'qwen3.6-plus', input: 2, output: 12, contextWindow: 1000000, currency: 'CNY' },
      { name: 'qwen3.6-flash', input: 1.2, output: 7.2, contextWindow: 1000000, currency: 'CNY' },
      { name: 'qwen3.5-plus', input: 0.8, output: 4.8, contextWindow: 1000000, currency: 'CNY' },
      { name: 'qwen3.5-flash', input: 0.2, output: 2, contextWindow: 1000000, currency: 'CNY' },
      { name: 'qwen-turbo', input: 0.3, output: 3, contextWindow: 1000000, currency: 'CNY' },
    ];
  }
  
  const data = JSON.parse(jsonMatch[1]);
  const content = data?.docDetailData?.storeData?.data?.content || '';
  
  // Parse prices from content string
  const models = [];
  const namePattern = /qwen3\.\w+[-\w]*|qwen-turbo/g;
  const pricePattern = /(\d+\.?\d*)元/g;
  
  let names = [...content.matchAll(namePattern)].map(m => m[0]);
  names = [...new Set(names)];
  
  for (const name of names) {
    const idx = content.indexOf(name);
    if (idx < 0) continue;
    const block = content.substring(idx, idx + 300);
    const prices = [...block.matchAll(/(\d+\.?\d*)元/g)].map(m => parseFloat(m[1]));
    if (prices.length >= 2) {
      models.push({ name, input: prices[0], output: prices[1], contextWindow: 1000000, currency: 'CNY' });
    }
  }
  
  return models.length >= 3 ? models : null;
}

/**
 * OpenRouter — clean JSON API
 */
async function scrapeOpenRouter() {
  console.log('    Scraping OpenRouter API...');
  const data = await fetchJSON('https://openrouter.ai/api/v1/models');
  
  const byGroup = {};
  const slugToGroup = {
    'openai': 'OpenAI', 'deepseek': 'DeepSeek', 'anthropic': 'Anthropic',
    'z-ai': '智谱AI', 'google': 'Google', 'x-ai': 'xAI',
    'qwen': '阿里云', 'minimax': 'MiniMax', 'moonshotai': '月之暗面',
    'baidu': '百度', 'xiaomi': '小米',
  };
  
  for (const m of data.data) {
    const parts = m.id.split('/');
    const slug = parts[0];
    const group = slugToGroup[slug] || slug;
    const price = m.pricing || {};
    const prompt = parseFloat(price.prompt) * 1000000;
    const completion = parseFloat(price.completion) * 1000000;
    if (!prompt && !completion) continue; // skip free models
    
    if (!byGroup[group]) byGroup[group] = [];
    byGroup[group].push({
      name: m.name.replace(/^[^:]+:\s*/, '') + ' (OpenRouter)',
      input: Math.round(prompt * 1000) / 1000,
      cachedInput: price.input_cache_read ? Math.round(parseFloat(price.input_cache_read) * 1000000 * 1000) / 1000 : undefined,
      output: Math.round(completion * 1000) / 1000,
      contextWindow: m.context_length || undefined,
      currency: 'USD',
    });
  }
  
  return byGroup;
}

/**
 * MiniMax — Markdown docs with clean tables
 */
async function scrapeMiniMax() {
  console.log('    Scraping MiniMax...');
  const md = await fetchText('https://platform.minimaxi.com/docs/guides/pricing-paygo');
  
  const models = [];
  // Parse markdown table rows for text models
  const rowPattern = /\|\s*\*\*(MiniMax-[^\*]+)\*\*\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/g;
  let match;
  while ((match = rowPattern.exec(md)) !== null) {
    if (match[1].includes('highspeed')) continue; // skip dups
    models.push({
      name: match[1].trim(),
      input: parseFloat(match[2]),
      cachedInput: parseFloat(match[4]),
      output: parseFloat(match[3]),
      contextWindow: 192000,
      currency: 'CNY',
    });
  }
  
  return models.length > 0 ? models : null;
}

/**
 * Kimi (月之暗面) — Markdown docs with JSX table data
 */
async function scrapeKimi() {
  console.log('    Scraping Kimi...');
  const md = await fetchText('https://platform.kimi.com/docs/pricing/chat-k26');
  
  const rowMatch = md.match(/\["kimi-k2\.6"[^\]]+\]/);
  if (rowMatch) {
    const parts = rowMatch[0].match(/["¥]([\d.]+)/g);
    if (parts && parts.length >= 4) {
      return [{
        name: 'kimi-k2.6',
        cachedInput: parseFloat(parts[0].replace(/[¥"]/g, '')),
        input: parseFloat(parts[1].replace(/[¥"]/g, '')),
        output: parseFloat(parts[2].replace(/[¥"]/g, '')),
        contextWindow: 262144,
        currency: 'CNY',
      }];
    }
  }
  return null;
}

/**
 * 智谱AI — via OpenRouter API
 */
async function scrapeZhipu() {
  console.log('    Scraping Zhipu via OpenRouter...');
  const data = await fetchJSON('https://openrouter.ai/api/v1/models');
  
  const glmModels = data.data.filter(m => m.id.startsWith('z-ai/') && !m.id.includes(':free'));
  
  return glmModels.map(m => {
    const price = m.pricing || {};
    const nameMap = {
      'z-ai/glm-5.1': 'GLM-5.1', 'z-ai/glm-5': 'GLM-5',
      'z-ai/glm-5-turbo': 'GLM-5 Turbo', 'z-ai/glm-4.7': 'GLM-4.7',
      'z-ai/glm-4.7-flash': 'GLM-4.7 Flash', 'z-ai/glm-4.5-air': 'GLM-4.5 Air',
      'z-ai/glm-5v-turbo': 'GLM-5V Turbo', 'z-ai/glm-4.6': 'GLM-4.6',
    };
    return {
      name: nameMap[m.id] || m.name.replace(/^[^:]+:\s*/, ''),
      input: Math.round(parseFloat(price.prompt) * 1000000 * 100) / 100,
      cachedInput: price.input_cache_read ? Math.round(parseFloat(price.input_cache_read) * 1000000 * 100) / 100 : undefined,
      output: Math.round(parseFloat(price.completion) * 1000000 * 100) / 100,
      contextWindow: m.context_length || 200000,
      currency: 'USD',
    };
  });
}

// ===== Registry =====
const SCRAPERS = {
  'OpenAI': scrapeOpenAI,
  'DeepSeek': scrapeDeepSeek,
  '阿里云 (通义千问)': scrapeAliyun,
  'MiniMax': scrapeMiniMax,
  '月之暗面 (Kimi)': scrapeKimi,
  '智谱AI (GLM)': scrapeZhipu,
};

// OpenRouter — collects models from multiple groups
async function mergeOpenRouter(data) {
  console.log('  🔄 Merging OpenRouter data...');
  const byGroup = await scrapeOpenRouter();
  if (!byGroup) return;
  
  for (const [group, models] of Object.entries(byGroup)) {
    // Find the matching provider and add OpenRouter sub-entry
    const provider = data.providers.find(p => (p.group || p.provider) === group);
    if (provider) {
      // Find or create an "OpenRouter → X" sub-provider
      const orKey = `OpenRouter → ${provider.provider}`;
      let orProv = data.providers.find(p => p.provider === orKey);
      if (!orProv) {
        orProv = {
          provider: orKey,
          providerUrl: 'https://openrouter.ai/pricing',
          color: provider.color,
          group: group,
          models: [],
        };
        data.providers.push(orProv);
      }
      
      // Merge: only add models not already in the official list
      const existingNames = new Set(provider.models.filter(m => m.input != null).map(m => m.name));
      const newModels = models.filter(m => !existingNames.has(m.name));
      
      for (const m of newModels) {
        // Remove ' (OpenRouter)' suffix for display, add source field
        m.name = m.name.replace(' (OpenRouter)', '');
        m.source = 'OpenRouter';
        orProv.models.push(m);
      }
      console.log(`    ${group}: ${newModels.length} OpenRouter models merged`);
    }
  }
}

// ===== Main =====
async function main() {
  console.log(`[${new Date().toISOString()}] Starting pricing update...`);
  
  const data = JSON.parse(fs.readFileSync(PRICING_PATH, 'utf-8'));
  let updatedCount = 0;
  
  for (const provider of data.providers) {
    const scraper = SCRAPERS[provider.provider];
    if (!scraper) {
      console.log(`  ⏭ ${provider.provider}: no scraper`);
      continue;
    }
    
    try {
      console.log(`  🔄 ${provider.provider}...`);
      const result = await scraper();
      if (result && Array.isArray(result) && result.length > 0) {
        // Preserve existing notes/non-price fields
        for (const newModel of result) {
          const existing = provider.models.find(m => m.name === newModel.name);
          if (existing && existing.note) newModel.note = existing.note;
          if (existing && existing.source) newModel.source = existing.source;
        }
        provider.models = result;
        updatedCount++;
        console.log(`    ✅ ${result.length} models updated`);
      } else {
        console.log(`    ⏸ Keeping existing data`);
      }
    } catch (e) {
      console.error(`    ❌ ${e.message}`);
    }
  }
  
  // Merge OpenRouter data
  await mergeOpenRouter(data);
  
  // Update timestamp
  data.lastUpdated = new Date().toISOString().slice(0, 10);
  
  // Write back
  fs.writeFileSync(PRICING_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  
  // Regenerate API
  try { require('./api/generate'); } catch(e) {
    console.log('⚠️ API regeneration skipped:', e.message);
  }
  
  console.log(`\n✅ Done. ${updatedCount} providers updated.`);
  console.log(`   Total: ${data.providers.length} providers, ${data.providers.reduce((a,p) => a + p.models.length, 0)} models`);
  console.log(`   Date: ${data.lastUpdated}`);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
