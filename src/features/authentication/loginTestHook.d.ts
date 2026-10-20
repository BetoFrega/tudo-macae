declare global {
  interface Window {
    login?: (email: string, password: string) => Promise<void>;
  }
}

export {};
