#!/usr/bin/env tsx
import { loadConfig } from "../src/config.js";
import { createMoltbookClient } from "../src/social/moltbook/client.js";

(async () => {
  const config = loadConfig();
  const client = createMoltbookClient(config);
  
  console.log("Fetching agent profile...");
  const profile = await client.getProfileMe();
  console.log("Agent:", profile.username || profile.name, profile.id);
  console.log("Full profile:", JSON.stringify(profile, null, 2));
  
  console.log("\nFetching timeline...");
  const timeline = await client.getTimeline({ sort: "new", limit: 50 });
  const posts = timeline.posts || timeline.items || [];
  console.log("Global timeline posts:", posts.length);
  
  // Filter to find agent's posts
  const agentId = (profile as any).agent?.id || profile.id;
  const agentName = (profile as any).agent?.name || profile.name || profile.username;
  console.log(`Looking for posts by agent ${agentName} (${agentId})`);
  
  const agentPosts = posts.filter((p: any) => 
    (p.author?.id === agentId) || 
    (p.author?.name === agentName)
  );
  console.log("Agent's posts in timeline:", agentPosts.length);
  
  // Try fetching with author filter
  console.log("\nTrying timeline with author filter...");
  try {
    const agentTimeline = await (client as any).request({
      method: "GET",
      path: "/posts",
      query: { author: agentName, limit: 50 }
    });
    const filteredPosts = agentTimeline.posts || agentTimeline.items || [];
    console.log("Posts with author filter:", filteredPosts.length);
    if (filteredPosts.length > 0) {
      console.log("First filtered post:", JSON.stringify(filteredPosts[0], null, 2));
    }
  } catch (err: any) {
    console.error("Author filter error:", err.message);
  }
  
  if (posts.length > 0) {
    console.log("\nFirst post structure:");
    const post = posts[0];
    console.log("- id:", post.id || post.post_id);
    console.log("- author:", post.author || post.username);
    console.log("- content:", (post.content || post.text || "").slice(0, 50));
    console.log("- comments field:", post.comments ? `array[${post.comments.length}]` : post.comment_count || "missing");
    
    // Try fetching individual post by ID
    console.log("\n Attempting GET /posts/{id} for agent's post...");
    try {
      if (agentPosts.length > 0) {
        const ourPost = agentPosts[0];
        console.log("Found our post:", ourPost.id);
        const postDetail = await (client as any).request({ 
          method: "GET", 
          path: `/posts/${ourPost.id}` 
        });
        console.log("Post detail response:", JSON.stringify(postDetail, null, 2));
      } else {
        console.log("No posts by our agent in timeline");
      }
    } catch (err: any) {
      console.error("Error fetching post detail:", err.message);
    }
    
    if (post.comments && post.comments.length > 0) {
      console.log("\nFirst comment:");
      const comment = post.comments[0];
      console.log(JSON.stringify(comment, null, 2));
    }
  }
})();
