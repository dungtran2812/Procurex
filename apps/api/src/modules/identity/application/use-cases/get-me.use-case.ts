import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../../common/auth/auth.types';
import { DomainError } from '../../../../common/errors/domain-error';
import { IdentityRepository } from '../../domain/identity.repository';
import { PublicUser } from '../ports';

@Injectable()
export class GetMeUseCase {
  constructor(private readonly repo: IdentityRepository) {}

  async execute(actor: AuthUser): Promise<PublicUser> {
    const user = await this.repo.findById(actor.id);
    if (!user) throw new DomainError('USER_NOT_FOUND', 'Không tìm thấy người dùng');
    return user.toPublic();
  }
}
