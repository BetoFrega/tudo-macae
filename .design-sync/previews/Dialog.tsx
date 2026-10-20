import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from "macae-classificados";

// DialogContent always portals to document.body and is fixed-positioned, so
// these render open (cardMode "single" in cfg.overrides) — a closed dialog
// would show nothing but its trigger.
export const ConfirmDelete = () => (
  <Dialog open>
    <DialogTrigger asChild>
      <Button variant="destructive">Excluir anúncio</Button>
    </DialogTrigger>
    <DialogContent onOpenAutoFocus={e => e.preventDefault()}>
      <DialogHeader>
        <DialogTitle>Excluir este anúncio?</DialogTitle>
        <DialogDescription>
          Esta ação não pode ser desfeita. O anúncio sairá do ar imediatamente
          e deixará de aparecer nas buscas.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancelar</Button>
        </DialogClose>
        <Button variant="destructive">Excluir</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const ContactForm = () => (
  <Dialog open>
    <DialogContent onOpenAutoFocus={e => e.preventDefault()}>
      <DialogHeader>
        <DialogTitle>Falar com o anunciante</DialogTitle>
        <DialogDescription>
          Sua mensagem será enviada junto com o e-mail cadastrado na sua conta.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="d-nome">Seu nome</Label>
          <Input id="d-nome" defaultValue="Marina Souza" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="d-tel">Telefone</Label>
          <Input id="d-tel" defaultValue="(22) 99999-0000" />
        </div>
      </div>
      <DialogFooter>
        <Button>Enviar mensagem</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
