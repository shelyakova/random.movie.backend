import { TmdbMediaType } from '../types/enums/tmdb-media-type.js';
import { TmdbSearchResultDto, TmdbDetailsResultDto } from './dto/tmdb.dto.js';
import {
  TmdbMultiSearchItem,
  TmdbMovieDetails,
  TmdbTvDetails,
} from './tmdb-reult-types.js';

export const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

export function mapSearchItem(item: TmdbMultiSearchItem): TmdbSearchResultDto {
  const isMovie = item.media_type === TmdbMediaType.Movie;
  const dateStr = isMovie ? item.release_date : item.first_air_date;

  return {
    tmdbId: item.id,
    type: isMovie ? TmdbMediaType.Movie : TmdbMediaType.Tv,
    name: (isMovie ? item.title : item.name) ?? '',
    year: dateStr ? new Date(dateStr).getFullYear() : null,
  };
}

export function mapMovieDetails(data: TmdbMovieDetails): TmdbDetailsResultDto {
  return {
    tmdbId: data.id,
    type: TmdbMediaType.Movie,
    name: data.title,
    description: data.overview || null,
    year: data.release_date ? new Date(data.release_date).getFullYear() : null,
    duration: data.runtime || null,
    seasons: null,
    episodes: null,
    newSeason: null,
    latestEpisode: null,
    mark: data.vote_average ? Math.round(data.vote_average * 100) / 100 : null,
    posterUrl: data.poster_path ? `${IMAGE_BASE_URL}${data.poster_path}` : null,
  };
}

export function mapTvDetails(
  data: TmdbTvDetails,
  seasonDates: { newSeason: string | null; latestEpisode: string | null },
): TmdbDetailsResultDto {
  return {
    tmdbId: data.id,
    type: TmdbMediaType.Tv,
    name: data.name,
    description: data.overview || null,
    year: data.first_air_date ? new Date(data.first_air_date).getFullYear() : null,
    duration: data.episode_run_time?.[0] || null,
    seasons: data.number_of_seasons ?? null,
    episodes: data.number_of_episodes ?? null,
    newSeason: seasonDates.newSeason,
    latestEpisode: seasonDates.latestEpisode,
    mark: data.vote_average ? Math.round(data.vote_average * 100) / 100 : null,
    posterUrl: data.poster_path ? `${IMAGE_BASE_URL}${data.poster_path}` : null,
  };
}