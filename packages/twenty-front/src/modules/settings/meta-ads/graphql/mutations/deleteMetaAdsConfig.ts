import gql from 'graphql-tag';

export const DELETE_META_ADS_CONFIG = gql`
  mutation DeleteMetaAdsConfig {
    deleteMetaAdsConfig {
      id
    }
  }
`;
