import { MeetingAvailabilityService } from 'src/modules/meeting-booking/services/meeting-availability.service';
import {
  MeetingAvailabilityDTO,
  MeetingAvailabilityInput,
} from 'src/modules/meeting-booking/dtos/meeting-availability.dto';
import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { PermissionsGraphqlApiExceptionFilter } from 'src/engine/metadata-modules/permissions/utils/permissions-graphql-api-exception.filter';
import { BookMeetingOutputDTO } from 'src/modules/meeting-booking/dtos/book-meeting-output.dto';
import { BookMeetingInput } from 'src/modules/meeting-booking/dtos/book-meeting.input';
import { MeetingBookingService } from 'src/modules/meeting-booking/services/meeting-booking.service';

// Meetings are booked on behalf of the calling member's own Google calendar,
// so any authenticated workspace member may use this.
@CoreResolver()
@UseFilters(AuthGraphqlApiExceptionFilter, PermissionsGraphqlApiExceptionFilter)
@UseGuards(WorkspaceAuthGuard, NoPermissionGuard)
@UsePipes(ResolverValidationPipe)
export class MeetingBookingResolver {
  constructor(
    private readonly meetingBookingService: MeetingBookingService,
    private readonly availabilityService: MeetingAvailabilityService,
  ) {}

  @Query(() => MeetingAvailabilityDTO)
  meetingAvailability(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: MeetingAvailabilityInput,
  ) {
    return this.availabilityService.getAvailability(
      workspace.id,
      userWorkspaceId,
      input,
    );
  }

  @Mutation(() => BookMeetingOutputDTO)
  async bookMeeting(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @Args('input') input: BookMeetingInput,
  ): Promise<BookMeetingOutputDTO> {
    return this.meetingBookingService.bookMeeting({
      workspaceId: workspace.id,
      userWorkspaceId,
      input,
    });
  }
}
