import { PartialType } from "@nestjs/mapped-types";
import { Transform } from "class-transformer";
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

export class GetFilmsQueryDto {
    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @Transform(({ value }) => {
        if (value === undefined) return undefined;
        if (typeof value === 'boolean') return value;
        return value === 'true';
    })
    @IsBoolean()
    isWatched?: boolean;

    @IsOptional()
    @Transform(({ value }) => {
        if (value === undefined) return undefined;
        if (Array.isArray(value) && value.every((v) => typeof v === 'number')) {
            return value;
        }
        return Array.isArray(value) ? value.map(Number) : [Number(value)];
    })
    @IsArray()
    @IsInt({ each: true })
    categoryIds?: number[];

    @IsOptional()
    @Transform(({ value }) => {
        if (value === undefined) return undefined;
        if (typeof value === 'number') return value;
        return Number(value);
    })
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Transform(({ value }) => {
        if (value === undefined) return undefined;
        if (typeof value === 'number') return value;
        return Number(value);
    })
    @IsInt()
    @Min(1)
    limit?: number = 10;
}

export class CreateFilmDto {
    @Transform(({ value }) => value?.trim())
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    categoryIds?: number[];

    @IsOptional()
    @IsInt()
    seasons?: number;

    @IsOptional()
    @IsInt()
    episodes?: number;

    @IsOptional()
    @IsInt()
    duration?: number;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsInt()
    year?: number;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(1)
    @Max(10)
    mark?: number;

    @IsOptional()
    @IsBoolean()
    isWatched?: boolean;

    @IsString()
    @IsNotEmpty()
    link: string;
}

export class EditFilmDto extends PartialType(CreateFilmDto) { }