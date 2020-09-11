import DataLoader from "dataloader";
import {User} from "../entities/User";

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