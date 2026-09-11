import { Module } from "@nestjs/common";

import { AuthModule } from "@/auth/auth.module";
import { PASSWORD_HASHER } from "@/platform/password-hasher";
import { ONBOARDING_REPOSITORY } from "@/tenant/application/onboarding/onboarding.repository";
import { OnboardingController } from "@/tenant/presentation/onboarding.controller";
import { PrismaOnboardingRepository } from "@/tenant/infrastructure/prisma-onboarding.repository";
import { OnboardingService } from "@/tenant/application/onboarding/onboarding.service";

@Module({
  imports: [AuthModule],
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
