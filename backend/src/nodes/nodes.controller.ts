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
import { NodeDetailResponseDto } from './dto/node-detail.dto';
import { NodeFuseSetsResponseDto, NodesResponseDto } from './dto/nodes.dto';
import { NodeDetailService } from './node-detail.service';
import { NodesService } from './nodes.service';

@Controller('nodes')
@ApiTags('nodes')
export class NodesController {
  constructor(
    private readonly nodesService: NodesService,
    private readonly scopeService: ScopeService,
    private readonly nodeDetailService: NodeDetailService,
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List nodes visible to the authenticated user.',
    description:
      'Not paginated. A Colbits administrator sees every node; a consultation user, only those under their assigned nodes, circuits, substations or zones (F-10); an inactive account, none. The fuse and transformer states are recomputed from the latest telemetry on every call, so polling this endpoint keeps them current (F-25, F-26).',
  })
  @ApiOkResponse({
    type: NodesResponseDto,
    description: 'Nodes in scope, ordered by name.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Bearer token is missing, invalid, expired, or logged out.',
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
    description:
      'A node that does not exist and a node outside the user scope give the same 404, so the endpoint never reveals which nodes exist (F-10).',
  })
  @ApiParam({
    name: 'name',
    example: '0000100002',
    description: 'Node identifier.',
  })
  @ApiOkResponse({
    type: NodeFuseSetsResponseDto,
    description: 'Fuse sets of the node.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Bearer token is missing, invalid, expired, or logged out.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Node was not found in the authenticated user scope.',
  })
  async findFuseSets(@Param('name') name: string, @Req() request: Request) {
    const userId = userIdOf(request);
    const nodeName = nodeNameOf(name);
    const scope = await this.scopeService.resolve(userId);

    return this.nodesService.fuseSetsOf(nodeName, scope);
  }

  @Get(':name/detail')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Node detail for the map: circuit, substation, fuses and transformers (F-27, F-29).',
    description:
      'What the map shows when a node is selected, with the last Falcon and SMAC records. A node that does not exist and a node outside the user scope give the same 404 (F-10).',
  })
  @ApiParam({
    name: 'name',
    example: '0000100002',
    description: 'Node identifier.',
  })
  @ApiOkResponse({
    type: NodeDetailResponseDto,
    description: 'Detail of the node.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Bearer token is missing, invalid, expired, or logged out.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Node was not found in the authenticated user scope.',
  })
  async findDetail(@Param('name') name: string, @Req() request: Request) {
    const userId = userIdOf(request);
    const nodeName = nodeNameOf(name);
    const scope = await this.scopeService.resolve(userId);

    return this.nodeDetailService.detailOf(nodeName, scope);
  }
}

/** Trimmed node name, or 404: node names are short identifiers, anything else cannot exist. */
function nodeNameOf(name: unknown): string {
  const nodeName = typeof name === 'string' ? name.trim() : '';

  if (nodeName.length === 0 || nodeName.length > 64) {
    throw new NotFoundException('Node not found');
  }

  return nodeName;
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
