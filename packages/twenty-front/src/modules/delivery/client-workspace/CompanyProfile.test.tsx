import { act, renderHook } from '@testing-library/react';
import { FieldMetadataType } from 'twenty-shared/types';
import { useCompanyProfile } from '@/delivery/client-workspace/useCompanyProfile';
const mockUpdate = jest.fn();
const mockRefetch = jest.fn();
const mockQuery = jest.fn();
const mockPermissions = {
  canReadObjectRecords: true,
  canUpdateObjectRecords: true,
  restrictedFields: {} as Record<
    string,
    { canRead?: boolean; canUpdate?: boolean }
  >,
};
const mockRecord = {
  id: 'client',
  name: 'Acme',
  domainName: {
    primaryLinkUrl: 'acme.test',
    primaryLinkLabel: 'Website',
    secondaryLinks: [{ url: 'other.test', label: 'Other' }],
  },
};
jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: {
      id: 'company',
      isSystem: false,
      readableFields: [
        {
          id: 'name',
          name: 'name',
          type: FieldMetadataType.TEXT,
          isActive: true,
        },
        {
          id: 'domain',
          name: 'domainName',
          type: FieldMetadataType.LINKS,
          isActive: true,
        },
        {
          id: 'phone',
          name: 'phones',
          type: FieldMetadataType.PHONES,
          isActive: true,
        },
      ],
    },
  }),
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => mockPermissions,
}));
jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: (options: unknown) => {
    mockQuery(options);
    return { record: mockRecord, refetch: mockRefetch };
  },
}));
jest.mock('@/object-record/hooks/useUpdateOneRecord', () => ({
  useUpdateOneRecord: () => ({ updateOneRecord: mockUpdate }),
}));
jest.mock('@/delivery/drafts/DeliveryDraftGuard', () => ({
  useDeliveryDraftStatus: jest.fn(),
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions.restrictedFields = {};
  mockPermissions.canUpdateObjectRecords = true;
  mockRefetch.mockResolvedValue({ data: { company: mockRecord } });
  mockUpdate.mockImplementation(
    async ({
      updateOneRecordInput,
    }: {
      updateOneRecordInput: Record<string, unknown>;
    }) => ({ ...mockRecord, ...updateOneRecordInput }),
  );
});
it('reads only permitted profile fields and never phones', () => {
  mockPermissions.restrictedFields = { domain: { canRead: false } };
  const { result } = renderHook(() => useCompanyProfile('client'));
  expect(mockQuery).toHaveBeenLastCalledWith(
    expect.objectContaining({ recordGqlFields: { id: true, name: true } }),
  );
  expect(result.current.canEditField('domainName')).toBe(false);
});
it('saves changed fields while preserving link siblings', async () => {
  const { result } = renderHook(() => useCompanyProfile('client'));
  act(() => result.current.beginEdit());
  act(() =>
    result.current.setDraft({ 'domainName.primaryLinkUrl': 'new.test' }),
  );
  await act(() => result.current.save());
  expect(mockUpdate).toHaveBeenCalledWith(
    expect.objectContaining({
      updateOneRecordInput: {
        domainName: { ...mockRecord.domainName, primaryLinkUrl: 'new.test' },
      },
    }),
  );
  expect(result.current.draft).toBeNull();
});
it('keeps drafts instead of overwriting concurrent edits', async () => {
  const { result } = renderHook(() => useCompanyProfile('client'));
  act(() => result.current.beginEdit());
  act(() => result.current.setDraft({ name: 'New name' }));
  mockRefetch.mockResolvedValue({
    data: { company: { ...mockRecord, name: 'Concurrent name' } },
  });
  await act(() => result.current.save());
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(result.current.draft).toEqual({ name: 'New name' });
});
it('prevents writes when update access is revoked', async () => {
  const { result, rerender } = renderHook(() => useCompanyProfile('client'));
  act(() => result.current.beginEdit());
  act(() => result.current.setDraft({ name: 'New name' }));
  mockPermissions.restrictedFields = { name: { canUpdate: false } };
  rerender();
  await act(() => result.current.save());
  expect(mockUpdate).not.toHaveBeenCalled();
});
it('retains the draft after a failed save', async () => {
  mockUpdate.mockRejectedValue(new Error('Offline'));
  const { result } = renderHook(() => useCompanyProfile('client'));
  act(() => result.current.beginEdit());
  act(() => result.current.setDraft({ name: 'New name' }));
  await act(() => result.current.save());
  expect(result.current.draft).toEqual({ name: 'New name' });
  expect(result.current.dirty).toBe(true);
});

it('clears private draft and baseline when field read access changes', () => {
  const { result, rerender } = renderHook(() => useCompanyProfile('client'));
  act(() => result.current.beginEdit());
  act(() => result.current.setDraft({ name: 'Private draft' }));
  mockPermissions.restrictedFields = { name: { canRead: false } };
  rerender();
  expect(result.current.draft).toBeNull();
  expect(result.current.baseline).toEqual({});
});
it.each([
  null,
  { id: 'another-client', name: 'New name' },
  { id: 'client', name: 'Unexpected name' },
])(
  'keeps edits when save response does not confirm exact values: %p',
  async (receipt) => {
    mockUpdate.mockResolvedValue(receipt);
    const { result } = renderHook(() => useCompanyProfile('client'));
    act(() => result.current.beginEdit());
    act(() => result.current.setDraft({ name: 'New name' }));
    await act(() => result.current.save());
    expect(result.current.draft).toEqual({ name: 'New name' });
    expect(result.current.message).toBe('');
  },
);
it('preserves confirmed save status if directory refresh fails', async () => {
  const refresh = jest.fn().mockRejectedValue(new Error('Offline'));
  const { result } = renderHook(() => useCompanyProfile('client', refresh));
  act(() => result.current.beginEdit());
  act(() => result.current.setDraft({ name: 'New name' }));
  await act(() => result.current.save());
  expect(refresh).toHaveBeenCalled();
  expect(result.current.draft).toBeNull();
  expect(result.current.message).toContain('saved');
});
it('uses a fresh uncached native record read', () => {
  renderHook(() => useCompanyProfile('client'));
  expect(mockQuery).toHaveBeenLastCalledWith(
    expect.objectContaining({ fetchPolicy: 'no-cache' }),
  );
});
it('does not start a mutation after its authority boundary unmounts', async () => {
  let resolveRead: (value: unknown) => void = () => undefined;
  mockRefetch.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
  );
  const { result, unmount } = renderHook(() => useCompanyProfile('client'));
  act(() => result.current.beginEdit());
  act(() => result.current.setDraft({ name: 'New name' }));
  let pendingSave: Promise<void> = Promise.resolve();
  act(() => {
    pendingSave = result.current.save();
  });
  unmount();
  await act(async () => {
    resolveRead({ data: { company: mockRecord } });
    await pendingSave;
  });
  expect(mockUpdate).not.toHaveBeenCalled();
});
