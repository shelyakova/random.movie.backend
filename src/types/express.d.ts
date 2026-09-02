import { User } from '../generated/prisma/client.js';

declare global {
    namespace Express {
        interface User extends Omit<import('../generated/prisma/client.js').User, 'hash'> { }
    }
}