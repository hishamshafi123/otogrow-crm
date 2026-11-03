import { Trans, useLingui } from '@lingui/react/macro';
import { type ReleaseBody } from '@/delivery/development/release.types';
import { useReleaseLabels } from '@/delivery/development/useReleaseLabels';
import { StyledReleaseItem } from '@/delivery/development/releaseStyles';
import {
  StyledDeliveryGrid,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type ReleaseChecksFormProps = {
  body: ReleaseBody;
  update: (body: ReleaseBody) => void;
};
export const ReleaseChecksForm = ({ body, update }: ReleaseChecksFormProps) => {
  const { t } = useLingui();
  const labels = useReleaseLabels();
  return (
    <>
      <h3>
        <Trans>Release checks</Trans>
      </h3>
      <p>
        <Trans>
          Record test, independent code review, rollback and handover readiness.
          Evidence links and notes are team attestations.
        </Trans>
      </p>
      {body.checks.map((check, index) => (
        <StyledReleaseItem key={check.id}>
          <details>
            <summary>
              {labels.check(check.kind)} · {labels.checkState(check.status)}
            </summary>
            <StyledDeliveryStack>
              <StyledDeliveryGrid>
                <label>
                  <Trans>Check name</Trans>
                  <input
                    aria-label={t`Check name for ${labels.check(check.kind)}`}
                    maxLength={200}
                    required
                    value={check.label}
                    onChange={(event) =>
                      update({
                        ...body,
                        checks: body.checks.map((value, at) =>
                          at === index
                            ? { ...value, label: event.currentTarget.value }
                            : value,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  <Trans>Check status</Trans>
                  <select
                    aria-label={t`Check status for ${check.label}`}
                    value={check.status}
                    onChange={(event) =>
                      update({
                        ...body,
                        checks: body.checks.map((value, at) =>
                          at === index
                            ? {
                                ...value,
                                status: event.currentTarget.value,
                              }
                            : value,
                        ),
                      })
                    }
                  >
                    {['NOT_RUN', 'PASSED', 'FAILED'].map((status) => (
                      <option key={status} value={status}>
                        {labels.checkState(status)}
                      </option>
                    ))}
                  </select>
                </label>
              </StyledDeliveryGrid>
              <label>
                <Trans>Evidence link</Trans>
                <input
                  aria-label={t`Evidence link for ${check.label}`}
                  type="url"
                  pattern="https://.*"
                  maxLength={2000}
                  value={check.evidenceUrl}
                  onChange={(event) =>
                    update({
                      ...body,
                      checks: body.checks.map((value, at) =>
                        at === index
                          ? {
                              ...value,
                              evidenceUrl: event.currentTarget.value,
                            }
                          : value,
                      ),
                    })
                  }
                />
              </label>
              <label>
                <Trans>Check notes</Trans>
                <textarea
                  aria-label={t`Check notes for ${check.label}`}
                  maxLength={2000}
                  rows={2}
                  value={check.note}
                  onChange={(event) =>
                    update({
                      ...body,
                      checks: body.checks.map((value, at) =>
                        at === index
                          ? { ...value, note: event.currentTarget.value }
                          : value,
                      ),
                    })
                  }
                />
              </label>
            </StyledDeliveryStack>
          </details>
        </StyledReleaseItem>
      ))}
    </>
  );
};
