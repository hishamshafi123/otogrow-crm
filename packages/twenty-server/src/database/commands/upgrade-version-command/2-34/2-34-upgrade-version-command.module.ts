import { Module } from '@nestjs/common';

import { WorkspaceIteratorModule } from 'src/database/commands/command-runners/workspace-iterator.module';
import { SyncChannelMessageStandardObjectsCommand } from 'src/database/commands/upgrade-version-command/2-34/2-34-workspace-command-1787565000000-sync-channel-message-standard-objects.command';
import { SyncLeadScoringStandardObjectsCommand } from 'src/database/commands/upgrade-version-command/2-34/2-34-workspace-command-1787600000000-sync-lead-scoring-standard-objects.command';
import { SyncQuotingStandardObjectsCommand } from 'src/database/commands/upgrade-version-command/2-34/2-34-workspace-command-1787929627000-sync-quoting-standard-objects.command';
import { SyncClientPortalWidgetCommand } from 'src/database/commands/upgrade-version-command/2-34/2-34-workspace-command-1787957598573-sync-client-portal-widget.command';
import { SyncCallStandardObjectsCommand } from 'src/database/commands/upgrade-version-command/2-34/2-34-workspace-command-1789793812031-sync-call-standard-objects.command';
import { SyncMeetingBookingCommand } from 'src/database/commands/upgrade-version-command/2-34/2-34-workspace-command-1789878659246-sync-meeting-booking.command';
import { SyncMetaAdLeadSourceCommand } from 'src/database/commands/upgrade-version-command/2-34/2-34-workspace-command-1790000001001-sync-meta-ad-lead-source.command';
import { SyncLeadLifecycleFieldsCommand } from 'src/database/commands/upgrade-version-command/2-34/2-34-workspace-command-1790000002001-sync-lead-lifecycle-fields.command';
import { SyncOtogrowAnalyticsCommand } from 'src/database/commands/upgrade-version-command/2-34/2-34-workspace-command-1787856793000-sync-otogrow-analytics.command';
import { SyncSequenceStandardObjectsCommand } from 'src/database/commands/upgrade-version-command/2-34/2-34-workspace-command-1787525000000-sync-sequence-standard-objects.command';
import { WorkspaceManyOrAllFlatEntityMapsCacheModule } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.module';
import { TwentyStandardApplicationModule } from 'src/engine/workspace-manager/twenty-standard-application/twenty-standard-application.module';

@Module({
  imports: [
    WorkspaceIteratorModule,
    TwentyStandardApplicationModule,
    WorkspaceManyOrAllFlatEntityMapsCacheModule,
  ],
  providers: [
    SyncSequenceStandardObjectsCommand,
    SyncChannelMessageStandardObjectsCommand,
    SyncLeadScoringStandardObjectsCommand,
    SyncQuotingStandardObjectsCommand,
    SyncClientPortalWidgetCommand,
    SyncCallStandardObjectsCommand,
    SyncOtogrowAnalyticsCommand,
    SyncMeetingBookingCommand,
    SyncMetaAdLeadSourceCommand,
    SyncLeadLifecycleFieldsCommand,
  ],
})
export class V2_34_UpgradeVersionCommandModule {}
