import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
    posts: defineTable({
        title: v.string(),
        slug: v.string(),
        content: v.string(),
        excerpt: v.optional(v.string()),
        authorId: v.string(),
        authorName: v.optional(v.string()),
        published: v.boolean(),
        featured: v.boolean(),
        metaTitle: v.optional(v.string()),
        metaDescription: v.optional(v.string()),
        publishedAt: v.optional(v.number()),
    }).index('by_slug', ['slug']),

    comments: defineTable({
        postId: v.id('posts'),
        content: v.string(),
        authorId: v.string(),
        authorName: v.optional(v.string()),
        approved: v.boolean(),
        flagged: v.boolean(),
    }).index('by_post', ['postId']),
});
