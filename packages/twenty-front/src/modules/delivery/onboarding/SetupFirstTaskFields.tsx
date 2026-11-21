import { Trans, useLingui } from '@lingui/react/macro';
import { isDateWithoutTime } from 'twenty-shared/utils';
import {
  type ClientSetupTask,
  type ClientSetupMember,
} from '@/delivery/onboarding/client-setup.types';
import {
  StyledDeliveryGrid,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export type SetupTaskValues = {
  title: string;
  brief: string;
  service: string;
  assigneeId: string;
  reviewerId: string;
  priority: string;
  scheduledDate: string;
  dueDate: string;
  checklist: string;
  evidence: string;
};
export const emptySetupTask = (): SetupTaskValues => ({
  title: '',
  brief: '',
  service: '',
  assigneeId: '',
  reviewerId: '',
  priority: 'NORMAL',
  scheduledDate: '',
  dueDate: '',
  checklist: '',
  evidence: '',
});
export const setupTaskInput = (values: SetupTaskValues): ClientSetupTask => ({
  title: values.title.trim(),
  brief: values.brief,
  service: values.service,
  assigneeId: values.assigneeId,
  reviewerId: values.reviewerId,
  priority: values.priority,
  scheduledDate: values.scheduledDate || null,
  dueAt: values.dueDate ? `${values.dueDate}T23:59:59.000Z` : null,
  checklist: values.checklist
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean),
  evidence: values.evidence
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean),
});
export const setupTaskIssues = (
  values: SetupTaskValues,
  members: ClientSetupMember[],
  memberIds: string[],
) => {
  const checklist = values.checklist
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);
  const evidence = values.evidence
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);
  const validDate = (value: string) =>
    !value ||
    (isDateWithoutTime(value) &&
      Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) &&
      new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value);
  const validReference = (value: string) => {
    try {
      return (
        value.length <= 2000 &&
        ['http:', 'https:'].includes(new URL(value).protocol)
      );
    } catch {
      return false;
    }
  };
  return [
    ...(!values.title.trim() || values.title.trim().length > 200
      ? ['TASK_TITLE']
      : []),
    ...(values.brief.trim().length > 20000 || values.service.trim().length > 100
      ? ['TASK_TEXT']
      : []),
    ...(!memberIds.includes(values.assigneeId) ||
    !members.some((member) => member.id === values.assigneeId)
      ? ['TASK_ASSIGNEE']
      : []),
    ...(!members.some(
      (member) =>
        member.id === values.reviewerId &&
        ['ADMIN', 'MANAGER'].includes(member.access),
    )
      ? ['TASK_REVIEWER']
      : []),
    ...(!['LOW', 'NORMAL', 'HIGH'].includes(values.priority)
      ? ['TASK_PRIORITY']
      : []),
    ...(!validDate(values.scheduledDate) || !validDate(values.dueDate)
      ? ['TASK_DATE']
      : []),
    ...(checklist.length > 100 || checklist.some((item) => item.length > 200)
      ? ['TASK_CHECKLIST']
      : []),
    ...(evidence.length > 30 || evidence.some((item) => !validReference(item))
      ? ['TASK_REFERENCES']
      : []),
  ];
};
export const setupTaskReady = (
  values: SetupTaskValues,
  members: ClientSetupMember[],
  memberIds: string[],
) => setupTaskIssues(values, members, memberIds).length === 0;
type SetupFirstTaskFieldsProps = {
  values: SetupTaskValues;
  onChange: (values: SetupTaskValues) => void;
  members: ClientSetupMember[];
  memberIds: string[];
};
export const SetupFirstTaskFields = ({
  values,
  onChange,
  members,
  memberIds,
}: SetupFirstTaskFieldsProps) => {
  const { t } = useLingui();
  const messages: Record<string, string> = {
    TASK_TITLE: t`Enter a first task title of at most 200 characters.`,
    TASK_TEXT: t`Keep task instructions within 20,000 characters and the service within 100.`,
    TASK_ASSIGNEE: t`Choose a current member of the selected project.`,
    TASK_REVIEWER: t`Choose a current delivery manager. The first task assignee and reviewer may be the same person.`,
    TASK_PRIORITY: t`Choose a supported task priority.`,
    TASK_DATE: t`Choose valid calendar dates or leave the dates empty.`,
    TASK_CHECKLIST: t`Use at most 100 checklist lines, with at most 200 characters in each.`,
    TASK_REFERENCES: t`Use at most 30 references, each a complete HTTP or HTTPS URL of at most 2,000 characters.`,
  };
  const assignees = members.filter((member) => memberIds.includes(member.id));
  const reviewers = members.filter((member) =>
    ['ADMIN', 'MANAGER'].includes(member.access),
  );
  return (
    <StyledDeliveryStack>
      <StyledDeliveryGrid>
        <label>
          <Trans>First task title</Trans>
          <input
            aria-label={t`First task title`}
            value={values.title}
            maxLength={200}
            onChange={(event) =>
              onChange({ ...values, title: event.target.value })
            }
          />
        </label>
        <label>
          <Trans>Task service</Trans>
          <input
            aria-label={t`Task service`}
            value={values.service}
            maxLength={100}
            onChange={(event) =>
              onChange({ ...values, service: event.target.value })
            }
          />
        </label>
      </StyledDeliveryGrid>
      <label>
        <Trans>Task instructions</Trans>
        <textarea
          aria-label={t`Task instructions`}
          value={values.brief}
          maxLength={20000}
          onChange={(event) =>
            onChange({ ...values, brief: event.target.value })
          }
        />
      </label>
      <StyledDeliveryGrid>
        <label>
          <Trans>First task assignee</Trans>
          <select
            aria-label={t`First task assignee`}
            value={values.assigneeId}
            onChange={(event) =>
              onChange({ ...values, assigneeId: event.target.value })
            }
          >
            <option value="">{t`Choose a project member`}</option>
            {values.assigneeId &&
              !assignees.some((member) => member.id === values.assigneeId) && (
                <option
                  value={values.assigneeId}
                >{t`Selected assignee unavailable`}</option>
              )}
            {assignees.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <Trans>First task reviewer</Trans>
          <select
            aria-label={t`First task reviewer`}
            value={values.reviewerId}
            onChange={(event) =>
              onChange({ ...values, reviewerId: event.target.value })
            }
          >
            <option value="">{t`Choose a delivery manager`}</option>
            {values.reviewerId &&
              !reviewers.some((member) => member.id === values.reviewerId) && (
                <option
                  value={values.reviewerId}
                >{t`Selected reviewer unavailable`}</option>
              )}
            {reviewers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
      </StyledDeliveryGrid>
      <StyledDeliveryGrid>
        <label>
          <Trans>Scheduled date</Trans>
          <input
            aria-label={t`Scheduled date`}
            type="date"
            value={values.scheduledDate}
            onChange={(event) =>
              onChange({ ...values, scheduledDate: event.target.value })
            }
          />
        </label>
        <label>
          <Trans>Due date</Trans>
          <input
            aria-label={t`Due date`}
            type="date"
            value={values.dueDate}
            onChange={(event) =>
              onChange({ ...values, dueDate: event.target.value })
            }
          />
        </label>
        <label>
          <Trans>Priority</Trans>
          <select
            aria-label={t`Priority`}
            value={values.priority}
            onChange={(event) =>
              onChange({ ...values, priority: event.target.value })
            }
          >
            <option value="NORMAL">{t`Normal`}</option>
            <option value="HIGH">{t`High`}</option>
          </select>
        </label>
      </StyledDeliveryGrid>
      <details>
        <summary>
          <Trans>First task checklist and references</Trans>
        </summary>
        <StyledDeliveryGrid>
          <label>
            <Trans>Checklist — one item per line</Trans>
            <textarea
              aria-label={t`Checklist — one item per line`}
              value={values.checklist}
              onChange={(event) =>
                onChange({ ...values, checklist: event.target.value })
              }
            />
          </label>
          <label>
            <Trans>References — one URL per line</Trans>
            <textarea
              aria-label={t`References — one URL per line`}
              value={values.evidence}
              onChange={(event) =>
                onChange({ ...values, evidence: event.target.value })
              }
            />
          </label>
        </StyledDeliveryGrid>
      </details>
      <ul aria-label={t`First task requirements`}>
        {setupTaskIssues(values, members, memberIds).map((code) => (
          <li key={code}>{messages[code]}</li>
        ))}
      </ul>
    </StyledDeliveryStack>
  );
};
