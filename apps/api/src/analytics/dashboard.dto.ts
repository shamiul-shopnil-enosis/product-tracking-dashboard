import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class RangeQuery {
  @IsOptional() @Type(() => Number) @IsIn([7, 14, 30, 60, 90]) days?: number;
  /** A custom range (YYYY-MM-DD) instead of days, and optionally the period to compare it with. */
  @IsOptional() @Matches(DAY) from?: string;
  @IsOptional() @Matches(DAY) to?: string;
  @IsOptional() @Matches(DAY) compareFrom?: string;
  @IsOptional() @Matches(DAY) compareTo?: string;
  @IsOptional() @IsIn(['human', 'all']) traffic?: 'human' | 'all';
  @IsOptional() @Type(() => Number) @IsIn([10, 20, 30, 50]) threshold?: number;
}

export class CardsQuery extends RangeQuery {
  /** Card keys to make sure are included, or the only ones to return with `only`, separated by commas */
  @IsOptional() @Matches(/^[A-Za-z0-9_,-]{0,3000}$/) keys?: string;
  @IsOptional() @IsIn(['1', '0']) only?: string;
}

export class FrictionQuery extends RangeQuery {
  @IsOptional() @IsIn(['any', 'rage', 'dead', 'quickback', 'scriptError']) sort?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) minSessions?: number;
}

export class BreakdownQuery extends RangeQuery {
  @IsOptional() @IsIn(['channel', 'source', 'country', 'device', 'os']) dimension?: string;
}

export class DemographicsQuery extends RangeQuery {
  @IsOptional() @IsIn(['country', 'city', 'device', 'browser', 'language']) dimension?: string;
  @IsOptional() @IsIn(['1', '0']) organic?: string;
}

export class PagesQuery extends RangeQuery {
  @IsOptional() @IsIn(['sessions', 'scrollDepth', 'activeTime', 'quickbackRate']) sort?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) minSessions?: number;
}

export class LandingQuery extends RangeQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) minSessions?: number;
}
