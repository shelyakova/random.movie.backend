import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetUser = createParamDecorator(
    (data: keyof Express.User | undefined, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();

        if (data) {
            return request.user?.[data];
        }
        return request.user;
    },
);