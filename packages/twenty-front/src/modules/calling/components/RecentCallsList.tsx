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
  max-height: 180px;
  overflow-y: auto;
`;

const StyledRow = styled.button`
  align-items: center;
  background: transparent;
  border: none;
  border-radius: ${themeCssVariables.border.radius.sm};
  cursor: pointer;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]};
  text-align: left;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }
`;

const StyledNumber = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
`;

const StyledStatus = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  margin-left: auto;
`;

const StyledEmpty = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[2]};
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
