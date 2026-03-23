"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import LoginPage from "@/components/LoginPage";
import Header from "@/components/Header";
import PendingChangesToast from "@/components/PendingChangesToast";
import AddAssetSuccessToast from "@/components/AddAssetSuccessToast";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  return (
    <AuthContext.Provider value={{ session, user: session.user, signOut }}>
      <div className="layout-container flex h-full min-h-screen flex-col">
        <Header />
        <main className="flex-1 px-4 py-8 lg:px-40 pt-24">
          {children}
        </main>
        <AddAssetSuccessToast />
        <PendingChangesToast />
      </div>
    </AuthContext.Provider>
  );
}

