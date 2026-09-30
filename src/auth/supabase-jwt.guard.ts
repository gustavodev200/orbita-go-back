import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
} from 'jose';
import { UsersService } from '../users/users.service';
import type { AuthenticatedRequest } from './current-user.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

export interface SupabaseJwtPayload extends JWTPayload {
  email?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
    avatar_url?: string;
    picture?: string;
  };
}

// Guard global: toda rota exige Bearer do Supabase, exceto as marcadas com @Public().
// O back nunca faz login — só valida o JWT emitido pelo Supabase Auth (Google).
@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly legacySecret: Uint8Array | undefined;

  constructor(
    config: ConfigService,
    private readonly reflector: Reflector,
    private readonly users: UsersService,
  ) {
    const supabaseUrl = config.getOrThrow<string>('SUPABASE_URL');
    this.issuer = `${supabaseUrl.replace(/\/$/, '')}/auth/v1`;
    this.jwks = createRemoteJWKSet(
      new URL(`${this.issuer}/.well-known/jwks.json`),
    );
    const secret = config.get<string>('SUPABASE_JWT_SECRET');
    this.legacySecret = secret ? new TextEncoder().encode(secret) : undefined;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException();
    }

    const payload = await this.verify(token);
    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException();
    }

    await this.users.ensureUser({
      id: payload.sub,
      email: payload.email,
      name:
        payload.user_metadata?.full_name ?? payload.user_metadata?.name ?? null,
      avatarUrl:
        payload.user_metadata?.avatar_url ??
        payload.user_metadata?.picture ??
        null,
    });
    request.user = { id: payload.sub, email: payload.email };
    return true;
  }

  private async verify(token: string): Promise<SupabaseJwtPayload> {
    try {
      const { alg } = decodeProtectedHeader(token);
      const options = { issuer: this.issuer, audience: 'authenticated' };
      if (alg === 'HS256') {
        // Projetos Supabase antigos assinam com segredo compartilhado (legado).
        if (!this.legacySecret) {
          throw new UnauthorizedException();
        }
        const { payload } = await jwtVerify<SupabaseJwtPayload>(
          token,
          this.legacySecret,
          { ...options, algorithms: ['HS256'] },
        );
        return payload;
      }
      const { payload } = await jwtVerify<SupabaseJwtPayload>(
        token,
        this.jwks,
        options,
      );
      return payload;
    } catch {
      throw new UnauthorizedException();
    }
  }

  private extractBearerToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' && token ? token : undefined;
  }
}
