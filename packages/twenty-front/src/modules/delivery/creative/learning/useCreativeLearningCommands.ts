import { useRef, useState } from 'react';
import { useApolloClient, useMutation } from '@apollo/client/react';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { useLingui } from '@lingui/react/macro';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { type useCreativeLearningAccess } from '@/delivery/creative/learning/useCreativeLearningAccess';
import {
  type CreativeLearningCommand,
  type CreativeLearningReceipt,
} from '@/delivery/creative/learning/creative-learning.types';
import {
  GET_LEARNING_PREVIEW,
  GET_LEARNING_RECEIPT,
  SAVE_LEARNING_LINK,
  DECIDE_LEARNING_LINK,
  SAVE_CREATIVE_LESSON,
} from '@/delivery/creative/learning/delivery-creative-learning.graphql';
import {
  type DeliveryCreativeAdLinkPreviewQuery,
  type DeliveryCreativeAdLinkPreviewInput,
  type DeliveryCreativeLearningReceiptQuery,
  type SaveDeliveryCreativeAdLinkMutation,
  type DecideDeliveryCreativeAdLinkMutation,
  type RecordDeliveryCreativeLessonMutation,
} from '~/generated-metadata/graphql';
import {
  creativeLearningCommandHash,
  normalizeCreativeLearningCommand,
} from '@/delivery/creative/learning/creative-learning-command';
export type CreativeLearningCommandAccess = Pick<
  ReturnType<typeof useCreativeLearningAccess>,
  'source' | 'capture' | 'matches'
