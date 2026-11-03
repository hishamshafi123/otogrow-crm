import { Trans, useLingui } from '@lingui/react/macro';
import { type SeoBody } from '@/delivery/seo-results/seo-results.types';
import { type useSeoAccess } from '@/delivery/seo-results/useSeoAccess';
import { seoBodyValid } from '@/delivery/seo-results/seo-body';
import { SeoMetricFields } from '@/delivery/seo-results/SeoMetricFields';
import { SeoEvidenceChoices } from '@/delivery/seo-results/SeoEvidenceChoices';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type SeoReportFormProps = {
  access: ReturnType<typeof useSeoAccess>;
  projectId: string;
  body: SeoBody;
  update: (body: SeoBody) => void;
  onSubmit: () => void;
  onDenied: () => void;
  disabled: boolean;
  ownerName?: string;
  taskNames?: Record<string, string>;
};
export const SeoReportForm = ({
  access,
  projectId,
  body,
  update,
  onSubmit,
  onDenied,
  disabled,
  ownerName,
  taskNames,
}: SeoReportFormProps) => {
  const { t } = useLingui();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && seoBodyValid(body)) onSubmit();
      }}
    >
      <fieldset disabled={disabled}>
        <StyledDeliveryStack>
          <p>
            <Trans>
              Save a draft first. Submission and independent approval are
              separate actions; saving does not send this report to a client.
            </Trans>
          </p>
          <label>
            <Trans>Report title</Trans>
            <input
              aria-label={t`Report title`}
              value={body.title}
              maxLength={200}
              required
              onChange={(event) =>
                update({ ...body, title: event.currentTarget.value })
              }
            />
          </label>
          <StyledDeliveryGrid>
            <label>
              <Trans>Reporting period</Trans>
              <select
                aria-label={t`Reporting period`}
                value={body.period}
                onChange={(event) =>
                  update({ ...body, period: event.currentTarget.value })
                }
              >
                <option value="WEEKLY">{t`Weekly — seven calendar days`}</option>
                <option value="MONTHLY">{t`Monthly — complete calendar month`}</option>
              </select>
            </label>
            <label>
              <Trans>Period starts</Trans>
              <input
                type="date"
                aria-label={t`Period starts`}
                value={body.periodStart}
                required
                onChange={(event) =>
                  update({ ...body, periodStart: event.currentTarget.value })
                }
              />
            </label>
            <label>
              <Trans>Period ends</Trans>
              <input
                type="date"
                aria-label={t`Period ends`}
                value={body.periodEnd}
                required
                onChange={(event) =>
                  update({ ...body, periodEnd: event.currentTarget.value })
                }
              />
            </label>
            <label>
              <Trans>Reporting time zone</Trans>
              <input
                aria-label={t`Reporting time zone`}
                value={body.timezone}
                maxLength={100}
                required
                onChange={(event) =>
                  update({ ...body, timezone: event.currentTarget.value })
                }
              />
            </label>
          </StyledDeliveryGrid>
          <SeoEvidenceChoices
            access={access}
            projectId={projectId}
            body={body}
            update={update}
            onDenied={onDenied}
            ownerName={ownerName}
            taskNames={taskNames}
          />
          <label>
            <Trans>Results summary</Trans>
            <textarea
              aria-label={t`Results summary`}
              value={body.summary}
              maxLength={6000}
              onChange={(event) =>
                update({ ...body, summary: event.currentTarget.value })
              }
            />
          </label>
          <label>
            <Trans>Completed work and context</Trans>
            <textarea
              aria-label={t`Completed work and context`}
              value={body.workNotes}
              maxLength={6000}
              onChange={(event) =>
                update({ ...body, workNotes: event.currentTarget.value })
              }
            />
          </label>
          <section aria-label={t`Measured SEO results`}>
            <StyledDeliveryStack>
              <StyledDeliveryRow>
                <h3>
                  <Trans>Measured results</Trans>
                </h3>
                <StyledDeliveryButton
                  type="button"
                  disabled={body.metrics.length >= 20}
                  onClick={() =>
                    update({
                      ...body,
                      metrics: [
                        ...body.metrics,
                        {
                          id: crypto.randomUUID(),
                          key: 'CLICKS',
                          label: '',
                          unit: 'COUNT',
                          value: null,
                          unknownReason: '',
                          source: 'SEARCH_CONSOLE',
                          sourceUrl: '',
                          property: '',
                          segment: '',
                          definition: '',
                          observedAt: '',
                        },
                      ],
                    })
                  }
                >
                  <Trans>Add measurement</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryRow>
              <p>
                <Trans>
                  Record source, property, filters, definition and capture time
                  for each value. Leave unavailable values explicitly unknown;
                  never substitute zero. Capture results after the reporting
                  period ends before submitting.
                </Trans>
              </p>
              {body.metrics.length === 0 && (
                <p>
                  <Trans>
                    No measured results yet. A draft may be saved without
                    measurements.
                  </Trans>
                </p>
              )}
              {body.metrics.map((metric, index) => (
                <SeoMetricFields
                  key={metric.id}
                  metric={metric}
                  number={index + 1}
                  onChange={(next) =>
                    update({
                      ...body,
                      metrics: body.metrics.map((item, itemIndex) =>
                        itemIndex === index ? next : item,
                      ),
                    })
                  }
                  onRemove={() =>
                    update({
                      ...body,
                      metrics: body.metrics.filter(
                        (item) => item.id !== metric.id,
                      ),
                    })
                  }
                />
              ))}
            </StyledDeliveryStack>
          </section>
          <section aria-label={t`Supporting work evidence`}>
            <StyledDeliveryStack>
              <StyledDeliveryRow>
                <h3>
                  <Trans>Supporting evidence</Trans>
                </h3>
                <StyledDeliveryButton
                  type="button"
                  disabled={body.evidence.length >= 20}
                  onClick={() =>
                    update({
                      ...body,
                      evidence: [
                        ...body.evidence,
                        { label: '', url: '', note: '' },
                      ],
                    })
                  }
                >
                  <Trans>Add evidence link</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryRow>
              {body.evidence.map((evidence, index) => (
                <fieldset key={index}>
                  <StyledDeliveryStack>
                    <label>
                      <Trans>Evidence label</Trans>
                      <input
                        value={evidence.label}
                        aria-label={t`Evidence label ${index + 1}`}
                        required
                        maxLength={200}
                        onChange={(event) =>
                          update({
                            ...body,
                            evidence: body.evidence.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, label: event.currentTarget.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      <Trans>Evidence URL</Trans>
                      <input
                        type="url"
                        value={evidence.url}
                        aria-label={t`Evidence URL ${index + 1}`}
                        required
                        maxLength={2000}
                        onChange={(event) =>
                          update({
                            ...body,
                            evidence: body.evidence.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, url: event.currentTarget.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      <Trans>Evidence notes</Trans>
                      <textarea
                        value={evidence.note}
                        aria-label={t`Evidence notes ${index + 1}`}
                        maxLength={1000}
                        onChange={(event) =>
                          update({
                            ...body,
                            evidence: body.evidence.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, note: event.currentTarget.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </label>
                    <StyledDeliveryButton
                      type="button"
                      onClick={() =>
                        update({
                          ...body,
                          evidence: body.evidence.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        })
                      }
                    >
                      <Trans>Remove evidence link</Trans>
                    </StyledDeliveryButton>
                  </StyledDeliveryStack>
                </fieldset>
              ))}
            </StyledDeliveryStack>
          </section>
          {!seoBodyValid(body) && (
            <p role="status">
              <Trans>
                Choose an owner and a complete weekly or monthly period.
                Complete each measurement or remove it; every unknown value
                needs an explanation and source details.
              </Trans>
            </p>
          )}
          <StyledDeliveryButton
            type="submit"
            data-primary="true"
            disabled={!seoBodyValid(body)}
          >
            <Trans>Save report draft</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryStack>
      </fieldset>
    </form>
  );
};
