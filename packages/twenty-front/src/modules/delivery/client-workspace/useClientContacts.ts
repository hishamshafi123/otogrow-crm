import { useQuery } from '@apollo/client/react';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useFindManyRecordsQuery } from '@/object-record/hooks/useFindManyRecordsQuery';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { useAssistantAccess } from '@/delivery/assistants/useAssistantAccess';
import { isValidUuid } from 'twenty-shared/utils';

type ClientContact = {
  id: string;
  companyId: string;
  name?: { firstName?: string; lastName?: string };
  emails?: { primaryEmail?: string };
  jobTitle?: string;
};
type ClientContactsResult = {
  people: {
    edges: { node: ClientContact }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

export const useClientContactsAccess = () => {
  const { permission, source } = useAssistantAccess();
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: 'person',
  });
  const native = useObjectPermissionsForObject(objectMetadataItem.id);
  const canReadField = (name: string) => {
    const fieldMetadata = objectMetadataItem.fields.find(
      (field) => field.name === name,
    );
    return (
      fieldMetadata !== undefined &&
      native.restrictedFields[fieldMetadata.id]?.canRead !== false
    );
  };
  return {
    source: `${source}:${JSON.stringify(native)}`,
    allowed:
      permission.manager &&
      native.canReadObjectRecords &&
      canReadField('company'),
    fields: {
      id: true,
      companyId: true,
      name: canReadField('name'),
      emails: canReadField('emails'),
      jobTitle: canReadField('jobTitle'),
    },
  };
};

export const useClientContacts = (
  companyId: string,
  after: string | null,
  access: ReturnType<typeof useClientContactsAccess>,
) => {
  const client = useApolloCoreClient();
  const { findManyRecordsQuery } = useFindManyRecordsQuery({
    objectNameSingular: 'person',
    recordGqlFields: access.fields,
    computeReferences: false,
  });
  const allowed = access.allowed && isValidUuid(companyId);
  const query = useQuery<ClientContactsResult>(findManyRecordsQuery, {
    client,
    variables: {
      filter: { companyId: { eq: companyId } },
      orderBy: [{ id: 'AscNullsFirst' }],
      limit: 25,
      lastCursor: after ?? undefined,
      identity: access.source,
    },
    skip: !allowed,
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
  });
  const candidate = query.data?.people;
  const available =
    allowed &&
    !query.loading &&
    !query.error &&
    candidate?.edges.every(({ node }) => node.companyId === companyId);
  return {
    allowed,
    loading: query.loading,
    error: query.error,
    data: available ? candidate : null,
    refetch: query.refetch,
  };
};
