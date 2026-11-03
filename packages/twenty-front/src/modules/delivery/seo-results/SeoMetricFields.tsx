import { Trans, useLingui } from '@lingui/react/macro';
import { type SeoBody } from '@/delivery/seo-results/seo-results.types';
import { useSeoLabels } from '@/delivery/seo-results/useSeoLabels';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type SeoMetricFieldsProps = {
  metric: SeoBody['metrics'][number];
  number: number;
  onChange: (metric: SeoBody['metrics'][number]) => void;
  onRemove: () => void;
};
export const SeoMetricFields = ({
  metric,
  number,
  onChange,
  onRemove,
}: SeoMetricFieldsProps) => {
  const { t } = useLingui();
  const labels = useSeoLabels();
  const update = (field: keyof typeof metric, value: string | null) =>
    onChange({ ...metric, [field]: value });
  return (
    <fieldset>
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h4>{metric.label || t`New measurement`}</h4>
          <StyledDeliveryButton type="button" onClick={onRemove}>
            <Trans>Remove measurement</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
        <StyledDeliveryGrid>
          <label>
            <Trans>Measurement type</Trans>
            <select
              value={metric.key}
              aria-label={t`Measurement type ${number}`}
              onChange={(event) => {
                const key = event.currentTarget.value;
                onChange({
                  ...metric,
                  key,
                  unit: key === 'AVERAGE_POSITION' ? 'POSITION' : 'COUNT',
                });
              }}
            >
              {[
                'CLICKS',
                'IMPRESSIONS',
                'ORGANIC_SESSIONS',
                'CONVERSIONS',
                'AVERAGE_POSITION',
                'CUSTOM',
              ].map((key) => (
                <option key={key} value={key}>
                  {labels.metric(key)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <Trans>Measurement label</Trans>
            <input
              value={metric.label}
              maxLength={160}
              required
              aria-label={t`Measurement label ${number}`}
              onChange={(event) => update('label', event.currentTarget.value)}
            />
          </label>
          <label>
            <Trans>Units</Trans>
            <select
              value={metric.unit}
              disabled={metric.key !== 'CUSTOM'}
              aria-label={t`Measurement units ${number}`}
              onChange={(event) => update('unit', event.currentTarget.value)}
            >
              {['COUNT', 'POSITION', 'PERCENT'].map((unit) => (
                <option key={unit} value={unit}>
                  {labels.unit(unit)}
                </option>
              ))}
            </select>
          </label>
        </StyledDeliveryGrid>
        <label>
          <input
            type="checkbox"
            checked={metric.value === null}
            aria-label={t`Value unavailable ${number}`}
            onChange={(event) =>
              update('value', event.currentTarget.checked ? null : '')
            }
          />
          <Trans>Value is unavailable</Trans>
        </label>
        {metric.value === null ? (
          <label>
            <Trans>Why is the measurement unavailable?</Trans>
            <textarea
              value={metric.unknownReason}
              required
              maxLength={1000}
              aria-label={t`Unavailable reason ${number}`}
              onChange={(event) =>
                update('unknownReason', event.currentTarget.value)
              }
            />
          </label>
        ) : (
          <label>
            <Trans>Measured value</Trans>
            <input
              value={metric.value}
              inputMode="decimal"
              required
              aria-label={t`Measured value ${number}`}
              onChange={(event) => update('value', event.currentTarget.value)}
            />
            <small>
              <Trans>
                Enter the exact number; zero is a measured result, not an
                unknown value.
              </Trans>
            </small>
          </label>
        )}
        <details>
          <summary>
            <Trans>Source and measurement definition</Trans>
          </summary>
          <StyledDeliveryStack>
            <label>
              <Trans>Source</Trans>
              <select
                value={metric.source}
                aria-label={t`Measurement source ${number}`}
                onChange={(event) =>
                  update('source', event.currentTarget.value)
                }
              >
                {['SEARCH_CONSOLE', 'ANALYTICS', 'RANK_TRACKER', 'OTHER'].map(
                  (source) => (
                    <option key={source} value={source}>
                      {labels.source(source)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              <Trans>Evidence link</Trans>
              <input
                type="url"
                value={metric.sourceUrl}
                required
                maxLength={2000}
                aria-label={t`Measurement evidence link ${number}`}
                onChange={(event) =>
                  update('sourceUrl', event.currentTarget.value)
                }
              />
            </label>
            <label>
              <Trans>Website property</Trans>
              <input
                value={metric.property}
                required
                maxLength={500}
                aria-label={t`Website property ${number}`}
                onChange={(event) =>
                  update('property', event.currentTarget.value)
                }
              />
            </label>
            <label>
              <Trans>Segment and filters</Trans>
              <input
                value={metric.segment}
                required
                maxLength={1000}
                aria-label={t`Segment and filters ${number}`}
                onChange={(event) =>
                  update('segment', event.currentTarget.value)
                }
              />
            </label>
            <label>
              <Trans>Definition and attribution</Trans>
              <textarea
                value={metric.definition}
                required
                maxLength={1000}
                aria-label={t`Definition and attribution ${number}`}
                onChange={(event) =>
                  update('definition', event.currentTarget.value)
                }
              />
            </label>
            <label>
              <Trans>Captured at, including time zone</Trans>
              <input
                value={metric.observedAt}
                required
                maxLength={40}
                placeholder="2026-11-02T06:00:00+03:00"
                aria-label={t`Captured at ${number}`}
                onChange={(event) =>
                  update('observedAt', event.currentTarget.value)
                }
              />
            </label>
          </StyledDeliveryStack>
        </details>
      </StyledDeliveryStack>
    </fieldset>
  );
};
