import { Module } from "@nestjs/common";

import { PASSWORD_HASHER } from "@/platform/password-hasher";
import { ONBOARDING_REPOSITORY } from "@/modules/tenant/application/onboarding/onboarding.repository";
import { OnboardingController } from "@/modules/tenant/presentation/onboarding.controller";
import { PrismaOnboardingRepository } from "@/modules/tenant/infrastructure/prisma-onboarding.repository";
import { OnboardingService } from "@/modules/tenant/application/onboarding/onboarding.service";

@Module({
  controllers: [OnboardingController],
  providers: [
    PrismaOnboardingRepository,
    {
      provide: ONBOARDING_REPOSITORY,
      useExisting: PrismaOnboardingRepository,
    },
    {
      provide: OnboardingService,
      useFactory: (identities, passwords) =>
        new OnboardingService(identities, passwords),
      inject: [ONBOARDING_REPOSITORY, PASSWORD_HASHER],
    },
  ],
})
export class TenantModule {}
