/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { AuthMode } from '../types';
import { Shield, Eye, EyeOff, Loader2, ArrowRight, Lock, Mail } from 'lucide-react';

export const Login: React.FC = () => {
  const { signUp, signIn, error, clearError, loading } = useAuth();
  const [mode, setMode] = useState<AuthMode>(AuthMode.SIGN_IN);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    // Validations
    if (!email) {
      setLocalError('Please enter your email address.');
      return;
    }
    if (!password) {
      setLocalError('Please enter your password.');
      return;
    }
    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters.');
      return;
    }

    if (mode === AuthMode.SIGN_UP) {
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match.');
        return;
      }
    }

    try {
      if (mode === AuthMode.SIGN_IN) {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
    } catch (err) {
      // Errors are handled inside the AuthContext state
      console.warn('Authentication fail captured.');
    }
  };

  const handleModeToggle = () => {
    setMode(mode === AuthMode.SIGN_IN ? AuthMode.SIGN_UP : AuthMode.SIGN_IN);
    clearError();
    setLocalError(null);
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <div id="login-container" className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="absolute top-4 left-4 flex items-center space-x-2 text-slate-800">
        <Shield className="w-5 h-5 text-blue-600" />
        <span className="font-sans font-bold text-sm tracking-tight text-slate-900">ClientVault</span>
      </div>

      <div className="sm:mx-auto w-full max-w-md">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xs border border-blue-700">
            <Shield className="w-6 h-6" />
          </div>
          <h2 className="mt-5 text-center text-3xl font-extrabold font-sans text-slate-900 tracking-tight">
            {mode === AuthMode.SIGN_IN ? 'Sign In to ClientVault' : 'Create an Account'}
          </h2>
          <p className="mt-2 text-center text-sm text-slate-500">
            {mode === AuthMode.SIGN_IN ? (
              <>
                New to ClientVault?{' '}
                <button
                  id="btn-switch-signup"
                  type="button"
                  onClick={handleModeToggle}
                  className="font-medium text-blue-600 hover:text-blue-500 underline transition cursor-pointer"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  id="btn-switch-signin"
                  type="button"
                  onClick={handleModeToggle}
                  className="font-medium text-blue-600 hover:text-blue-500 underline transition cursor-pointer"
                >
                  Sign in instead
                </button>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto w-full max-w-md">
        <div className="bg-white py-8 px-4 border border-slate-200 rounded-2xl sm:px-10 shadow-xs">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Display error messages */}
            {(error || localError) && (
              <div 
                id="auth-error-alert"
                className="rounded-xl bg-red-50 p-4 border border-red-200"
              >
                <div className="flex">
                  <div className="shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-red-800">{localError || error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Email Field */}
            <div>
              <label htmlFor="login-email" className="block text-sm font-semibold text-slate-700">
                Email address
              </label>
              <div className="mt-1.5 relative rounded-md">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-4.5 w-4.5" />
                </div>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-sm transition-all bg-slate-50/10"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="login-password" className="block text-sm font-semibold text-slate-700">
                Password
              </label>
              <div className="mt-1.5 relative rounded-md">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4.5 w-4.5" />
                </div>
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="block w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-sm transition-all bg-slate-50/10"
                />
                <button
                  id="btn-toggle-password"
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                </button>
              </div>
            </div>

            {/* Confirm Password Field (only showing on Sign Up) */}
            {mode === AuthMode.SIGN_UP && (
              <div>
                <label htmlFor="login-confirm-password" className="block text-sm font-semibold text-slate-700">
                  Confirm Password
                </label>
                <div className="mt-1.5 relative rounded-md">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="h-4.5 w-4.5" />
                  </div>
                  <input
                    id="login-confirm-password"
                    name="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Verify your password"
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-sm transition-all bg-slate-50/10"
                  />
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div>
              <button
                id="btn-auth-submit"
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center space-x-2 py-2.5 px-4 border border-blue-700 text-sm font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 text-white" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <span>{mode === AuthMode.SIGN_IN ? 'Sign In' : 'Create Account'}</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Sandbox Guideline Banner */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest font-mono">Sandbox Quick Notice</h4>
            <ul className="mt-2 text-[11px] text-slate-500 space-y-1 font-sans list-disc list-inside">
              <li>Feel free to **self-register** to test dynamic clients.</li>
              <li>You may see a mock warning until your Firebase terms are accepted.</li>
              <li>Files must be under 2MB (Base64-backed database storage).</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
