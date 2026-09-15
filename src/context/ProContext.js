// src/context/ProContext.js
import React, { createContext, useContext, useState } from 'react';

const ProContext = createContext();

const HACKATHON_DEMO_UNLOCKED = true;

// The hackathon build starts unlocked so judges can review the full product.
export function ProProvider({ children }) {
  const [isPro, setIsPro] = useState(HACKATHON_DEMO_UNLOCKED);
  const [solveCount, setSolveCount] = useState(0);
  const FREE_LIMIT = 5;

  const canSolve = isPro || solveCount < FREE_LIMIT;
  const remaining = Math.max(0, FREE_LIMIT - solveCount);

  function recordSolve() {
    if (!isPro) setSolveCount(c => c + 1);
  }

  async function purchasePro() {
    // Simulated unlock for demo builds.
    return new Promise(resolve => {
      setTimeout(() => {
        setIsPro(true);
        resolve(true);
      }, 1200);
    });
  }

  function restorePurchases() {
    setIsPro(true);
  }

  return (
    <ProContext.Provider value={{
      isPro,
      canSolve,
      remaining,
      FREE_LIMIT,
      isDemoMode: HACKATHON_DEMO_UNLOCKED,
      recordSolve,
      purchasePro,
      restorePurchases,
    }}>
      {children}
    </ProContext.Provider>
  );
}

export const usePro = () => useContext(ProContext);
