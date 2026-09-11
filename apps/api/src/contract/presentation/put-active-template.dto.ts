import { IsInt, IsObject, Max, Min } from "class-validator";

export class PutActiveTemplateDto {
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedRevision!: number;

  @IsObject()
  definition!: Record<string, unknown>;
}
