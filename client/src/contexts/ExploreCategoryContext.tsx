import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

const ExploreCategoryContext = createContext<{
  exploreCategoryDisplayName: string | null;
  setExploreCategoryDisplayName: (name: string | null) => void;
}>({
  exploreCategoryDisplayName: null,
  setExploreCategoryDisplayName: () => {},
});

export function ExploreCategoryProvider({ children }: { children: ReactNode }) {
  const [exploreCategoryDisplayName, setExploreCategoryDisplayName] = useState<string | null>(null);
  const setter = useCallback((name: string | null) => {
    setExploreCategoryDisplayName(name);
  }, []);
  return (
    <ExploreCategoryContext.Provider
      value={{ exploreCategoryDisplayName, setExploreCategoryDisplayName: setter }}
    >
      {children}
    </ExploreCategoryContext.Provider>
  );
}

export function useExploreCategoryDisplayName() {
  return useContext(ExploreCategoryContext);
}
