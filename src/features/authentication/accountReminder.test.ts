import { expect, test } from "vitest";
import { accountReminder } from "./accountReminder";

test("email wins over profile and publication, even with no publications", () => {
  expect(accountReminder(false, [], [])).toMatchObject({ label: "Verificar e-mail", href: "/minha-conta/verificar-email" });
  expect(accountReminder(false, [{ advertiserProfileId: "profile" }], [])).toMatchObject({ label: "Verificar e-mail" });
});
test("confirmation reveals profile blockers, then publication, then no reminder", () => {
  const publications = [{ advertiserProfileId: "profile" }];
  expect(accountReminder(true, publications, [])).toMatchObject({ href: "/minha-conta/anuncios?filter=profile" });
  expect(accountReminder(true, publications, [{ id: "profile", title: "Ana", contacts: [{ number: "22999999999" }] }])).toMatchObject({ text: "1 anúncio com publicação pendente.", href: "/minha-conta/anuncios?filter=pending" });
  expect(accountReminder(true, [], [])).toBeNull();
});

test("evaluates each publication against its associated profile", () => {
  const publications = [
    { advertiserProfileId: "shared" },
    { advertiserProfileId: "shared" },
    { advertiserProfileId: "other" },
  ];
  const publishable = { title: "Ana", contacts: [{ number: "22999999999" }] };

  expect(accountReminder(true, publications, [
    { id: "shared", ...publishable },
    { id: "other", title: "Sem contato", contacts: [] },
  ])).toMatchObject({
    text: "Há anúncios aguardando você completar o perfil.",
    href: "/minha-conta/anuncios?filter=profile",
  });

  expect(accountReminder(true, publications, [
    { id: "shared", ...publishable },
    { id: "other", ...publishable },
    { id: "unrelated", title: "Incompleto", contacts: [] },
  ])).toMatchObject({
    text: "3 anúncios com publicação pendente.",
    href: "/minha-conta/anuncios?filter=pending",
  });
});
