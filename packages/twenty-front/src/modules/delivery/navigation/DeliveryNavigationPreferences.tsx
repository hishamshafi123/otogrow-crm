import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { type useDeliveryNavigationPreferences } from '@/delivery/navigation/useDeliveryNavigationPreferences';
import { MAX_PINNED_DELIVERY_PAGES } from '@/delivery/navigation/delivery-navigation-preferences';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryGrid,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type DeliveryNavigationPreferencesProps = {
  personalNavigation: ReturnType<typeof useDeliveryNavigationPreferences>;
};

const StyledPreferences = styled.details`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  margin-top: 10px;
  padding-top: 16px;
  > summary {
    background: ${themeCssVariables.background.secondary};
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: 999px;
    color: ${themeCssVariables.font.color.secondary};
    cursor: pointer;
    font-size: 12.5px;
    font-weight: 500;
    padding: 7px 14px;
    transition:
      background-color 150ms ease,
      border-color 150ms ease,
      color 150ms ease;
    width: fit-content;
  }
  > summary:hover {
    background: ${themeCssVariables.color.transparent.iris2};
    border-color: ${themeCssVariables.color.iris5};
    color: ${themeCssVariables.color.iris11};
  }
  &[open] > summary {
    background: ${themeCssVariables.color.transparent.iris2};
    border-color: ${themeCssVariables.color.iris6};
    color: ${themeCssVariables.color.iris11};
    margin-bottom: 12px;
  }
`;

export const DeliveryNavigationPreferences = ({
  personalNavigation,
}: DeliveryNavigationPreferencesProps) => {
  const { t } = useLingui();
  const { ready, preferences, pages, change, reset, error } =
    personalNavigation;
  return (
    <StyledPreferences>
      <summary>
        <Trans>Personalize workspace</Trans>
      </summary>
      <StyledDeliveryCard>
        <StyledDeliveryStack>
          <p>
            <Trans>
              Choose where the workspace opens and pin the pages you use most.
              Preferences apply to your account in this browser; they do not
              change permissions. Direct task links keep their destination.
            </Trans>
          </p>
          {!ready && (
            <p role="status">
              <Trans>Verifying your access before changing preferences…</Trans>
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <fieldset disabled={!ready}>
            <StyledDeliveryStack>
              <label>
                <Trans>Start page</Trans>
                <select
                  value={preferences.startView}
                  onChange={(event) =>
                    change({ ...preferences, startView: event.target.value })
                  }
                >
                  {pages.map((page) => (
                    <option key={page.view} value={page.view}>
                      {page.label}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend>{t`Pinned pages (up to ${MAX_PINNED_DELIVERY_PAGES})`}</legend>
                <StyledDeliveryGrid>
                  {pages.map((page) => {
                    const checked = preferences.pinnedViews.includes(page.view);
                    return (
                      <label key={page.view}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={
                            !checked &&
                            preferences.pinnedViews.length >=
                              MAX_PINNED_DELIVERY_PAGES
                          }
                          onChange={(event) =>
                            change({
                              ...preferences,
                              pinnedViews: event.target.checked
                                ? [...preferences.pinnedViews, page.view]
                                : preferences.pinnedViews.filter(
                                    (view) => view !== page.view,
                                  ),
                            })
                          }
                        />
                        {page.label}
                      </label>
                    );
                  })}
                </StyledDeliveryGrid>
              </fieldset>
              <StyledDeliveryButton onClick={reset}>
                <Trans>Use role defaults</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryStack>
          </fieldset>
        </StyledDeliveryStack>
      </StyledDeliveryCard>
    </StyledPreferences>
  );
};
