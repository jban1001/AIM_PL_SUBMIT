import type { Category, Post } from "./types.ts";

export function preferredPosts(posts: Post[], categories: readonly Category[]): Post[] {
  return posts.filter((post) => post.category === "기타" || categories.includes(post.category));
}
