import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import {
  CoreObjectNameSingular,
  type RecordGqlOperationGqlRecordFields,
  type RecordGqlOperationOrderBy,
} from 'twenty-shared/types';
import { IconPhoneIncoming, IconPhoneOutgoing } from 'twenty-ui/icon';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { useOpenDialer } from '@/calling/hooks/useOpenDialer';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';

const RECENT_CALLS_LIMIT = 5;

const CALL_RECORD_FIELDS = {
  id: true,
  direction: true,
  status: true,
  fromNumber: true,
  toNumber: true,
  durationSeconds: true,
  createdAt: true,
  personId: true,
} as const satisfies RecordGqlOperationGqlRecordFields;

const RECENT_CALLS_ORDER_BY: RecordGqlOperationOrderBy = [
  { createdAt: 'DescNullsLast' },
];

type CallRecord = ObjectRecord & {
  direction: 'INBOUND' | 'OUTBOUND';
  status: string;
  fromNumber: string;
  toNumber: string;
  durationSeconds: number | null;
};

const StyledList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 196px;
  overflow-y: auto;
`;

const StyledRow = styled.button`
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  padding: 8px 10px;
  text-align: left;
  transition:
    background-color 140ms ease,
    border-color 140ms ease;

  &:hover {
    background: ${themeCssVariables.color.transparent.iris1};
    border-color: ${themeCssVariables.color.iris5};
  }
`;

const StyledNumber = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-variant-numeric: tabular-nums;
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledStatus = styled.span`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 999px;
  color: ${themeCssVariables.font.color.tertiary};
  font-family: ${themeCssVariables.code.font.family};
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  margin-left: auto;
  padding: 2px 8px;
  text-transform: uppercase;
`;

const StyledEmpty = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px dashed ${themeCssVariables.border.color.medium};
  border-radius: 10px;
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[3]};
  text-align: center;
`;

export const RecentCallsList = () => {
  const { t } = useLingui();
  const { openDialer } = useOpenDialer();

  const { canReadObjectRecords } = useObjectPermissionsForObject(
    CoreObjectNameSingular.Call,
  );

  const { records } = useFindManyRecords<CallRecord>({
    objectNameSingular: CoreObjectNameSingular.Call,
    recordGqlFields: CALL_RECORD_FIELDS,
    orderBy: RECENT_CALLS_ORDER_BY,
    limit: RECENT_CALLS_LIMIT,
    skip: !canReadObjectRecords,
  });

  if (records.length === 0) {
    return <StyledEmpty>{t`No recent calls`}</StyledEmpty>;
  }

  return (
    <StyledList>
      {records.map((call) => {
        const contactNumber =
          call.direction === 'OUTBOUND' ? call.toNumber : call.fromNumber;
        const DirectionIcon =
          call.direction === 'OUTBOUND' ? IconPhoneOutgoing : IconPhoneIncoming;

        return (
          <StyledRow
            key={call.id}
            type="button"
            onClick={() =>
              openDialer({
                phoneNumber: contactNumber,
                personId: call.personId ?? null,
              })
            }
            aria-label={t`Call ${contactNumber} again`}
          >
            <DirectionIcon size={16} />
            <StyledNumber>{contactNumber}</StyledNumber>
            <StyledStatus>{call.status}</StyledStatus>
          </StyledRow>
        );
      })}
    </StyledList>
  );
};
