import {
  describePropertyRuleMatch,
  evaluatePropertyRule,
  type PropertyRuleContext,
} from 'src/modules/lead-scoring/utils/evaluate-lead-scoring-rule.util';

const CONTEXT: PropertyRuleContext = {
  person: { jobTitle: 'CEO' },
  company: {
    name: 'Acme',
    address: { addressCountry: 'France' },
    domainName: { primaryLinkUrl: 'acme.com' },
  },
};

describe('evaluatePropertyRule', () => {
  it('matches IS_SET when the property has a value', () => {
    expect(
      evaluatePropertyRule(
        { property: 'jobTitle', operator: 'IS_SET', value: null },
        CONTEXT,
      ),
    ).toBe(true);
  });

  it('does not match IS_SET when the property is empty', () => {
    expect(
      evaluatePropertyRule(
        { property: 'jobTitle', operator: 'IS_SET', value: null },
        { person: { jobTitle: '' }, company: null },
      ),
    ).toBe(false);
    expect(
      evaluatePropertyRule(
        { property: 'jobTitle', operator: 'IS_SET', value: null },
        { person: { jobTitle: null }, company: null },
      ),
    ).toBe(false);
  });

  it('matches EQ case-insensitively', () => {
    expect(
      evaluatePropertyRule(
        { property: 'company.addressCountry', operator: 'EQ', value: 'france' },
        CONTEXT,
      ),
    ).toBe(true);
    expect(
      evaluatePropertyRule(
        { property: 'company.addressCountry', operator: 'EQ', value: 'spain' },
        CONTEXT,
      ),
    ).toBe(false);
  });

  it('matches NEQ on a different value and on an unset property', () => {
    expect(
      evaluatePropertyRule(
        { property: 'jobTitle', operator: 'NEQ', value: 'cto' },
        CONTEXT,
      ),
    ).toBe(true);
    expect(
      evaluatePropertyRule(
        { property: 'jobTitle', operator: 'NEQ', value: 'ceo' },
        CONTEXT,
      ),
    ).toBe(false);
    expect(
      evaluatePropertyRule(
        { property: 'jobTitle', operator: 'NEQ', value: 'ceo' },
        { person: null, company: null },
      ),
    ).toBe(true);
  });

  it('matches CONTAINS case-insensitively', () => {
    expect(
      evaluatePropertyRule(
        { property: 'company.domainName', operator: 'CONTAINS', value: 'ACME' },
        CONTEXT,
      ),
    ).toBe(true);
    expect(
      evaluatePropertyRule(
        { property: 'company.domainName', operator: 'CONTAINS', value: 'corp' },
        CONTEXT,
      ),
    ).toBe(false);
  });

  it('compares GT/LT numerically', () => {
    expect(
      evaluatePropertyRule(
        { property: 'jobTitle', operator: 'GT', value: '50' },
        { person: { jobTitle: '100' }, company: null },
      ),
    ).toBe(true);
    expect(
      evaluatePropertyRule(
        { property: 'jobTitle', operator: 'LT', value: '50' },
        { person: { jobTitle: '100' }, company: null },
      ),
    ).toBe(false);
  });

  it('fails GT/LT when either side is not numeric', () => {
    expect(
      evaluatePropertyRule(
        { property: 'jobTitle', operator: 'GT', value: '50' },
        CONTEXT,
      ),
    ).toBe(false);
  });

  it('never matches an unknown property path', () => {
    expect(
      evaluatePropertyRule(
        { property: 'company.employees', operator: 'IS_SET', value: null },
        CONTEXT,
      ),
    ).toBe(false);
  });

  it('never matches a rule missing property or operator', () => {
    expect(
      evaluatePropertyRule(
        { property: null, operator: 'IS_SET', value: null },
        CONTEXT,
      ),
    ).toBe(false);
    expect(
      evaluatePropertyRule(
        { property: 'jobTitle', operator: null, value: null },
        CONTEXT,
      ),
    ).toBe(false);
  });
});

describe('describePropertyRuleMatch', () => {
  it('describes an IS_SET rule', () => {
    expect(
      describePropertyRuleMatch({
        property: 'jobTitle',
        operator: 'IS_SET',
        value: null,
      }),
    ).toBe('jobTitle is set');
  });

  it('describes a comparison rule', () => {
    expect(
      describePropertyRuleMatch({
        property: 'company.addressCountry',
        operator: 'GT',
        value: '50',
      }),
    ).toBe('company.addressCountry > 50');
  });
});
