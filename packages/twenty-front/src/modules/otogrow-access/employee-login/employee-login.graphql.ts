import { gql } from '@apollo/client';

export type CreateOtogrowEmployeeLoginInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  crmRoleId?: string | null;
  otogrowRoleIds?: string[];
};

export type CreatedOtogrowEmployeeLogin = {
  userId: string;
  workspaceMemberId: string;
  email: string;
  firstName: string;
  lastName: string;
  signInUrl: string;
  otogrowRoleNames: string[];
};

export type ResetOtogrowEmployeePasswordInput = {
  workspaceMemberId: string;
  password: string;
};

export type ResetOtogrowEmployeePasswordResult = {
  workspaceMemberId: string;
  email: string;
  firstName: string;
  lastName: string;
  signInUrl: string;
};

export const CREATE_OTOGROW_EMPLOYEE_LOGIN = gql`
  mutation CreateOtogrowEmployeeLogin($input: JSON!) {
    createOtogrowEmployeeLogin(input: $input)
  }
`;

export const RESET_OTOGROW_EMPLOYEE_PASSWORD = gql`
  mutation ResetOtogrowEmployeePassword($input: JSON!) {
    resetOtogrowEmployeePassword(input: $input)
  }
`;
