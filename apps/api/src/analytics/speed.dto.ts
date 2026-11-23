import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class SpeedSummaryQuery {
  @IsString() @MaxLength(500)
  url: string;

  @IsIn(['mobile', 'desktop'])
  strategy: 'mobile' | 'desktop';

  @IsOptional() @Matches(DAY)
  from?: string;

  @IsOptional() @Matches(DAY)
  to?: string;

  /** the one day to compare the latest test with */
  @IsOptional() @Matches(DAY)
  compare?: string;
}

export class SpeedRunDto {
  @IsString() @MaxLength(500)
  url: string;

  @IsIn(['mobile', 'desktop', 'both'])
  strategy: 'mobile' | 'desktop' | 'both';
}

export class SpeedSettingsDto {
  /** Time of the daily check in Bangladesh time, 24-hour, for example 12:00 */
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'dailyTime must look like 12:00' })
  dailyTime: string;
}

export class SpeedTargetDto {
  @IsString() @MaxLength(500)
  url: string;

  @IsOptional() @IsString() @MaxLength(80)
  label?: string;
}
