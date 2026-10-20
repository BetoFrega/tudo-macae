export default function ForbiddenAccessPage() {
  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-8">
        <div className={`
          flex h-[calc(100vh-6rem)] flex-col items-center justify-center
        `}
        >
          <h1 className="mb-2 text-2xl font-bold">
            Opa! O que você está tentando fazer?
          </h1>
          <p className="mb-16 text-muted-foreground">
            Você não tem permissão para ver essa página.
          </p>
        </div>
      </main>
    </div>
  );
}
