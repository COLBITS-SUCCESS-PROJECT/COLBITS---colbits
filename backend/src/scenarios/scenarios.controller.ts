import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ScopeService } from '../scope/scope.service';
import {
  RunScenarioDto,
  ScenarioResultDto,
  ScenariosStatusDto,
} from './dto/scenarios.dto';
import { ScenariosService } from './scenarios.service';

const ADMIN_ROLE = 'Colbits administrator';

@Controller('scenarios')
@UseGuards(AuthGuard, RolesGuard)
@ApiTags('scenarios')
@ApiBearerAuth()
export class ScenariosController {
  constructor(
    private readonly scenariosService: ScenariosService,
    private readonly scopeService: ScopeService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Demo mode and the scenarios it offers (US31 · F-100).',
    description:
      'enabled is true only where scenarios could write: DEMO_SCENARIOS_ENABLED=true, DEMO_SCENARIOS_DATABASE names the connected database, and that database has its synthetic-dataset marker (never in production, NF-03). The frontend shows the scenario panel only when enabled is true.',
  })
  @ApiOkResponse({ type: ScenariosStatusDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  status() {
    return this.scenariosService.status();
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Run a demo scenario: open or close a fuse, cut or restore voltage, drop or restore a transformer phase (US31 · F-100).',
    description:
      'Writes what the device would send: one telemetry reading (falcon_values or smac_vc_values) and one alarm event with the Technical Annex §4.2 code (13xx20, 13xx21, 05xx21y), SET or CLEAR, both stamped now. The map, GET /faults and the node detail then react through their normal rules on the next refresh. Only for Colbits administrators, inside their scope, and only in demo mode. An action that would repeat the current state (opening an open fuse) is refused with 409.',
  })
  @ApiCreatedResponse({ type: ScenarioResultDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'Unknown action, missing target, channel missing or not allowed, the device or channel does not exist.',
  })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description:
      'Demo mode is off, the database is not the one designated by DEMO_SCENARIOS_DATABASE or has no synthetic-dataset marker for itself, or the user is not a Colbits administrator. Nothing is written.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Target not found, or outside the user scope.',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'The target is already in the state the action would set.',
  })
  async run(@Body() body: RunScenarioDto, @Req() request: Request) {
    const user = (
      request as Request & { user?: { sub?: unknown; role?: unknown } }
    ).user;
    const userId = user?.sub;
    if (
      typeof userId !== 'number' ||
      !Number.isSafeInteger(userId) ||
      userId <= 0
    ) {
      throw new UnauthorizedException('Invalid user identity');
    }
    if (user?.role !== ADMIN_ROLE) {
      throw new ForbiddenException(
        'Only Colbits administrators can run demo scenarios',
      );
    }

    const scope = await this.scopeService.resolve(userId);
    return this.scenariosService.run(body, scope);
  }
}
