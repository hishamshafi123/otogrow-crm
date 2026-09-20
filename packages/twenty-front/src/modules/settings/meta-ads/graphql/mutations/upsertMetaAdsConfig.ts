import gql from 'graphql-tag';

export const UPSERT_META_ADS_CONFIG = gql`
  mutation UpsertMetaAdsConfig($input: UpsertMetaAdsConfigInput!) {
    upsertMetaAdsConfig(input: $input) {
      id
      appId
      hasAppSecret
      appSecretLastFour
      pageId
      hasPageAccessToken
      pageAccessTokenLastFour
      verifyToken
      formId
      isActive
    }
  }
`;
