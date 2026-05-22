#!/usr/bin/env node
/**
 * Generate static API endpoints from pricing.json
 * Run: node api/generate.js
 * Creates static JSON files for GitHub Pages hosting
 */
const fs = require('fs');
const path = require('path');

const pricing = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pricing.json'), 'utf-8'));
const apiDir = path.join(__dirname, 'v1');

// Helper: flatten models with provider info
function flattenModels() {
  const models = [];
  for (const p of pricing.providers) {
    if (!p.models || p.models.length === 0) continue;
    for (const m of p.models) {
      models.push({
        provider: p.provider,
        providerUrl: p.providerUrl,
        ...m
      });
    }
  }
  return models;
}

// 1. /api/v1/models — all models grouped by provider
const allModels = flattenModels();
const grouped = pricing.providers.map(p => ({
  provider: p.provider,
  providerUrl: p.providerUrl,
  color: p.color,
  models: p.models
})).filter(g => g.models.length > 0);

fs.writeFileSync(path.join(apiDir, 'models.json'), JSON.stringify({
  lastUpdated: pricing.lastUpdated,
  total: allModels.length,
  providers: grouped
}, null, 2));
console.log(`✅ /api/v1/models.json — ${grouped.length} providers with ${allModels.length} models (grouped)`);

// 2. /api/v1/providers — provider list
fs.writeFileSync(path.join(apiDir, 'providers.json'), JSON.stringify({
  lastUpdated: pricing.lastUpdated,
  total: pricing.providers.length,
  providers: pricing.providers.map(p => ({
    provider: p.provider,
    providerUrl: p.providerUrl,
    color: p.color,
    modelCount: p.models.length,
    models: p.models.filter(m => m.input != null).map(m => m.name)
  }))
}, null, 2));
console.log(`✅ /api/v1/providers.json — ${pricing.providers.length} providers`);

// 3. /api/v1/models/:provider — per-provider model lists
for (const p of pricing.providers) {
  const slug = p.provider.replace(/[()\/\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  fs.writeFileSync(path.join(apiDir, `models-${slug}.json`), JSON.stringify({
    provider: p.provider,
    providerUrl: p.providerUrl,
    lastUpdated: pricing.lastUpdated,
    total: p.models.length,
    models: p.models
  }, null, 2));
  console.log(`  models-${slug}.json — ${p.models.length} models`);
}

// 4. /api/v1/stats — summary statistics
const withPrices = allModels.filter(m => m.input != null);
const byCurrency = {};
for (const m of withPrices) {
  const c = m.currency || 'USD';
  if (!byCurrency[c]) byCurrency[c] = [];
  byCurrency[c].push(m);
}

const stats = {
  lastUpdated: pricing.lastUpdated,
  totalProviders: pricing.providers.length,
  totalModels: allModels.length,
  modelsWithPricing: withPrices.length,
  cheapestInput: withPrices.sort((a, b) => a.input - b.input).slice(0, 5).map(m => ({
    provider: m.provider,
    model: m.name,
    input: m.input,
    currency: m.currency
  })),
  cheapestOutput: [...withPrices].sort((a, b) => a.output - b.output).slice(0, 5).map(m => ({
    provider: m.provider,
    model: m.name,
    output: m.output,
    currency: m.currency
  })),
  largestContext: [...withPrices].sort((a, b) => (b.contextWindow || 0) - (a.contextWindow || 0)).slice(0, 5).map(m => ({
    provider: m.provider,
    model: m.name,
    contextWindow: m.contextWindow
  }))
};

fs.writeFileSync(path.join(apiDir, 'stats.json'), JSON.stringify(stats, null, 2));
console.log(`✅ /api/v1/stats.json`);

console.log('\n🎉 Done!');
