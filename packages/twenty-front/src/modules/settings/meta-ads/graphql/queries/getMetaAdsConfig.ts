import gql from 'graphql-tag';

export const GET_META_ADS_CONFIG = gql`
  query GetMetaAdsConfig {
    metaAdsConfig {
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
