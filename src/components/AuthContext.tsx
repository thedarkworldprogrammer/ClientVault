/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signOut, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword 
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { AuthMode, UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  signUp: (emailStr: string, passwordStr: string, nameStr: string) => Promise<void>;
  signIn: (emailStr: string, passwordStr: string) => Promise<void>;
  logOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribeProfileSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      
      if (unsubscribeProfileSnapshot) {
        unsubscribeProfileSnapshot();
        unsubscribeProfileSnapshot = null;
      }

      if (currentUser) {
        const userDocRef = doc(db, 'users', currentUser.uid);
        unsubscribeProfileSnapshot = onSnapshot(userDocRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setProfile({
              email: data.email,
              name: data.name || '',
              createdAt: data.createdAt?.toDate() || new Date(),
            });
          } else {
            setProfile(null);
          }
          setLoading(false);
        }, (err) => {
          handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}`);
          setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfileSnapshot) {
        unsubscribeProfileSnapshot();
      }
    };
  }, []);

  const clearError = () => setError(null);

  const signUp = async (emailStr: string, passwordStr: string, nameStr: string) => {
    setLoading(true);
    setError(null);
    try {
      // 1. Create auth account in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, emailStr, passwordStr);
      const newUser = userCredential.user;

      // 2. Provision their profile document in Firestore if available (otherwise warn gracefully)
      const profilePath = `users/${newUser.uid}`;
      try {
        await setDoc(doc(db, 'users', newUser.uid), {
          email: emailStr,
          name: nameStr,
          createdAt: serverTimestamp(),
        });
        setProfile({
          email: emailStr,
          name: nameStr,
          createdAt: new Date(),
        });
      } catch (dbErr) {
        console.warn('Firestore profile synchronization skipped (Firestore is not provisioned or active in this project):', dbErr);
      }
    } catch (err: any) {
      console.error('Sign Up Error:', err);
      // Map standard friendly translations for common Firebase Auth issues
      if (err.code === 'auth/email-already-in-use') {
        setError('This email address is already registered.');
      } else if (err.code === 'auth/weak-password') {
        setError('The password is too weak. Please use at least 6 characters.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else if (err.message && err.message.startsWith('{')) {
        setError('Database setup pending. Please wait for rule validation.');
      } else {
        setError(err.message || 'An error occurred during account creation.');
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (emailStr: string, passwordStr: string) => {
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, emailStr, passwordStr);
    } catch (err: any) {
      console.error('Sign In Error:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Invalid email or password combination.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError(err.message || 'An error occurred while signing in.');
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logOut = async () => {
    setLoading(true);
    setError(null);
    try {
      await signOut(auth);
    } catch (err: any) {
      console.error('Sign Out Error:', err);
      setError(err.message || 'An error occurred while signing out.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, error, signUp, signIn, logOut, clearError }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
