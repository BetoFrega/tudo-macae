"use client";

import { useState } from "react";
import { Button } from "@tudomacae/react-primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tudomacae/react-primitives/dialog";
import { useCategoryUI } from "./context";

export function SeedCategoriesButton() {
  const { seedCategories } = useCategoryUI();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const handleSeed = async () => {
    setLoading(true);
    await seedCategories();
    setSuccess(true);
    setLoading(false);
  };

  return (
    <>
      <Button onClick={handleSeed} disabled={loading} variant="outline">
        {loading ? "Semeando..." : "Semear Categorias (Reset)"}
      </Button>
      <Dialog open={success} onOpenChange={setSuccess}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Semear Categorias</DialogTitle>
            <DialogDescription>
              Categorias semeadas com sucesso!
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
