import { BadRequestException } from '@nestjs/common';
import { assertSafePublicProductUrl } from 'src/modules/delivery/studio/studio-product-url-scraper';

describe('assertSafePublicProductUrl (SSRF protection)', () => {
  it.each([
    'http://localhost/product',
    'http://127.0.0.1/admin',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.1/internal',
    'http://192.168.1.5/router',
    'http://172.16.0.10/private',
    'http://metadata.internal/secrets',
    'file:///etc/passwd',
  ])('blocks unsafe/internal URL %s', async (url) => {
    await expect(assertSafePublicProductUrl(url)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('allows public IPv4 URLs', async () => {
    const parsed = await assertSafePublicProductUrl('https://93.184.216.34/tee');
    expect(parsed.hostname).toBe('93.184.216.34');
    expect(parsed.protocol).toBe('https:');
  });
});
