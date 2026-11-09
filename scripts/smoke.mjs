// Loads the built ES module through the package's `exports` map.
import assert from 'node:assert/strict';
import { CompanyEnrich, NotFoundError } from '@companyenrich/sdk';

const client = new CompanyEnrich({
  apiKey: 'smoke',
  fetch: async () => new Response(JSON.stringify({ title: 'Not Found' }), { status: 404 }),
});
await assert.rejects(client.companies.enrich({ domain: 'example.com' }), NotFoundError);
console.log(`ESM entry works on Node ${process.version}`);
