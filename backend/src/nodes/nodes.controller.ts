import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ScopeService } from '../scope/scope.service';
import { NodeDetailResponseDto } from './dto/node-detail.dto';
import { NodeTelemetryResponseDto } from './dto/node-telemetry.dto';
import { NodeFuseSetsResponseDto, NodesResponseDto } from './dto/nodes.dto';
import { NodeDetailService } from './node-detail.service';
import {
  MAX_NODE_TELEMETRY_RANGE_DAYS,
  NODE_TELEMETRY_QUERY_PARAMETERS,
  type RawNodeTelemetryQuery,
  parseNodeTelemetryQuery,
} from './node-telemetry-params';
import { NodeTelemetryService } from './node-telemetry.service';
import { NodesService } from './nodes.service';

const badRequest = (message: string) => ({
  statusCode: 400,
  message,
  error: 'Bad Request',
});

@Controller('nodes')
@ApiTags('nodes')
export class NodesController {
  constructor(
    private readonly nodesService: NodesService,
    private readonly scopeService: ScopeService,
    private readonly nodeDetailService: NodeDetailService,
    private readonly nodeTelemetryService: NodeTelemetryService,
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

  @Get(':name/telemetry')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Raw Falcon and SMAC telemetry of a node for a time window, by stable element id (node view, F-72, F-75).',
    description: `Raw records over the half-open range [from, to). from and to are required ISO 8601 instants with a time zone offset (for example 2026-06-01T00:00:00-05:00) and the range cannot exceed ${MAX_NODE_TELEMETRY_RANGE_DAYS} days (an initial technical decision pending frontend coordination, not a client requirement). Fuses and transformers are resolved by custom_id, so the history continues across a device replacement: each row carries the hw_id that produced it, and the rows of the old and the new device at the same instant are both returned. The SMAC vc, pw and pf records are returned raw, one list per table, not aligned (alignment is a separate task). A consultation user with individual-device assignments only receives the elements those assignments match (by custom_id or current hw_id) and then their whole custom_id history; this replacement behavior is a provisional interpretation pending Product Owner confirmation. A node that does not exist and a node outside the user scope give the same 404 (F-10). The unit internal_temperature in °C is assumed, not confirmed by the client.`,
  })
  @ApiParam({
    name: 'name',
    example: '0000100002',
    description: 'Node identifier.',
  })
  @ApiQuery({
    name: 'from',
    required: true,
    type: String,
    format: 'date-time',
    example: '2026-06-01T00:00:00-05:00',
    description:
      'Inclusive start of the range: an ISO 8601 instant with a time zone offset (Z or +/-hh:mm).',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    type: String,
    format: 'date-time',
    example: '2026-06-08T00:00:00-05:00',
    description: `Exclusive end of the range: an ISO 8601 instant with a time zone offset, later than from and at most ${MAX_NODE_TELEMETRY_RANGE_DAYS} days after it.`,
  })
  @ApiOkResponse({
    type: NodeTelemetryResponseDto,
    description:
      'Raw records of the fuses and transformers of the node the user may see, oldest first.',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: `A query parameter other than ${NODE_TELEMETRY_QUERY_PARAMETERS.join(', ')} was sent; from or to is missing, repeated or not an ISO 8601 instant with an offset; from is not earlier than to; or the range exceeds ${MAX_NODE_TELEMETRY_RANGE_DAYS} days.`,
    examples: {
      unknownParameter: {
        summary: 'Unknown parameter',
        value: badRequest(
          `Unknown query parameter "custom_id". Allowed parameters: ${NODE_TELEMETRY_QUERY_PARAMETERS.join(', ')}`,
        ),
      },
      fromRequired: {
        summary: 'from is missing',
        value: badRequest('from is required'),
      },
      invalidInstant: {
        summary: 'from without a time zone offset',
        value: badRequest(
          'from must be an ISO 8601 date-time with a time zone offset, for example 2026-10-21T00:00:00-05:00',
        ),
      },
      fromNotBeforeTo: {
        summary: 'from is not earlier than to',
        value: badRequest('from must be earlier than to'),
      },
      rangeTooLong: {
        summary: `Range longer than ${MAX_NODE_TELEMETRY_RANGE_DAYS} days`,
        value: badRequest(
          `The range between from and to must not exceed ${MAX_NODE_TELEMETRY_RANGE_DAYS} days`,
        ),
      },
    },
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Bearer token is missing, invalid, expired, or logged out.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Node was not found in the authenticated user scope.',
  })
  async findTelemetry(
    @Param('name') name: string,
    @Query() rawQuery: RawNodeTelemetryQuery,
    @Req() request: Request,
  ) {
    const userId = userIdOf(request);
    const nodeName = nodeNameOf(name);
    // Every 400 is decided here, before the scope (and so the database) is touched.
    const window = parseNodeTelemetryQuery(rawQuery);
    const scope = await this.scopeService.resolve(userId);

    return this.nodeTelemetryService.telemetryOf(nodeName, window, scope);
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
