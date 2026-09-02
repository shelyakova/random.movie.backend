import { Transform } from "class-transformer";
import { IsNotEmpty, IsString, MinLength } from "class-validator";

export class CategoryDto {
    @Transform(({ value }) => value?.trim())
    @IsString()
    @IsNotEmpty()
    @MinLength(3)
    name: string;
}