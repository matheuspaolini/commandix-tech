import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Post,
} from "@nestjs/common";

import { OnboardingDto } from "./onboarding.dto";
import { InvalidIdentityInput } from "@/modules/tenant/domain/identity";
import { DuplicateOnboardingIdentity } from "@/modules/tenant/application/onboarding/onboarding.repository";
import { OnboardingService } from "@/modules/tenant/application/onboarding/onboarding.service";

@Controller()
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post("onboarding")
  async onboard(@Body() body: OnboardingDto) {
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
