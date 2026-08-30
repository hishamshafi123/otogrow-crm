import { styled } from '@linaria/react';

import { LEAD_FORM_TABLE_ROW_GRID_TEMPLATE_COLUMNS } from '@/settings/forms/constants/LeadFormTableRowGridTemplateColumns';
import { TableCell } from '@/ui/layout/table/components/TableCell';
import { TableRow } from '@/ui/layout/table/components/TableRow';
import { useLingui } from '@lingui/react/macro';
import { useContext } from 'react';
import { IconChevronRight } from 'twenty-ui/icon';
import { ThemeContext, themeCssVariables } from 'twenty-ui/theme-constants';
import { type Form } from '~/generated-metadata/graphql';
import { formatToHumanReadableDate } from '~/utils/date-utils';

const StyledEllipsisLabel = styled.div`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

type SettingsLeadFormTableRowProps = {
  form: Pick<Form, 'id' | 'name' | 'isActive' | 'createdAt'>;
  to: string;
};

export const SettingsLeadFormTableRow = ({
  form,
  to,
}: SettingsLeadFormTableRowProps) => {
  const { t } = useLingui();
  const { theme } = useContext(ThemeContext);

  return (
    <TableRow
      gridTemplateColumns={LEAD_FORM_TABLE_ROW_GRID_TEMPLATE_COLUMNS}
      to={to}
    >
      <TableCell color={themeCssVariables.font.color.primary} overflow="hidden">
        <StyledEllipsisLabel>{form.name}</StyledEllipsisLabel>
      </TableCell>
      <TableCell color={themeCssVariables.font.color.tertiary}>
        {form.isActive ? t`Active` : t`Inactive`}
      </TableCell>
      <TableCell color={themeCssVariables.font.color.tertiary}>
        {formatToHumanReadableDate(form.createdAt)}
      </TableCell>
      <TableCell align="right">
        <IconChevronRight
          size={theme.icon.size.md}
          color={themeCssVariables.font.color.tertiary}
        />
      </TableCell>
    </TableRow>
  );
};
