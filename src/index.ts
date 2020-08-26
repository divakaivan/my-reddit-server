import "reflect-metadata";
import { MikroORM } from "@mikro-orm/core";
// import { __prod__ } from "./constants";
import microConfig from "./mikro-orm.config";
import express from "express";
import { ApolloServer } from "apollo-server-express";
import { buildSchema } from "type-graphql";
import { HelloResolver } from "./resolvers/hello";
import { PostResolver } from "./resolvers/post";
import {UserResolver} from "./resolvers/user";

import redis from "redis";
import session from "express-session";
import connectRedis from "connect-redis";
import {__prod__} from "./constants";
import {REDIS_SECRET} from "../env";
import {MyContext} from "./types";

const main = async () => {
  const orm = await MikroORM.init(microConfig);
  await orm.getMigrator().up();

  const app = express();

    const RedisStore = connectRedis(session);
    const redisClient = redis.createClient();

    app.use(
        session({
            name: 'qid',
            store: new RedisStore({
                client: redisClient,
                disableTouch: true
            }),
            cookie: {
                maxAge: 1000 * 60 * 60 * 24 * 365 * 10, // 10 years
                httpOnly: true,
                sameSite: 'lax', // csrf
                secure: __prod__ // cookie only works in https
            },
            saveUninitialized: false,
            secret: REDIS_SECRET,
            resave: false,
        })
    );

  const apolloServer = new ApolloServer({
    schema: await buildSchema({
      resolvers: [HelloResolver, PostResolver, UserResolver],
      validate: false,
    }),
    context: ({req, res}): MyContext => <MyContext>({em: orm.em, req, res}),
    // give access to the db to the resolvers
  });

  apolloServer.applyMiddleware({ app, cors: {origin: "http://localhost:3000"} });

  app.listen(4000, () => {
    console.log("SERVER STARTED ON http://localhost:4000/");
  });
};

main().catch((err) => {
  console.error(err);
});
