import { useCallback, useLayoutEffect, useState } from 'react';
import { useApolloClient, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { isCreativeLearningSourceLost } from '@/delivery/creative/learning/useCreativeLearningAccess';
import { type CreativeLearningCommandAccess } from '@/delivery/creative/learning/useCreativeLearningCommands';
import {
  GET_LEARNING_LINKS,
  GET_LEARNING_LINK,
  GET_LEARNING_STATE,
} from '@/delivery/creative/learning/delivery-creative-learning.graphql';
import { type CreativeLessonSelection } from '@/delivery/creative/learning/creative-lesson-evidence';
import { CreativeLearningEvidence } from '@/delivery/creative/learning/CreativeLearningEvidence';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
import {
  type DeliveryCreativeAdLinksQuery,
  type DeliveryCreativeAdLinkQuery,
  type DeliveryCreativeAdLinkStateQuery,
} from '~/generated-metadata/graphql';
type CreativeLessonEvidencePickerProps = {
  state: CreativeLearningCommandAccess;
  projectId: string;
  items: CreativeLessonSelection[];
  onChange: (items: CreativeLessonSelection[]) => void;
  onReady: (ready: boolean) => void;
  enabled: boolean;
  onDenied: () => void;
};
export const CreativeLessonEvidencePicker = ({
  state,
  projectId,
  items,
  onChange,
  onReady,
  enabled,
  onDenied,
}: CreativeLessonEvidencePickerProps) => {
  const { t } = useLingui();
  const client = useApolloClient();
  const [after, setAfter] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [verified, setVerified] = useState<Record<string, boolean>>({});
  const input = {
    projectId,
    status: 'REVIEWED',
    assetId: null,
    afterId: after,
  };
  const source = `${state.source}:lesson:${JSON.stringify(input)}`;
  const query = useQuery<DeliveryCreativeAdLinksQuery>(GET_LEARNING_LINKS, {
    variables: { input, identity: source },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    skip: !enabled,
  });
  const reading = useAssistantRead({
    value: query.data?.deliveryCreativeAdLinks,
    source,
    enabled,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: state.matches,
  });
  useLayoutEffect(() => {
    if (isCreativeLearningSourceLost(query.error)) onDenied();
  }, [query.error, onDenied]);
  const changedValidity = useCallback(
    (id: string, ready: boolean) =>
      setVerified((value) =>
        value[id] === ready ? value : { ...value, [id]: ready },
      ),
    [],
  );
  const ready =
    items.length > 0 &&
    items.every((item) => verified[item.id] === true) &&
    !busy;
  useLayoutEffect(() => onReady(ready), [ready, onReady]);
  const choose = async (id: string) => {
    if (
      !enabled ||
      busy ||
      items.length >= 5 ||
      items.some((item) => item.id === id)
    )
      return;
    setBusy(true);
    setError('');
    const current = state.capture();
    try {
      const value = (
        await client.query<DeliveryCreativeAdLinkQuery>({
          query: GET_LEARNING_LINK,
          variables: { input: { id }, identity: `${source}:${id}` },
          fetchPolicy: 'no-cache',
        })
      ).data?.deliveryCreativeAdLink;
      if (!current()) return;
      if (
        !value ||
        !state.matches(value) ||
        value.link.id !== id ||
        value.body.projectId !== projectId ||
        value.link.state !== 'REVIEWED' ||
        value.link.correctedById ||
        !value.sourceCurrent ||
        value.link.reviewedVersion !== value.selectedVersion
      ) {
        setError(
          t`This association is no longer current reviewed evidence. Choose another or refresh its source.`,
        );
        return;
      }
      onChange([
        ...items,
        {
          id,
          version: value.selectedVersion,
          fingerprint: value.link.fingerprint,
          body: value.body,
          title: `${value.link.adName} · ${value.link.taskTitle}`,
        },
      ]);
    } catch (caught) {
      if (!current()) return;
      if (isCreativeLearningSourceLost(caught)) onDenied();
      else
        setError(
          t`This evidence could not be checked. Your selected evidence and notes are kept.`,
        );
    } finally {
      if (current()) setBusy(false);
    }
  };
  return (
    <StyledDeliveryStack>
      <h4>
        <Trans>Reviewed evidence — up to five separate observations</Trans>
      </h4>
      <p>
        <Trans>
          The first association remains this lesson’s anchor. Choose additional
          reviewed observations explicitly; reporting windows and ad spend are
          never added together.
        </Trans>
      </p>
      {error && <p role="alert">{error}</p>}
      {items.map((item, index) => (
        <div
          key={item.id}
          data-learning-evidence={item.id}
          data-learning-fingerprint={item.fingerprint}
        >
          <CreativeLessonEvidenceState
            state={state}
            item={item}
            enabled={enabled}
            onReady={changedValidity}
            onDenied={onDenied}
          />
          <details hidden={verified[item.id] !== true}>
            <summary>
              {item.title} · {item.body.source.fromDate} –{' '}
              {item.body.source.throughDate}
            </summary>
            <CreativeLearningEvidence body={item.body} />
          </details>
          {index > 0 && (
            <StyledDeliveryButton
              type="button"
              disabled={!enabled || busy}
              onClick={() =>
                onChange(items.filter((selected) => selected.id !== item.id))
              }
            >
              <Trans>Remove this observation</Trans>
            </StyledDeliveryButton>
          )}
        </div>
      ))}
      <details>
        <summary>
          <Trans>Choose more reviewed observations</Trans>
        </summary>
        <StyledDeliveryStack>
          {reading.data ? (
            <>
              <p>{t`Showing ${reading.data.items.length} of ${reading.data.totalCount} reviewed associations.`}</p>
              {reading.data.items.map((item) => (
                <StyledDeliveryButton
                  type="button"
                  key={item.id}
                  disabled={
                    !enabled ||
                    busy ||
                    items.length >= 5 ||
                    items.some((selected) => selected.id === item.id) ||
                    Boolean(item.correctedById)
                  }
                  onClick={() => void choose(item.id)}
                >
                  {item.adName} · {item.taskTitle} · {item.fromDate} –{' '}
                  {item.throughDate}
                  {items.some((selected) => selected.id === item.id)
                    ? ` · ${t`Selected`}`
                    : item.correctedById
                      ? ` · ${t`Corrected`}`
                      : ''}
                </StyledDeliveryButton>
              ))}
              <StyledDeliveryRow>
                {after && (
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => setAfter(null)}
                  >
                    <Trans>First reviewed observations</Trans>
                  </StyledDeliveryButton>
                )}
                {reading.data.nextCursor && (
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => setAfter(reading.data?.nextCursor ?? null)}
                  >
                    <Trans>More reviewed observations</Trans>
                  </StyledDeliveryButton>
                )}
              </StyledDeliveryRow>
            </>
          ) : (
            <p role={query.error ? 'alert' : 'status'}>
              {query.error
                ? t`Reviewed observations could not be checked. Your selection and lesson are kept.`
                : t`Loading reviewed observations…`}
            </p>
          )}
          <StyledDeliveryButton
            type="button"
            disabled={!enabled || busy}
            onClick={() => void query.refetch().catch(() => undefined)}
          >
            <Trans>Refresh reviewed choices</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryStack>
      </details>
    </StyledDeliveryStack>
  );
};
const CreativeLessonEvidenceState = ({
  state,
  item,
  enabled,
  onReady,
  onDenied,
}: {
  state: CreativeLearningCommandAccess;
  item: CreativeLessonSelection;
  enabled: boolean;
  onReady: (id: string, ready: boolean) => void;
  onDenied: () => void;
}) => {
  const source = `${state.source}:lesson-selected:${item.id}:${item.fingerprint}`;
  const query = useQuery<DeliveryCreativeAdLinkStateQuery>(GET_LEARNING_STATE, {
    variables: { input: { id: item.id }, identity: source },
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
    notifyOnNetworkStatusChange: true,
    skip: !enabled,
  });
  const reading = useAssistantRead({
    value: query.data?.deliveryCreativeAdLinkState,
    source,
    enabled,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) => state.matches(value) && value.link.id === item.id,
  });
  const ready =
    reading.data !== null &&
    reading.data.link.state === 'REVIEWED' &&
    !reading.data.link.correctedById &&
    reading.data.link.fingerprint === item.fingerprint &&
    reading.data.link.reviewedVersion === item.version &&
    reading.data.sourceCurrent;
  useLayoutEffect(() => {
    if (isCreativeLearningSourceLost(query.error)) onDenied();
  }, [query.error, onDenied]);
  useLayoutEffect(() => onReady(item.id, ready), [item.id, ready, onReady]);
  return ready ? (
    <p role="status">
      <Trans>Selected reviewed evidence is current.</Trans>
    </p>
  ) : (
    <p role={query.error ? 'alert' : 'status'}>
      <Trans>
        This selected observation is unverified or changed. Your lesson is kept;
        refresh or remove the changed observation before recording.
      </Trans>
      <StyledDeliveryButton
        type="button"
        disabled={!enabled}
        onClick={() => void query.refetch().catch(() => undefined)}
      >
        <Trans>Check selected observation</Trans>
      </StyledDeliveryButton>
    </p>
  );
};
