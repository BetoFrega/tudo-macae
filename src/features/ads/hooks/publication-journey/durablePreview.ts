export async function durablePreview(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("A foto foi salva, mas não foi possível mostrar a prévia. Recarregue a página para vê-la."));
    reader.readAsDataURL(file);
  });
}
