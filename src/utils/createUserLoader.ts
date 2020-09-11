import DataLoader from "dataloader";
import {User} from "../entities/User";
import {Updoot} from "../entities/Updoot";

// [1,4,5,54,23]
// [{id: 1, username: "tim"}, {id:4, username: "ben}, {}, {}, {}]
// get the username of the creator for the post using its id

export const createUserLoader = () => new DataLoader<number, User>(async userIds => {
    const users = await User.findByIds(userIds as number[]);
    const userIdToUser: Record<number, User> = {};
    users.forEach(u => {
        userIdToUser[u.id] = u;
    });
    return userIds.map(userId => userIdToUser[userId]);
});

// keys that come in (in array) [{postId: 5, userId: 10},...]
// then return [{postId: 5, userId: 10, value: 1},...]
export const createUpdootLoader = () => new DataLoader<{ postId: number, userId: number }, Updoot | null>
(async keys => {
    const updoots = await Updoot.findByIds(keys as any);
    const updootIdsToUpdoot: Record<string, Updoot> = {};
    updoots.forEach(updoot => {
        updootIdsToUpdoot[`${updoot.userId}|${updoot.postId}`] = updoot;
    });
    return keys.map(key => updootIdsToUpdoot[`${key.userId}|${key.postId}`]);
});