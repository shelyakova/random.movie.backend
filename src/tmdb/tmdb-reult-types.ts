import { TmdbMediaType } from "../types/enums/tmdb-media-type.js";

interface TmdbGenre {
    id: number;
    name: string;
  }
  
  export interface TmdbMultiSearchItem {
    id: number;
    media_type: TmdbMediaType;
    title?: string;
    name?: string;
    release_date?: string;
    first_air_date?: string;
    poster_path: string | null;
  }
  
  export interface TmdbMovieDetails {
    id: number;
    title: string;
    overview: string | null;
    release_date: string | null;
    runtime: number | null;
    vote_average: number | null;
    poster_path: string | null;
    genres: TmdbGenre[];
  }
  
  interface TmdbEpisodeInfo {
    air_date: string | null;
  }
  
  export interface TmdbTvDetails {
    id: number;
    name: string;
    overview: string | null;
    first_air_date: string | null;
    number_of_seasons: number | null;
    number_of_episodes: number | null;
    episode_run_time: number[];
    vote_average: number | null;
    poster_path: string | null;
    genres: TmdbGenre[];
    next_episode_to_air: TmdbEpisodeInfo | null;
    last_episode_to_air: TmdbEpisodeInfo | null;
  }
  
  interface TmdbSeasonEpisode {
    episode_number: number;
    air_date: string | null;
  }
  
  export interface TmdbSeasonDetails {
    episodes: TmdbSeasonEpisode[];
  }