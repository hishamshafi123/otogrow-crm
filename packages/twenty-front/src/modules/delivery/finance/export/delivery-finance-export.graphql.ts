import { gql } from '@apollo/client';

export const GET_DELIVERY_FINANCE_EXPORTS = gql`
  query DeliveryFinanceExports($input: DeliveryFinanceExportsInput!) {
    deliveryFinanceExports(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      canManage
      profiles {
        ...FinanceExportProfileFields
      }
      nextProfileId
      selectedProfile {
        ...FinanceExportProfileFields
      }
      batches {
        ...FinanceExportBatchFields
      }
      nextBatchId
      selectedBatch {
        batch {
          ...FinanceExportBatchFields
        }
        profile {
          ...FinanceExportProfileFields
        }
        rows {
          ...FinanceExportBatchRowFields
        }
        nextRowKey
        exclusions {
          key
          sourceId
          title
          sourceType
          sourceStatus
          code
          amountMicros
          blocking
          previousBatchCount
        }
        currentWarnings
      }
      projects {
        id
        name
      }
      allowedFields
      mappingScopes
      limitations
    }
  }
  fragment FinanceExportProfileFields on DeliveryFinanceExportProfile {
    id
    revision
    name
    basis
    active
    columns {
      header
      field
      constant
    }
    mappings {
      target
      scope
      key
      value
    }
    delimiter
    precision
    dateFormat
    includeBom
    changedAt
    changedByName
  }
  fragment FinanceExportBatchFields on DeliveryFinanceExportBatch {
    id
    profileId
    profileRevision
    profileName
    basis
    currency
    dateFrom
    dateTo
    serviceMonth
    accountingDate
    checksum
    byteLength
    totals {
      incomingMicros
      outgoingMicros
      netMicros
      sourceCount
      rowCount
      exclusionCount
      errorCount
      repeatedSourceCount
    }
    revision
    importStatus
    importReference
    importEvidenceUrl
    importChangedAt
    importChangedByName
    createdAt
    createdByName
    reexportReason
  }
  fragment FinanceExportBatchRowFields on DeliveryFinanceExportRow {
    key
    identityKey
    sourceId
    sourceRevision
    sourceType
    sourceReference
    sourceStatus
    date
    serviceMonth
    kind
    category
    title
    currency
    amountMicros
    projectId
    projectName
    evidenceUrl
    account
    paymentAccount
    counterparty
    cells
    errors
    warnings
    previousBatchCount
    latestBatchId
    currentStatus
    sourceChanged
  }
`;

export const GET_DELIVERY_FINANCE_EXPORT_PREVIEW = gql`
  query DeliveryFinanceExportPreview(
    $input: DeliveryFinanceExportPreviewInput!
  ) {
    deliveryFinanceExportPreview(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      canManage
      profile {
        id
        revision
        name
        basis
        active
        columns {
          header
          field
          constant
        }
        mappings {
          target
          scope
          key
          value
        }
        delimiter
        precision
        dateFormat
        includeBom
        changedAt
        changedByName
      }
      basis
      currency
      businessDate
      timezone
      clockConfirmed
      previewToken
      canCreate
      totals {
        incomingMicros
        outgoingMicros
        netMicros
        sourceCount
        rowCount
        exclusionCount
        errorCount
        repeatedSourceCount
      }
      rows {
        key
        identityKey
        sourceId
        sourceRevision
        sourceType
        sourceReference
        sourceStatus
        date
        serviceMonth
        kind
        category
        title
        currency
        amountMicros
        projectId
        projectName
        evidenceUrl
        account
        paymentAccount
        counterparty
        cells
        errors
        warnings
        previousBatchCount
        latestBatchId
        currentStatus
        sourceChanged
      }
      nextRowKey
      exclusions {
        key
        sourceId
        title
        sourceType
        sourceStatus
        code
        amountMicros
        blocking
        previousBatchCount
      }
      nextExclusionKey
      errors
      warnings
      limitations
    }
  }
`;

export const GET_DELIVERY_FINANCE_EXPORT_DOWNLOAD = gql`
  query DeliveryFinanceExportDownload(
    $input: DeliveryFinanceExportDownloadInput!
  ) {
    deliveryFinanceExportDownload(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      batchId
      fileName
      mimeType
      encoding
      csv
      checksum
      byteLength
    }
  }
`;

export const GET_DELIVERY_FINANCE_EXPORT_HISTORY = gql`
  query DeliveryFinanceExportHistory(
    $input: DeliveryFinanceExportHistoryInput!
  ) {
    deliveryFinanceExportHistory(input: $input) {
      workspaceId
      memberId
      userWorkspaceId
      nextBeforeId
      events {
        id
        sourceType
        sourceId
        action
        revision
        actorId
        actorName
        createdAt
        reason
        importStatus
        reference
        evidenceUrl
        checksum
        profile {
          id
          revision
          name
          basis
          active
          columns {
            header
            field
            constant
          }
          mappings {
            target
            scope
            key
            value
          }
          delimiter
          precision
          dateFormat
          includeBom
          changedAt
          changedByName
        }
      }
    }
  }
`;

export const SAVE_DELIVERY_FINANCE_EXPORT_PROFILE = gql`
  mutation SaveDeliveryFinanceExportProfile(
    $input: DeliveryFinanceExportProfileInput!
  ) {
    saveDeliveryFinanceExportProfile(input: $input) {
      profile {
        id
        revision
        name
        basis
        active
        columns {
          header
          field
          constant
        }
        mappings {
          target
          scope
          key
          value
        }
        delimiter
        precision
        dateFormat
        includeBom
        changedAt
        changedByName
      }
      replayed
    }
  }
`;
export const CREATE_DELIVERY_FINANCE_EXPORT_BATCH = gql`
  mutation CreateDeliveryFinanceExportBatch(
    $input: DeliveryFinanceExportBatchInput!
  ) {
    createDeliveryFinanceExportBatch(input: $input) {
      batch {
        id
        profileId
        profileRevision
        profileName
        basis
        currency
        dateFrom
        dateTo
        serviceMonth
        accountingDate
        checksum
        byteLength
        totals {
          incomingMicros
          outgoingMicros
          netMicros
          sourceCount
          rowCount
          exclusionCount
          errorCount
          repeatedSourceCount
        }
        revision
        importStatus
        importReference
        importEvidenceUrl
        importChangedAt
        importChangedByName
        createdAt
        createdByName
        reexportReason
      }
      replayed
    }
  }
`;
export const CHANGE_DELIVERY_FINANCE_EXPORT_IMPORT_STATUS = gql`
  mutation ChangeDeliveryFinanceExportImportStatus(
    $input: DeliveryFinanceExportImportStatusInput!
  ) {
    changeDeliveryFinanceExportImportStatus(input: $input) {
      batch {
        id
        profileId
        profileRevision
        profileName
        basis
        currency
        dateFrom
        dateTo
        serviceMonth
        accountingDate
        checksum
        byteLength
        totals {
          incomingMicros
          outgoingMicros
          netMicros
          sourceCount
          rowCount
          exclusionCount
          errorCount
          repeatedSourceCount
        }
        revision
        importStatus
        importReference
        importEvidenceUrl
        importChangedAt
        importChangedByName
        createdAt
        createdByName
        reexportReason
      }
      replayed
    }
  }
`;
