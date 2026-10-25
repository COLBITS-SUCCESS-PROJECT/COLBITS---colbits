import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ScopeService } from '../scope/scope.service';
import { NodesResponseDto } from './dto/nodes.dto';
import { NodesService } from './nodes.service';

@Controller('nodes')
@ApiTags('nodes')
export class NodesController {
  constructor(
    private readonly nodesService: NodesService,
    private readonly scopeService: ScopeService,
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List nodes visible to the authenticated user.' })
  @ApiOkResponse({ type: NodesResponseDto })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Bearer token is missing, invalid, or expired.',
  })
  async findAll(@Req() request: Request) {
    const userId: unknown = (request as Request & { user?: { sub?: unknown } })
      .user?.sub;

    if (
      typeof userId !== 'number' ||
      !Number.isSafeInteger(userId) ||
      userId <= 0
    ) {
      throw new UnauthorizedException('Invalid user identity');
    }

    const scope = await this.scopeService.resolve(userId);

    return this.nodesService.findAll(scope);
  }
}
