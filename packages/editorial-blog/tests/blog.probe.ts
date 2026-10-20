import type * as entry from "../blog";
import type { BlogPost } from "../blog";
export async function run(module: typeof entry) {
  let post: BlogPost | null = null;
  const blog = module.createBlog({
    now: () => 1000, newId: () => "blog-probe", isOperator: async () => true,
    read: async () => post, list: async () => ({ items: post ? [{ id: post.id, title: post.content.title, status: post.status }] : [] }),
    transact: async (_id, decide) => decide({ read: async () => post, readMedia: async () => [], hasMediaUsePermission: async () => true, save: (next) => { post = next; } }),
    synchronize: async () => "confirmed" as const,
  });
  const { post: saved } = await blog.save("operator", { title: "Registro", body: "Texto", publish: true });
  await blog.read("operator", saved.id);
  await blog.list("operator");
  await blog.takeOffline("operator", { id: saved.id, expectedRevision: saved.revision });
}
