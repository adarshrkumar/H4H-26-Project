import type { Doc, Id } from '../../convex/_generated/dataModel';

export type Post = Doc<'posts'>;
export type PostId = Id<'posts'>;
export type Comment = Doc<'comments'>;
export type CommentId = Id<'comments'>;
