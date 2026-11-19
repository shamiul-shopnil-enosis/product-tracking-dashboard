import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsOptional } from 'class-validator';
import { BREAKDOWN_KEYS } from './clarity.constants';

export class ManualSyncDto {
  @IsOptional() @IsArray() @ArrayMaxSize(BREAKDOWN_KEYS.length) @ArrayUnique() @IsIn(BREAKDOWN_KEYS, { each: true })
  breakdowns?: string[];
}
