/**
 * Vercel Serverless API — Dynamic model querying
 * 
 * Endpoints:
 *   GET /api/models              — all models (supports ?provider=&search=&minPrice=&maxPrice=)
 *   GET /api/models/:slug        — models for a specific provider
 *   GET /api/providers           — list all providers
 *   GET /api/stats               — pricing statistics
 *   GET /api/compare?models=a,b  — compare specific models by name
 * 
 * Deploy on Vercel: just push the repo, Vercel auto-detects this file
 */

const pricing = require('../pricing.json');

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '');
}

function flattenModels(providers) {
  const result = [];
  for (const p of providers) {
    if (!p.models || !p.models.length) continue;
    for (const m of p.models) {
      result.push({ provider: p.provider, providerUrl: p.providerUrl, ...m });
    }
  }
  return result;
}

function parseQuery(url) {
  const u = new URL(url, 'http://localhost');
  return Object.fromEntries(u.searchParams.entries());
}

module.exports = async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, `http://${req.headers.host}`);
  const q = Object.fromEntries(searchParams.entries());
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // GET /api/providers
    if (pathname === '/api/providers') {
      return res.json({
        lastUpdated: pricing.lastUpdated,
        total: pricing.providers.length,
        providers: pricing.providers.map(p => ({
          provider: p.provider,
          providerUrl: p.providerUrl,
          color: p.color,
          modelCount: p.models.length,
          models: p.models.filter(m => m.input != null).map(m => m.name)
        }))
      });
    }

    // GET /api/stats
    if (pathname === '/api/stats') {
      const all = flattenModels(pricing.providers).filter(m => m.input != null);
      const top5 = (arr, key) => [...arr].sort((a, b) => a[key] - b[key]).slice(0, 5);
      return res.json({
        lastUpdated: pricing.lastUpdated,
        totalModels: all.length,
        cheapestInput: top5(all, 'input'),
        cheapestOutput: top5(all, 'output'),
        largestContext: [...all].sort((a, b) => (b.contextWindow||0) - (a.contextWindow||0)).slice(0, 5)
      });
    }

    // GET /api/compare?models=xxx,yyy
    if (pathname === '/api/compare') {
      const names = (q.models || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      if (!names.length) {
        return res.status(400).json({ error: 'Provide ?models=model1,model2,...' });
      }
      const all = flattenModels(pricing.providers);
      const matched = all.filter(m => names.some(n => 
        m.name.toLowerCase().includes(n) || m.provider.toLowerCase().includes(n)
      ));
      return res.json({ query: names, total: matched.length, models: matched });
    }

    // GET /api/models — with optional filters
    if (pathname === '/api/models' || pathname === '/api/models/') {
      let all = flattenModels(pricing.providers);
      
      // Filter by provider
      if (q.provider) {
        const slug = slugify(q.provider);
        all = all.filter(m => slugify(m.provider).includes(slug));
      }
      // Search
      if (q.search) {
        const s = q.search.toLowerCase();
        all = all.filter(m => 
          m.name.toLowerCase().includes(s) || m.provider.toLowerCase().includes(s)
        );
      }
      // Price range
      if (q.minPrice) all = all.filter(m => m.input != null && m.input >= parseFloat(q.minPrice));
      if (q.maxPrice) all = all.filter(m => m.input != null && m.input <= parseFloat(q.maxPrice));
      // Currency
      if (q.currency) all = all.filter(m => m.currency === q.currency.toUpperCase());
      
      // Sort
      if (q.sort === 'input') all.sort((a, b) => (a.input||Infinity) - (b.input||Infinity));
      else if (q.sort === 'output') all.sort((a, b) => (a.output||Infinity) - (b.output||Infinity));
      else if (q.sort === 'context') all.sort((a, b) => (b.contextWindow||0) - (a.contextWindow||0));
      
      return res.json({
        lastUpdated: pricing.lastUpdated,
        total: all.length,
        models: all
      });
    }

    // GET /api/models/:slug — specific provider
    const modelMatch = pathname.match(/^\/api\/models\/(.+)$/);
    if (modelMatch) {
      const slug = modelMatch[1].toLowerCase();
      const provider = pricing.providers.find(p => slugify(p.provider) === slug);
      if (!provider) {
        return res.status(404).json({ error: `Provider "${slug}" not found. Available: ${pricing.providers.map(p => slugify(p.provider)).join(', ')}` });
      }
      return res.json({
        provider: provider.provider,
        providerUrl: provider.providerUrl,
        lastUpdated: pricing.lastUpdated,
        total: provider.models.length,
        models: provider.models
      });
    }

    return res.status(404).json({ error: 'Not found. Endpoints: /api/models, /api/providers, /api/stats, /api/compare, /api/models/:slug' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
