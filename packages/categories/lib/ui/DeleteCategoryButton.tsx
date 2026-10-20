"use client";

import { Trash2 } from "lucide-react";
import { useCategoryUI } from "./context";
import { useState } from "react";
import { Button } from "@tudomacae/react-primitives/button";

export function DeleteCategoryButton({ id }: { id: string }) {
  const { deleteCategory, navigate } = useCategoryUI();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (
      !confirm(
        "Tem certeza? Isso pode afetar anúncios existentes que usam esta categoria.",
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      await deleteCategory({ id });
      alert("Categoria excluída com sucesso!");
      navigate("/admin/categorias");
    }
    catch (error) {
      console.error(error);
      alert("Erro ao excluir categoria.");
    }
    finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={handleDelete}
      disabled={loading}
    >
      <Trash2 className="mr-2 size-4" />
      {loading ? "Excluindo..." : "Excluir Categoria"}
    </Button>
  );
}
