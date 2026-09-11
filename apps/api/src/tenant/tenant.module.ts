import { Module } from "@nestjs/common";

import { AuthModule } from "@/auth/auth.module";
import { PASSWORD_HASHER } from "@/platform/password-hasher";
import { OnboardingController } from "@/tenant/presentation/onboarding.controller";
import { PrismaOnboardingRepository } from "@/tenant/application/onboarding/onboarding.repository";
import { OnboardingService } from "@/tenant/application/onboarding/onboarding.service";

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
