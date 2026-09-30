import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  onboardingSchema,
  type OnboardingInput,
} from './dto/onboarding.schema';
import { OnboardingService } from './onboarding.service';

@ApiTags('onboarding')
@ApiBearerAuth()
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post()
  @HttpCode(200)
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(onboardingSchema)) dto: OnboardingInput,
  ) {
    return this.onboarding.complete(user.id, dto);
  }
}
