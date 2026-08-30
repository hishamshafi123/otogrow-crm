import { gql } from '@apollo/client';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { t } from '@lingui/core/macro';
import { useCallback, useEffect, useState } from 'react';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { isDefined } from 'twenty-shared/utils';

export type PortalAccess = {
  id: string;
  companyId: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  isActive: boolean;
};

export type PortalAccessWithToken = PortalAccess & { token: string };

const PORTAL_ACCESS_FOR_COMPANY = gql`
  query PortalAccessForCompany($companyId: UUID!) {
    portalAccessForCompany(companyId: $companyId) {
      id
      companyId
      createdAt
      expiresAt
      revokedAt
      isActive
    }
  }
`;

const GENERATE_PORTAL_ACCESS = gql`
  mutation GeneratePortalAccess($companyId: UUID!) {
    generatePortalAccess(companyId: $companyId) {
      id
      companyId
      createdAt
      expiresAt
      revokedAt
      isActive
      token
    }
  }
`;

const REVOKE_PORTAL_ACCESS = gql`
  mutation RevokePortalAccess($id: UUID!) {
    revokePortalAccess(id: $id) {
      id
      companyId
      createdAt
      expiresAt
      revokedAt
      isActive
    }
  }
`;

const REGENERATE_PORTAL_ACCESS = gql`
  mutation RegeneratePortalAccess($id: UUID!) {
    regeneratePortalAccess(id: $id) {
      id
      companyId
      createdAt
      expiresAt
      revokedAt
      isActive
      token
    }
  }
`;

// Portal mutations are core-schema (@CoreResolver) operations, so they must
// go through the core Apollo client — the default client targets /metadata.
export const usePortalAccess = ({ companyId }: { companyId: string }) => {
  const apolloCoreClient = useApolloCoreClient();
  const [portalAccess, setPortalAccess] = useState<PortalAccess | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);

  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();

  const refetch = useCallback(async () => {
    try {
      const result = await apolloCoreClient.query<{
        portalAccessForCompany: PortalAccess | null;
      }>({
        query: PORTAL_ACCESS_FOR_COMPANY,
        variables: { companyId },
        fetchPolicy: 'network-only',
      });

      setPortalAccess(result.data?.portalAccessForCompany ?? null);
    } catch (error) {
      enqueueErrorSnackBar({
        ...(CombinedGraphQLErrors.is(error) ? { apolloError: error } : {}),
      });
    } finally {
      setIsLoading(false);
    }
  }, [apolloCoreClient, companyId, enqueueErrorSnackBar]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const generate = async (): Promise<PortalAccessWithToken | null> => {
    setIsMutating(true);

    try {
      const result = await apolloCoreClient.mutate<{
        generatePortalAccess: PortalAccessWithToken;
      }>({
        mutation: GENERATE_PORTAL_ACCESS,
        variables: { companyId },
      });
      const generated = result.data?.generatePortalAccess;

      if (!isDefined(generated)) {
        throw new Error('No portal access returned');
      }

      setPortalAccess(generated);

      return generated;
    } catch (error) {
      enqueueErrorSnackBar({
        ...(CombinedGraphQLErrors.is(error) ? { apolloError: error } : {}),
      });

      return null;
    } finally {
      setIsMutating(false);
    }
  };

  const revoke = async (): Promise<boolean> => {
    if (!isDefined(portalAccess)) {
      return false;
    }

    setIsMutating(true);

    try {
      const result = await apolloCoreClient.mutate<{
        revokePortalAccess: PortalAccess;
      }>({
        mutation: REVOKE_PORTAL_ACCESS,
        variables: { id: portalAccess.id },
      });

      setPortalAccess(result.data?.revokePortalAccess ?? null);
      enqueueSuccessSnackBar({ message: t`Portal link revoked` });

      return true;
    } catch (error) {
      enqueueErrorSnackBar({
        ...(CombinedGraphQLErrors.is(error) ? { apolloError: error } : {}),
      });

      return false;
    } finally {
      setIsMutating(false);
    }
  };

  const regenerate = async (): Promise<PortalAccessWithToken | null> => {
    if (!isDefined(portalAccess)) {
      return null;
    }

    setIsMutating(true);

    try {
      const result = await apolloCoreClient.mutate<{
        regeneratePortalAccess: PortalAccessWithToken;
      }>({
        mutation: REGENERATE_PORTAL_ACCESS,
        variables: { id: portalAccess.id },
      });
      const regenerated = result.data?.regeneratePortalAccess;

      if (!isDefined(regenerated)) {
        throw new Error('No portal access returned');
      }

      setPortalAccess(regenerated);

      return regenerated;
    } catch (error) {
      enqueueErrorSnackBar({
        ...(CombinedGraphQLErrors.is(error) ? { apolloError: error } : {}),
      });

      return null;
    } finally {
      setIsMutating(false);
    }
  };

  return { portalAccess, isLoading, isMutating, generate, revoke, regenerate };
};
