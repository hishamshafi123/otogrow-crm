import {
  inspectKnowledgeAsset,
  knowledgeAssetBindingsSchema,
  knowledgeAssetDigest,
  knowledgeUploadSchema,
  KNOWLEDGE_ASSET_MAX_BYTES,
} from '../delivery-knowledge-assets.policy';

const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64',
);
const input = {
  name: 'Approved logo.png',
  size: image.length,
  sha256: knowledgeAssetDigest(image),
};

describe('approved knowledge file inputs', () => {
  it('detects a PNG from its bytes and preserves the exact digest', async () => {
    await expect(inspectKnowledgeAsset(input, image)).resolves.toBe(
      'image/png',
    );
  });
  it.each(['logo.pdf', 'logo.html', 'logo.svg'])(
    'rejects a mismatched extension %s',
    async (name) => {
      await expect(
        inspectKnowledgeAsset({ ...input, name }, image),
      ).rejects.toThrow('matching file extension');
    },
  );
  it('accepts an explicitly downloadable PDF', async () => {
    const bytes = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
    await expect(
      inspectKnowledgeAsset(
        {
          name: 'Guidelines.PDF',
          size: bytes.length,
          sha256: knowledgeAssetDigest(bytes),
        },
        bytes,
      ),
    ).resolves.toBe('application/pdf');
  });
  it('rejects HTML disguised as an image', async () => {
    const bytes = Buffer.from('<html><script>alert(1)</script></html>');
    await expect(
      inspectKnowledgeAsset(
        {
          name: 'logo.png',
          size: bytes.length,
          sha256: knowledgeAssetDigest(bytes),
        },
        bytes,
      ),
    ).rejects.toThrow('matching file extension');
  });
  it.each([
    { ...input, sha256: '0'.repeat(64) },
    { ...input, size: image.length + 1 },
  ])(
    'rejects changed bytes or an inaccurate declared size',
    async (invalid) => {
      await expect(inspectKnowledgeAsset(invalid, image)).rejects.toThrow(
        'selected size and SHA256',
      );
    },
  );
  it('rejects empty and oversized content before parsing it', async () => {
    for (const bytes of [
      Buffer.alloc(0),
      Buffer.alloc(KNOWLEDGE_ASSET_MAX_BYTES + 1),
    ]) {
      await expect(
        inspectKnowledgeAsset(
          { ...input, size: bytes.length, sha256: knowledgeAssetDigest(bytes) },
          bytes,
        ),
      ).rejects.toThrow('selected size and SHA256');
    }
  });
  it('requires unique bounded immutable file bindings', () => {
    const binding = {
      id: '01234567-89ab-4cde-8fab-0123456789ab',
      sha256: input.sha256,
    };
    expect(knowledgeAssetBindingsSchema.safeParse([binding]).success).toBe(
      true,
    );
    expect(
      knowledgeAssetBindingsSchema.safeParse([binding, binding]).success,
    ).toBe(false);
    expect(
      knowledgeAssetBindingsSchema.safeParse([
        { ...binding, sha256: 'changed' },
      ]).success,
    ).toBe(false);
    expect(
      knowledgeAssetBindingsSchema.safeParse(
        Array.from({ length: 11 }, (_, index) => ({
          ...binding,
          id: `01234567-89ab-4cde-8fab-${String(index).padStart(12, '0')}`,
        })),
      ).success,
    ).toBe(false);
  });
  it.each(['../logo.png', 'logo\\other.png', 'logo\n.png', 'logo\u0000.png'])(
    'rejects unsafe names %s',
    (name) => {
      expect(
        knowledgeUploadSchema.safeParse({
          requestId: '01234567-89ab-4cde-8fab-0123456789ab',
          projectId: '01234567-89ab-4cde-8fab-0123456789ac',
          sourceId: '01234567-89ab-4cde-8fab-0123456789ad',
          sourceRevision: 0,
          expectedCompanyId: null,
          ...input,
          name,
        }).success,
      ).toBe(false);
    },
  );
});
