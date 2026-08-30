import { Command } from 'nest-commander';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { prefillOtogrowAnalyticsDashboard } from 'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-otogrow-analytics-dashboard.util';
import { TwentyStandardApplicationService } from 'src/engine/workspace-manager/twenty-standard-application/services/twenty-standard-application.service';
import {
  FORM_SUBMISSION_NOTE_TITLE_PREFIX,
  LEAD_SCORE_BAND_HOT_MIN,
  LEAD_SCORE_BAND_WARM_MIN,
} from 'src/modules/lead-scoring/constants/lead-scoring.constant';

@RegisteredWorkspaceCommand('2.34.0', 1787856793000)
@Command({
  name: 'upgrade:2-34:sync-otogrow-analytics',
  description:
    'Re-sync the twenty-standard application so existing workspaces get the person.leadSource and person.leadScoreBand fields and the Otogrow Analytics dashboard page layout, insert the Otogrow Analytics dashboard row, and backfill leadSource/leadScoreBand on existing people',
})
export class SyncOtogrowAnalyticsCommand extends ProvisionedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly twentyStandardApplicationService: TwentyStandardApplicationService,
    private readonly flatEntityMapsCacheService: WorkspaceManyOrAllFlatEntityMapsCacheService,
    @InjectDataSource()
    private readonly coreDataSource: DataSource,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
  }: RunOnWorkspaceArgs): Promise<void> {
    await this.twentyStandardApplicationService.synchronizeTwentyStandardApplicationOrThrow(
      { workspaceId },
    );

    const { flatPageLayoutMaps } =
      await this.flatEntityMapsCacheService.getOrRecomputeManyOrAllFlatEntityMaps(
        {
          workspaceId,
          flatMapsKeys: ['flatPageLayoutMaps'],
        },
      );

    const schemaName = getWorkspaceSchemaName(workspaceId);
    const queryRunner = this.coreDataSource.createQueryRunner();

    await queryRunner.connect();

    try {
      await queryRunner.startTransaction();

      await prefillOtogrowAnalyticsDashboard(
        queryRunner.manager,
        schemaName,
        flatPageLayoutMaps,
      );

      // Form-created people carry a "Form submission: ..." note targeted at
      // them; it is the only form provenance available on existing records.
      // The column default already filled existing rows with MANUAL, so the
      // MANUAL case is overwritten here but never a channel set by a writer.
      await queryRunner.query(
        `UPDATE "${schemaName}"."person" p
         SET "leadSource" = 'FORM'::"${schemaName}"."person_leadSource_enum"
         WHERE (p."leadSource" IS NULL OR p."leadSource" = 'MANUAL')
           AND EXISTS (
             SELECT 1
             FROM "${schemaName}"."noteTarget" nt
             JOIN "${schemaName}"."note" n ON n."id" = nt."noteId"
             WHERE nt."targetPersonId" = p."id"
               AND n."title" LIKE $1
           )`,
        [`${FORM_SUBMISSION_NOTE_TITLE_PREFIX}%`],
      );

      await queryRunner.query(
        `UPDATE "${schemaName}"."person"
         SET "leadSource" = 'MANUAL'::"${schemaName}"."person_leadSource_enum"
         WHERE "leadSource" IS NULL`,
      );

      // leadScoreBand is fully derived from leadScore, so recompute it for
      // every row rather than only the ones the column default never reached
      await queryRunner.query(
        `UPDATE "${schemaName}"."person"
         SET "leadScoreBand" = (CASE
           WHEN COALESCE("leadScore", 0) >= ${LEAD_SCORE_BAND_HOT_MIN} THEN 'HOT'
           WHEN COALESCE("leadScore", 0) >= ${LEAD_SCORE_BAND_WARM_MIN} THEN 'WARM'
           ELSE 'COLD'
         END)::"${schemaName}"."person_leadScoreBand_enum"`,
      );

      await queryRunner.commitTransaction();
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }

      throw error;
    } finally {
      await queryRunner.release();
    }

    this.logger.log(
      `Synced Otogrow Analytics dashboard and backfilled leadSource/leadScoreBand for workspace ${workspaceId}`,
    );
  }
}
