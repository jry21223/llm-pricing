#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const pricing = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pricing.json'), 'utf-8'));
const apiDir = path.join(__dirname, 'v1');

// Build groups
const groupMap = new Map();
for (const p of pricing.providers) {
  const g = p.group || p.provider;
  if (!groupMap.has(g)) {
    groupMap.set(g, { provider: g, group: g, color: p.color, models: [] });
  }
  const entry = groupMap.get(g);
  for (const m of p.models) {
    entry.models.push({ ...m, source: m.source || '官方' });
  }
}

const allModels = [];
for (const [, entry] of groupMap) {
  for (const m of entry.models) allModels.push(m);
}

// 1. /api/v1/models.json — grouped by base provider
const grouped = Array.from(groupMap.values()).filter(g => g.models.length > 0);
fs.writeFileSync(path.join(apiDir, 'models.json'), JSON.stringify({
  lastUpdated: pricing.lastUpdated, total: allModels.length, groups: grouped
}, null, 2));
console.log(`✅ models.json — ${grouped.length} groups, ${allModels.length} models`);

// 2. /api/v1/providers.json — per-source listing
fs.writeFileSync(path.join(apiDir, 'providers.json'), JSON.stringify({
  lastUpdated: pricing.lastUpdated, total: pricing.providers.length,
  providers: pricing.providers.map(p => ({
    provider: p.provider, providerUrl: p.providerUrl, color: p.color,
    group: p.group || p.provider, modelCount: p.models.length,
    models: p.models.filter(m => m.input != null).map(m => ({name: m.name, source: m.source || '官方'}))
  }))
}, null, 2));
console.log(`✅ providers.json — ${pricing.providers.length} providers`);

// 3. /api/v1/groups.json — full group summary
fs.writeFileSync(path.join(apiDir, 'groups.json'), JSON.stringify({
  lastUpdated: pricing.lastUpdated, total: groupMap.size,
  groups: Array.from(groupMap.values()).map(g => ({
    provider: g.provider, group: g.group, color: g.color,
    modelCount: g.models.length,
    models: g.models.map(m => ({name: m.name, source: m.source}))
  }))
}, null, 2));
console.log(`✅ groups.json — ${groupMap.size} groups`);

// 4. Per-group files
for (const [g, entry] of groupMap) {
  const slug = g.replace(/[()\/\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  fs.writeFileSync(path.join(apiDir, `group-${slug}.json`), JSON.stringify({
    group: entry.provider, color: entry.color,
    lastUpdated: pricing.lastUpdated, total: entry.models.length,
    models: entry.models
  }, null, 2));
  console.log(`  group-${slug}.json — ${entry.models.length} models`);
}

// 5. /api/v1/stats.json
const withPrices = allModels.filter(m => m.input != null);
const sortedInput = [...withPrices].sort((a, b) => a.input - b.input).slice(0, 5);
const sortedOutput = [...withPrices].sort((a, b) => a.output - b.output).slice(0, 5);
const sortedCtx = [...withPrices].sort((a, b) => (b.contextWindow||0) - (a.contextWindow||0)).slice(0, 5);
fs.writeFileSync(path.join(apiDir, 'stats.json'), JSON.stringify({
  lastUpdated: pricing.lastUpdated, totalModels: withPrices.length,
  cheapestInput: sortedInput, cheapestOutput: sortedOutput, largestContext: sortedCtx
}, null, 2));
console.log(`✅ stats.json`);

console.log('\n🎉 Done!');
