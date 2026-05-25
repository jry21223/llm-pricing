# OpenClaw Data Review Instructions

Use OpenClaw as a reviewer and PR author, not as an unattended publisher. The daily GitHub Action owns deterministic updates. OpenClaw should inspect sources that are hard to scrape, then open a pull request with evidence.

## Scope

- Review `sources.json` first.
- Focus on sections with `updateMode` set to `agent_review`, especially `subscriptionPlans`, `activeDeals`, and `channels`.
- Do not rewrite generated files by hand unless you also run `npm run generate-api`.
- Do not invent prices or promotions. If a source is inaccessible, record that as an open question instead of filling a guess.

## Daily Prompt

```text
You are maintaining jry21223/llm-pricing.

Goal:
Check whether the agent-reviewed data is still accurate and open a PR only if something changed.

Repository:
https://github.com/jry21223/llm-pricing

Branch:
Create a new branch from main named agent/data-review-YYYY-MM-DD.

Read first:
- sources.json
- pricing.json
- api/generate.js
- update-pricing.js

Review targets:
1. subscriptionPlans in pricing.json
2. activeDeals in pricing.json
3. channels in pricing.json

Sources to check:
- 阿里云百炼套餐: https://bailian.console.aliyun.com/
- 阿里云模型计费: https://help.aliyun.com/zh/model-studio/model-pricing
- 智谱 Coding Plan / pricing: https://open.bigmodel.cn/
- 火山方舟 / 豆包相关套餐: https://www.volcengine.com/product/doubao
- OpenRouter pricing/free models: https://openrouter.ai/api/v1/models
- Any source URLs listed in sources.json

Rules:
- Prefer official pages and APIs.
- For every changed price, quota, promotion, or expiry, include the source URL in the PR body.
- If a page requires login or cannot be verified, leave the existing value unchanged and mention it in the PR.
- Preserve JSON structure and existing field names.
- Update item-level lastUpdated only when you actually verified or changed that item.
- Update sources.json lastChecked for sections you reviewed.
- Run:
  npm ci
  npm run update
  npm run generate-api
- Check that pricing.json and api/v1/*.json are valid JSON.
- Open a PR to main with:
  - Summary
  - Source links
  - Changed fields
  - Verification commands and outputs
  - Open questions / inaccessible sources

Do not merge the PR yourself.
```

## Good PR Title

```text
agent: review plans and promotions 2026-05-25
```

## Review Checklist

- `sources.json` explains whether data is automatic, derived, manual, or agent-reviewed.
- `api/v1/sources.json` was regenerated.
- No expired promotion remains visible.
- Free models that come from OpenRouter match the API response.
- Plan prices are changed only with source evidence.
