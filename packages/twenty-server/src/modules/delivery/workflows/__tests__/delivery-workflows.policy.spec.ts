import { DELIVERY_WORKFLOW_STARTERS } from 'src/modules/delivery/workflows/delivery-workflows.starters';
import {
  workflowDefinitionSchema,
  type DeliveryAppliedWorkflow,
} from 'src/modules/delivery/workflows/delivery-workflows.types';
import {
  assertWorkflowAnswers,
  assertWorkflowReview,
  assertWorkflowSubmission,
  missingWorkflowRequirements,
} from 'src/modules/delivery/workflows/delivery-workflows.policy';
const definition = DELIVERY_WORKFLOW_STARTERS[1].definition;
const workflow = (): DeliveryAppliedWorkflow => ({
  templateId: 'template',
  version: 1,
  revision: 1,
  definition: structuredClone(definition),
  checkedIds: [],
  evidence: [],
  appliedAt: '2026-10-25T00:00:00.000Z',
  appliedBy: 'manager',
  appliedByName: 'Manager',
});
const complete = () => ({
  ...workflow(),
  checkedIds: definition.checklist.map((item) => item.id),
  evidence: definition.evidence.map((item) => ({
    requirementId: item.id,
    value: 'https://example.com/evidence',
  })),
});
describe('service workflow validation', () => {
  test('all six unsaved starters satisfy the editable definition contract', () => {
    expect(DELIVERY_WORKFLOW_STARTERS).toHaveLength(6);
    for (const starter of DELIVERY_WORKFLOW_STARTERS)
      expect(
        workflowDefinitionSchema.safeParse(starter.definition).success,
      ).toBe(true);
  });
  test('legacy tasks keep existing submission and review behavior', () => {
    expect(() => assertWorkflowSubmission(undefined)).not.toThrow();
    expect(() => assertWorkflowReview(undefined, undefined)).not.toThrow();
  });
  test('requires every required checklist/evidence response with clear missing labels', () => {
    expect(missingWorkflowRequirements(workflow())).toContain(
      'Add evidence: Final creative',
    );
    expect(() => assertWorkflowSubmission(workflow())).toThrow(/Complete:/);
    expect(() => assertWorkflowSubmission(complete())).not.toThrow();
  });
  test('rejects arbitrary checklist/evidence identities and duplicates', () => {
    expect(() => assertWorkflowAnswers(workflow(), ['unknown'], [])).toThrow();
    expect(() =>
      assertWorkflowAnswers(workflow(), ['angle', 'angle'], []),
    ).toThrow();
    expect(() =>
      assertWorkflowAnswers(
        workflow(),
        [],
        [{ requirementId: 'unknown', value: 'value' }],
      ),
    ).toThrow();
    expect(() =>
      assertWorkflowAnswers(
        workflow(),
        [],
        [
          { requirementId: 'creative', value: 'https://example.com' },
          { requirementId: 'creative', value: '' },
        ],
      ),
    ).toThrow();
  });
  test('link format validation rejects executable schemes and embedded credentials without making requests', () => {
    for (const value of [
      'javascript:alert(1)',
      'file:///tmp/asset',
      'https://user:secret@example.com',
      'not a link',
    ])
      expect(() =>
        assertWorkflowAnswers(
          workflow(),
          [],
          [{ requirementId: 'creative', value }],
        ),
      ).toThrow();
    expect(() =>
      assertWorkflowAnswers(
        workflow(),
        [],
        [{ requirementId: 'creative', value: 'https://example.com' }],
      ),
    ).not.toThrow();
  });
  test('optional requirements may be omitted but provided invalid links still fail', () => {
    const optional = workflow();
    optional.definition.checklist = optional.definition.checklist.map(
      (item) => ({ ...item, required: false }),
    );
    optional.definition.evidence = optional.definition.evidence.map((item) => ({
      ...item,
      required: false,
    }));
    expect(() => assertWorkflowSubmission(optional)).not.toThrow();
    optional.evidence = [{ requirementId: 'creative', value: 'invalid' }];
    expect(() => assertWorkflowSubmission(optional)).toThrow();
  });
  test('independent quality review needs required confirmations; requesting changes can use partial checks', () => {
    expect(() => assertWorkflowReview(complete(), [])).toThrow(
      /quality review/,
    );
    expect(() =>
      assertWorkflowReview(
        complete(),
        definition.reviewChecks.map((item) => item.id),
      ),
    ).not.toThrow();
    expect(() => assertWorkflowReview(complete(), [], false)).not.toThrow();
    expect(() =>
      assertWorkflowReview(complete(), ['unknown'], false),
    ).toThrow();
  });
  test('duplicate requirement identifiers are rejected while stable keys can recur across sections', () => {
    expect(
      workflowDefinitionSchema.safeParse({
        ...definition,
        checklist: [definition.checklist[0], definition.checklist[0]],
      }).success,
    ).toBe(false);
    expect(
      workflowDefinitionSchema.safeParse({
        ...definition,
        evidence: [definition.evidence[0], definition.evidence[0]],
      }).success,
    ).toBe(false);
  });
});
