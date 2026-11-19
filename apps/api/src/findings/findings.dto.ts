import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUrl,
  Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { BANDS, EFFORTS, FINDING_TYPES, REACHES, STATUSES } from './findings.constants';

const URL_OPTS = { protocols: ['http', 'https'], require_protocol: true };

export class EvidenceLinkDto {
  @IsOptional() @IsString() @MaxLength(200) label?: string;
  @IsUrl(URL_OPTS) @MaxLength(2000) url: string;
}

export class ResultCheckDto {
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() @MaxLength(500) before?: string;
  @IsOptional() @IsString() @MaxLength(500) after?: string;
}

export class CreateFindingDto {
  @IsString() @MinLength(1) @MaxLength(200) title: string;
  @IsIn(FINDING_TYPES) type: string;
  @IsString() @MinLength(1) @MaxLength(300) where: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(2000) whyItMatters?: string;
  @IsInt() @Min(1) @Max(4) severity: number;
  @IsIn(REACHES) reach: string;
  @IsIn(EFFORTS) effort: string;
  @IsOptional() @IsString() @MaxLength(2000) suggestedChange?: string;
  @IsOptional() @IsString() @MaxLength(100) surface?: string;
  @IsOptional() @IsString() @MaxLength(200) firstMetric?: string;
  @IsOptional() @IsIn(STATUSES) status?: string;
  @IsOptional() @IsString() @MaxLength(50) plannedRelease?: string;
  @IsOptional() @IsString() @MaxLength(1000) ignoredReason?: string;
  @IsOptional() @IsUrl(URL_OPTS) @MaxLength(2000) githubUrl?: string;
  @IsOptional() @IsString() @MaxLength(2000) pageUrl?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => EvidenceLinkDto)
  evidenceLinks?: EvidenceLinkDto[];
  @IsOptional() @ValidateNested() @Type(() => ResultCheckDto) resultCheck?: ResultCheckDto;
  // null clears an override
  @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(20) overrideScore?: number | null;
  @IsOptional() @IsIn(BANDS) overrideBand?: string | null;
  @IsOptional() @IsString() @MaxLength(500) overrideReason?: string;
}

export class UpdateFindingDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsIn(FINDING_TYPES) type?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(300) where?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(2000) whyItMatters?: string;
  @IsOptional() @IsInt() @Min(1) @Max(4) severity?: number;
  @IsOptional() @IsIn(REACHES) reach?: string;
  @IsOptional() @IsIn(EFFORTS) effort?: string;
  @IsOptional() @IsString() @MaxLength(2000) suggestedChange?: string;
  @IsOptional() @IsString() @MaxLength(100) surface?: string;
  @IsOptional() @IsString() @MaxLength(200) firstMetric?: string;
  @IsOptional() @IsIn(STATUSES) status?: string;
  @IsOptional() @IsString() @MaxLength(50) plannedRelease?: string;
  @IsOptional() @IsString() @MaxLength(1000) ignoredReason?: string;
  // empty string clears the link
  @IsOptional() @IsString() @MaxLength(2000) githubUrl?: string;
  @IsOptional() @IsString() @MaxLength(2000) pageUrl?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => EvidenceLinkDto)
  evidenceLinks?: EvidenceLinkDto[];
  @IsOptional() @ValidateNested() @Type(() => ResultCheckDto) resultCheck?: ResultCheckDto;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(20) overrideScore?: number | null;
  @IsOptional() @IsIn(BANDS) overrideBand?: string | null;
  @IsOptional() @IsString() @MaxLength(500) overrideReason?: string;
}

export class ListFindingsQuery {
  @IsOptional() @IsIn(FINDING_TYPES) type?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(4) severity?: number;
  @IsOptional() @IsIn(REACHES) reach?: string;
  @IsOptional() @IsIn(STATUSES) status?: string;
  @IsOptional() @IsIn(BANDS) band?: string;
  @IsOptional() @IsString() @MaxLength(100) surface?: string;
  @IsOptional() @IsString() @MaxLength(50) release?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() @MaxLength(2000) pageUrl?: string;
  @IsOptional() @IsIn(['priority', 'newest']) sort?: 'priority' | 'newest';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
