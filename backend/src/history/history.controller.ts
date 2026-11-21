import {
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ScopeService } from '../scope/scope.service';
import { HistoryResponseDto } from './dto/history.dto';
import {
  HISTORY_QUERY_PARAMETERS,
  MAX_NODE_NAME_LENGTH,
  MAX_SELECTED_ELEMENTS,
  type RawHistoryQuery,
  parseHistoryQuery,
} from './history-params';
import { HistoryService } from './history.service';

/** zones.id, substations.id and circuits.id are PostgreSQL `integer` (int4) columns. */
const ID_ITEM_SCHEMA = {
  type: 'integer',
  format: 'int32',
  minimum: 1,
  maximum: 2_147_483_647,
} as const;

/** Repeatable filter: `?circuit_id=1&circuit_id=2` (form style, exploded). */
const repeatable = (items: object) =>
  ({
    required: false,
    style: 'form',
    explode: true,
    schema: { type: 'array', items, maxItems: MAX_SELECTED_ELEMENTS },
  }) as const;

const NOT_FOUND_EXAMPLE = {
  statusCode: 404,
  message: 'Selected scope element not found',
  error: 'Not Found',
};

const badRequest = (message: string) => ({
  statusCode: 400,
  message,
  error: 'Bad Request',
});

/**
 * SCRUM-283 · US20 (F-64, F-65, F-66): GET /history. The query is parsed and validated first (a 400
 * never touches the database), then the scope of the user in the token is resolved. The whole query
 * object is read, so that parameters other than HISTORY_QUERY_PARAMETERS are rejected (this
 * endpoint only; the other endpoints keep ignoring unknown parameters).
 */
@Controller('history')
@ApiTags('history')
export class HistoryController {
  constructor(
    private readonly historyService: HistoryService,
    private readonly scopeService: ScopeService,
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Historical series of fuse faults and loss-of-voltage alarms inside the authenticated user scope (US20: F-64, F-65, F-66).',
    description:
      'Counts fuse-opening faults and loss-of-voltage alarms per time bucket over the half-open range [from, to). from and to are required ISO 8601 instants with a time zone offset, from must be earlier than to and the range cannot exceed 366 days. Buckets are Bogota calendar days or weeks (America/Bogota, fixed UTC-05:00, weeks start Monday 00:00); the interval is automatic: day when the range is at most 62 days, otherwise week. Each bucket is returned with its full calendar boundaries as half-open [start, end) UTC instants; is_partial marks a first or last bucket that sticks out of the range, and counting only includes starts inside [max(start, from), min(end, to)). Each fault or alarm is counted once, in the bucket of its start, only when its start is in [from, to): anything already active before from is excluded. voltage_alarms counts loss of voltage only (NO_VOLTAGE, Falcon event code 13xx21); SMAC phase drop and phase out of range are not included. Optional filters zone_id, substation_id, circuit_id (positive integer ids) and node (node name) are repeatable and can be mixed: the covered area is the union of the selected elements (an element covers everything under it) intersected with the scope of the user, and without filters it is the whole scope. At most 100 elements can be selected in total, over all four filters together (after removing duplicates). Repeat a filter to select several elements (form style, exploded: ?circuit_id=1&circuit_id=2); comma lists are invalid. Only the parameters from, to, zone_id, substation_id, circuit_id and node are accepted: any other parameter, including node_id and bracket forms such as circuit_id[] or circuit_id[0], is rejected with 400 (this endpoint only). If any selected element does not exist, has no overlap with the scope of the user, or any filter is sent by a user with no scope, the whole request is 404 with the same body. A selected parent that overlaps the scope is valid and yields the intersection. A valid selection with no nodes or no events returns a series whose buckets all have zero counts. Clients must ignore unknown response fields: further aggregate fields may be added.',
  })
  @ApiQuery({
    name: 'from',
    required: true,
    type: String,
    format: 'date-time',
    example: '2026-10-21T00:00:00-05:00',
    description:
      'Inclusive start of the range: an ISO 8601 instant with a time zone offset (Z or +/-hh:mm).',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    type: String,
    format: 'date-time',
    example: '2026-11-20T00:00:00-05:00',
    description:
      'Exclusive end of the range: an ISO 8601 instant with a time zone offset, later than from and at most 366 days after it.',
  })
  @ApiQuery({
    name: 'zone_id',
    ...repeatable(ID_ITEM_SCHEMA),
    description:
      'Zone id (zones.id, a positive int4). Repeat the parameter to select several zones: ?zone_id=1&zone_id=2. The 100-element limit counts all four filters together.',
  })
  @ApiQuery({
    name: 'substation_id',
    ...repeatable(ID_ITEM_SCHEMA),
    description:
      'Substation id (substations.id, a positive int4). Repeat the parameter to select several substations. The 100-element limit counts all four filters together.',
  })
  @ApiQuery({
    name: 'circuit_id',
    ...repeatable(ID_ITEM_SCHEMA),
    description:
      'Circuit id (circuits.id, a positive int4). Repeat the parameter to select several circuits: ?circuit_id=1&circuit_id=2. The 100-element limit counts all four filters together.',
  })
  @ApiQuery({
    name: 'node',
    ...repeatable({
      type: 'string',
      minLength: 1,
      maxLength: MAX_NODE_NAME_LENGTH,
    }),
    description:
      'Node name (nodes.name), case-sensitive and used as given. Repeat the parameter to select several nodes. The 100-element limit counts all four filters together.',
  })
  @ApiOkResponse({
    type: HistoryResponseDto,
    description:
      'Series of fuse faults and loss-of-voltage alarms per bucket, with totals, for the selected area inside the scope. Every bucket of the range is present, including buckets whose counts are zero.',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: `A query parameter other than ${HISTORY_QUERY_PARAMETERS.join(', ')} was sent (including node_id or bracket forms such as circuit_id[]); from or to is missing, repeated or not an ISO 8601 instant with an offset; from is not earlier than to; the range exceeds 366 days; an id filter is not a positive int4 integer; a node name is empty or longer than ${MAX_NODE_NAME_LENGTH} characters; or more than ${MAX_SELECTED_ELEMENTS} elements are selected in total.`,
    examples: {
      unknownParameter: {
        summary: 'Unknown parameter (node_id instead of node)',
        value: badRequest(
          `Unknown query parameter "node_id". Allowed parameters: ${HISTORY_QUERY_PARAMETERS.join(', ')}`,
        ),
      },
      invalidInstant: {
        summary: 'from without a time zone offset',
        value: badRequest(
          'from must be an ISO 8601 date-time with a time zone offset, for example 2026-10-21T00:00:00-05:00',
        ),
      },
      rangeTooLong: {
        summary: 'Range longer than 366 days',
        value: badRequest(
          'The range between from and to must not exceed 366 days',
        ),
      },
      invalidId: {
        summary: 'Id filter that is not a positive integer',
        value: badRequest('circuit_id must be a positive integer id'),
      },
    },
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Bearer token is missing, invalid, expired, or logged out.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description:
      'A selected element does not exist, has no overlap with the scope of the user, or a filter was sent by a user with no scope. The body is identical in all these cases.',
    example: NOT_FOUND_EXAMPLE,
  })
  async findHistory(
    @Req() request: Request,
    @Query() rawQuery: RawHistoryQuery,
  ): Promise<HistoryResponseDto> {
    const query = parseHistoryQuery(rawQuery ?? {});
    const scope = await this.scopeService.resolve(userIdOf(request));

    return this.historyService.history(scope, query);
  }
}

/** User id from the verified token, or 401 (same rule as FaultsController; the guard checked the signature). */
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
