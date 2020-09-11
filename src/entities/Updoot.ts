import { ObjectType, Field } from "type-graphql";
import {
    Entity,
    BaseEntity,
    ManyToOne, PrimaryColumn, Column,
} from "typeorm";
import { User } from "./User";
import {Post} from "./Post";


// many to many relationship
// user <-> posts
// several users can up many posts
// user -> join table <- posts
// user -> updoot <- posts


@ObjectType()
@Entity()
export class Updoot extends BaseEntity {

    @Field()
    @Column({type: 'int'})
    value: number;

    @Field()
    @PrimaryColumn()
    userId: number;

    @Field(()=>User)
    @ManyToOne(() => User, (user) => user.updoots)
    user: User;

    @Field()
    @PrimaryColumn()
    postId: number;

    @Field(()=>Post)
    @ManyToOne(() => Post, (post) => post.updoots)
    post: Post;
}
