import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class RangeQuery {
  @IsOptional() @Type(() => Number) @IsIn([7, 14, 30]) days?: number;
  @IsOptional() @IsIn(['human', 'all']) traffic?: 'human' | 'all';
  @IsOptional() @Type(() => Number) @IsIn([10, 20, 30, 50]) threshold?: number;
}

export class FrictionQuery extends RangeQuery {
  @IsOptional() @IsIn(['any', 'rage', 'dead', 'quickback', 'scriptError']) sort?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) minSessions?: number;
}

export class BreakdownQuery extends RangeQuery {
  @IsOptional() @IsIn(['channel', 'source', 'country', 'device', 'os']) dimension?: string;
}

export class PagesQuery extends RangeQuery {
  @IsOptional() @IsIn(['sessions', 'scrollDepth', 'activeTime', 'quickbackRate']) sort?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) minSessions?: number;
}

export class LandingQuery extends RangeQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) minSessions?: number;
}
