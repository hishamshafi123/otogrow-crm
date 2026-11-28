import { BadRequestException } from '@nestjs/common';
import {
  assertSafePublicProductUrl,
  dedupeKeyForImageUrl,
  hammingDistance64,
  isAcceptableProductDimensions,
  isLikelyNonProductImageUrl,
  normalizeCandidateImageUrl,
  readImageDimensions,
  stripNonProductHtmlSections,
  unwrapProxyImageUrl,
} from 'src/modules/delivery/studio/studio-product-url-scraper';

const makePngHeader = (width: number, height: number): Buffer => {
  const buf = Buffer.alloc(32);
  // PNG signature
  buf[0] = 0x89;
  buf[1] = 0x50;
  buf[2] = 0x4e;
  buf[3] = 0x47;
  buf[4] = 0x0d;
  buf[5] = 0x0a;
  buf[6] = 0x1a;
  buf[7] = 0x0a;
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
};

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

describe('product image URL deduplication & filtering', () => {
  const baseUrl = new URL('https://store.example.com/products/boxy-heavyweight-tee');

  it('unwraps Next.js and Cloudflare image proxy URLs', () => {
    expect(
      unwrapProxyImageUrl(
        '/_next/image?url=https%3A%2F%2Fcdn.example.com%2Fproducts%2Ftee-1.jpg&w=640&q=75',
        baseUrl,
      ),
    ).toBe('https://cdn.example.com/products/tee-1.jpg');

    expect(
      unwrapProxyImageUrl(
        '/cdn-cgi/image/width=800,quality=80/https://cdn.example.com/products/tee-1.jpg',
        baseUrl,
      ),
    ).toBe('https://cdn.example.com/products/tee-1.jpg');
  });

  it('collapses Shopify dual CDN domains, resize suffixes, and format variants into one dedupe key', () => {
    const a = normalizeCandidateImageUrl(
      'https://cdn.shopify.com/s/files/1/0555/1234/files/heavyweight-tee-front_1024x1024.jpg?v=1711',
      baseUrl,
    )!;
    const b = normalizeCandidateImageUrl(
      'https://store.example.com/cdn/shop/files/heavyweight-tee-front_600x600_crop_center.webp?width=400&v=1711',
      baseUrl,
    )!;
    const c = normalizeCandidateImageUrl(
      'https://store.example.com/cdn/shop/products/heavyweight-tee-front.png?v=9999',
      baseUrl,
    )!;

    expect(dedupeKeyForImageUrl(a)).toBe(dedupeKeyForImageUrl(b));
    expect(dedupeKeyForImageUrl(b)).toBe(dedupeKeyForImageUrl(c));
  });

  it('collapses WooCommerce and Cloudinary resized variants into one dedupe key', () => {
    const wooOrig = 'https://brand.com/wp-content/uploads/2026/05/jacket-front.jpg';
    const wooThumb =
      'https://brand.com/wp-content/uploads/2026/05/jacket-front-600x800.webp';
    const wooScaled =
      'https://brand.com/wp-content/uploads/2026/05/jacket-front-scaled.jpg';

    expect(dedupeKeyForImageUrl(wooOrig)).toBe(dedupeKeyForImageUrl(wooThumb));
    expect(dedupeKeyForImageUrl(wooOrig)).toBe(dedupeKeyForImageUrl(wooScaled));

    const cldA =
      'https://res.cloudinary.com/demo/image/upload/w_600,c_fill,f_auto/products/hoodie-1.jpg';
    const cldB =
      'https://res.cloudinary.com/demo/image/upload/w_1600,q_auto/products/hoodie-1.webp';
    expect(dedupeKeyForImageUrl(cldA)).toBe(dedupeKeyForImageUrl(cldB));
  });

  it('blocks non-product images without false positives on product names', () => {
    // Non-product images blocked
    expect(
      isLikelyNonProductImageUrl('https://brand.com/cdn/shop/files/brand-logo.png'),
    ).toBe(true);
    expect(
      isLikelyNonProductImageUrl(
        'https://brand.com/cdn/shop/files/tee-size-chart.jpg',
      ),
    ).toBe(true);
    expect(
      isLikelyNonProductImageUrl(
        'https://brand.com/cdn/shop/files/product-img-5.jpg',
        'Size Guide measurements table',
      ),
    ).toBe(true);
    expect(
      isLikelyNonProductImageUrl(
        'https://brand.com/cdn/shop/files/summer-promo-banner.jpg',
      ),
    ).toBe(true);
    expect(
      isLikelyNonProductImageUrl(
        'https://brand.com/cdn/shop/files/black-swatch.png',
      ),
    ).toBe(true);

    // Genuine product names that contain substrings like "icon" or "flag" must NOT be blocked
    expect(
      isLikelyNonProductImageUrl(
        'https://brand.com/cdn/shop/files/iconic-boxy-tee-front.jpg',
        'Iconic Boxy Tee',
      ),
    ).toBe(false);
    expect(
      isLikelyNonProductImageUrl(
        'https://brand.com/cdn/shop/files/flagship-heavyweight-hoodie.jpg',
        'Flagship Heavyweight Hoodie',
      ),
    ).toBe(false);
  });

  it('strips header, nav, footer, and related-product sections before fallback HTML scanning', () => {
    const html = `
      <header><img src="/img/nav-promo.jpg" /></header>
      <main>
        <div class="product-gallery"><img src="/products/tee-1.jpg" alt="Boxy Tee" /></div>
        <section class="related-products"><img src="/products/other-pants.jpg" /></section>
      </main>
      <footer><img src="/img/footer-badge.png" /></footer>
    `;
    const stripped = stripNonProductHtmlSections(html);
    expect(stripped).toContain('/products/tee-1.jpg');
    expect(stripped).not.toContain('nav-promo.jpg');
    expect(stripped).not.toContain('other-pants.jpg');
    expect(stripped).not.toContain('footer-badge.png');
  });

  it('reads PNG dimensions and rejects tiny swatches and ultra-wide banners', () => {
    const goodProduct = readImageDimensions(makePngHeader(1200, 1500));
    expect(goodProduct).toEqual({ width: 1200, height: 1500 });
    expect(isAcceptableProductDimensions(goodProduct)).toBe(true);

    const tinySwatch = readImageDimensions(makePngHeader(120, 120));
    expect(isAcceptableProductDimensions(tinySwatch)).toBe(false);

    const wideBanner = readImageDimensions(makePngHeader(1800, 400));
    expect(isAcceptableProductDimensions(wideBanner)).toBe(false);
  });

  it('computes 64-bit Hamming distance accurately for dHash dedupe', () => {
    expect(hammingDistance64('101010'.padEnd(64, '0'), '101010'.padEnd(64, '0'))).toBe(0);
    expect(hammingDistance64('101010'.padEnd(64, '0'), '101001'.padEnd(64, '0'))).toBe(2);
    expect(hammingDistance64('0'.repeat(64), '1'.repeat(16) + '0'.repeat(48))).toBe(16);
  });
});
