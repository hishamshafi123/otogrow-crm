import { Trans, useLingui } from '@lingui/react/macro';
import { AdvertisingChoicePicker } from '@/delivery/advertising/workbench/AdvertisingChoicePicker';
import { AdvertisingActionOrigin } from '@/delivery/advertising/drafts/AdvertisingActionOrigin';
import { type AdvertisingActionDraft } from '@/delivery/advertising/workbench/advertising-draft';
import { type AdvertisingSourceSelection } from '@/delivery/advertising/workbench/useAdvertisingSource';
import { type useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import { StyledAdvertisingItem } from '@/delivery/advertising/workbench/advertisingWorkbenchStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type AdvertisingActionEditorProps = {
  state: ReturnType<typeof useAdvertisingContext>;
  selection: AdvertisingSourceSelection;
  scope: string;
  action: AdvertisingActionDraft;
  position: number;
  disabled: boolean;
  onChange: (value: AdvertisingActionDraft) => void;
  onRemove: () => void;
};
export const AdvertisingActionEditor = ({
  state,
  selection,
  scope,
  action,
  position,
  disabled,
  onChange,
  onRemove,
}: AdvertisingActionEditorProps) => {
  const { t } = useLingui();
  const adopted = action.adoptTaskId != null;
  return (
    <StyledAdvertisingItem data-advertising-action-id={action.id}>
      <fieldset disabled={disabled}>
        <StyledDeliveryStack>
          <h3>{t`Recommendation ${position}`}</h3>
          <AdvertisingActionOrigin
            origin={action.origin}
            humanEdited={action.originEdited}
            canOpen={state.permission.manager}
          />
          {adopted && (
            <p>
              <Trans>
                This recommendation links existing work. Its owner, reviewer,
                deadline, progress and original instructions stay unchanged.
              </Trans>
            </p>
          )}
          <label>
            <Trans>Action title</Trans>
            <input
              name="title"
              required
              maxLength={200}
              value={action.title}
              onChange={(event) =>
                onChange({
                  ...action,
                  title: event.target.value,
                  originEdited: action.origin != null || action.originEdited,
                })
              }
            />
          </label>
          <label>
            <Trans>Why this action is needed</Trans>
            <textarea
              name="rationale"
              required
              rows={3}
              maxLength={3000}
              value={action.rationale}
              onChange={(event) =>
                onChange({
                  ...action,
                  rationale: event.target.value,
                  originEdited: action.origin != null || action.originEdited,
                })
              }
            />
          </label>
          <label>
            <Trans>Expected result and how to check it</Trans>
            <textarea
              name="expectedResult"
              required
              rows={3}
              maxLength={3000}
              value={action.expectedResult}
              onChange={(event) =>
                onChange({
                  ...action,
                  expectedResult: event.target.value,
                  originEdited: action.origin != null || action.originEdited,
                })
              }
            />
          </label>
          <label>
            <Trans>Evidence and references for the person doing the work</Trans>
            <textarea
              name="evidence"
              required
              rows={3}
              maxLength={3000}
              value={action.evidence}
              onChange={(event) =>
                onChange({
                  ...action,
                  evidence: event.target.value,
                  originEdited: action.origin != null || action.originEdited,
                })
              }
            />
          </label>
          <StyledDeliveryGrid>
            <AdvertisingChoicePicker
              state={state}
              sourceKind={selection.kind}
              sourceId={selection.id}
              scope={scope}
              kind="OWNER"
              label={t`Human owner`}
              value={
                action.ownerId
                  ? {
                      id: action.ownerId,
                      name:
                        action.ownerName ||
                        t`Previously selected person is unavailable`,
                      version: null,
                    }
                  : null
              }
              disabled={disabled || adopted}
              onChange={(choice) =>
                onChange({
                  ...action,
                  ownerId: choice?.id ?? '',
                  ownerName: choice?.name ?? '',
                  assistantId: null,
                  assistantName: null,
                  assistantVersion: null,
                })
              }
            />
            <AdvertisingChoicePicker
              state={state}
              sourceKind={selection.kind}
              sourceId={selection.id}
              scope={scope}
              kind="REVIEWER"
              ownerId={action.ownerId}
              label={t`Independent reviewer`}
              value={
                action.reviewerId
                  ? {
                      id: action.reviewerId,
                      name:
                        action.reviewerName ||
                        t`Previously selected reviewer is unavailable`,
                      version: null,
                    }
                  : null
              }
              disabled={disabled || adopted}
              onChange={(choice) =>
                onChange({
                  ...action,
                  reviewerId: choice?.id ?? '',
                  reviewerName: choice?.name ?? '',
                })
              }
            />
            <label>
              <Trans>Due date</Trans>
              <input
                name="dueDate"
                required
                type="date"
                value={action.dueDate}
                disabled={adopted}
                onChange={(event) =>
                  onChange({ ...action, dueDate: event.target.value })
                }
              />
            </label>
          </StyledDeliveryGrid>
          {action.ownerId && action.ownerId === action.reviewerId && (
            <p role="alert">
              <Trans>
                The person doing the work must have a different reviewer.
              </Trans>
            </p>
          )}
          <AdvertisingChoicePicker
            state={state}
            sourceKind={selection.kind}
            sourceId={selection.id}
            scope={scope}
            kind="ASSISTANT"
            ownerId={action.ownerId || null}
            label={t`Optional assistant support`}
            value={
              action.assistantId
                ? {
                    id: action.assistantId,
                    name:
                      action.assistantName ??
                      t`Previously selected assistant is unavailable`,
                    version: action.assistantVersion,
                  }
                : null
            }
            disabled={disabled || adopted}
            onChange={(choice) =>
              onChange({
                ...action,
                assistantId: choice?.id ?? null,
                assistantName: choice?.name ?? null,
                assistantVersion: choice?.version ?? null,
              })
            }
          />
          <small>
            <Trans>
              The human owner remains responsible. Assistant support is opened
              separately and does not run or change an ad account automatically.
            </Trans>
          </small>
          <StyledDeliveryButton type="button" onClick={onRemove}>
            <Trans>Remove recommendation</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryStack>
      </fieldset>
    </StyledAdvertisingItem>
  );
};