>;
export const useCreativeLearningCommands = ({
  state,
  scope,
  enabled,
  onDenied,
}: {
  state: CreativeLearningCommandAccess;
  scope: string;
  enabled: boolean;
  onDenied: () => void;
}) => {
  const { t } = useLingui();
  const client = useApolloClient();
  const refreshHistory = () => {
    void client
      .refetchQueries({
        include: ['DeliveryCreativeAdLinks', 'DeliveryCreativeLessons'],
      })
      .catch(() => undefined);
  };
  const [save] =
      useMutation<SaveDeliveryCreativeAdLinkMutation>(SAVE_LEARNING_LINK),
    [decide] =
      useMutation<DecideDeliveryCreativeAdLinkMutation>(DECIDE_LEARNING_LINK),
    [lesson] =
      useMutation<RecordDeliveryCreativeLessonMutation>(SAVE_CREATIVE_LESSON);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  // oxlint-disable-next-line twenty/no-state-useref -- Same-turn commands share one transport boundary and must never allocate a competing receipt.
  const pending = useRef(false);
  const begin = useFinanceExportRequestGuard(
    `${state.source}:${scope}`,
    enabled,
  );
  const currentRequest = () => {
    const current = begin(),
      source = state.capture();
    return () => current() && source();
  };
  const fail = (caught: unknown, current: () => boolean) => {
    if (!current()) return;
    if (isOtogrowAccessDenied(caught)) onDenied();
    else
      setError(
        caught instanceof Error
          ? caught.message
          : t`The saved result could not be verified.`,
      );
  };
  const preview = async (input: DeliveryCreativeAdLinkPreviewInput) => {
    if (!enabled || pending.current) return null;
    pending.current = true;
    setBusy(true);
    setError('');
    const current = currentRequest();
    try {
      const value = (
        await client.query<DeliveryCreativeAdLinkPreviewQuery>({
          query: GET_LEARNING_PREVIEW,
          variables: { input },
          fetchPolicy: 'no-cache',
        })
      ).data?.deliveryCreativeAdLinkPreview;
      return current() &&
        value &&
        state.matches(value) &&
        value.body.projectId === input.projectId &&
        value.body.sourceId === input.sourceId &&
        value.body.adId === input.adId &&
        value.body.taskId === input.taskId &&
        value.body.assetId === input.assetId &&
        value.body.submissionVersion === input.submissionVersion
        ? value
        : null;
    } catch (caught) {
      fail(caught, current);
      return null;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const check = async (
    requestId: string,
    expectedCommand?: CreativeLearningCommand,
  ) => {
    if (!enabled || pending.current) return { kind: 'UNKNOWN' as const };
    pending.current = true;
    setBusy(true);
    setError('');
    const current = currentRequest();
    try {
      const expectedHash = expectedCommand
        ? await creativeLearningCommandHash(expectedCommand)
        : null;
      if (!current()) return { kind: 'UNKNOWN' as const };
      const value = (
        await client.query<DeliveryCreativeLearningReceiptQuery>({
          query: GET_LEARNING_RECEIPT,
          variables: { input: { requestId } },
          fetchPolicy: 'no-cache',
        })
      ).data?.deliveryCreativeLearningReceipt;
      if (
        current() &&
        value &&
        state.matches(value) &&
        value.receipt.requestId === requestId
      ) {
        if (expectedHash !== null && value.inputHash !== expectedHash)
          return { kind: 'CONFLICT' as const };
        refreshHistory();
        return { kind: 'FOUND' as const, receipt: value };
      }
      return { kind: 'UNKNOWN' as const };
    } catch (caught) {
      fail(caught, current);
      return {
        kind:
          current() &&
          CombinedGraphQLErrors.is(caught) &&
          caught.errors.some((item) => item.extensions?.code === 'NOT_FOUND')
            ? ('NOT_FOUND' as const)
            : ('UNKNOWN' as const),
      };
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const execute = async (
    candidate: CreativeLearningCommand,
  ): Promise<
    | { kind: 'FOUND'; receipt: CreativeLearningReceipt }
    | { kind: 'UNKNOWN' }
    | { kind: 'REJECTED' | 'CONFLICT'; message: string }
  > => {
    if (!enabled || pending.current) return { kind: 'UNKNOWN' };
    pending.current = true;
    setBusy(true);
    setError('');
    const current = currentRequest();
    const command = normalizeCreativeLearningCommand(candidate);
    let dispatchStarted = false;
    try {
      const expectedHash = await creativeLearningCommandHash(command);
      if (!current()) return { kind: 'UNKNOWN' };
      dispatchStarted = true;
      const value =
        command.kind === 'SAVE'
          ? (await save({ variables: { input: command.input } })).data
              ?.saveDeliveryCreativeAdLink
          : command.kind === 'DECIDE'
            ? (await decide({ variables: { input: command.input } })).data
                ?.decideDeliveryCreativeAdLink
            : (await lesson({ variables: { input: command.input } })).data
                ?.recordDeliveryCreativeLesson;
      const expectedAction =
        command.kind === 'SAVE'
          ? 'SAVE'
          : command.kind === 'LESSON'
            ? 'LESSON'
            : command.input.action;
      const expectedLink =
        command.kind === 'LESSON' ? command.input.linkIds[0] : command.input.id;
      if (
        !current() ||
        !value ||
        !state.matches(value) ||
        value.inputHash !== expectedHash ||
        value.receipt.requestId !== command.input.requestId ||
        value.receipt.action !== expectedAction ||
        value.receipt.linkId !== expectedLink ||
        (command.kind === 'LESSON' &&
          value.receipt.lessonId !== command.input.id)
      )
        return { kind: 'UNKNOWN' };
      refreshHistory();
      return { kind: 'FOUND', receipt: value };
    } catch (caught) {
      fail(caught, current);
      if (current() && !dispatchStarted)
        return {
          kind: 'REJECTED',
          message: t`This browser could not verify the submitted preparation. No request was sent. Keep your notes and try again in a supported browser.`,
        };
      if (current() && CombinedGraphQLErrors.is(caught)) {
        const rejection = caught.errors.find((item) =>
          ['BAD_USER_INPUT', 'CONFLICT'].includes(
            String(item.extensions?.code),
          ),
        );
        if (rejection)
          return {
            kind:
              rejection.extensions?.code === 'CONFLICT'
                ? 'CONFLICT'
                : 'REJECTED',
            message: rejection.message,
          };
      }
      return { kind: 'UNKNOWN' };
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return { preview, check, execute, busy, error };
};
