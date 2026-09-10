import { IsInt, Max, Min } from "class-validator";

export class ActivateContractDto {
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  expectedRevision!: number;
}
