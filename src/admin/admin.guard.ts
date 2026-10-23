import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext) {
    if (await this.auth.verify(ctx.switchToHttp().getRequest())) return true;
    throw new UnauthorizedException('Session expired — please log in again');
  }
}
