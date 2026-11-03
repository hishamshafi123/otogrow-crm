import { useLayoutEffect, useRef, useState } from 'react';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { type useClientSetup } from '@/delivery/onboarding/useClientSetup';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';

export const useSetupCompanyCreation = (
  state: ReturnType<typeof useClientSetup>,
) => {
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: 'company',
  });
  const objectPermission = useObjectPermissionsForObject(objectMetadataItem.id);
  const { createOneRecord } = useCreateOneRecord({
    objectNameSingular: 'company',
    recordGqlFields: { id: true, name: true },
  });
  const allowed =
    state.permission.manager &&
    objectPermission.canReadObjectRecords &&
    objectPermission.canUpdateObjectRecords;
  const [busy, setBusy] = useState(false);
  // oxlint-disable-next-line twenty/no-state-useref -- A late native response cannot publish into a changed identity or permission scope.
  const epoch = useRef(0);
  useLayoutEffect(() => {
    epoch.current += 1;
    return () => {
      epoch.current += 1;
    };
  }, [state.authority, allowed]);
  const create = async (input: { id: string; name: string }) => {
    if (!allowed || busy) return { kind: 'UNAVAILABLE' as const };
    const started = epoch.current;
    setBusy(true);
    try {
      await createOneRecord({ id: input.id, name: input.name });
    } catch (error) {
      if (started === epoch.current && isOtogrowAccessDenied(error)) {
        state.denyAccess();
        return { kind: 'UNAVAILABLE' as const };
      }
      // Native optimistic data is not evidence that the company was committed.
    } finally {
      setBusy(false);
    }
    if (started !== epoch.current) return { kind: 'UNAVAILABLE' as const };
    return state.checkCompany(input.id);
  };
  return { allowed, busy, create };
};
