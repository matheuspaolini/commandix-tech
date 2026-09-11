import { IsString } from "class-validator";

export class OnboardingDto {
  @IsString()
  slug!: string;

  @IsString()
  email!: string;

  @IsString()
  password!: string;
}
