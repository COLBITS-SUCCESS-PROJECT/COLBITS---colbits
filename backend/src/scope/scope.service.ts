import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../auth/user.entity';
import { ScopeContext } from './scope.types';

@Injectable()
export class ScopeService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async resolve(userId: number): Promise<ScopeContext> {
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      throw new UnauthorizedException('Invalid user identity');
    }

    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user || !user.is_active) {
      return { kind: 'empty' };
    }

    if (user.role === 'Colbits administrator') {
      return { kind: 'unrestricted' };
    }

    if (user.role === 'consultation user') {
      return { kind: 'restricted', userId: user.id };
    }

    return { kind: 'empty' };
  }
}
