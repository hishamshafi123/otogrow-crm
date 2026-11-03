import { Trans, useLingui } from '@lingui/react/macro';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  type DeliveryCreativeAdLinkChoicesQuery,
  type DeliveryCreativeDeclaredComponentInput,
} from '~/generated-metadata/graphql';
type ComponentSelection = NonNullable<
  DeliveryCreativeAdLinkChoicesQuery['deliveryCreativeAdLinkChoices']['selected']
>;
type CreativeLearningComponentsProps = {
  selected: ComponentSelection;
  declared: DeliveryCreativeDeclaredComponentInput[];
  previousNames: { assetId: string; name: string }[];
  onChange: (value: DeliveryCreativeDeclaredComponentInput[]) => void;
};
export const areDeclaredLearningComponentsCurrent = (
  selected: ComponentSelection,
  declared: DeliveryCreativeDeclaredComponentInput[],
) =>
  declared.every(
    (component) =>
      !selected.provenComponents.some(
        (proven) => proven.role === component.role,
      ) &&
      selected.components.some(
        (option) =>
          option.role === component.role &&
          option.assetId === component.assetId,
      ),
  );
export const CreativeLearningComponents = ({
  selected,
  declared,
  previousNames,
  onChange,
}: CreativeLearningComponentsProps) => {
  const { t } = useLingui();
  const labels: Record<string, string> = {
    BASE: t`Main video`,
    HOOK: t`Opening hook`,
    CTA: t`Call to action`,
  };
  const change = (role: string, assetId: string) => {
    const retained = declared.filter((component) => component.role !== role);
    onChange(assetId ? [...retained, { role, assetId }] : retained);
  };
  return (
    <fieldset>
      <legend>
        <Trans>Rendered component evidence (optional)</Trans>
      </legend>
      <StyledDeliveryStack>
        <p>
          <Trans>
            Recorded assembly parts are shown as evidence. For an externally
            edited final, you may declare an approved source clip only when you
            can substantiate its use. Explain that evidence below. Leaving a
            part unknown is valid.
          </Trans>
        </p>
        {['BASE', 'HOOK', 'CTA'].map((role) => {
          const proven = selected.provenComponents.find(
              (component) => component.role === role,
            ),
            current = declared.find((component) => component.role === role);
          const options = selected.components.filter(
            (component) => component.role === role,
          );
          const available =
            current &&
            options.some((option) => option.assetId === current.assetId);
          return (
            <div key={role}>
              {proven ? (
                <>
                  <strong>{labels[role]}</strong>
                  <p>
                    {proven.name} · {t`Recorded assembly component`}
                  </p>
                  {current && (
                    <>
                      <p role="alert">
                        <Trans>
                          A recorded assembly part is available for this role.
                          Remove the earlier human declaration before
                          previewing.
                        </Trans>
                      </p>
                      <StyledDeliveryButton
                        type="button"
                        onClick={() => change(role, '')}
                      >
                        <Trans>Remove earlier declaration</Trans>
                      </StyledDeliveryButton>
                    </>
                  )}
                </>
              ) : (
                <label>
                  {labels[role]}
                  <select
                    aria-label={labels[role]}
                    value={current?.assetId ?? ''}
                    onChange={(event) =>
                      change(role, event.currentTarget.value)
                    }
                  >
                    <option value="">{t`Unknown / not declared`}</option>
                    {current && !available && (
                      <option value={current.assetId} disabled>
                        {previousNames.find(
                          (component) => component.assetId === current.assetId,
                        )?.name ?? t`Earlier declared clip`}{' '}
                        · {t`No longer eligible`}
                      </option>
                    )}
                    {options.map((option) => (
                      <option
                        key={option.assetId}
                        value={option.assetId}
                        disabled={declared.some(
                          (component) =>
                            component.role !== role &&
                            component.assetId === option.assetId,
                        )}
                      >
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {!proven && !options.length && (
                <p>
                  <Trans>
                    No current approved source clip is eligible for this part.
                    Keep it unknown; an approved final alone does not prove its
                    components.
                  </Trans>
                </p>
              )}
              {current && !proven && (
                <small>
                  <Trans>
                    Human declaration, not independently verified assembly
                    evidence.
                  </Trans>
                </small>
              )}
            </div>
          );
        })}
      </StyledDeliveryStack>
    </fieldset>
  );
};
