import { IsInt, IsObject, IsUUID, Max, Min } from "class-validator";

export class MigrateDraftDto {
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  expectedRevision!: number;

  @IsUUID("4")
  targetVersionId!: string;

  @IsObject()
  values!: Record<string, unknown>;
}
