export default function NotFound() {
  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-8">
        <div className={`
          flex h-[calc(100vh-6rem)] flex-col items-center justify-center
        `}
        >
          <h1 className="mb-2 text-2xl font-bold">Perfil não encontrado</h1>
          <p className="mb-16 text-muted-foreground">
            O perfil de anunciante que você está procurando não existe ou está
            indisponível.
          </p>
        </div>
      </main>
    </div>
  );
}
