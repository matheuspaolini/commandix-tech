import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Post,
} from "@nestjs/common";

import { CredentialsDto } from "@/auth/presentation/dto";
import { InvalidIdentityInput } from "@/tenant/domain/identity";
import { DuplicateOnboardingIdentity } from "@/tenant/application/onboarding/onboarding.repository";
import { OnboardingService } from "@/tenant/application/onboarding/onboarding.service";

@Controller()
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post("onboarding")
  async onboard(@Body() body: CredentialsDto) {
    try {
      return await this.onboarding.execute(body);
    } catch (error) {
      if (error instanceof InvalidIdentityInput)
        throw new BadRequestException();
      if (error instanceof DuplicateOnboardingIdentity)
        throw new ConflictException();
      throw error;
    }
  }
}
