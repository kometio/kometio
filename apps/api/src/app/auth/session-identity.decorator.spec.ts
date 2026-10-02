import {
  Controller,
  Get,
  Injectable,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { AuthenticatedRequest } from './session-auth.guard';
import { TenantId, UserId } from './session-identity.decorator';

/** Stands in for SessionAuthGuard: writes what it would have read from the session. */
@Injectable()
class SignedIn implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.tenantId = 'tenant-1';
    request.userId = 'user-1';
    return true;
  }
}

@Controller('who')
class WhoController {
  @Get('guarded')
  @UseGuards(SignedIn)
  guarded(@TenantId() tenantId: string, @UserId() userId: string) {
    return { tenantId, userId };
  }

  @Get('unguarded')
  unguarded(@TenantId() tenantId: string) {
    return { tenantId };
  }
}

describe('@TenantId() and @UserId()', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [WhoController],
      providers: [SignedIn],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('hand a handler the tenant and user the session guard found', async () => {
    await request(app.getHttpServer())
      .get('/who/guarded')
      .expect(200)
      .expect({ tenantId: 'tenant-1', userId: 'user-1' });
  });

  it('fail loudly on a route the guard does not cover', async () => {
    await request(app.getHttpServer()).get('/who/unguarded').expect(500);
  });
});
