import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<any>();
    const user = request['user'];

    // If there is no user attached yet, let the AuthGuard handle the rejection
    if (!user) {
      return true;
    }

    // F-06: Reject any write operations for consultation users
    const isConsultationUser = user.role === 'consultation user';
    const isWriteMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);

    if (isConsultationUser && isWriteMethod) {
      throw new ForbiddenException('Consultation users are restricted to read-only access');
    }

    return true;
  }
}