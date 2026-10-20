import { pageObject } from "../../fixtures/POMs/pageObject";
import type { Locator, Page } from "@playwright/test";
import { BasePage } from "../../fixtures/POMs/BasePage";

export class AdminMediaPage extends BasePage {
  route: string;

  constructor(page: Page, route = "/admin/midias") {
    super(page);
    this.route = route;
  }

  /** Navigates without waiting for the library — for asserting the guard. */
  async goto() {
    await this.page.goto(this.route);
  }

  /**
   * Navigates and waits for the library to be there to work with. Partial
   * Prerendering paints the static shell and then streams the rendered page
   * over it, so both copies are in the DOM for a moment and every locator here
   * is ambiguous until that window closes.
   */
  async open() {
    await this.goto();
    await this.waitForReady(
      this.kindSelect,
      this.fileField,
      this.altField,
      this.captionField,
      this.originSelect,
      this.creatorField,
      this.creditField,
      this.acquiredAtField,
      this.submitButton,
    );
  }

  get heading() {
    return this.getByRole("heading", { name: "Acervo de mídia" });
  }

  /** The registration form, scoped so its labels never collide with the edit dialog's. */
  private get form() {
    return this.getByTestId("media-form");
  }

  get kindSelect() {
    return this.form.getByLabel("Espécie");
  }

  get fileField() {
    return this.form.getByLabel("Arquivo");
  }

  get fileErrorAlert() {
    return this.form.getByRole("alert");
  }

  get altField() {
    return this.form.getByLabel("Texto alternativo");
  }

  get captionField() {
    return this.form.getByLabel("Legenda");
  }

  get originSelect() {
    return this.form.getByLabel("Origem");
  }

  get creatorField() {
    return this.form.getByLabel("Autoria");
  }

  get creditField() {
    return this.form.getByLabel("Crédito");
  }

  get acquiredAtField() {
    return this.form.getByLabel("Data de aquisição");
  }

  get submitButton() {
    return this.form.getByRole("button", { name: "Cadastrar mídia" });
  }

  async chooseFile(name: string, mimeType: string, buffer: Buffer) {
    await this.fileField.setInputFiles({ name, mimeType, buffer });
  }

  async submit() {
    await this.click(this.submitButton);
    // Upload preparation, transfer and finalization finish before effects are read.
    await this.form.getByRole("button", { name: "Cadastrando...", exact: true })
      .waitFor({ state: "hidden" });
  }

  /** A card in the library, located by its accessible image. */
  card(alt: string): Locator {
    return this.getByTestId("media-card").filter({ has: pageObject(this.page).getByRole("img", { name: alt, exact: true }) });
  }

  // ---- The media picker, mounted on this screen so it can be exercised ----

  get pickerTrigger() {
    return this.getByRole("button", { name: "Escolher mídia" });
  }

  get picker() {
    return this.getByTestId("media-picker");
  }

  async openPicker() {
    await this.click(this.pickerTrigger);
  }

  /** A media offered by the picker, located by its accessible image. */
  pickerOption(alt: string): Locator {
    return this.picker.getByTestId("media-option").filter({ has: pageObject(this.page).getByRole("img", { name: alt, exact: true }) });
  }

  async chooseFromPicker(alt: string) {
    await this.click(this.pickerOption(alt));
  }

  /** The registration form inside the picker — the page's own form, scoped to the dialog. */
  private get pickerForm() {
    return this.picker.getByTestId("media-form");
  }

  get pickerFileField() {
    return this.pickerForm.getByLabel("Arquivo");
  }

  get pickerAltField() {
    return this.pickerForm.getByLabel("Texto alternativo");
  }

  get pickerCreatorField() {
    return this.pickerForm.getByLabel("Autoria");
  }

  get pickerCreditField() {
    return this.pickerForm.getByLabel("Crédito");
  }

  get pickerAcquiredAtField() {
    return this.pickerForm.getByLabel("Data de aquisição");
  }

  get pickerKindSelect() {
    return this.pickerForm.getByLabel("Espécie");
  }

  get pickerSubmitButton() {
    return this.pickerForm.getByRole("button", { name: "Cadastrar e escolher" });
  }

  async choosePickerFile(name: string, mimeType: string, buffer: Buffer) {
    await this.pickerFileField.setInputFiles({ name, mimeType, buffer });
  }

  async submitPickerForm() {
    await this.click(this.pickerSubmitButton);
    await this.pickerForm.getByRole("button", { name: "Cadastrando...", exact: true })
      .waitFor({ state: "hidden" });
  }

  /** What the screen shows for the media the picker handed back. */
  get pickerChoice() {
    return this.getByTestId("media-picker-choice");
  }

  private get editForm() {
    return this.getByTestId("media-edit-form");
  }

  async openEditDialog(alt: string) {
    await this.click(this.card(alt).getByRole("button", { name: `Editar mídia: ${alt}`, exact: true }));
  }

  get editAltField() {
    return this.editForm.getByLabel("Texto alternativo");
  }

  get editCreditField() {
    return this.editForm.getByLabel("Crédito");
  }

  get editFileField() {
    return this.editForm.getByLabel("Arquivo");
  }

  get saveEditButton() {
    return this.editForm.getByRole("button", { name: "Salvar alterações" });
  }

  get editReasonField() {
    return this.getByLabel("Motivo da correção");
  }

  async saveEdit(reason?: string) {
    if (reason !== undefined) await this.editReasonField.fill(reason);
    await this.click(this.saveEditButton);
  }
}
