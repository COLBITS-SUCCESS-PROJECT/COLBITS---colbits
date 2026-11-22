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
      'enabled is true only where scenarios could write: DEMO_SCENARIOS_ENABLED=true, DEMO_SCENARIOS_DATABASE names the connected database, and that database has its synthetic-dataset marker (never in production, NF-03). The frontend shows the scenario panel only when enabled is true. actions lists the 22 actions in a fixed order, each start right before its stop: the six fuse, voltage and phase actions (SCRUM-252), phase out of range and back in range, then low energy, free fall, solar panel, overload and inactivity (SCRUM-253). docs/demo-scenarios.md describes each one.',
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
      'Run a demo scenario: fuse, voltage, phase, low energy, free fall, solar panel, overload or device inactivity (US31 · F-100).',
    description:
      "Writes what the device would send, stamped with the database clock and strictly after its previous record, under a per-device lock. Fuse, voltage and phase actions write one reading and one alarm event with the Technical Annex §4.2 code (13xx20, 13xx21, 05xx21y), SET or CLEAR. Low energy, solar panel and overload write one reading with only their own fields changed and no event; FREE_FALL also writes a 13xx01 MSG event. SILENCE_FALCON / SILENCE_SMAC remove the device's readings of the last inactivity threshold plus one minute and record the silence; RESUME_FALCON / RESUME_SMAC write one reading copied from the last one. The map, GET /faults, GET /device/low-energy and GET /device/inactive then react through their normal rules. Only for Colbits administrators, inside their scope, and only in a designated synthetic demo database (403 otherwise). An action that would change nothing, or that would break another scenario, is refused with 409 and nothing is written.",
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
    description:
      'Nothing is written. The target is already in the state the action would set; or its device is silenced (run RESUME_* first); or SILENCE would remove alarm events, erase or bring back another scenario, change an overload or imbalance alert, or has no older reading to keep; or the device has a record too far in the future; or the target changed during the request. The message says which.',
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
