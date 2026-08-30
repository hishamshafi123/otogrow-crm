import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

// Only these dot paths are resolvable on a person (or its company); anything
// else never matches so a mistyped rule fails closed instead of granting
// points on a wrong field
const PROPERTY_RESOLVERS: Record<
  string,
  (context: PropertyRuleContext) => string | null
> = {
  jobTitle: ({ person }) => person?.jobTitle ?? null,
  'company.name': ({ company }) => company?.name ?? null,
  'company.addressCountry': ({ company }) =>
    company?.address?.addressCountry ?? null,
  'company.domainName': ({ company }) =>
    company?.domainName?.primaryLinkUrl ?? null,
};

export type PropertyRuleContext = {
  person: { jobTitle?: string | null } | null;
  company: {
    name?: string | null;
    address?: { addressCountry?: string | null } | null;
    domainName?: { primaryLinkUrl?: string | null } | null;
  } | null;
};

export type PropertyRuleInput = {
  property: string | null;
  operator: string | null;
  value: string | null;
};

const isSet = (value: string | null): value is string =>
  isDefined(value) && isNonEmptyString(value);

export const evaluatePropertyRule = (
  rule: PropertyRuleInput,
  context: PropertyRuleContext,
): boolean => {
  const { property, operator, value: expected } = rule;

  if (!isNonEmptyString(property) || !isNonEmptyString(operator)) {
    return false;
  }

  const resolver = PROPERTY_RESOLVERS[property];

  if (!isDefined(resolver)) {
    return false;
  }

  const actualValue = resolver(context);

  if (operator === 'IS_SET') {
    return isSet(actualValue);
  }

  if (!isSet(actualValue) || !isNonEmptyString(expected)) {
    // NEQ on an unset property is still true: "not equal to X" holds
    return operator === 'NEQ';
  }

  switch (operator) {
    case 'EQ':
      return actualValue.toLowerCase() === expected.toLowerCase();
    case 'NEQ':
      return actualValue.toLowerCase() !== expected.toLowerCase();
    case 'CONTAINS':
      return actualValue.toLowerCase().includes(expected.toLowerCase());
    case 'GT':
    case 'LT': {
      const actualNumber = Number(actualValue);
      const expectedNumber = Number(expected);

      if (Number.isNaN(actualNumber) || Number.isNaN(expectedNumber)) {
        return false;
      }

      return operator === 'GT'
        ? actualNumber > expectedNumber
        : actualNumber < expectedNumber;
    }
    default:
      return false;
  }
};

export const describePropertyRuleMatch = (rule: PropertyRuleInput): string => {
  if (rule.operator === 'IS_SET') {
    return `${rule.property} is set`;
  }

  const operatorLabels: Record<string, string> = {
    EQ: '=',
    NEQ: '≠',
    CONTAINS: 'contains',
    GT: '>',
    LT: '<',
  };

  const operatorLabel = operatorLabels[rule.operator ?? ''] ?? rule.operator;

  return `${rule.property} ${operatorLabel} ${rule.value}`;
};
