import {
  fetchDeliveryPublicPage,
  inspectDeliveryBacklinks,
  validateDeliveryPublicUrl,
  verifyDeliverySeo,
} from 'src/modules/delivery/agents/delivery-seo-verifier';
import { deliveryAgentConfigurationSchema } from 'src/modules/delivery/agents/delivery-agent.types';

describe('Delivery SEO evidence', () => {
  it('respects a document base rather than attributing relative links to the wrong site', () => {
    const html =
      '<html><head><base href="https://other.example/"></head><body><a href="/product">Product</a></body></html>';
    expect(
      inspectDeliveryBacklinks(
        html,
        'https://source.example/',
        'https://source.example/product',
      ),
    ).toEqual([]);
    expect(
      inspectDeliveryBacklinks(
        html,
        'https://source.example/',
        'https://other.example/product',
      ),
    ).toHaveLength(1);
  });
  it.each([
    'http://127.0.0.1',
    'http://0x7f000001',
    'http://[::1]',
    'http://[::ffff:127.0.0.1]',
    'http://169.254.169.254',
    'http://10.0.0.1',
    'file:///etc/passwd',
    'http://localhost',
    'http://user:password@example.com',
    'http://example.com:3000',
  ])('rejects unsafe input %s', (url) => {
    expect(() => validateDeliveryPublicUrl(url)).toThrow();
  });

  it('resolves relative links, decodes text, and matches exact destination and anchor', () => {
    const html =
      '<a href="/product?x=1&amp;y=2" rel="nofollow">Brand <b>&amp;</b> Product</a><a href="https://other.example/product">Brand &amp; Product</a>';
    expect(
      inspectDeliveryBacklinks(
        html,
        'https://brand.example/article',
        'https://brand.example/product?x=1&y=2',
        'Brand & Product',
      ),
    ).toEqual([
      {
        href: 'https://brand.example/product?x=1&y=2',
        text: 'Brand & Product',
        rel: 'nofollow',
      },
    ]);
    expect(
      inspectDeliveryBacklinks(
        html,
        'https://brand.example/article',
        'https://brand.example/product?x=1&y=2',
        'Wrong anchor',
      ),
    ).toEqual([]);
  });

  it('separates observed links from inaccessible destinations', async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce({
        url: 'https://source.example/page',
        contentType: 'text/html',
        body: '<a href="https://brand.example/product">Product</a>',
      })
      .mockRejectedValueOnce(new Error('Unavailable'));
    const result = await verifyDeliverySeo(
      {
        copy: '',
        requirements: '',
        sourceUrl: 'https://source.example/page',
        targetUrl: 'https://brand.example/product',
      },
      new AbortController().signal,
      fetchPage,
    );
    expect(result.summary).toBe('Backlink observed in fetched HTML.');
    expect(result.findings[1].evidence).toContain('inaccessible');
    expect(result.findings[0].correction).toContain(
      'does not prove search indexing',
    );
  });

  it('does not claim missing backlinks when the source is inaccessible', async () => {
    const result = await verifyDeliverySeo(
      {
        copy: '',
        requirements: '',
        sourceUrl: 'https://source.example',
        targetUrl: 'https://brand.example',
      },
      new AbortController().signal,
      jest.fn().mockRejectedValue(new Error('Blocked')),
    );
    expect(result.summary).toContain('could not be verified');
    expect(result.summary).not.toContain('No matching');
  });

  it('reports an absent exact link without inferring indexing', async () => {
    const result = await verifyDeliverySeo(
      {
        copy: '',
        requirements: '',
        sourceUrl: 'https://source.example',
        targetUrl: 'https://brand.example',
      },
      new AbortController().signal,
      jest.fn().mockResolvedValue({
        url: 'https://source.example',
        contentType: 'text/html',
        body: '<a href="https://other.example">Other</a>',
      }),
    );
    expect(result.summary).toContain('No matching backlink');
    expect(result.findings[0].correction).toContain('does not prove absence');
  });

  it('blocks loopback fetches before making a request', async () => {
    await expect(
      fetchDeliveryPublicPage(
        'http://127.0.0.1:3000',
        new AbortController().signal,
      ),
    ).rejects.toThrow();
  });

  it('rejects unapproved tools and autonomous edits', () => {
    const configuration = {
      name: 'Test',
      purpose: 'Test',
      kind: 'BRIEF',
      enabled: false,
      instructions: 'Check brief',
      requiredInputs: ['brief'],
      outputFormat: 'findings',
      tools: [],
      modelId: null,
      projectIds: ['00000000-0000-4000-8000-000000000001'],
      roles: ['ADMIN'],
      dailyRunLimit: 2,
      maxOutputTokens: 256,
      humanConfirmation: true,
    };
    expect(
      deliveryAgentConfigurationSchema.safeParse(configuration).success,
    ).toBe(true);
    expect(
      deliveryAgentConfigurationSchema.safeParse({
        ...configuration,
        tools: ['send_email'],
      }).success,
    ).toBe(false);
    expect(
      deliveryAgentConfigurationSchema.safeParse({
        ...configuration,
        humanConfirmation: false,
      }).success,
    ).toBe(false);
  });
});
