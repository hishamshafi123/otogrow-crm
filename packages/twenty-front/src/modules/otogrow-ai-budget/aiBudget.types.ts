import { type OtogrowAiBudgetFieldsFragment } from '~/generated-metadata/graphql';

export type AiBudgetSnapshot = OtogrowAiBudgetFieldsFragment;
export type AiBudget = AiBudgetSnapshot['budgets'][number];
export type AiPrice = AiBudgetSnapshot['priceProfiles'][number];
export type AiSpend = AiBudgetSnapshot['recentSpend'][number];
