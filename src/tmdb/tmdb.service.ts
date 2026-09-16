import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { TmdbSearchResultDto, TmdbDetailsResultDto } from './dto/tmdb.dto.js';
import {
  TmdbMultiSearchItem,
  TmdbMovieDetails,
  TmdbTvDetails,
  TmdbSeasonDetails,
} from './tmdb-reult-types.js';
import { mapSearchItem, mapMovieDetails, mapTvDetails } from './tmdb.mappers.js';
import { TmdbMediaType } from '../types/enums/tmdb-media-type.js';

@Injectable()
export class TmdbService {
  private readonly apiKey = process.env.TMDB_API_ACESS_TOKEN;
  private readonly baseUrl = process.env.TMDB_BASE_URL ?? 'https://api.themoviedb.org/3';

  async search(query: string): Promise<TmdbSearchResultDto[]> {
    const url = `${this.baseUrl}/search/multi?query=${encodeURIComponent(query)}&include_adult=false`;
    const data = await this.fetchTmdb<{ results: TmdbMultiSearchItem[] }>(url);

    return data.results
      .filter((item) => item.media_type === TmdbMediaType.Movie || item.media_type === TmdbMediaType.Tv)
      .map(mapSearchItem);
  }

  async getDetails(type: TmdbMediaType, id: number): Promise<TmdbDetailsResultDto> {
    const url = `${this.baseUrl}/${type}/${id}`;

    if (type === TmdbMediaType.Movie) {
      const data = await this.fetchTmdb<TmdbMovieDetails>(url);
      return mapMovieDetails(data);
    }

    const data = await this.fetchTmdb<TmdbTvDetails>(url);
    const seasonDates = await this.getLatestSeasonDates(
      data.id,
      data.number_of_seasons,
      data.next_episode_to_air?.air_date ?? null,
    );

    return mapTvDetails(data, seasonDates);
  }

  private async getLatestSeasonDates(
    tvId: number,
    numberOfSeasons: number | null,
    fallbackNextEpisodeDate: string | null,
  ): Promise<{ newSeason: string | null; latestEpisode: string | null }> {
    if (!numberOfSeasons || numberOfSeasons < 1) {
      return { newSeason: fallbackNextEpisodeDate, latestEpisode: null };
    }

    const url = `${this.baseUrl}/tv/${tvId}/season/${numberOfSeasons}`;
    const season = await this.fetchTmdb<TmdbSeasonDetails>(url);

    const episodesWithDates = season.episodes
      .filter((ep) => ep.air_date)
      .sort((a, b) => a.episode_number - b.episode_number);

    if (episodesWithDates.length === 0) {
      return { newSeason: fallbackNextEpisodeDate, latestEpisode: null };
    }

    const firstEpisode = episodesWithDates[0];
    const lastEpisode = episodesWithDates[episodesWithDates.length - 1];

    const isSeasonFullyOut = new Date(lastEpisode.air_date!) <= new Date();

    return {
      newSeason: firstEpisode.air_date ?? fallbackNextEpisodeDate,
      latestEpisode: isSeasonFullyOut ? lastEpisode.air_date : null,
    };
  }

  private async fetchTmdb<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        accept: 'application/json',
      },
    });
  
    if (response.status === 404) {
      throw new NotFoundException('TMDB entry not found');
    }
  
    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const message = errorBody?.status_message ?? 'Failed to fetch data from TMDB';
  
      throw new HttpException(message, response.status);
    }
  
    return response.json() as Promise<T>;
  }
}