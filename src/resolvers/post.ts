import {
    Resolver,
    Query,
    Arg,
    Mutation,
    InputType,
    Field,
    Ctx,
    UseMiddleware,
    Int,
    FieldResolver,
    Root, ObjectType
} from "type-graphql";
import {Post} from "../entities/Post";
import {MyContext} from "../types";
import {isAuth} from "../middleware/isAuth";
import {getConnection} from "typeorm";
import {Updoot} from "../entities/Updoot";
import {User} from "../entities/User";

@InputType()
class PostInput {
    @Field()
    title: string;
    @Field()
    text: string
}

@ObjectType()
class PaginatedPosts {
    @Field(()=>[Post]) //gql type
    posts: Post[]; //ts type
    @Field()
    hasMore: boolean
}


@Resolver(Post) // adding Post here for the FieldResolver
export class PostResolver {
    @FieldResolver(()=>String)
    textSnippet(
        @Root() root: Post
    ) {
        return root.text.slice(0, 50)
    }

    @FieldResolver(()=>User)
    creator(
        @Root() post: Post,
        @Ctx() {userLoader}: MyContext
    ) {
        return userLoader.load(post.creatorId);
    }

    // these field resolvers only run if the fields are requested by the query. (optimisation)
    @FieldResolver(()=>Int, {nullable: true})
    async voteStatus(
        @Root() post: Post,
        @Ctx() {updootLoader, req}: MyContext
    ) {
        if (!req.session.userId) return null;
        const updoot = await updootLoader.load({postId: post.id, userId: req.session.userId});

        // if we cant find a value, then the user didnt vote on the post, otherwise give the value
        return updoot ? updoot.value : null
    }

    @Mutation(()=>Boolean)
    @UseMiddleware(isAuth)
    async vote(
        @Arg('postId', ()=>Int) postId: number,
        @Arg('value', ()=>Int) value: number,
        @Ctx() {req}:MyContext
    ) {
        const isUpdoot = value !== -1;
        const realValue = isUpdoot ? 1 : -1;
        const {userId} = req.session;
        const updoot = await Updoot.findOne({where: {postId, userId}});

        // the user has voted on the post before
        // and they are changing their vote
        if (updoot && updoot.value !== realValue) {
            await getConnection().transaction(async (tm) => {
                await tm.query(`
                    update updoot
                    set value = $1
                    where "postId" = $2 and "userId" = $3
                    `,[realValue, postId, userId]
                );

                await tm.query(`
                      update post
                      set points = points + $1
                      where id = $2
                    `,[2 * realValue, postId]
                );
            });
        } else if (!updoot) {
            // has never voted before
            // typeorm will handle opening and closing the transaction
            await getConnection().transaction(async (tm)=>{
                await tm.query(`
                    insert into updoot ("userId", "postId", value)
                    values ($1, $2, $3)
                `, [userId, postId, realValue]); // can be done directly. be consistent irl
                await tm.query(`
                    update post
                    set points = points + $1
                    where id = $2
                `, [realValue, postId]);
            })
        }
        // await Updoot.insert({
        //     userId,
        //     postId,
        //     value: realValue
        // }); // added to the raw sql so that if one of the two fails, all fails (for reference)
        // sometimes you can write your own sql

        // can add params directly because they are integers
        // doing it like this does not convert the sql to a prepared statement

        return true
    }

    @Query(() => PaginatedPosts)
    async posts(
        @Arg("limit", () => Int) limit: number,
        @Arg("cursor", () => String, {nullable: true}) cursor: string | null
    ): Promise<PaginatedPosts> {
        const realLimit = Math.min(50, limit);
        const realLimitPlusOne = realLimit + 1; // +1 to check if there are more posts

        const replacements: any[] = [realLimitPlusOne];

        if (cursor) {
            replacements.push(new Date(parseInt(cursor)));
        }

        // json_build_object lets reshape data into an object - which is what our gql expects for the creator
        // because otherwise we get all the items on a top level (check previous commits to see logic)
        const posts = await getConnection().query(`
            select p.*
            from post p
            ${cursor ? `where p."createdAt" < $2` : ''}
            order by p."createdAt" DESC
            limit $1
        `, replacements);

        // const qb = getConnection()
        //     .getRepository(Post)
        //     .createQueryBuilder("p")
        //     .innerJoinAndSelect(
        //         "p.creator",
        //         "u",
        //         'u.id = p."creatorId"'
        //     )
        //     .orderBy('p."createdAt"', "DESC")
        //     .take(realLimitPlusOne);

        // if (cursor) {
        //     qb.where('p."createdAt" < :cursor', {
        //         cursor: new Date(parseInt(cursor)),
        //     });
        // }

        // for pagination: we try and get the amount of posts the user asked for plus 1.
        // we return the amount they asked for (with the slice below)
        // but we use the amount + 1 to check if there are more posts
        // const posts = await qb.getMany();

        return {posts: posts.slice(0, realLimit), hasMore: posts.length === realLimitPlusOne}
    }


    @Query(() => Post, {nullable: true})
    post(@Arg("id", ()=>Int) id: number): Promise<Post | undefined> {
        return Post.findOne(id);
    }

    @Mutation(() => Post)
    @UseMiddleware(isAuth)
    async createPost(
        @Arg("input") input: PostInput,
        @Ctx() {req}: MyContext
    ): Promise<Post> {

        return Post.create({
            ...input,
            creatorId: req.session.userId
        }).save();
    }

    @Mutation(() => Post, {nullable: true})
    @UseMiddleware(isAuth)
    async updatePost(
        @Arg("id", ()=>Int) id: number,
        @Arg("title") title: string,
        @Arg("text") text: string,
        @Ctx() {req}: MyContext
    ): Promise<Post | null> {

        const result = await getConnection()
            .createQueryBuilder()
            .update(Post)
            .set({title, text})
            .where('id = :id and "creatorId" = :creatorId', {id, creatorId: req.session.userId})
            .returning("*")
            .execute();

        return result.raw[0];
    }

    @Mutation(() => Boolean)
    @UseMiddleware(isAuth)
    async deletePost(@Arg("id", ()=>Int) id: number, @Ctx() {req}: MyContext): Promise<boolean> {
        // not cascade way (either or is fine and depends on different situations)
        const post = await Post.findOne(id);
        if (!post) return false;
        if (post.creatorId !== req.session.userId) {
            throw new Error('not authorized')
        }
        // we need to delete the post's upvotes from the updoot table because otherwise psql wont allow to delete the post
        await Updoot.delete({postId: id});
        // default id is given as Float even tho we specify a number with ts. with ()=>Int we make it an Int
        // you can only delete posts that you own
        await Post.delete({id, creatorId: req.session.userId});


        // await Post.delete({id, creatorId: req.session.userId});

        return true;
    }
}
