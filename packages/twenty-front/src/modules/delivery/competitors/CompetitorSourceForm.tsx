import { useId, useLayoutEffect } from 'react';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type useCompetitorAccess } from '@/delivery/competitors/useCompetitorAccess';
import { useCompetitorRead } from '@/delivery/competitors/useCompetitorRead';
import { GET_COMPETITOR_CHOICES } from '@/delivery/competitors/delivery-competitors.graphql';
import {
  type CompetitorBody,
  type CompetitorChoices,
  type CompetitorPlatform,
  type CompetitorProject,
} from '@/delivery/competitors/competitor.types';
import { useCompetitorLabels } from '@/delivery/competitors/useCompetitorLabels';
import { CompetitorSourceCoverage } from '@/delivery/competitors/CompetitorSourceCoverage';
import {
  StyledCompetitorForm,
  StyledCompetitorFields,
} from '@/delivery/competitors/competitorStyles';
import { StyledDeliveryButton } from '@/delivery/deliveryStyles';

type CompetitorSourceFormProps = {
  access: ReturnType<typeof useCompetitorAccess>;
  project: CompetitorProject;
  contextScope: string;
  body: CompetitorBody;
  update: (body: CompetitorBody) => void;
  editing: boolean;
  enabled: boolean;
  locked: boolean;
  onDenied: () => void;
  onReady: (scope: string | null) => void;
  onSubmit: () => void;
};
export const CompetitorSourceForm = ({
  access,
  project,
  contextScope,
  body,
  update,
  editing,
  enabled,
  locked,
  onDenied,
  onReady,
  onSubmit,
}: CompetitorSourceFormProps) => {
  const { t } = useLingui();
  const labels = useCompetitorLabels();
  const referenceHelpId = useId();
  const query = useQuery<{
    deliveryCompetitorSourceChoices: CompetitorChoices;
  }>(GET_COMPETITOR_CHOICES, {
    variables: { input: { projectId: project.id } },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
    skip: !enabled,
  });
  const read = useCompetitorRead({
    value: query.data?.deliveryCompetitorSourceChoices,
    access,
    scope: `choices:${project.id}`,
    query,
    matches: (value) =>
      value.project.id === project.id &&
      value.project.revision === project.revision &&
      value.project.companyId === project.companyId &&
      value.scope === contextScope,
    onDenied,
  });
  const choices = read.data;
  const membersValid = Boolean(
    choices?.owners.some((owner) => owner.id === body.ownerId) &&
    choices.reviewers.some((reviewer) => reviewer.id === body.reviewerId) &&
    body.ownerId !== body.reviewerId,
  );
  useLayoutEffect(() => {
    onReady(choices && membersValid ? contextScope : null);
  }, [choices, membersValid, contextScope, onReady]);
  const updateField = <TField extends keyof CompetitorBody>(
    field: TField,
    value: CompetitorBody[TField],
  ) => update({ ...body, [field]: value });
  return (
    <StyledCompetitorForm
      onSubmit={(event) => {
        event.preventDefault();
        if (choices && membersValid && !locked) onSubmit();
      }}
    >
      <label>
        <Trans>Source name</Trans>
        <input
          aria-label={t`Source name`}
          required
          maxLength={160}
          disabled={locked}
          value={body.label}
          onChange={(event) => updateField('label', event.currentTarget.value)}
        />
      </label>
      <StyledCompetitorFields>
        <label>
          <Trans>Platform</Trans>
          <select
            aria-label={t`Platform`}
            disabled={editing || locked}
            value={body.platform}
            onChange={(event) =>
              updateField(
                'platform',
                event.currentTarget.value as CompetitorPlatform,
              )
            }
          >
            {(['X', 'INSTAGRAM', 'META_AD_LIBRARY', 'MANUAL'] as const).map(
              (platform) => (
                <option key={platform} value={platform}>
                  {labels.platform(platform)}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          <Trans>Public account or source reference</Trans>
          <input
            aria-label={t`Public account or source reference`}
            aria-describedby={referenceHelpId}
            required
            maxLength={2000}
            disabled={locked}
            readOnly={editing}
            value={body.accountReference}
            onChange={(event) =>
              updateField('accountReference', event.currentTarget.value)
            }
          />
        </label>
      </StyledCompetitorFields>
      <p id={referenceHelpId}>
        {body.platform === 'X'
          ? t`Use @handle or the exact public X profile link.`
          : body.platform === 'INSTAGRAM'
            ? t`Use @handle or the exact public Instagram profile link.`
            : body.platform === 'META_AD_LIBRARY'
              ? t`Use a numeric Facebook Page ID or its exact official Ad Library link.`
              : t`Use a public HTTPS source link without credentials.`}
      </p>
      {editing && (
        <p>
          <Trans>
            Project, platform and account identity stay fixed. Add a separate
            source to research another account.
          </Trans>
        </p>
      )}
      <CompetitorSourceCoverage platform={body.platform} />
      <p>
        <Trans>
          The server checks the exact reference before you save. No provider
          lookup runs during preparation.
        </Trans>
      </p>
      {access.permission.manager ? (
        <StyledCompetitorFields>
          <label>
            <Trans>Source owner</Trans>
            <select
              aria-label={t`Source owner`}
              required
              disabled={locked || !choices}
              value={body.ownerId}
              onChange={(event) =>
                updateField('ownerId', event.currentTarget.value)
              }
            >
              <option value="">{t`Choose an owner`}</option>
              {!choices?.owners.some((owner) => owner.id === body.ownerId) &&
                body.ownerId && (
                  <option
                    value={body.ownerId}
                  >{t`Current owner unavailable — choose again`}</option>
                )}
              {choices?.owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <Trans>Independent reviewer</Trans>
            <select
              aria-label={t`Independent reviewer`}
              required
              disabled={locked || !choices}
              value={body.reviewerId}
              onChange={(event) =>
                updateField('reviewerId', event.currentTarget.value)
              }
            >
              <option value="">{t`Choose a reviewer`}</option>
              {!choices?.reviewers.some(
                (reviewer) => reviewer.id === body.reviewerId,
              ) &&
                body.reviewerId && (
                  <option
                    value={body.reviewerId}
                  >{t`Current reviewer unavailable — choose again`}</option>
                )}
              {choices?.reviewers.map((reviewer) => (
                <option
                  key={reviewer.id}
                  value={reviewer.id}
                  disabled={reviewer.id === body.ownerId}
                >
                  {reviewer.name}
                </option>
              ))}
            </select>
          </label>
        </StyledCompetitorFields>
      ) : (
        <p>
          {choices && (
            <>
              {t`Owner: ${choices.owners.find((owner) => owner.id === body.ownerId)?.name ?? t`Unavailable`}`}{' '}
              ·{' '}
              {t`Reviewer: ${choices.reviewers.find((reviewer) => reviewer.id === body.reviewerId)?.name ?? t`Unavailable`}`}
              <br />
            </>
          )}
          <Trans>
            Only a project manager can change the owner or reviewer.
          </Trans>
        </p>
      )}
      {choices && !membersValid && (
        <p role="status">
          <Trans>
            Choose a current owner and a different current reviewer before
            preparing the source.
          </Trans>
        </p>
      )}
      {!choices && (
        <div role={query.error ? 'alert' : 'status'}>
          <p>
            {query.error
              ? t`Current owners and reviewers could not be checked. Your entered source is kept.`
              : t`Checking current owners and reviewers…`}
          </p>
          <StyledDeliveryButton
            type="button"
            disabled={!enabled}
            onClick={() => void query.refetch()}
          >
            <Trans>Check source people again</Trans>
          </StyledDeliveryButton>
        </div>
      )}
      <StyledCompetitorFields>
        <label>
          <Trans>Planned interval in hours</Trans>
          <input
            aria-label={t`Planned interval in hours`}
            required
            type="number"
            min={1}
            max={720}
            step={1}
            disabled={locked}
            value={body.cadenceHours || ''}
            onChange={(event) =>
              updateField('cadenceHours', Number(event.currentTarget.value))
            }
          />
        </label>
        <label>
          <Trans>Lookback in days</Trans>
          <input
            aria-label={t`Lookback in days`}
            required
            type="number"
            min={1}
            max={90}
            step={1}
            disabled={locked}
            value={body.lookbackDays || ''}
            onChange={(event) =>
              updateField('lookbackDays', Number(event.currentTarget.value))
            }
          />
        </label>
      </StyledCompetitorFields>
      <p>
        <Trans>
          These are planned research settings. Collection is not connected and
          no next run is scheduled.
        </Trans>
      </p>
      <label>
        <Trans>Research purpose</Trans>
        <textarea
          aria-label={t`Research purpose`}
          rows={3}
          required
          maxLength={2000}
          disabled={locked}
          value={body.purpose}
          onChange={(event) =>
            updateField('purpose', event.currentTarget.value)
          }
        />
      </label>
      <StyledDeliveryButton
        type="submit"
        disabled={locked || !choices || !membersValid}
      >
        <Trans>Review source before saving</Trans>
      </StyledDeliveryButton>
    </StyledCompetitorForm>
  );
};
