import { CURRENT_USER_ID, type Category, type Post } from "./types.ts";

export function preferredPosts(posts: Post[], categories: readonly Category[]): Post[] {
  return posts.filter((post) =>
    post.authorId === CURRENT_USER_ID || categories.includes(post.category),
  );
}
