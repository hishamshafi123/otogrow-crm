// Real HTTP fixture checks. Only this test transport maps reserved hosts to loopback.
const assert = require('node:assert/strict');
const http = require('node:http');
const {
  verifyDeliverySeo,
  fetchDeliveryPublicPage,
} = require('../dist/modules/delivery/agents/delivery-seo-verifier');

async function main() {
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'text/html');
    if (request.url === '/inaccessible') {
      response.writeHead(403);
      response.end();
      return;
    }
    response.end(
      request.url === '/present'
        ? '<a href="https://brand.example/product">Brand product</a>'
        : '<p>No backlink on this fixture.</p>',
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const fetchFixture = async (url, signal) => {
      assert(
        ['source.example', 'brand.example'].includes(new URL(url).hostname),
      );
      const response = await fetch(`${origin}${new URL(url).pathname}`, {
        signal,
      });
      if (!response.ok) throw new Error('Fixture is inaccessible');
      return {
        url,
        body: await response.text(),
        contentType: response.headers.get('content-type'),
      };
    };
    for (const [path, expected] of [
      ['present', 'Backlink observed'],
      ['missing', 'No matching backlink'],
      ['inaccessible', 'could not be verified'],
    ]) {
      const result = await verifyDeliverySeo(
        {
          sourceUrl: `https://source.example/${path}`,
          targetUrl: 'https://brand.example/product',
          anchor: 'Brand product',
          copy: '',
          requirements: '',
        },
        AbortSignal.timeout(5000),
        fetchFixture,
      );
      assert(result.summary.includes(expected), result.summary);
    }
    await assert.rejects(
      fetchDeliveryPublicPage(origin, AbortSignal.timeout(5000)),
      /Only public/,
    );
    console.log(
      'PASS: fetched HTTP fixtures distinguish present, missing and inaccessible backlinks; production fetcher rejects the loopback fixture. No model calls.',
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
