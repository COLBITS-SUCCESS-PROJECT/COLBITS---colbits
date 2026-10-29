import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ScopeService } from '../scope/scope.service';
import { NodeFuseSetsResponseDto, NodesResponseDto } from './dto/nodes.dto';
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
    const scope = await this.scopeService.resolve(userIdOf(request));

    return this.nodesService.findAll(scope);
  }

  @Get(':name/fuse-sets')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Fuse sets of a node with their number of clients (node detail, F-29).',
  })
  @ApiParam({
    name: 'name',
    example: '0000100002',
    description: 'Node identifier.',
  })
  @ApiOkResponse({ type: NodeFuseSetsResponseDto })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Bearer token is missing, invalid, or expired.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Node was not found in the authenticated user scope.',
  })
  async findFuseSets(@Param('name') name: string, @Req() request: Request) {
    const userId = userIdOf(request);
    const nodeName = typeof name === 'string' ? name.trim() : '';

    // Node names are short identifiers; anything else cannot exist.
    if (nodeName.length === 0 || nodeName.length > 64) {
      throw new NotFoundException('Node not found');
    }

    const scope = await this.scopeService.resolve(userId);

    return this.nodesService.fuseSetsOf(nodeName, scope);
  }
}

/** User id from the verified token, or 401 (the guard already checked the signature). */
function userIdOf(request: Request): number {
  const userId: unknown = (request as Request & { user?: { sub?: unknown } })
    .user?.sub;

  if (
    typeof userId !== 'number' ||
    !Number.isSafeInteger(userId) ||
    userId <= 0
  ) {
    throw new UnauthorizedException('Invalid user identity');
  }

  return userId;
}
