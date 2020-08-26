import {Resolver, InputType, Field, Ctx, Arg, Mutation, ObjectType, Query} from "type-graphql";
import { MyContext } from "../types";
import {User} from "../entities/User";
import argon2 from "argon2";

@InputType()
class UsernamePasswordInput {
    @Field()
    username: string;
    @Field()
    password: string
}

@ObjectType()
class FieldError {
    @Field()
    field: string;
    @Field()
    message: string
}

@ObjectType()
class UserResponse {
    @Field(()=>[FieldError], {nullable: true})
    errors?: FieldError[];

    @Field(()=>User, {nullable: true})
    user?: User
}

@Resolver()
export class UserResolver {
    @Query(()=>User, {nullable: true})
    async me(
        @Ctx() {req, em}: MyContext
    ) {
        // you are not logged in
        if (!req.session.userId) {
            return null
        }
        const user = await em.findOne(User, {id: req.session.userId});
        return user;
    }


    @Mutation(() => UserResponse)
    async register(
        @Arg('options') options: UsernamePasswordInput,
        @Ctx() {em, req}: MyContext
    ): Promise<UserResponse> {
        if (options.username.length <= 2) {
            return {
                errors: [{
                    field: 'username',
                    message: 'Username must be longer than 2 characters'
                }]
            }
        }

        if (options.password.length <= 2) {
            return {
                errors: [{
                    field: 'password',
                    message: 'Password must be longer than 2 characters'
                }]
            }
        }

        const hashedPassword = await argon2.hash(options.password);
        const user = em.create(User, {username: options.username, password: hashedPassword});
        try {
            await em.persistAndFlush(user);
        } catch(err) {
            if (err.code === '23505' || err.detail.includes('already exists')) {
                // duplicate username error
                return {
                    errors: [{
                        field: 'username',
                        message: 'username already exists'
                    }]
                }
            }
        }

        // auto login after registration
        req.session.userId = user.id;

        return {
            user
        };
    }

    @Mutation(() => UserResponse)
    async login(
        @Arg('options') options: UsernamePasswordInput,
        @Ctx() {em, req}: MyContext
    ): Promise<UserResponse> {
        const user = await em.findOne(User, {username: options.username});
        if (!user) {
            return {
                errors: [{
                    field: 'username',
                    message: 'That username does not exist!'
                }]
            }
        }
        const valid = await argon2.verify(user.password, options.password);
        if (!valid) {
            return {
                errors: [{
                    field: 'password',
                    message: 'Wrong password!'
                }]
            }
        }

        // store the current user's id
        req.session.userId = user.id;

        return {
            user
        };
    }
}
