import { describe, expect, test, vi } from "vitest";
import { createBlog, type BlogPost } from "../blog";

import type { Media } from "@tudomacae/media/model";

function fixture(existing?: BlogPost, media: Media[] = [], synchronization: "confirmed" | "unconfirmed" = "confirmed", onTransaction = vi.fn(), onMediaRead = vi.fn(), hasMediaUsePermission: (permissionId: string, at: number) => Promise<boolean> = async () => true) {
  const posts = new Map<string, BlogPost>(existing ? [[existing.id, existing]] : []);
  const blog = createBlog({
    now: () => 1000,
    newId: () => "post-1",
    isOperator: async id => id === "admin" || id === "editor",
    read: async id => posts.get(id) ?? null,
    list: async () => ({ items: [...posts.values()].map(post => ({ id: post.id, title: post.content.title, status: post.status })) }),
    transact: async (_id, decide) => {
      onTransaction();
      return decide({
        read: async () => posts.get(_id) ?? null,
        hasMediaUsePermission,
        readMedia: async () => {
          onMediaRead();
          return media;
        },
        save: (post) => { posts.set(post.id, post); },
      });
    },
    synchronize: async () => synchronization,
  });
  return blog;
}

describe("Blog", () => {
  test("saves and publishes without a story, capture or submission", async () => {
    const blog = fixture();
    const { post: draft } = await blog.save("admin", { title: "Registro", body: "Texto **formatado**", publish: false });
    expect(draft.status).toBe("draft");
    const { post: post } = await blog.save("editor", { id: draft.id, expectedRevision: draft.revision, title: "Registro", body: "Texto **formatado**", publish: true });
    expect(post.status).toBe("published");
    expect(post.publishedAt).toBe(1000);
    expect(post.content.path).toBe("/noticia/post-1/registro");
    const { post: edited } = await blog.save("admin", { id: post.id, expectedRevision: post.revision, title: "Registro atualizado", body: "Texto novo" });
    expect(edited.status).toBe("published");
    expect(edited.content.body).toBe("Texto novo");
    expect(edited.content.path).toBe(post.content.path);
    const { post: offline } = await blog.takeOffline("editor", { id: edited.id, expectedRevision: edited.revision });
    expect(offline.status).toBe("draft");
    expect(offline.content.body).toBe("Texto novo");
  });
});

test("each mutation advances updatedAt past the stored one when the clock repeats", async () => {
  const blog = fixture();
  const { post: published } = await blog.save("editor", { title: "Registro", body: "Texto", publish: true });
  const { post: edited } = await blog.save("editor", { id: published.id, expectedRevision: published.revision, title: "Registro", body: "Novo" });
  const { post: offline } = await blog.takeOffline("editor", { id: edited.id, expectedRevision: edited.revision });
  expect([published.updatedAt, edited.updatedAt, offline.updatedAt]).toEqual([1000, 1001, 1002]);
  expect(offline.publishedAt).toBe(1000);
});

test("denies a valid mutation by a non-operator without changing the post", async () => {
  const blog = fixture();
  const { post: post } = await blog.save("editor", { title: "Registro", body: "Texto", publish: true });
  await expect(blog.save("reader", { id: post.id, expectedRevision: post.revision, title: "Mudança", body: "Outro texto" })).rejects.toThrow("Acesso restrito");
  expect(await blog.read("admin", post.id)).toEqual(post);
  await expect(blog.takeOffline("reader", { id: post.id, expectedRevision: post.revision })).rejects.toThrow("Acesso restrito");
});

test("rejects a stale edit and preserves the current publication", async () => {
  const blog = fixture();
  const { post: post } = await blog.save("editor", { title: "Registro", body: "Texto", publish: true });
  const { post: edited } = await blog.save("admin", { id: post.id, expectedRevision: post.revision, title: "Texto vigente", body: "Vigente" });
  await expect(blog.save("editor", { id: post.id, expectedRevision: post.revision, title: "Antigo", body: "Não sobrescrever" })).rejects.toThrow("O post foi alterado");
  expect(await blog.read("admin", post.id)).toEqual(edited);
});

test("republication preserves URL and original publication time", async () => {
  const blog = fixture();
  const { post: published } = await blog.save("editor", { title: "Registro", body: "Texto", publish: true });
  const { post: offline } = await blog.takeOffline("admin", { id: published.id, expectedRevision: published.revision });
  const { post: republished } = await blog.save("editor", { id: offline.id, expectedRevision: offline.revision, title: "Título editado", body: "Texto republicado", publish: true });
  expect(republished.content.path).toBe(published.content.path);
  expect(republished.publishedAt).toBe(published.publishedAt);
  expect(republished.status).toBe("published");
});

