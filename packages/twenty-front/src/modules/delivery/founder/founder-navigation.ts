import { z } from 'zod';
import { type DeliveryFounderExceptionsInput } from '~/generated-metadata/graphql';

const PARAMETERS = {
  domain: 'founderDomain',
  projectId: 'founderProject',
  ownerId: 'founderOwner',
  currency: 'founderCurrency',
  serviceMonth: 'founderMonth',
  after: 'founderAfter',
} as const;
const navigationSchema = z.object({
  domain: z
    .enum([
      'ALL',
      'DELIVERY',
      'COMMITMENTS',
      'FINANCE',
      'CAMPAIGNS',
      'MANUAL_RISKS',
    ])
    .default('ALL'),
  projectId: z.uuid().optional(),
  ownerId: z.uuid().optional(),
  currency: z.string().optional(),
  serviceMonth: z
    .string()
    .regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  after: z.string().min(1).max(2000).optional(),
});
export type FounderNavigationValue = z.infer<typeof navigationSchema>;
export const readFounderNavigation = (
  params: URLSearchParams,
  currencies: string[],
) =>
  navigationSchema
    .refine((value) => !value.currency || currencies.includes(value.currency))
    .safeParse(
      Object.fromEntries(
        Object.entries(PARAMETERS).map(([key, parameter]) => [
          key,
          params.get(parameter) || undefined,
        ]),
      ),
    );
export const writeFounderNavigation = (
  params: URLSearchParams,
  value: FounderNavigationValue,
) => {
  const next = new URLSearchParams(params);
  next.set('view', 'health');
  for (const [key, parameter] of Object.entries(PARAMETERS)) {
    next.delete(parameter);
    const field = value[key as keyof FounderNavigationValue];
    if (field && !(key === 'domain' && field === 'ALL'))
      next.set(parameter, field);
  }
  return next;
};
export const founderQueryInput = (
  value: FounderNavigationValue,
): DeliveryFounderExceptionsInput => ({ ...value, limit: 25 });
