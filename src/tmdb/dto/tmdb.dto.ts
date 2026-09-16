import { Transform } from "class-transformer";
import { IsEnum, IsInt, IsNotEmpty, IsString, Min } from "class-validator";
import { TmdbMediaType } from "../../types/enums/tmdb-media-type.js";

export class TmdbSearchQueryDto {
    @Transform(({ value }) => value?.trim())
    @IsString()
    @IsNotEmpty()
    query: string;
}

export class TmdbSearchResultDto {
    tmdbId: number;
    type: TmdbMediaType;
    name: string;
    year: number | null;
}

export class TmdbDetailsParamsDto {
    @IsEnum(TmdbMediaType)
    type: TmdbMediaType;

    @Transform(({ value }) => Number(value))
    @IsInt()
    @Min(1)
    id: number;
}

export class TmdbDetailsResultDto {
    tmdbId: number;
    type: TmdbMediaType;
    name: string;
    description: string | null;
    year: number | null;
    duration: number | null;
    seasons: number | null;
    episodes: number | null;
    newSeason: string | null;
    latestEpisode: string | null;
    mark: number | null;
    posterUrl: string | null;
}