const image: Media = {
  id: "image", kind: "article-image", status: "active", revision: 1, digest: "a".repeat(64),
  storagePath: `media-staged/sha256-${"a".repeat(64)}.webp`, mimeType: "image/webp", createdAt: 1, updatedAt: 1,
  alt: "Praça", caption: "Praça antiga", provenance: { origin: "own-production", creator: "Equipe", credit: "Foto: Equipe", displayBasis: "own-production", acquiredAt: 1 },
};
test("the first save preserves historical Markdown, image roles, credits, references and corrections", async () => {
  const legacy: BlogPost = { id: "post-1", status: "published", revision: 0, createdAt: 1, updatedAt: 2, publishedAt: 2, mediaIds: [image.id],
    content: { title: "Acervo", body: "  **Texto**\n\n![foto](media:image)\n\n[Referência](https://example.com)  ", path: "/noticia/post-1/acervo", media: [], sources: [{ name: "Fonte", url: "https://example.com" }], legacyHeaderMediaIds: [image.id], corrections: [{ summary: "Correção anterior", createdAt: 1 }], editorName: "Ana", assisted: true } };
  const blog = fixture(legacy, [image]);
  const { post } = await blog.save("editor", { id: legacy.id, expectedRevision: legacy.revision, title: legacy.content.title, body: legacy.content.body });
  expect(post.content).toMatchObject({ ...legacy.content, media: [{ id: image.id, digest: image.digest, alt: image.alt, caption: image.caption, credit: image.provenance.credit, generated: false }] });
  expect(post.mediaIds).toEqual([image.id]);
});
test.each([undefined, "raw/image.png"])("refuses an unavailable or unsanitized cover (%s) before saving", async (path) => {
  const blog = fixture(undefined, path ? [{ ...image, storagePath: path }] : []);
  await expect(blog.save("editor", { title: "Post", body: "Texto", leadMediaId: image.id, publish: true })).rejects.toThrow("Imagem indisponível");
  expect((await blog.list("admin")).items).toEqual([]);
});
test("reports an unconfirmed projection without misreporting the committed post as failed", async () => {
  const blog = fixture(undefined, [], "unconfirmed");
  const result = await blog.save("editor", { title: "Post", body: "Texto", publish: true });
  expect(result.synchronization).toBe("unconfirmed");
  expect(await blog.read("editor", result.post.id)).toEqual(result.post);
});

test.each([
  Array.from({ length: 21 }, (_, index) => `![image](media:image-${index})`).join("\n\n"),
  `![image](media:${"x".repeat(201)})`,
])("rejects unbounded media references before opening a transaction", async (body) => {
  const transact = vi.fn();
  const readMedia = vi.fn();
  const blog = fixture(undefined, [], "confirmed", transact, readMedia);
  await expect(blog.save("editor", { title: "Post", body })).rejects.toThrow("Use até 20 imagens");
  expect(transact).not.toHaveBeenCalled();
  expect(readMedia).not.toHaveBeenCalled();
  expect((await blog.list("editor")).items).toEqual([]);
});

test("accepts 20 distinct images, a 200-character identity and repeated uses of the cover", async () => {
  const media = Array.from({ length: 20 }, (_, index) => ({ ...image, id: index === 0 ? "x".repeat(200) : `image-${index}` }));
  const body = [...media, media[0]!].map(item => `![image](media:${item.id})`).join("\n\n");
  const { post } = await fixture(undefined, media).save("editor", { title: "Post", body, leadMediaId: media[1]!.id });
  expect(post.mediaIds).toHaveLength(20);
  expect(post.content.body).toBe(body);
});

test("bounds inherited cover references before reading media", async () => {
  const legacy: BlogPost = { id: "post-1", status: "published", revision: 0, createdAt: 1, updatedAt: 2, publishedAt: 2, mediaIds: [image.id],
    content: { title: "Acervo", body: "Texto", path: "/noticia/post-1/acervo", sources: [], media: [], legacyHeaderMediaIds: [image.id] } };
  const readMedia = vi.fn();
  const blog = fixture(legacy, [], "confirmed", vi.fn(), readMedia);
  const body = Array.from({ length: 20 }, (_, index) => `![image](media:image-${index})`).join("\n\n");
  await expect(blog.save("editor", { id: legacy.id, expectedRevision: 0, title: "Post", body })).rejects.toThrow("Use até 20 imagens");
  expect(readMedia).not.toHaveBeenCalled();
  expect(await blog.read("editor", legacy.id)).toEqual(legacy);
});

test.each([true, false])("checks current permission before committing permission-based media (%s)", async (valid) => {
  const permitted: Media = { ...image, provenance: { origin: "third-party", provider: "Fonte", creator: "Ana", credit: "Foto: Ana", displayBasis: "permission", permissionReference: "permission-1", acquiredAt: 1 } };
  const permission = vi.fn(async () => valid);
  const blog = fixture(undefined, [permitted], "confirmed", vi.fn(), vi.fn(), permission);
  const saving = blog.save("editor", { title: "Post", body: "Texto", leadMediaId: permitted.id, publish: true });
  if (valid) await expect(saving).resolves.toMatchObject({ post: { status: "published" } });
  else {
    await expect(saving).rejects.toThrow("A permissão de uso da imagem não está vigente");
    expect((await blog.list("editor")).items).toEqual([]);
  }
  expect(permission).toHaveBeenCalledWith("permission-1", 1000);
});

test.each(["body", "leadMediaId"] as const)("attributes missing, unsanitized and revoked media to %s", async (field) => {
  const input = { title: "Post", body: field === "body" ? "![image](media:image)" : "Texto", ...(field === "leadMediaId" ? { leadMediaId: image.id } : {}) };
  const permitted: Media = { ...image, provenance: { origin: "third-party", provider: "Fonte", creator: "Ana", credit: "Foto: Ana", displayBasis: "permission", permissionReference: "permission-1", acquiredAt: 1 } };
  for (const [media, permission] of [[[], true], [[{ ...image, storagePath: "raw/image.png" }], true], [[permitted], false]] as Array<[Media[], boolean]>) {
    const blog = fixture(undefined, media, "confirmed", vi.fn(), vi.fn(), async () => permission);
    await expect(blog.save("editor", input)).rejects.toMatchObject({ code: "media", field });
    expect((await blog.list("editor")).items).toEqual([]);
  }
});
