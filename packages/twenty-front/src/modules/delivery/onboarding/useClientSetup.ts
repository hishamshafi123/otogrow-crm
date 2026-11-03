import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useQuery, useMutation } from '@apollo/client/react';
import {
  type DeliveryClientSetupQuery,
  type DeliveryClientSetupContextInput,
  type DeliveryClientSetupCreateInput,
  type CreateDeliveryClientSetupMutation,
  type DeliveryClientSetupReceiptQuery,
} from '~/generated-metadata/graphql';
import {
  GET_CLIENT_SETUP,
  CREATE_CLIENT_SETUP,
  GET_CLIENT_SETUP_RECEIPT,
} from '@/delivery/onboarding/delivery-client-setup.graphql';
import {
  type ClientSetupContext,
  type ClientSetupReceipt,
} from '@/delivery/onboarding/client-setup.types';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { useClientSetupRead } from '@/delivery/onboarding/useClientSetupRead';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';

export type ClientSetupCheck =
  | { kind: 'FOUND'; receipt: ClientSetupReceipt }
  | { kind: 'NOT_FOUND' }
  | { kind: 'UNAVAILABLE' };
export const useClientSetup = (
  input: DeliveryClientSetupContextInput,
  valid: boolean,
) => {
  const permission = useWorkflowAccess();
  const [locallyDenied, setLocallyDenied] = useState(false);
  const signature = permission.ready
    ? JSON.stringify({
        capabilities: [...(permission.access?.capabilities ?? [])].sort(),
        roles: [...(permission.access?.roleIds ?? [])].sort(),
        grants: permission.access?.grants,
      })
    : null;
  const [verified, setVerified] = useState({
    scope: permission.scope,
    signature: signature ?? '',
  });
  if (
    signature !== null &&
    (verified.scope !== permission.scope || verified.signature !== signature)
  )
    setVerified({ scope: permission.scope, signature });
  const authority = `${permission.scope}:${signature ?? (verified.scope === permission.scope ? verified.signature : '')}`;
  const source = `${authority}:${JSON.stringify(input)}`;
  const query = useQuery<DeliveryClientSetupQuery>(GET_CLIENT_SETUP, {
    variables: { input, identity: source },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
    skip: !valid || !permission.manager || locallyDenied,
  });
  const candidate = query.data?.deliveryClientSetup;
  const matches = (snapshot: ClientSetupContext) =>
    Boolean(
      permission.matches(snapshot) &&
      snapshot.companySearch === (input.companySearch ?? '').trim() &&
      (!input.companyId ||
        snapshot.selectedCompany === null ||
        snapshot.selectedCompany?.id === input.companyId) &&
      (!input.projectId ||
        snapshot.servicePlans.every(
          (plan) => plan.projectId === input.projectId,
        )),
    );
  const reading = useClientSetupRead({
    value: candidate,
    source,
    available: valid && permission.manager && !locallyDenied,
    matches,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
  });
  const [mutate] =
    useMutation<CreateDeliveryClientSetupMutation>(CREATE_CLIENT_SETUP);
  const [busy, setBusy] = useState(false);
  // oxlint-disable-next-line twenty/no-state-useref -- Late source reads must not publish another workspace's private setup evidence.
  const epoch = useRef(0);
  const denyAccess = useCallback(() => {
    epoch.current += 1;
    setLocallyDenied(true);
  }, []);
  const sourceDenied =
    Boolean(permission.denied) || isOtogrowAccessDenied(query.error);
  useLayoutEffect(() => {
    if (sourceDenied) denyAccess();
  }, [sourceDenied, denyAccess]);
  const beginAccessCheck = useFinanceExportRequestGuard(
    authority,
    valid && permission.ready && permission.manager,
  );
  const sourcesAvailable = Boolean(reading.data);
  useLayoutEffect(() => {
    epoch.current += 1;
    return () => {
      epoch.current += 1;
    };
  }, [authority, permission.ready, sourcesAvailable]);
  const create = async (
    prepared: DeliveryClientSetupCreateInput,
  ): Promise<ClientSetupReceipt | null> => {
    const opened = reading.data;
    const company = opened?.selectedCompany;
    if (
      !opened ||
      !company ||
      !permission.manager ||
      busy ||
      prepared.companyId !== company.id ||
      prepared.companySourceToken !== company.sourceToken
    )
      return null;
    const started = epoch.current;
    setBusy(true);
    try {
      const result = (await mutate({ variables: { input: prepared } })).data
        ?.createDeliveryClientSetup;
      if (
        started !== epoch.current ||
        !result ||
        result.workspaceId !== opened.workspaceId ||
        result.memberId !== opened.memberId ||
        result.userWorkspaceId !== opened.userWorkspaceId ||
        result.requestId !== prepared.requestId ||
        result.companyId !== prepared.companyId ||
        (prepared.projectId && result.projectId !== prepared.projectId) ||
        (prepared.engagementId && result.engagementId !== prepared.engagementId)
      )
        return null;
      return result;
    } catch (error) {
      if (started === epoch.current && isOtogrowAccessDenied(error))
        denyAccess();
      return null;
    } finally {
      setBusy(false);
    }
  };
  const check = async (requestId: string): Promise<ClientSetupCheck> => {
    if (!permission.manager || busy || locallyDenied)
      return { kind: 'UNAVAILABLE' };
    const started = epoch.current;
    setBusy(true);
    try {
      const response =
        await query.client.query<DeliveryClientSetupReceiptQuery>({
          query: GET_CLIENT_SETUP_RECEIPT,
          variables: { input: { requestId }, identity: authority },
          fetchPolicy: 'no-cache',
        });
      const receipt = response.data?.deliveryClientSetupReceipt;
      if (started !== epoch.current || !permission.manager)
        return { kind: 'UNAVAILABLE' };
      if (receipt === null) return { kind: 'NOT_FOUND' };
      if (
        !receipt ||
        !permission.matches(receipt) ||
        receipt.requestId !== requestId
      )
        return { kind: 'UNAVAILABLE' };
      return { kind: 'FOUND', receipt };
    } catch (error) {
      if (started === epoch.current && isOtogrowAccessDenied(error))
        denyAccess();
      return { kind: 'UNAVAILABLE' };
    } finally {
      setBusy(false);
    }
  };
  const checkCompany = async (id: string) => {
    if (!permission.manager || busy || locallyDenied)
      return { kind: 'UNAVAILABLE' as const };
    const started = epoch.current;
    setBusy(true);
    try {
      const response = await query.client.query<DeliveryClientSetupQuery>({
        query: GET_CLIENT_SETUP,
        variables: { input: { companyId: id }, identity: authority },
        fetchPolicy: 'no-cache',
      });
      const result = response.data?.deliveryClientSetup;
      if (started !== epoch.current || !result || !permission.matches(result))
        return { kind: 'UNAVAILABLE' as const };
      if (result.selectedCompany === null)
        return { kind: 'NOT_FOUND' as const };
      if (!result.selectedCompany || result.selectedCompany.id !== id)
        return { kind: 'UNAVAILABLE' as const };
      return { kind: 'FOUND' as const, company: result.selectedCompany };
    } catch (error) {
      if (started === epoch.current && isOtogrowAccessDenied(error))
        denyAccess();
      return { kind: 'UNAVAILABLE' as const };
    } finally {
      setBusy(false);
    }
  };
  const recheckAccess = async () => {
    if (!valid || !permission.ready || !permission.manager || busy)
      return false;
    const current = beginAccessCheck();
    setBusy(true);
    try {
      const response = await query.refetch();
      const result = response.data?.deliveryClientSetup;
      if (!current() || !result || !matches(result)) return false;
      setLocallyDenied(false);
      return true;
    } catch (error) {
      if (current() && isOtogrowAccessDenied(error)) denyAccess();
      return false;
    } finally {
      setBusy(false);
    }
  };
  return {
    ...reading,
    data: locallyDenied || sourceDenied ? null : reading.data,
    permission,
    source,
    authority,
    query,
    busy,
    create,
    check,
    checkCompany,
    denyAccess,
    recheckAccess,
    denied: locallyDenied || sourceDenied,
  };
};
