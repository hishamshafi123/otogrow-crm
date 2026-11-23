import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@lingui/core/macro';
import { FieldMetadataType } from 'twenty-shared/types';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { type RecordGqlFields } from '@/object-record/graphql/record-gql-fields/types/RecordGqlFields';
import { useDeliveryDraftStatus } from '@/delivery/drafts/DeliveryDraftGuard';

const PROFILE_FIELDS = {
  name: FieldMetadataType.TEXT,
  domainName: FieldMetadataType.LINKS,
  linkedinLink: FieldMetadataType.LINKS,
  address: FieldMetadataType.ADDRESS,
  description: FieldMetadataType.TEXT,
};

export const companyProfileValue = (
  record: Record<string, unknown>,
  path: string,
) => {
  const [field, child] = path.split('.');
  const value = child
    ? (record[field] as Record<string, unknown> | null)?.[child]
    : record[field];
  return typeof value === 'string' ? value : '';
};

export const useCompanyProfile = (
  companyId: string,
  onSaved?: () => void | Promise<unknown>,
) => {
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: 'company',
  });
  const permissions = useObjectPermissionsForObject(objectMetadataItem.id);
  const fields = objectMetadataItem.readableFields.filter(
    (field) =>
      field.isActive &&
      Object.entries(PROFILE_FIELDS).some(
        ([name, type]) => field.name === name && field.type === type,
      ) &&
      permissions.restrictedFields?.[field.id]?.canRead !== false,
  );
  const recordGqlFields: RecordGqlFields = { id: true };
  fields.forEach((field) => {
    recordGqlFields[field.name] = true;
  });
  const query = useFindOneRecord({
    objectNameSingular: 'company',
    objectRecordId: companyId,
    fetchPolicy: 'no-cache',
    recordGqlFields,
  });
  const { updateOneRecord } = useUpdateOneRecord();
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [baseline, setBaseline] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const authorityKey = JSON.stringify([
    companyId,
    permissions,
    fields.map((field) => [field.id, field.isUIEditable]),
  ]);
  const [draftAuthorityKey, setDraftAuthorityKey] = useState(authorityKey);
  if (draftAuthorityKey !== authorityKey) {
    setDraftAuthorityKey(authorityKey);
    setDraft(null);
    setBaseline({});
    setSaveError('');
    setMessage('');
  }
  const dirty =
    draft !== null &&
    Object.entries(draft).some(
      ([path, value]) => value !== companyProfileValue(baseline, path),
    );
  useDeliveryDraftStatus({ dirty, saving });
  const canEditField = useCallback(
    (name: string) =>
      permissions.canReadObjectRecords &&
      permissions.canUpdateObjectRecords &&
      !objectMetadataItem.isSystem &&
      fields.some(
        (field) =>
          field.name === name &&
          field.isUIEditable !== false &&
          permissions.restrictedFields?.[field.id]?.canUpdate !== false,
      ),
    [fields, objectMetadataItem.isSystem, permissions],
  );
  // The asynchronous fresh read must not retain permissions revoked while awaiting it.
  // oxlint-disable-next-line twenty/no-state-useref
  const currentCanEditField = useRef(canEditField);
  currentCanEditField.current = canEditField;
  useEffect(() => {
    currentCanEditField.current = canEditField;
    return () => {
      currentCanEditField.current = () => false;
    };
  }, [canEditField]);
  const beginEdit = () => {
    setBaseline(query.record ?? {});
    setDraft({});
    setMessage('');
    setSaveError('');
  };
  const cancel = () => {
    setDraft(null);
    setSaveError('');
  };
  const save = async () => {
    if (!draft || saving || !dirty) return;
    const changed = Object.entries(draft).filter(
      ([path, value]) => value !== companyProfileValue(baseline, path),
    );
    if (changed.some(([path]) => !canEditField(path.split('.')[0]))) {
      setSaveError(t`Your access changed. These changes cannot be saved.`);
      return;
    }
    if (changed.some(([path, value]) => path === 'name' && !value.trim())) {
      setSaveError(t`Enter a company name.`);
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const fresh = (await query.refetch()).data?.company;
      if (
        !fresh ||
        changed.some(
          ([path]) =>
            companyProfileValue(fresh, path) !==
            companyProfileValue(baseline, path),
        )
      ) {
        setSaveError(
          t`This profile changed elsewhere. Keep a copy of your edits, then cancel and reopen the editor to review the latest details.`,
        );
        return;
      }
      if (
        changed.some(
          ([path]) => !currentCanEditField.current(path.split('.')[0]),
        )
      ) {
        setSaveError(t`Your access changed. These changes cannot be saved.`);
        return;
      }
      const input: Record<string, unknown> = {};
      changed.forEach(([path, value]) => {
        const [field, child] = path.split('.');
        if (child) {
          const source = (input[field] ?? fresh[field] ?? {}) as Record<
            string,
            unknown
          >;
          const { __typename: _typename, ...siblings } = source;
          input[field] = { ...siblings, [child]: value };
        } else input[field] = value;
      });
      const saved = await updateOneRecord({
        objectNameSingular: 'company',
        idToUpdate: companyId,
        updateOneRecordInput: input,
        recordGqlFields,
      });
      if (
        !saved ||
        saved.id !== companyId ||
        changed.some(
          ([path, value]) => companyProfileValue(saved, path) !== value,
        )
      ) {
        setSaveError(
          t`We could not confirm the saved details. Your edits are kept. Reload the profile before trying again.`,
        );
        return;
      }
      if (
        changed.some(
          ([path]) => !currentCanEditField.current(path.split('.')[0]),
        )
      )
        return;
      setDraft(null);
      setBaseline({});
      setMessage(t`Company profile saved.`);
      try {
        await query.refetch();
        await onSaved?.();
      } catch {
        setMessage(
          t`Company profile saved. Refresh to load the latest details.`,
        );
      }
    } catch {
      setSaveError(
        t`We could not confirm the save. Your edits are kept. Check your connection and retry.`,
      );
    } finally {
      setSaving(false);
    }
  };
  return {
    ...query,
    fields,
    draft,
    saving,
    dirty,
    message,
    saveError,
    canRead: permissions.canReadObjectRecords,
    canEditField,
    beginEdit,
    cancel,
    save,
    setDraft,
    baseline,
  };
};
