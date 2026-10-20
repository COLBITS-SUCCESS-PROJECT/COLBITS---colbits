import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { ScopeService } from '../scope/scope.service';
import { NodesService } from './nodes.service';

@Controller('nodes')
export class NodesController {
  constructor(
    private readonly nodesService: NodesService,
    private readonly scopeService: ScopeService,
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  async findAll(@Req() request: Request) {
    const userId: unknown = (
    request as Request & { user?: { sub?: unknown } }
    ).user?.sub;

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
