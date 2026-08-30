import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { EnrollInSequenceInput } from 'src/modules/sequences/dtos/enroll-in-sequence.input';
import { EnrollInSequenceOutputDTO } from 'src/modules/sequences/dtos/enroll-in-sequence-output.dto';
import { SequenceAnalyticsDTO } from 'src/modules/sequences/dtos/sequence-analytics.dto';
import { UnenrollFromSequenceInput } from 'src/modules/sequences/dtos/unenroll-from-sequence.input';
import { UnenrollFromSequenceOutputDTO } from 'src/modules/sequences/dtos/unenroll-from-sequence-output.dto';
import { SequenceGraphqlApiExceptionFilter } from 'src/modules/sequences/filters/sequence-graphql-api-exception.filter';
import { SequenceEnrollmentService } from 'src/modules/sequences/services/sequence-enrollment.service';

@UseGuards(
  WorkspaceAuthGuard,
  SettingsPermissionGuard(PermissionFlagType.WORKSPACE),
)
@UseFilters(SequenceGraphqlApiExceptionFilter)
@UsePipes(ResolverValidationPipe)
@MetadataResolver()
export class SequenceResolver {
  constructor(
    private readonly sequenceEnrollmentService: SequenceEnrollmentService,
  ) {}

  @Mutation(() => EnrollInSequenceOutputDTO)
  async enrollInSequence(
    @Args('input') input: EnrollInSequenceInput,
    @AuthWorkspace() currentWorkspace: WorkspaceEntity,
  ): Promise<EnrollInSequenceOutputDTO> {
    return this.sequenceEnrollmentService.enroll({
      workspaceId: currentWorkspace.id,
      sequenceId: input.sequenceId,
      personIds: input.personIds,
    });
  }

  @Mutation(() => UnenrollFromSequenceOutputDTO)
  async unenrollFromSequence(
    @Args('input') input: UnenrollFromSequenceInput,
    @AuthWorkspace() currentWorkspace: WorkspaceEntity,
  ): Promise<UnenrollFromSequenceOutputDTO> {
    const unenrolledCount = await this.sequenceEnrollmentService.unenroll({
      workspaceId: currentWorkspace.id,
      enrollmentIds: input.enrollmentIds,
    });

    return { unenrolledCount };
  }

  @Query(() => SequenceAnalyticsDTO)
  async sequenceAnalytics(
    @Args('sequenceId', { type: () => UUIDScalarType }) sequenceId: string,
    @AuthWorkspace() currentWorkspace: WorkspaceEntity,
  ): Promise<SequenceAnalyticsDTO> {
    return this.sequenceEnrollmentService.getAnalytics({
      workspaceId: currentWorkspace.id,
      sequenceId,
    });
  }
}
