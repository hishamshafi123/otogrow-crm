import { Trans, useLingui } from '@lingui/react/macro';
import { type AtlasProfile } from '@/delivery/creative/atlas/atlas.types';
import { StyledDeliveryGrid } from '@/delivery/deliveryStyles';
type AtlasParameterFieldsProps = {
  profile: AtlasProfile;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
};
export const AtlasParameterFields = ({
  profile,
  values,
  onChange,
}: AtlasParameterFieldsProps) => {
  const { t } = useLingui();
  return (
    <StyledDeliveryGrid>
      {profile.parameters.map((parameter) => (
        <label key={parameter.name}>
          {parameter.label}
          {parameter.choices.length > 0 ? (
            <select
              aria-label={parameter.label}
              value={values[parameter.name] ?? ''}
              onChange={(event) =>
                onChange({ ...values, [parameter.name]: event.target.value })
              }
            >
              <option value="">{t`Choose a supported value`}</option>
              {values[parameter.name] &&
                !parameter.choices.includes(values[parameter.name]) && (
                  <option
                    value={values[parameter.name]}
                  >{t`Prepared value is no longer supported`}</option>
                )}
              {parameter.choices.map((choice) => (
                <option key={choice} value={choice}>
                  {choice}
                </option>
              ))}
            </select>
          ) : parameter.type === 'BOOLEAN' ? (
            <select
              aria-label={parameter.label}
              value={values[parameter.name] ?? ''}
              onChange={(event) =>
                onChange({ ...values, [parameter.name]: event.target.value })
              }
            >
              <option value="">{t`Choose`}</option>
              <option value="false">{t`No`}</option>
              <option value="true">{t`Yes`}</option>
            </select>
          ) : parameter.type === 'INTEGER' ? (
            <input
              aria-label={parameter.label}
              type="number"
              min={parameter.minimum ?? undefined}
              max={parameter.maximum ?? undefined}
              step={1}
              value={values[parameter.name] ?? ''}
              onChange={(event) =>
                onChange({ ...values, [parameter.name]: event.target.value })
              }
            />
          ) : (
            <input
              aria-label={parameter.label}
              value={values[parameter.name] ?? ''}
              onChange={(event) =>
                onChange({ ...values, [parameter.name]: event.target.value })
              }
            />
          )}
          {parameter.required && (
            <small>
              <Trans>Required for this model</Trans>
            </small>
          )}
        </label>
      ))}
    </StyledDeliveryGrid>
  );
};
