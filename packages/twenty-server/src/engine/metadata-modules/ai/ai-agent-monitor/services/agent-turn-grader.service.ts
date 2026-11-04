import {
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';

import { msg } from '@lingui/core/macro';
import { generateText } from 'ai';
import { isValidUuid } from 'twenty-shared/utils';
import { z } from 'zod';

import { NotFoundError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { AgentMessageEntity } from 'src/engine/metadata-modules/ai/ai-agent-execution/entities/agent-message.entity';
import { AgentTurnEntity } from 'src/engine/metadata-modules/ai/ai-agent-execution/entities/agent-turn.entity';
import { AgentTurnEvaluationEntity } from 'src/engine/metadata-modules/ai/ai-agent-monitor/entities/agent-turn-evaluation.entity';
import { buildAiTelemetry } from 'src/engine/metadata-modules/ai/ai-models/utils/build-ai-telemetry.util';
import { AiModelRegistryService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { OtogrowNativeAiService } from 'src/modules/otogrow-ai-budget/otogrow-native-ai.service';
import {
  AiException,
  AiExceptionCode,
} from 'src/engine/metadata-modules/ai/ai.exception';

const evaluationSchema = z
  .object({
    score: z.number().min(0).max(100),
    comment: z.string().trim().min(1).max(500),
  })
  .strict();
@Injectable()
export class AgentTurnGraderService {
  private readonly logger = new Logger(AgentTurnGraderService.name);

  constructor(
    @InjectWorkspaceScopedRepository(AgentTurnEntity)
    private readonly turnRepository: WorkspaceScopedRepository<AgentTurnEntity>,
    @InjectWorkspaceScopedRepository(AgentTurnEvaluationEntity)
    private readonly evaluationRepository: WorkspaceScopedRepository<AgentTurnEvaluationEntity>,
    private readonly aiModelRegistryService: AiModelRegistryService,
    private readonly nativeAi: OtogrowNativeAiService,
  ) {}

  async evaluateTurn({
    turnId,
    workspaceId,
    userWorkspaceId,
  }: {
    turnId: string;
    workspaceId: string;
    userWorkspaceId?: string;
  }): Promise<AgentTurnEvaluationEntity> {
    const turn = await this.turnRepository.findOne(workspaceId, {
      where: { id: turnId },
      relations: ['messages', 'messages.parts', 'thread'],
    });

    if (!turn) {
      throw new NotFoundError(`Turn ${turnId} not found`, {
        userFriendlyMessage: msg`This evaluation target could not be found.`,
      });
    }

    const { score, comment } = await this.evaluateWithAI(
      turn,
      userWorkspaceId ?? turn.thread?.userWorkspaceId,
    );

    return this.evaluationRepository.insertAndReturnOne(workspaceId, {
      turnId,
      score,
      comment,
    });
  }

  private async evaluateWithAI(
    turn: AgentTurnEntity & { messages: AgentMessageEntity[] },
    userWorkspaceId: string | null | undefined,
  ): Promise<{ score: number; comment: string }> {
    if (typeof userWorkspaceId !== 'string' || !isValidUuid(userWorkspaceId))
      throw new ForbiddenException('An active person must own this AI review.');
    try {
      const defaultModel = this.aiModelRegistryService.getDefaultSpeedModel();

      if (!defaultModel) {
        throw new AiException(
          'Configure an available model before requesting an AI review.',
          AiExceptionCode.API_KEY_NOT_CONFIGURED,
        );
      }

      const evaluationContext = this.buildEvaluationContext(turn);

      const prompt = `You are evaluating an AI agent's performance on a single turn (user request + agent response).

${evaluationContext}

Evaluate this agent turn based on:
1. **Task Completion**: Did the agent accomplish what the user asked?
2. **Tool Usage**: Were tools used correctly and appropriately?
3. **Response Quality**: Is the response clear, accurate, and helpful?
4. **Error Handling**: Were errors handled gracefully?

Provide:
- A score from 0 to 100 (0 = complete failure, 100 = perfect)
- A brief comment explaining the score (max 200 characters)

Respond ONLY with valid JSON in this exact format:
{"score": <number>, "comment": "<string>"}`;

      const result = await generateText({
        model: this.nativeAi.wrap(defaultModel.model, {
          workspaceId: turn.workspaceId,
          userWorkspaceId,
          modelId: defaultModel.modelId,
          modelConfig: this.aiModelRegistryService.getEffectiveModelConfig(
            defaultModel.modelId,
          ),
        }),
        maxOutputTokens: 512,
        prompt,
        temperature: 0.3,
        experimental_telemetry: buildAiTelemetry({
          functionId: 'agent-turn-grading',
          workspaceId: turn.workspaceId,
          agentId: turn.agentId,
          threadId: turn.threadId,
          turnId: turn.id,
        }),
      });

      const parsed = evaluationSchema.parse(JSON.parse(result.text));

      return {
        score: Math.round(parsed.score),
        comment: parsed.comment,
      };
    } catch (error) {
      if (error instanceof HttpException || error instanceof AiException)
        throw error;
      this.logger.error(
        'AI review could not be completed; no evaluation was saved.',
      );
      throw new AiException(
        'AI review could not be completed. No evaluation was saved. Check the model connection and AI spending status before trying again.',
        AiExceptionCode.AGENT_EXECUTION_FAILED,
      );
    }
  }

  private buildEvaluationContext(
    turn: AgentTurnEntity & { messages: AgentMessageEntity[] },
  ): string {
    const userMessages = turn.messages.filter((m) => m.role === 'user');
    const assistantMessages = turn.messages.filter(
      (m) => m.role === 'assistant',
    );

    const userText = userMessages
      .flatMap((m) => m.parts || [])
      .filter((p) => p.textContent)
      .map((p) => p.textContent)
      .join('\n');

    const assistantParts = assistantMessages.flatMap((m) => m.parts || []);

    const assistantText = assistantParts
      .filter((p) => p.textContent)
      .map((p) => p.textContent)
      .join('\n');

    const toolCalls = assistantParts
      .filter((p) => p.toolName)
      .map((p) => ({
        tool: p.toolName,
        hasError: !!p.errorMessage,
        error: p.errorMessage,
      }));

    const errors = assistantParts
      .filter((p) => p.errorMessage)
      .map((p) => p.errorMessage);

    let context = `**User Request:**\n${userText || '(no text)'}\n\n`;

    context += `**Agent Response:**\n${assistantText || '(no text response)'}\n\n`;

    if (toolCalls.length > 0) {
      context += `**Tools Used:**\n${toolCalls.map((t) => `- ${t.tool}${t.hasError ? ' (FAILED)' : ''}`).join('\n')}\n\n`;
    }

    if (errors.length > 0) {
      context += `**Errors:**\n${errors.map((e) => `- ${e}`).join('\n')}\n\n`;
    }

    return context;
  }
}
