import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { PASSWORD_HASHER } from "../auth/password";
import { OnboardingController } from "./onboarding.controller";
import { PrismaOnboardingRepository } from "./onboarding.repository";
import { OnboardingService } from "./onboarding.service";

@Module({
  imports: [AuthModule],
  controllers: [OnboardingController],
  providers: [
    PrismaOnboardingRepository,
    {
      provide: OnboardingService,
      useFactory: (identities, passwords) =>
        new OnboardingService(identities, passwords),
      inject: [PrismaOnboardingRepository, PASSWORD_HASHER],
    },
  ],
})
export class TenantModule {}
