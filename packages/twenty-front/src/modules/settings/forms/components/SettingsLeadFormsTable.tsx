import { styled } from '@linaria/react';

import { SettingsLeadFormTableRow } from '@/settings/forms/components/SettingsLeadFormTableRow';
import { LEAD_FORM_TABLE_ROW_GRID_TEMPLATE_COLUMNS } from '@/settings/forms/constants/LeadFormTableRowGridTemplateColumns';
import { Table } from '@/ui/layout/table/components/Table';
import { TableBody } from '@/ui/layout/table/components/TableBody';
import { TableHeader } from '@/ui/layout/table/components/TableHeader';
import { TableRow } from '@/ui/layout/table/components/TableRow';
import { Trans } from '@lingui/react/macro';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { useQuery } from '@apollo/client/react';
import { GetFormsDocument } from '~/generated-metadata/graphql';

const StyledTableBodyContainer = styled.div`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  max-height: 260px;
  overflow-y: auto;
`;

export const SettingsLeadFormsTable = () => {
  const { data: formsData } = useQuery(GetFormsDocument);

  const forms = formsData?.forms;

  return (
    <Table>
      <TableRow gridTemplateColumns={LEAD_FORM_TABLE_ROW_GRID_TEMPLATE_COLUMNS}>
        <TableHeader>
          <Trans>Name</Trans>
        </TableHeader>
        <TableHeader>
          <Trans>Status</Trans>
        </TableHeader>
        <TableHeader>
          <Trans>Created</Trans>
        </TableHeader>
        <TableHeader></TableHeader>
      </TableRow>
      {!!forms?.length && (
        <StyledTableBodyContainer>
          <TableBody>
            {forms.map((form) => (
              <SettingsLeadFormTableRow
                key={form.id}
                form={form}
                to={getSettingsPath(SettingsPath.LeadFormDetail, {
                  formId: form.id,
                })}
              />
            ))}
          </TableBody>
        </StyledTableBodyContainer>
      )}
    </Table>
  );
};
