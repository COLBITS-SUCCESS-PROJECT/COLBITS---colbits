import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * F-05: Only the Colbits administrator may list, create, modify, deactivate
 * users or assign their scope.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: { role?: unknown } }>();
    const role = request.user?.role;

    if (role !== 'Colbits administrator') {
      throw new ForbiddenException(
        'Only Colbits administrators can manage users and scopes',
      );
    }

    return true;
  }
}
