import { FieldActorSource } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { type EntityManager } from 'typeorm';

import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByUniversalIdentifier } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-universal-identifier.util';
import { type FlatPageLayout } from 'src/engine/metadata-modules/flat-page-layout/types/flat-page-layout.type';
import { STANDARD_PAGE_LAYOUTS } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-page-layout.constant';

export const OTOGROW_ANALYTICS_DASHBOARD_ID =
  '73385cb3-bea3-4b34-82fa-09f6418b8ad6';

export const prefillOtogrowAnalyticsDashboard = async (
  entityManager: EntityManager,
  schemaName: string,
  flatPageLayoutMaps: FlatEntityMaps<FlatPageLayout>,
) => {
  const otogrowAnalyticsPageLayout = findFlatEntityByUniversalIdentifier({
    flatEntityMaps: flatPageLayoutMaps,
    universalIdentifier:
      STANDARD_PAGE_LAYOUTS.otogrowAnalyticsDashboard.universalIdentifier,
  });

  if (!isDefined(otogrowAnalyticsPageLayout)) {
    throw new Error(
      `Page layout with universalIdentifier '${STANDARD_PAGE_LAYOUTS.otogrowAnalyticsDashboard.universalIdentifier}' not found`,
    );
  }

  await entityManager
    .createQueryBuilder()
    .insert()
    .into(`${schemaName}.dashboard`, [
      'id',
      'title',
      'pageLayoutId',
      'position',
      'createdBySource',
      'createdByWorkspaceMemberId',
      'createdByName',
      'createdByContext',
      'updatedBySource',
      'updatedByWorkspaceMemberId',
      'updatedByName',
      'updatedByContext',
    ])
    .orIgnore()
    .values([
      {
        id: OTOGROW_ANALYTICS_DASHBOARD_ID,
        title: 'Otogrow Analytics',
        pageLayoutId: otogrowAnalyticsPageLayout.id,
        position: 1,
        createdBySource: FieldActorSource.SYSTEM,
        createdByWorkspaceMemberId: null,
        createdByName: 'System',
        createdByContext: {},
        updatedBySource: FieldActorSource.SYSTEM,
        updatedByWorkspaceMemberId: null,
        updatedByName: 'System',
        updatedByContext: {},
      },
    ])
    .returning('*')
    .execute();
};
