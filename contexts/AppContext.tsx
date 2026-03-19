import { PropsWithChildren, createContext, useContext, useState } from 'react';

type AppState = {
  selectedPharmacyId: string | null;
};

type AppContextValue = {
  state: AppState;
  setSelectedPharmacyId: (id: string | null) => void;
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AppState>({
    selectedPharmacyId: null,
  });

  const setSelectedPharmacyId = (id: string | null) => {
    setState((prev) => ({ ...prev, selectedPharmacyId: id }));
  };

  return (
    <AppContext.Provider
      value={{
        state,
        setSelectedPharmacyId,
      }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);

  if (!ctx) {
    throw new Error('useApp must be used within AppProvider');
  }

  return ctx;
}

