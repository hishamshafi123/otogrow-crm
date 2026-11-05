import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { GET_CONTENT_ASSETS } from '@/delivery/content/delivery-content.graphql';
import {
  type ContentBody,
  type ContentAsset,
} from '@/delivery/content/content.types';
import { type useContentAccess } from '@/delivery/content/useContentAccess';
import { useContentRead } from '@/delivery/content/useContentRead';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type DeliveryContentAssetChoicesQuery } from '~/generated-metadata/graphql';

export const ContentAssetPicker = ({
  access,
  projectId,
  value,
  snapshot,
  onSelect,
  onDenied,
  enabled,
}: {
  access: ReturnType<typeof useContentAccess>;
  projectId: string;
  value: ContentBody['asset'];
  snapshot?: ContentAsset | null;
  onSelect: (asset: ContentBody['asset']) => void;
  onDenied: () => void;
  enabled: boolean;
}) => {
  const { t } = useLingui();
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [afterTaskId, setAfterTaskId] = useState<string | null>(null);
  const query = useQuery<DeliveryContentAssetChoicesQuery>(GET_CONTENT_ASSETS, {
    variables: { input: { projectId, search, afterTaskId } },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    skip: !enabled,
  });
  const read = useContentRead({
    value: query.data?.deliveryContentAssetChoices,
    access,
    query,
    scope: `assets:${projectId}:${search}:${afterTaskId}`,
    onDenied,
  });
  return (
    <StyledDeliveryStack>
      <h4>
        <Trans>Choose exact approved creative</Trans>
      </h4>
      {value && (
        <p>
          {snapshot?.assetId === value.assetId
            ? snapshot.name
            : t`Selected approved asset`}{' '}
          · {t`Submission ${value.submissionVersion}`}
        </p>
      )}
      <StyledDeliveryRow>
        <label>
          <Trans>Find approved creative</Trans>
          <input
            maxLength={200}
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                setAfterTaskId(null);
                setSearch(searchDraft.trim());
              }
            }}
          />
        </label>
        <StyledDeliveryButton
          type="button"
          disabled={!enabled}
          onClick={() => {
            setAfterTaskId(null);
            setSearch(searchDraft.trim());
          }}
        >
          <Trans>Search creative</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryRow>
      {!read.data ? (
        <p role={query.error ? 'alert' : 'status'}>
          <Trans>Current approved creative could not be checked.</Trans>{' '}
          <StyledDeliveryButton
            type="button"
            disabled={!enabled}
            onClick={() => void query.refetch()}
          >
            <Trans>Check creative choices</Trans>
          </StyledDeliveryButton>
        </p>
      ) : (
        <>
          {read.data.items.map((asset) => (
            <label
              key={`${asset.taskId}:${asset.submissionVersion}:${asset.assetId}`}
            >
              <input
                type="radio"
                name="content-asset"
                checked={
                  value?.assetId === asset.assetId &&
                  value.taskId === asset.taskId &&
                  value.submissionVersion === asset.submissionVersion
                }
                onChange={() =>
                  onSelect({
                    taskId: asset.taskId,
                    submissionVersion: asset.submissionVersion,
                    assetId: asset.assetId,
                  })
                }
              />
              {asset.title} · {asset.name} ·{' '}
              {t`Submission ${asset.submissionVersion}`}
            </label>
          ))}
          {!read.data.items.length && (
            <p>
              <Trans>
                No current approved creative matches. Complete approval in
                Creative studio first or change your search.
              </Trans>
            </p>
          )}
          <StyledDeliveryRow>
            {read.data.nextTaskId && (
              <StyledDeliveryButton
                type="button"
                onClick={() => setAfterTaskId(read.data?.nextTaskId ?? null)}
              >
                <Trans>More approved creative</Trans>
              </StyledDeliveryButton>
            )}
            {afterTaskId && (
              <StyledDeliveryButton
                type="button"
                onClick={() => setAfterTaskId(null)}
              >
                <Trans>First creative choices</Trans>
              </StyledDeliveryButton>
            )}
            {value && (
              <StyledDeliveryButton
                type="button"
                onClick={() => onSelect(null)}
              >
                <Trans>Clear creative selection</Trans>
              </StyledDeliveryButton>
            )}
          </StyledDeliveryRow>
        </>
      )}
      <small>
        <Trans>
          Saving and review recheck the current native submission. A saved
          selection alone is not proof that it is still usable.
        </Trans>
      </small>
    </StyledDeliveryStack>
  );
};
