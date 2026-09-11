import { IsObject } from "class-validator";

export class CreateContractDto {
  @IsObject()
  values!: Record<string, unknown>;
}
