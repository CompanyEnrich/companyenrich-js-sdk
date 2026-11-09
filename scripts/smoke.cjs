// Loads the built CommonJS module through the package's `exports` map.
const assert = require('node:assert/strict');
const { CompanyEnrich, NotFoundError } = require('@companyenrich/sdk');

const client = new CompanyEnrich({
  apiKey: 'smoke',
  fetch: async () => new Response(JSON.stringify({ title: 'Not Found' }), { status: 404 }),
});
assert
  .rejects(client.companies.enrich({ domain: 'example.com' }), NotFoundError)
  .then(() => console.log(`CommonJS entry works on Node ${process.version}`));
