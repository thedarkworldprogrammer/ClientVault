/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from './AuthContext';
import { ShieldAlert, Clock, LogOut, Shield, RefreshCw } from 'lucide-react';

export const InactivityTracker: React.FC = () => {
  const { user, logOut } = useAuth();
  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [countdown, setCountdown] = useState(60); // 60-second warning countdown
  const [isSimulated, setIsSimulated] = useState(false);

  const lastActivityRef = useRef<number>(Date.now());
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Default timeout: 15 minutes (900,000 ms)
  // Simulation timeout: 5 seconds (5,000 ms)
  const inactivityLimit = isSimulated ? 5 * 1000 : 15 * 60 * 1000;

  // Reset activity tracker
  const resetActivity = () => {
    lastActivityRef.current = Date.now();
    // If the warning dialog is already showing, we don't auto-dismiss:
    // we let them click "Extend Session" to explicitly re-authenticate.
  };

  useEffect(() => {
    if (!user) {
      setIsWarningOpen(false);
      setIsSimulated(false);
      return;
    }

    // Handlers for activity events
    const handleActivity = () => {
      resetActivity();
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Periodically check the idle time
    checkIntervalRef.current = setInterval(() => {
      if (isWarningOpen) return;

      const idleDuration = Date.now() - lastActivityRef.current;
      if (idleDuration >= inactivityLimit) {
        // Trigger inactivity warning
        setIsWarningOpen(true);
        setCountdown(60);
      }
    }, 1000);

    // Custom Dev Simulation trigger via window event
    const handleSimulationEvent = () => {
      setIsSimulated(true);
      lastActivityRef.current = Date.now();
      setIsWarningOpen(false);
    };

    window.addEventListener('trigger-inactivity-demo', handleSimulationEvent);

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      window.removeEventListener('trigger-inactivity-demo', handleSimulationEvent);
    };
  }, [user, inactivityLimit, isWarningOpen]);

  // Handle warning state countdown
  useEffect(() => {
    if (!user) return;

    if (isWarningOpen) {
      // Focus element for keyboard navigation access
      const closeBtn = document.getElementById('extend-session-btn');
      if (closeBtn) closeBtn.focus();

      countdownIntervalRef.current = setInterval(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
    } else {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    }

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [isWarningOpen, user]);

  // Handle logout trigger safely in a separate effect when countdown reaches zero
  useEffect(() => {
    if (user && isWarningOpen && countdown <= 0) {
      setIsWarningOpen(false);
      logOut();
    }
  }, [countdown, isWarningOpen, logOut, user]);

  const handleExtendSession = () => {
    lastActivityRef.current = Date.now();
    setIsWarningOpen(false);
    setCountdown(60);
    // If we were in simulated mode, let's keep it or turn it off to let them return to normal 15m mode
    setIsSimulated(false);
  };

  const handleImmediateLogout = () => {
    setIsWarningOpen(false);
    logOut();
  };

  if (!user) return null;

  return (
    <AnimatePresence>
      {isWarningOpen && (
        <div 
          id="inactivity-warning-overlay"
          className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
        >
          <motion.div
            id="inactivity-warning-modal"
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            transition={{ type: 'spring', duration: 0.4 }}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl w-full max-w-md overflow-hidden relative font-sans"
          >
            {/* Top Security Accent Header */}
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-500 via-rose-500 to-red-650" />

            <div className="flex flex-col items-center text-center space-y-4 pt-2">
              <div className="w-14 h-14 bg-amber-500/10 dark:bg-amber-500/20 text-amber-500 dark:text-amber-400 rounded-2xl flex items-center justify-center shadow-xs">
                <ShieldAlert className="w-8 h-8 animate-bounce" />
              </div>

              <div>
                <span className="font-mono text-[10px] text-amber-500 uppercase tracking-widest font-extrabold select-none">
                  {isSimulated ? 'Simulation Active • Security Protocol' : 'Security Alert • Inactivity Detected'}
                </span>
                <h3 className="text-xl font-black text-slate-900 dark:text-white mt-1">
                  Session Expiration Warning
                </h3>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-405 leading-relaxed max-w-sm">
                You have been inactive for {isSimulated ? '5 seconds (Simulated)' : '15 minutes'}. For zero-trust security compliance and data protection, your security vault session will expire automatically.
              </p>

              {/* Countdown Board */}
              <div className="bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850 py-4 px-6 rounded-2xl w-full flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Automatic logout in</span>
                </div>
                <div className="font-mono text-xl font-bold text-rose-500 bg-rose-50 dark:bg-rose-950/30 px-3 py-1 rounded-xl border border-rose-100 dark:border-rose-900/30 animate-pulse">
                  {countdown}s
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 w-full pt-2">
                <button
                  type="button"
                  id="immediate-logout-btn"
                  onClick={handleImmediateLogout}
                  className="px-4 py-2.5 text-xs font-bold text-slate-550 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-950/40 rounded-xl transition-all border border-slate-200 dark:border-slate-850 flex items-center justify-center space-x-1.5 focus:ring-2 focus:ring-slate-350"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out Now</span>
                </button>
                <button
                  type="button"
                  id="extend-session-btn"
                  onClick={handleExtendSession}
                  className="px-4 py-2.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-sm flex items-center justify-center space-x-1.5 focus:ring-2 focus:ring-blue-500"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Extend Session</span>
                </button>
              </div>

              <div className="flex items-center justify-center space-x-1 text-[10px] text-slate-400 font-mono pt-1 select-none">
                <Shield className="w-3 h-3 text-emerald-500" />
                <span>Zero-Trust Workspace Vault Protection Active</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
