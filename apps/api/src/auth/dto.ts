import { IsString } from "class-validator";

export class CredentialsDto {
  @IsString()
  slug!: string;

  @IsString()
  email!: string;

  @IsString()
  password!: string;
}
