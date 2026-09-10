import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class EditDraftValuesDto {
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  expectedRevision!: number;

  @IsObject()
  values!: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  clearedKeys?: string[];
}
