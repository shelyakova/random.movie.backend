import { Transform } from "class-transformer";
import { IsNotEmpty, IsString, MinLength } from "class-validator";

export class AuthDto {
    @Transform(({ value }) => value?.trim())
    @IsString()
    @IsNotEmpty()
    @MinLength(3)
    username: string;

    @Transform(({ value }) => value?.trim())
    @IsString()
    @IsNotEmpty()
    @MinLength(6)
    password: string;
}