import { BasePage } from "../../fixtures/POMs/BasePage";

export class ActivityAreasForm extends BasePage {
  get category() {
    return this.getByLabel("Categoria da área de atuação", { exact: true });
  }

  get subcategory() {
    return this.getByLabel("Subcategoria da área de atuação", { exact: true });
  }

  get removeButton() {
    return this.getByRole("button", { name: "Remover área de atuação", exact: true });
  }

  get unavailable() {
    return this.getByText("Área de atuação indisponível", { exact: true });
  }

  selection(category: string, subcategory: string) {
    return this.getByText(`${category} → ${subcategory}`, { exact: true });
  }

  counter(count: number) {
    return this.getByText(`${count} de 3`, { exact: true });
  }

  async add(categoryId: string, subcategoryId: string) {
    await this.category.selectOption(categoryId);
    await this.subcategory.selectOption(subcategoryId);
    await this.click(this.getByRole("button", { name: "Adicionar área", exact: true }));
  }

  async remove() {
    await this.click(this.removeButton);
  }
}
